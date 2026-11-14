import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Keypair, Networks, Transaction, TransactionBuilder, rpc } from '@stellar/stellar-sdk';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrivyClient } from '@privy-io/server-auth';
import WebSocket from 'ws';
import { databaseConnectionString } from './lib/database-connection.mjs';
import { clinicalRpcUrl } from './lib/clinical-rpc.mjs';
import { acquireClinicalSourceLocks } from './lib/clinical-source-lock.mjs';
import { acquireSignerLock, PRIVY_APP_ID, secureStoreSigner } from './lib/private-worker-runtime.mjs';
import { assertPrivateRxScopeOpen, loadPrivateRxScope, PRIVATE_RX_SCOPE_ENV } from './lib/digital-cabs-rx-scope.mjs';
import { createPrivateRxSponsorship, privateRxQuote } from './lib/private-rx-sponsorship.mjs';
import { quoteExpiresAt, sha256 } from './lib/sponsorship-domain.mjs';
import { assertScopedAttestationJob, createScopedAttestationChain, createStore, quoteScopedAttestation, runOnce } from './worker-prescription-bookings.mjs';

const QUOTE_FILE = 'digital-cabs-rx-attestation-quote.private.json';
const deny = (code = 'private_rx_attestation_scope_rejected') => { throw Error(code); };
const check = (value, code) => { if (!value) deny(code); };

function quotePath(env) {
  const scopeFile = env[PRIVATE_RX_SCOPE_ENV.file], file = env.TRUSTLEAF_PRIVATE_RX_ATTESTATION_QUOTE_FILE;
  check(typeof file === 'string' && isAbsolute(file) && basename(file) === QUOTE_FILE &&
    resolve(file) === resolve(dirname(scopeFile), QUOTE_FILE));
  check(realpathSync(dirname(file)) === realpathSync(dirname(scopeFile)));
  return file;
}

function quoteSummary(artifact, quoteSha256) {
  const { requestId, appointmentId, issuanceId, ledger, quote } = artifact;
  return { status: 'quoted', requestId, appointmentId, issuanceId, ledger, quoteSha256,
    maxFeeStroops: quote.offeredFeeStroops, resourceFeeStroops: quote.resourceFeeStroops,
    preparedAt: quote.preparedAt, quoteExpiresAt: quoteExpiresAt(quote), expiresAt: quote.maxTime };
}

async function readPinnedQuote(scope, env, live) {
  const file = quotePath(env), stat = lstatSync(file);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 65536, 'private_rx_attestation_quote_mismatch');
  const bytes = readFileSync(file, 'utf8');
  check(sha256(bytes) === scope.attestationQuoteSha256, 'private_rx_attestation_quote_mismatch');
  const artifact = JSON.parse(bytes);
  check(Object.keys(artifact).sort().join(',') === 'appointmentId,authority,bookingValidUntil,contractId,issuanceId,ledger,network,quote,relayer,requestId,runId,schemaVersion,sourceSequence,unsignedXdr' &&
    artifact.schemaVersion === 1 && artifact.network === 'testnet' && artifact.runId === scope.runId && artifact.appointmentId === scope.appointmentId &&
    artifact.issuanceId === scope.issuanceId && artifact.requestId === scope.steps.attest.requestId && artifact.contractId === scope.contractId &&
    artifact.authority === scope.authority && artifact.relayer === scope.relayer && artifact.bookingValidUntil === scope.bookingValidUntil &&
    Number.isSafeInteger(artifact.ledger) && artifact.ledger > 0 && /^(?:0|[1-9][0-9]*)$/.test(artifact.sourceSequence) &&
    typeof artifact.unsignedXdr === 'string' && artifact.quote?.preparedAt >= scope.openedAt, 'private_rx_attestation_quote_mismatch');
  const tx = TransactionBuilder.fromXDR(artifact.unsignedXdr, Networks.TESTNET);
  check(tx instanceof Transaction && BigInt(tx.sequence) === BigInt(artifact.sourceSequence) + 1n, 'private_rx_attestation_quote_mismatch');
  const quote = await privateRxQuote(scope, 'attest', artifact.unsignedXdr, undefined,
    { preparedAt: artifact.quote.preparedAt, now: live ? Math.floor(Date.now() / 1000) : artifact.quote.preparedAt });
  check(Object.keys(quote).length === Object.keys(artifact.quote).length &&
    Object.entries(quote).every(([key, value]) => Object.hasOwn(artifact.quote, key) && artifact.quote[key] === value), 'private_rx_attestation_quote_mismatch');
  return artifact;
}

async function readBooking(client, scope, fresh = false) {
  const result = await client.query(`SELECT r.* FROM prescription_booking_requests r
    JOIN appointments a ON a.id=r.appointment_id
    JOIN privy_stellar_wallet_bindings p ON p.app_id=$6 AND p.user_id=r.patient_requested_by AND p.wallet_id=r.patient_wallet_id AND p.address=r.patient_wallet
    JOIN privy_stellar_wallet_bindings d ON d.app_id=$6 AND d.user_id=r.doctor_user_id AND d.wallet_id=r.doctor_wallet_id AND d.address=r.doctor_wallet
    WHERE r.appointment_id=$1 AND r.issuance_id=$2 AND a.date=$3::date AND a.time_slot=$4 AND a.type=$5 AND a.doctor_id=$7
      AND a.patient_user_id=r.patient_requested_by AND a.patient_wallet_id=r.patient_wallet_id AND a.patient_wallet=r.patient_wallet AND a.patient_email=r.patient_email
      AND a.doctor_user_id=r.doctor_user_id AND a.doctor_wallet_id=r.doctor_wallet_id AND a.doctor_wallet=r.doctor_wallet AND a.doctor_email=r.doctor_email
      AND (NOT $8 OR (a.status='in_progress' AND a.date=(NOW() AT TIME ZONE 'America/Santiago')::date AND a.started_at<=NOW()
        AND a.started_at>NOW()-INTERVAL '24 hours' AND a.attendance_at<=NOW() AND a.attendance_user_id=r.patient_requested_by AND a.started_by=r.doctor_user_id
        AND r.valid_until>EXTRACT(EPOCH FROM NOW()) AND r.cancellation_requested_at IS NULL))`,
    [scope.appointmentId, scope.issuanceId, scope.slot.date, scope.slot.timeSlot, scope.slot.type, PRIVY_APP_ID, scope.doctorId, fresh]);
  check(result.rows.length === 1);
  const [job] = result.rows;
  assertScopedAttestationJob(scope, job);
  return job;
}

function savedEnvelope(job) {
  const hash = job.transaction_hash ?? job.attestation_hash;
  if (!hash) return null;
  const attempts = job.attempts;
  check(Array.isArray(attempts) && attempts.length === 1 && attempts[0].kind === 'attest' && attempts[0].hash === hash &&
    (!job.prepared_xdr || job.prepared_xdr === attempts[0].xdr));
  return { hash, xdr: attempts[0].xdr };
}

async function receiptSummary(job, artifact, sponsorship, server) {
  const saved = savedEnvelope(job);
  if (!saved) return { queueState: job.state, transactionHash: null, receiptStatus: null, feeChargedStroops: null };
  await sponsorship.verifyBound('attest', artifact.unsignedXdr, undefined, saved.xdr, saved.hash);
  const receipt = await server.getTransaction(saved.hash);
  const canonical = await sponsorship.reconcile('attest', artifact.unsignedXdr, undefined, saved.xdr, saved.hash, receipt, { readOnly: true });
  return { queueState: job.state, transactionHash: saved.hash, receiptStatus: receipt.status,
    feeChargedStroops: canonical?.feeChargedStroops ?? null, ledger: canonical?.ledger ?? null };
}

async function assertNoOtherAuthorityAttempt(client, scope) {
  const result = await client.query(`SELECT EXISTS (
    SELECT 1 FROM doctor_authorization_requests WHERE network='testnet' AND state='submitted' AND transaction_hash IS NOT NULL
    UNION ALL SELECT 1 FROM prescription_booking_requests WHERE network='testnet' AND appointment_id<>$1
      AND state IN ('submitted','cancel_requested') AND transaction_hash IS NOT NULL
    UNION ALL SELECT 1 FROM private_operations WHERE source_wallet=$2 AND state IN ('awaiting_signature','submitted')
    UNION ALL SELECT 1 FROM clinical_web_operations WHERE source_wallet=$2 AND state IN ('awaiting_signature','submitted')
    UNION ALL SELECT 1 FROM clinical_transaction_attempts WHERE source_wallet=$2 AND state IN ('prepared','submitted')
  ) AS busy`, [scope.appointmentId, scope.authority]);
  check(result.rows[0]?.busy === false, 'private_rx_authority_busy');
}

export async function runPrivateRxAttestation({ mode, env = process.env }) {
  const quoteOnly = mode === '--quote-only', reconcileRead = mode === '--reconcile-read', once = mode === '--once';
  check(quoteOnly || reconcileRead || once, 'private_rx_explicit_mode_required');
  const scope = loadPrivateRxScope({ env, requireApproval: once, allowExpired: reconcileRead });
  check(scope?.phase === 'issuance' && (quoteOnly ? scope.attestationQuoteSha256 === null : Boolean(scope.attestationQuoteSha256)));
  if (reconcileRead) check(env[PRIVATE_RX_SCOPE_ENV.approval] === scope.policyHash);
  if (!once) check(!env.RELAYER_SECRET && !env.DOCTOR_REGISTRY_ADMIN_ALIAS, 'private_rx_read_mode_has_signer');
  const server = new rpc.Server(clinicalRpcUrl(env.TRUSTLEAF_CLINICAL_RPC_PROVIDER), { timeout: 20000 });
  check((await server.getNetwork()).passphrase === Networks.TESTNET);
  const database = new URL(databaseConnectionString(env));
  if (once) database.hostname = database.hostname.replace('-pooler.', '.');
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: database.href, connectionTimeoutMillis: 15000 });
  let client, locks, bookingLock = false, readTransaction = false;
  const releaseSigners = [];
  try {
    if (once) {
      check(Keypair.fromSecret(env.RELAYER_SECRET ?? '').publicKey() === scope.relayer && env.STELLAR_CONFIG_DIR && env.DOCTOR_REGISTRY_ADMIN_ALIAS);
      for (const address of [scope.authority, scope.relayer].sort()) {
        const release = await acquireSignerLock(env.STELLAR_CONFIG_DIR, address);
        check(release, 'private_rx_authority_busy');
        releaseSigners.push(release);
      }
    }
    client = await pool.connect();
    if (!once) { await client.query('BEGIN READ ONLY'); readTransaction = true; }
    const job = await readBooking(client, scope, quoteOnly);
    if (quoteOnly) {
      const artifact = await quoteScopedAttestation({ scope, job, server });
      const bytes = JSON.stringify(artifact, null, 2) + '\n';
      writeFileSync(quotePath(env), bytes, { flag: 'wx', mode: 0o600 });
      return quoteSummary(artifact, sha256(bytes));
    }
    const artifact = await readPinnedQuote(scope, env, once && !savedEnvelope(job));
    const sponsorship = createPrivateRxSponsorship({ scope, client, env });
    if (reconcileRead) return { status: 'read_only', requestId: artifact.requestId, ...await receiptSummary(job, artifact, sponsorship, server) };
    locks = await acquireClinicalSourceLocks(client, [scope.authority, scope.relayer]);
    const booking = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', ['trustleaf-booking:' + scope.authority]);
    check(booking.rows[0]?.locked === true, 'private_rx_authority_busy');
    bookingLock = true;
    const before = await readBooking(client, scope);
    if (['confirmed', 'consumed', 'failed'].includes(before.state)) {
      return { status: 'terminal', requestId: artifact.requestId, ...await receiptSummary(before, artifact, sponsorship, server) };
    }
    const sending = !savedEnvelope(before);
    if (sending) sponsorship.assertConfigured('attest');
    const assertJob = async (claimed, phase) => {
      assertPrivateRxScopeOpen(scope, { env, step: 'attest' });
      await locks.assertHeld();
      assertScopedAttestationJob(scope, claimed);
      if (phase === 'read') return;
      check(sending);
      const live = await readBooking(client, scope, true);
      check(live.lease_token === claimed.lease_token && (live.transaction_hash ?? null) === (claimed.transaction_hash ?? null));
      await assertNoOtherAuthorityAttempt(client, scope);
      assertPrivateRxScopeOpen(scope, { env, step: 'attest' });
    };
    const chain = createScopedAttestationChain({ scope, artifact, sponsorship, assertJob, server,
      provider: new PrivyClient(PRIVY_APP_ID, env.PRIVY_APP_SECRET),
      signXdr: sending ? secureStoreSigner({ alias: env.DOCTOR_REGISTRY_ADMIN_ALIAS, configDir: env.STELLAR_CONFIG_DIR }) : async () => deny() });
    const store = createStore(client, scope.contractId, { appointmentId: scope.appointmentId, sponsorship,
      settleSponsorship: (row, receipt) => sponsorship.reconcile('attest', artifact.unsignedXdr, undefined, row.prepared_xdr, row.transaction_hash, receipt, { atomic: true }) });
    const result = await runOnce({ store, chain, writesEnabled: sending, prepareEnabled: sending, appointmentId: scope.appointmentId });
    const saved = await readBooking(client, scope);
    return { ...result, requestId: artifact.requestId, ...await receiptSummary(saved, artifact, sponsorship, server) };
  } finally {
    if (readTransaction) await client.query('ROLLBACK').catch(() => {});
    if (bookingLock) await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['trustleaf-booking:' + scope.authority]).catch(() => {});
    if (locks) await locks.release();
    client?.release();
    await pool.end();
    for (const release of releaseSigners.reverse()) await release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  runPrivateRxAttestation({ mode: args.length === 1 ? args[0] : '' }).then(result => console.log(JSON.stringify(result))).catch(error => {
    const code = /^(?:private_rx_|sponsorship_|clinical_source_)[a-z_]+$/.test(error?.message ?? '') ? error.message : 'private_rx_attestation_unavailable';
    console.error(JSON.stringify({ status: 'blocked', error: code }));
    process.exitCode = 1;
  });
}
