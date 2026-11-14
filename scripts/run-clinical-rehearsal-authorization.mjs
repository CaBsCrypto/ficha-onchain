#!/usr/bin/env node
/** One approved local renewal, or read-only reconciliation of its same envelope.
 * Never enqueues, funds, restores, deploys, changes environment files or drains
 * another request. Keep global private writes disabled throughout this runner. */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Keypair, Networks, rpc } from '@stellar/stellar-sdk';
import { loadRehearsalPolicy } from './lib/clinical-rehearsal-policy.mjs';
import { rehearsalRunLockKey, assertRehearsalOpen } from './lib/clinical-rehearsal-closure.mjs';
import { databaseConnectionString } from './lib/database-connection.mjs';
import { createClinicalContractAuditor } from './lib/clinical-contract-audit.mjs';
import { clinicalSimulationIsLive } from './lib/clinical-live-read.mjs';
import { acquireClinicalSourceLocks } from './lib/clinical-source-lock.mjs';
import { acquireSignerLock, secureStoreSigner, workerConfiguration, PRIVY_APP_ID } from './lib/private-worker-runtime.mjs';
import { createRehearsalRenewalSponsorship } from './lib/clinical-renewal-sponsorship.mjs';
import { createChain, createStore, runOnce } from './worker-doctor-authorizations.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_WASM = 'b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02';
const fail = () => Error('clinical_rehearsal_authorization_rejected');

/** The manifest is still fully hashed, path-checked and approved by the loader.
 * Only read-only reconciliation may evaluate its original creation instant. */
function reconciliationInstant(env) {
  const value = JSON.parse(readFileSync(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE, 'utf8'));
  if ([12, 13, 19].includes(value.schemaVersion)) {
    const ownApproval = JSON.parse(readFileSync(resolve(dirname(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE), 'approval.private.json'), 'utf8'));
    if (!Number.isSafeInteger(value.preparedAt) || value.preparedAt < 1 || !Number.isSafeInteger(ownApproval.approvedAt) || ownApproval.approvedAt < value.preparedAt) throw fail();
    return ownApproval.approvedAt;
  }
  if (value.schemaVersion === 7) {
    const base = JSON.parse(readFileSync(value.basePlanFile, 'utf8'));
    const ownApproval = JSON.parse(readFileSync(resolve(dirname(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE), 'approval.private.json'), 'utf8'));
    if (base.schemaVersion !== 6 || !Number.isSafeInteger(ownApproval.approvedAt) || ownApproval.approvedAt < 1) throw fail();
    return Math.max(ownApproval.approvedAt, reconciliationInstant({ ...env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: value.basePlanFile }));
  }
  if (value.schemaVersion === 6) {
    const base = JSON.parse(readFileSync(value.basePlanFile, 'utf8'));
    const ownApproval = JSON.parse(readFileSync(resolve(dirname(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE), 'approval.private.json'), 'utf8'));
    if (base.schemaVersion !== 5 || !Number.isSafeInteger(ownApproval.approvedAt) || ownApproval.approvedAt < 1) throw fail();
    // Financial approval selects a read instant only; the pinned loader still
    // verifies the complete chain and preserves the original execution limit.
    return Math.max(ownApproval.approvedAt, reconciliationInstant({ ...env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: value.basePlanFile }));
  }
  if (value.schemaVersion === 5) {
    const base = JSON.parse(readFileSync(value.basePlanFile, 'utf8'));
    const baseApproval = JSON.parse(readFileSync(value.baseApprovalFile, 'utf8'));
    const ownApproval = JSON.parse(readFileSync(resolve(dirname(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE), 'approval.private.json'), 'utf8'));
    if (base.schemaVersion !== 4) throw fail();
    const original = JSON.parse(readFileSync(base.basePlanFile, 'utf8'));
    const originalApproval = JSON.parse(readFileSync(base.baseApprovalFile, 'utf8'));
    const anchors = [ownApproval.approvedAt, baseApproval.approvedAt, originalApproval.approvedAt, original.notBefore];
    if (original.schemaVersion !== 2 || !anchors.every(instant => Number.isSafeInteger(instant) && instant > 0)) throw fail();
    // Historical selection only: loader still verifies all three manifests and
    // their distinct approvals before any connection or reconciliation.
    return Math.max(...anchors);
  }
  if (value.schemaVersion === 3 || value.schemaVersion === 4) {
    const base = JSON.parse(readFileSync(value.basePlanFile, 'utf8'));
    const baseApproval = JSON.parse(readFileSync(value.baseApprovalFile, 'utf8'));
    const budgetApproval = JSON.parse(readFileSync(resolve(dirname(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE), 'approval.private.json'), 'utf8'));
    const anchors = [budgetApproval.approvedAt, baseApproval.approvedAt, base.notBefore];
    if (base.schemaVersion !== 2 || !anchors.every(instant => Number.isSafeInteger(instant) && instant > 0)) throw fail();
    // This selects a historical read instant only. The loader must still pin
    // both manifests and both approvals, preserving the base window for v3 or
    // validating the separately approved, capped execution window for v4.
    return Math.max(...anchors);
  }
  const approvedAt = value.schemaVersion === 2
    ? JSON.parse(readFileSync(resolve(dirname(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE), 'approval.private.json'), 'utf8')).approvedAt
    : value.createdAt;
  const notBefore = value.schemaVersion === 2 ? value.notBefore : approvedAt;
  if (!Number.isSafeInteger(approvedAt) || approvedAt < 1 || !Number.isSafeInteger(notBefore) || notBefore < 1) throw fail();
  // This timestamp is only an evaluation instant. The loader still pins and
  // validates the exact manifest and approval before any database connection.
  return Math.max(approvedAt, notBefore);
}
export function assertAuthorizationRehearsalJob(plan, job) {
  const a = plan.authorization;
  const confirmedRenewal = plan.completionContinuation ? undefined : plan.feeAmendment?.confirmedRenewalTransactionHash;
  if (confirmedRenewal !== undefined && job?.transaction_hash !== confirmedRenewal) throw fail();
  if (!job || job.id !== a.requestId || job.dossier_id !== a.dossierId || job.action !== 'renew' || job.method !== a.method ||
      job.network !== 'testnet' || job.contract_id !== plan.registryId || Number(job.doctor_id) !== plan.doctorId ||
      job.doctor_user_id !== plan.doctor.userId || job.wallet_id !== plan.doctor.walletId || job.wallet !== plan.doctor.address ||
      (plan.doctor.email !== undefined && String(job.doctor_email).toLowerCase() !== plan.doctor.email) ||
      job.requested_by !== plan.reviewer.userId || job.requested_email !== plan.reviewer.email ||
      Number(job.expected_version) !== a.expectedVersion || Number(job.target_version) !== a.targetVersion || Number(job.valid_until) !== a.validUntil ||
      (job.transaction_hash !== null && job.transaction_hash !== undefined && !/^[a-f0-9]{64}$/.test(job.transaction_hash))) throw fail();
}
export async function assertNoOtherRehearsalAttempts(client, requestId) {
  const result = await client.query(`SELECT EXISTS(
    SELECT 1 FROM doctor_authorization_requests WHERE network='testnet' AND state IN ('pending','submitted') AND id<>$1::uuid
    UNION ALL SELECT 1 FROM prescription_booking_requests WHERE network='testnet' AND state IN ('prepared','submitted','cancel_requested')
    UNION ALL SELECT 1 FROM private_operations WHERE state IN ('awaiting_signature','submitted')
    UNION ALL SELECT 1 FROM clinical_web_operations WHERE network='testnet' AND state IN ('awaiting_signature','submitted')
    UNION ALL SELECT 1 FROM clinical_transaction_attempts WHERE state IN ('prepared','submitted')
  ) AS busy`, [requestId]);
  if (result.rows[0]?.busy !== false) throw Error('clinical_rehearsal_authority_busy');
}
/** Pin current executable bytes, interface and administrator before each
 * fresh mutation boundary. Historical receipt reconciliation intentionally
 * does not depend on the registry executable that happens to be current. */
export async function verifyAuthorizationRegistryDeployment({ plan, server }) {
  const liveServer = {
    getNetwork: (...args) => server.getNetwork(...args),
    getLedgerEntries: (...args) => server.getLedgerEntries(...args),
    simulateTransaction: async (...args) => {
      const sim = await server.simulateTransaction(...args);
      if (!rpc.Api.isSimulationSuccess(sim) || !clinicalSimulationIsLive(sim) ||
          !Array.isArray(sim.result?.auth) || sim.result.auth.length !== 0) throw Error('clinical_rehearsal_registry_unavailable');
      return sim;
    },
  };
  const auditor = createClinicalContractAuditor({ server: liveServer, readerAddress: plan.admin });
  await auditor.network();
  return auditor.auditDeployment({ name: 'DoctorRegistryPrivate', contractId: plan.registryId,
    expectedWasmHash: REGISTRY_WASM, interfaceVersion: 1, configuration: { get_admin: plan.admin } });
}
async function connect(url) {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  neonConfig.webSocketConstructor = (await import('ws')).default;
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
  let client;
  try { client = await pool.connect(); }
  catch (error) { await pool.end(); throw error; }
  return { client, close: async () => { client.release(); await pool.end(); } };
}

/** Injected adapters support isolated tests; the CLI always uses real guards. */
export async function runAuthorizationRehearsal({ env = process.env, reconcile = false, adapters = {} } = {}) {
  if (typeof reconcile !== 'boolean') throw fail();
  const load = adapters.loadPolicy ?? loadRehearsalPolicy;
  const checkOpen = adapters.assertRehearsalOpen ?? assertRehearsalOpen;
  const policyOptions = { env, requireApproval: true, ...(reconcile ? { now: (adapters.reconciliationInstant ?? reconciliationInstant)(env) } : {}) };
  const plan = load(policyOptions);
  if (!plan || plan.closingContinuation || env.TRUSTLEAF_ENV !== 'local' || env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false') throw fail();
  const config = workerConfiguration({ ...env, DATABASE_URL: databaseConnectionString(env) });
  const relayer = Keypair.fromSecret(env.RELAYER_SECRET);
  if (config.authority !== plan.admin || relayer.publicKey() !== plan.relayer) throw fail();
  const step = plan.steps.find(item => item.key === 'renew');
  if (!step || step.actor !== 'admin' || step.action !== 'renew' || step.requestId !== plan.authorization.requestId) throw fail();
  const database = new URL(databaseConnectionString(env)); database.hostname = database.hostname.replace('-pooler.', '.');
  if (!/^ep-lingering-water-ahzh89z5\.c-3\.us-east-1\.aws\.neon\.tech$/.test(database.hostname)) throw fail();
  const server = adapters.server ?? new rpc.Server('https://soroban-testnet.stellar.org');
  if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw fail();
  const unlockFiles = []; let connection, locks, bookingHeld = false, runHeld = false, runKey = null, stopped = false;
  const stop = () => { stopped = true; }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const assertPlan = () => {
    const current = load(policyOptions);
    if (!current || current.policyHash !== plan.policyHash || JSON.stringify(current) !== JSON.stringify(plan) || stopped) throw fail();
  };
  try {
    for (const source of [...new Set([plan.admin, plan.relayer])].sort()) {
      const release = await (adapters.acquireSignerLock ?? acquireSignerLock)(env.STELLAR_CONFIG_DIR, source);
      if (!release) throw Error('clinical_rehearsal_authority_busy');
      unlockFiles.push(release);
    }
    assertPlan();
    connection = await (adapters.connect ?? connect)(database.href);
    const client = connection.client;
    locks = await (adapters.acquireSourceLocks ?? acquireClinicalSourceLocks)(client, [plan.admin, plan.relayer]);
    const booking = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', ['trustleaf-booking:' + plan.admin]);
    if (booking.rows[0]?.locked !== true) throw Error('clinical_rehearsal_authority_busy');
    bookingHeld = true;
    await locks.assertHeld(); assertPlan();
    if (plan.schemaVersion !== 2) await assertNoOtherRehearsalAttempts(client, plan.authorization.requestId);
    const selected = (await client.query('SELECT * FROM doctor_authorization_requests WHERE id=$1::uuid', [plan.authorization.requestId])).rows;
    if (!selected.length) return { status: 'not_queued', requestId: plan.authorization.requestId };
    if (selected.length !== 1) throw fail();
    assertAuthorizationRehearsalJob(plan, selected[0]);
    // Rerunning --once on a persisted attempt only reconciles; it never resends.
    const readOnly = reconcile || Boolean(selected[0].transaction_hash);
    if (plan.schemaVersion === 2 && !readOnly) await assertNoOtherRehearsalAttempts(client, plan.authorization.requestId);
    // Session lock survives the worker's own BEGIN/COMMIT boundaries and shares
    // its key with clinical/onboarding transaction locks. Saved receipts stay readable.
    if (!readOnly) {
      runKey = rehearsalRunLockKey(plan);
      if (runKey !== null) {
        const runLock = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [runKey]);
        if (runLock.rows[0]?.locked !== true) throw Error('clinical_rehearsal_authority_busy');
        runHeld = true;
        await checkOpen(client, plan, { lock: false, ...(plan.completionContinuation ? { step } : {}) });
      }
    }
    const assertJob = async (job, phase) => {
      assertPlan(); await locks.assertHeld(); assertAuthorizationRehearsalJob(plan, job);
      if (readOnly && ['prepare','sign','submit'].includes(phase)) throw Error('clinical_rehearsal_reconciliation_read_only');
      if (plan.schemaVersion !== 2 || !readOnly) await assertNoOtherRehearsalAttempts(client, plan.authorization.requestId);
      if (['prepare','sign','submit'].includes(phase)) {
        if (plan.schemaVersion === 2) {
          if (!runHeld || runKey !== rehearsalRunLockKey(plan)) throw fail();
          await checkOpen(client, plan, { lock: false, ...(plan.completionContinuation ? { step } : {}) });
        }
        await (adapters.verifyRegistryDeployment ?? verifyAuthorizationRegistryDeployment)({ plan, server });
        assertPlan(); await locks.assertHeld();
      }
    };
    const provider = adapters.provider ?? new (await import('@privy-io/server-auth')).PrivyClient(PRIVY_APP_ID, env.PRIVY_APP_SECRET);
    const signXdr = readOnly ? async () => { throw Error('clinical_rehearsal_reconciliation_read_only'); }
      : (adapters.secureStoreSigner ?? secureStoreSigner)({ alias: env.DOCTOR_REGISTRY_ADMIN_ALIAS, configDir: env.STELLAR_CONFIG_DIR });
    const sponsorship = plan.completionContinuation ? createRehearsalRenewalSponsorship({ plan, env, client, server,
      assertOpen: async () => { assertPlan(); await locks.assertHeld(); await checkOpen(client, plan, { lock: false, step }); } }) : undefined;
    const chain = (adapters.createChain ?? createChain)({ authority: plan.admin, relayer, provider, signXdr, dataKey: env.TRUSTLEAF_DATA_KEY,
      server, requestId: plan.authorization.requestId, until: plan.until, maxFeeStroops: step.maxFeeStroops, assertJob, ...(sponsorship ? { sponsorship } : {}) });
    const store = (adapters.createStore ?? createStore)(client, { requestId: plan.authorization.requestId, ...(sponsorship ? { sponsorship } : {}) });
    const result = await (adapters.runOnce ?? runOnce)({ store, chain, writesEnabled: !readOnly, prepareEnabled: !readOnly, requestId: plan.authorization.requestId });
    const snapshot = (await client.query('SELECT * FROM doctor_authorization_requests WHERE id=$1::uuid', [plan.authorization.requestId])).rows[0];
    let receiptStatus = null;
    if (/^[a-f0-9]{64}$/.test(snapshot?.transaction_hash ?? '')) {
      assertAuthorizationRehearsalJob(plan, snapshot);
      await chain.verifyEnvelope(snapshot);
      const evidence = await server.getTransaction(snapshot.transaction_hash);
      receiptStatus = evidence.status;
      if (sponsorship) await sponsorship.reconcile(snapshot, evidence);
      if (!['SUCCESS','FAILED','NOT_FOUND'].includes(receiptStatus)) throw fail();
    }
    return { ...result, requestId: plan.authorization.requestId, readOnly, transactionHash: snapshot?.transaction_hash ?? null, receiptStatus };
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    if (bookingHeld) await connection.client.query('SELECT pg_advisory_unlock(hashtext($1))', ['trustleaf-booking:' + plan.admin]).catch(() => {});
    const cleanupErrors = [];
    if (runHeld) {
      try { if ((await connection.client.query('SELECT pg_advisory_unlock(hashtext($1)) AS unlocked', [runKey])).rows[0]?.unlocked !== true) throw Error('clinical_rehearsal_run_lock_lost'); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (locks) await locks.release().catch(error => cleanupErrors.push(error));
    if (connection) await connection.close().catch(error => cleanupErrors.push(error));
    for (const release of unlockFiles.reverse()) await release().catch(error => cleanupErrors.push(error));
    if (cleanupErrors.length) throw Error('clinical_rehearsal_lock_cleanup_required');
  }
}
export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !['--once','--reconcile'].includes(argv[0])) throw Error('clinical_rehearsal_explicit_mode_required');
  process.loadEnvFile(resolve(ROOT, '.env.local'));
  return runAuthorizationRehearsal({ reconcile: argv[0] === '--reconcile' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(result => {
  console.log(JSON.stringify(result));
}).catch(error => {
  const code = /^clinical_rehearsal_[a-z_]+$/.test(error?.message ?? '') ? error.message : 'clinical_rehearsal_authorization_unavailable';
  console.error(JSON.stringify({ status: 'blocked', error: code })); process.exitCode = 1;
});
