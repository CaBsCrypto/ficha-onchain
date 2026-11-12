import { pathToFileURL } from 'node:url';
import { Address, Contract, Keypair, Networks, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrivyClient } from '@privy-io/server-auth';
import WebSocket from 'ws';
import { databaseConnectionString } from './lib/database-connection.mjs';
import { clinicalRpcUrl } from './lib/clinical-rpc.mjs';
import { acquireClinicalSourceLocks } from './lib/clinical-source-lock.mjs';
import { acquireSignerLock, secureStoreSigner, workerConfiguration, PRIVY_APP_ID } from './lib/private-worker-runtime.mjs';
import { assertInitialDoctorJob, loadInitialDoctorScope } from './lib/initial-doctor-scope.mjs';
import { createInitialDoctorSponsorship } from './lib/initial-doctor-sponsorship.mjs';
import { sha256 } from './lib/sponsorship-domain.mjs';
import { assertNoOtherRehearsalAttempts, verifyAuthorizationRegistryDeployment } from './run-clinical-rehearsal-authorization.mjs';
import { assertConfirmedState, createChain, createStore, runOnce } from './worker-doctor-authorizations.mjs';

const reject = code => new Error(code ?? 'initial_doctor_scope_rejected');

function bindingFor(plan, job) {
  assertInitialDoctorJob(plan, job);
  const operation = new Contract(plan.registryId).call(job.method, new Address(job.wallet).toScVal(),
    nativeToScVal(Buffer.from(job.commitment, 'hex')), nativeToScVal(BigInt(job.valid_until), { type: 'u64' }));
  return {
    requestId: job.id, network: 'testnet', sourceAddress: plan.admin, sponsorAddress: plan.relayer,
    patientAddress: plan.doctor.address, actorId: plan.reviewer.userId, walletId: 'registry-admin:' + plan.admin,
    contractId: plan.registryId, action: job.method, encounterId: job.dossier_id, intent: 'standard',
    operationFingerprint: sha256(operation.body().invokeHostFunctionOp().hostFunction().toXDR('base64')),
  };
}

async function runInitialDoctorAuthorization({ env, reconcile }) {
  const plan = loadInitialDoctorScope({ env, allowExpired: reconcile });
  if (!plan) throw reject();
  const databaseUrl = databaseConnectionString(env);
  const config = workerConfiguration({ ...env, DATABASE_URL: databaseUrl });
  const relayer = Keypair.fromSecret(env.RELAYER_SECRET);
  if (config.environment !== 'local' || config.writesEnabled || config.authority !== plan.admin || relayer.publicKey() !== plan.relayer) throw reject();
  const server = new rpc.Server(clinicalRpcUrl('gateway'), { timeout: 20000 });
  if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw reject();
  const database = new URL(databaseUrl);
  database.hostname = database.hostname.replace('-pooler.', '.');
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: database.href, connectionTimeoutMillis: 15000 });
  const requestId = plan.authorization.requestId;
  const releases = [];
  let client, locks, bookingLock = false, stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const checkPlan = (allowExpired = reconcile) => {
    const current = loadInitialDoctorScope({ env, allowExpired });
    if (stopped || current?.policyHash !== plan.policyHash) throw reject();
  };
  try {
    for (const address of [plan.admin, plan.relayer].sort()) {
      const release = await acquireSignerLock(env.STELLAR_CONFIG_DIR, address);
      if (!release) throw reject('initial_doctor_signer_busy');
      releases.push(release);
    }
    client = await pool.connect();
    locks = await acquireClinicalSourceLocks(client, [plan.admin, plan.relayer]);
    const booking = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', ['trustleaf-booking:' + plan.admin]);
    if (booking.rows[0]?.locked !== true) throw reject('initial_doctor_signer_busy');
    bookingLock = true;
    const readRequest = async () => (await client.query('SELECT * FROM doctor_authorization_requests WHERE id=$1::uuid', [requestId])).rows[0];
    const row = await readRequest();
    if (!row) return { status: 'not_queued', requestId };
    assertInitialDoctorJob(plan, row);
    const readOnly = reconcile || Boolean(row.transaction_hash);
    if (readOnly && !row.transaction_hash) return { status: 'no_signed_attempt', requestId };
    const assertOpen = async job => {
      if (readOnly) throw reject('initial_doctor_reconciliation_read_only');
      checkPlan(false);
      await locks.assertHeld();
      assertInitialDoctorJob(plan, job);
      await assertNoOtherRehearsalAttempts(client, requestId);
    };
    const assertJob = async (job, phase) => {
      checkPlan(readOnly);
      await locks.assertHeld();
      assertInitialDoctorJob(plan, job);
      if (['prepare', 'sign', 'submit'].includes(phase)) {
        await assertOpen(job);
        await verifyAuthorizationRegistryDeployment({ plan, server });
        await assertOpen(job);
      }
    };
    const sponsorship = createInitialDoctorSponsorship({ client, env, server,
      bindingFor: job => bindingFor(plan, job), assertOpen, maxFeeStroops: plan.maxFeeStroops });
    const chain = createChain({
      authority: plan.admin, relayer, server, requestId, until: plan.until, maxFeeStroops: plan.maxFeeStroops,
      provider: new PrivyClient(PRIVY_APP_ID, env.PRIVY_APP_SECRET), dataKey: env.TRUSTLEAF_DATA_KEY, assertJob, sponsorship,
      signXdr: readOnly ? async () => { throw reject('initial_doctor_reconciliation_read_only'); }
        : secureStoreSigner({ alias: env.DOCTOR_REGISTRY_ADMIN_ALIAS, configDir: env.STELLAR_CONFIG_DIR }),
    });
    const store = createStore(client, { requestId, sponsorship });
    const result = await runOnce({ store, chain, writesEnabled: !readOnly, prepareEnabled: !readOnly, requestId });
    const saved = await readRequest();
    assertInitialDoctorJob(plan, saved);
    let receiptStatus = null;
    let feeChargedStroops = null;
    if (saved.transaction_hash) {
      await chain.verifyEnvelope(saved);
      const receipt = await chain.receipt(saved.transaction_hash);
      receiptStatus = receipt.status;
      if (!['SUCCESS', 'FAILED', 'NOT_FOUND'].includes(receiptStatus)) throw reject('initial_doctor_receipt_unavailable');
      if (receiptStatus !== 'NOT_FOUND') {
        await sponsorship.reconcile(saved, receipt);
        feeChargedStroops = receipt.resultXdr.feeCharged().toString();
      }
      if (saved.state === 'confirmed' && (receiptStatus !== 'SUCCESS' || assertConfirmedState(saved, await chain.authorization(saved)) !== 'active')) {
        throw reject('initial_doctor_receipt_unavailable');
      }
    }
    return { ...result, requestId, queueState: saved.state, transactionHash: saved.transaction_hash ?? null, receiptStatus, feeChargedStroops };
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    const cleanup = [];
    if (bookingLock) await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['trustleaf-booking:' + plan.admin]).catch(error => cleanup.push(error));
    if (locks) await locks.release().catch(error => cleanup.push(error));
    client?.release();
    await pool.end().catch(error => cleanup.push(error));
    for (const release of releases.reverse()) await release().catch(error => cleanup.push(error));
    if (cleanup.length) throw reject('initial_doctor_lock_cleanup_required');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--once', '--reconcile'].includes(args[0])) throw reject('initial_doctor_explicit_mode_required');
  runInitialDoctorAuthorization({ env: process.env, reconcile: args[0] === '--reconcile' })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      const code = /^(initial_doctor_|clinical_source_|clinical_rehearsal_|sponsorship_)[a-z_]+$/.test(error?.message ?? '')
        ? error.message : 'initial_doctor_unavailable';
      console.error(JSON.stringify({ status: 'blocked', error: code }));
      process.exitCode = 1;
    });
}
