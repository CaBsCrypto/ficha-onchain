import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Address, FeeBumpTransaction, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { databaseConnectionString } from './database-connection.mjs';
import { PRIVATE_RX_AUTHORITY, validatePrivateRxManifest } from './digital-cabs-rx-scope.mjs';
import { PRIVATE_REGISTRY_ID } from './private-registry.mjs';
import { decodeSponsorshipReservation } from './sponsorship-sql-store.mjs';
import { privateRxInvocation, verifyPrivateRxReceipt } from './private-rx-sponsorship.mjs';
import { clinicalRpcUrl } from './clinical-rpc.mjs';
import { createClinicalWebAuditor } from './clinical-web-receipt-audit.mjs';

export const HOSTED_CAPTURE_ORIGIN = 'https://www.trustleaf.org';
const WEB_HOST = 'ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech';
const DIRECT_HOST = WEB_HOST.replace('-pooler.', '.');
const CLINICAL = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const lockKey = 'trustleaf-hosted-capture-v1';
const priorPhase = { 'grant-note': 'create', pdf: 'grant-note', appointment: 'pdf', attest: 'appointment', issuance: 'attest', close: 'issuance' };
const requiresVerification = new Set(['pdf', 'appointment', 'close']);
const hex = /^(?!0{64}$)[0-9a-f]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[0-9a-f]{12}$/;
const fail = (code = 'hosted_capture_scope_rejected') => { throw Error(code); };
const check = (condition, code) => { if (!condition) fail(code); };
const epoch = value => Number.isSafeInteger(value) && value > 0;
const now = () => Math.floor(Date.now() / 1000);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const actor = value => exact(value, ['userId', 'walletId', 'address']) && /^did:privy:[a-z0-9]{10,80}$/.test(value.userId) &&
  /^[a-zA-Z0-9_-]{6,100}$/.test(value.walletId) && StrKey.isValidEd25519PublicKey(value.address);
const concerned = name => /^TRUSTLEAF_(?:CLINICAL_(?:CAPTURE|CREATE_ONCE|HOSTED_CREATE_ONCE|REHEARSAL)|INITIAL_DOCTOR_SCOPE|DIGITAL_CABS_RX_SCOPE)(?:_|$)/.test(name);

export function hostedCaptureWebConfigured(env = process.env) {
  return env.TRUSTLEAF_HOSTED_CAPTURE_ENABLED === 'true';
}

function assertHostedCaptureEnvironment(env, web) {
  try {
    const connectionString = databaseConnectionString(env);
    const database = new URL(connectionString);
    const platform = web
      ? hostedCaptureWebConfigured(env) && !Object.hasOwn(env, 'TRUSTLEAF_HOSTED_CAPTURE_OPERATOR') && env.VERCEL_ENV === 'production'
      : env.TRUSTLEAF_HOSTED_CAPTURE_OPERATOR === 'true' && !hostedCaptureWebConfigured(env) && !Object.hasOwn(env, 'VERCEL') && !Object.hasOwn(env, 'VERCEL_ENV');
    const allowedParams = ['sslmode', 'channel_binding', 'connect_timeout', 'pgbouncer'];
    check(platform && env.TRUSTLEAF_ENV === 'test' && env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet' &&
      env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'false' && ['postgres:', 'postgresql:'].includes(database.protocol) &&
      [WEB_HOST, ...(web ? [] : [DIRECT_HOST])].includes(database.hostname) && database.hostname === env.TRUSTLEAF_DB_HOST &&
      /^\/[^/]+$/.test(database.pathname) && !database.hash && ['','5432'].includes(database.port) &&
      [...database.searchParams.keys()].every(key => allowedParams.includes(key) && database.searchParams.getAll(key).length === 1) &&
      (!database.searchParams.has('sslmode') || ['require', 'verify-full'].includes(database.searchParams.get('sslmode'))) &&
      !Object.keys(env).some(concerned) && ['TRUSTLEAF_CLINICAL_MIGRATION', 'TRUSTLEAF_CLINICAL_WEB_MIGRATION'].every(key => env[key] === undefined || env[key] === 'false'), 'hosted_capture_environment_rejected');
    database.hostname = DIRECT_HOST;
    database.searchParams.delete('pgbouncer');
    return { origin: HOSTED_CAPTURE_ORIGIN, connectionString, directConnectionString: database.href };
  } catch {
    fail('hosted_capture_environment_rejected');
  }
}

export const assertHostedCaptureWeb = (env = process.env) => assertHostedCaptureEnvironment(env, true);
export const assertHostedCaptureOperator = (env = process.env) => assertHostedCaptureEnvironment(env, false);

function parse(bytes) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 8192);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { fail(); }
}

function historyFor(address) {
  const network = Buffer.from(digest(Networks.TESTNET), 'hex');
  return digest(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('hist_id'), nativeToScVal(network),
    new Address(CLINICAL).toScVal(), new Address(address).toScVal()]).toXDR());
}

function samePair(left, right) {
  return left && right && ['patient', 'doctor', 'historyId', 'doctorId', 'relayer'].every(key => isDeepStrictEqual(left[key], right[key]));
}

function exactNote(note) {
  return exact(note, ['title', 'text', 'eventDate']) && note.eventDate === null &&
    typeof note.title === 'string' && note.title === note.title.trim() && note.title.length > 0 && note.title.length <= 120 &&
    typeof note.text === 'string' && note.text === note.text.trim() && note.text.length > 0 && note.text.length <= 20_000;
}

function validateManifest(phase, plan, previous, base) {
  check(plan?.schemaVersion === (phase === 'close' ? 2 : 1) && uuid.test(plan.runId) &&
    epoch(plan.openedAt) && epoch(plan.until) && plan.openedAt < plan.until);
  if (phase === 'close') {
    check(exact(plan, ['schemaVersion','runId','openedAt','until','basePdfScopeSha256','pdfTransactionHash','correction','revocation']) &&
      exact(plan.correction, ['requestId','operationId','entryId','previousCommitment','note']) &&
      exact(plan.revocation, ['requestId','operationId']) &&
      [plan.correction.operationId, plan.revocation.operationId, plan.correction.entryId, plan.correction.previousCommitment].every(value => hex.test(value)) &&
      plan.correction.operationId !== plan.revocation.operationId && hex.test(plan.pdfTransactionHash) &&
      exact(plan.correction.note, ['title','text','eventDate','prescriptionId']) &&
      plan.correction.note.prescriptionId === previous?.prescriptionId &&
      isDeepStrictEqual({ title: plan.correction.note.title, text: plan.correction.note.text, eventDate: plan.correction.note.eventDate }, base?.note) &&
      plan.openedAt >= base.until && plan.until - plan.openedAt <= 3600 && plan.until < base.doctorValidUntil);
    return [[plan.correction.requestId, 'close'], [plan.revocation.requestId, 'close']];
  }

  check(plan.network === 'testnet' && actor(plan.patient) && actor(plan.doctor) &&
    plan.patient.userId !== plan.doctor.userId && plan.patient.walletId !== plan.doctor.walletId &&
    StrKey.isValidEd25519PublicKey(plan.relayer) &&
    new Set([plan.patient.address, plan.doctor.address, plan.relayer, PRIVATE_RX_AUTHORITY]).size === 4 &&
    plan.historyId === historyFor(plan.patient.address) && epoch(plan.doctorId));
  if (phase === 'create') {
    check(exact(plan, ['schemaVersion','phase','runId','openedAt','until','network','patient','doctor','historyId','doctorId','relayer','requestId']) &&
      plan.phase === 'create' && plan.until - plan.openedAt <= 600);
    return [[plan.requestId, phase]];
  }
  if (phase === 'appointment' || phase === 'attest') {
    check(plan.phase === (phase === 'appointment' ? 'appointment' : 'issuance'));
    validatePrivateRxManifest(plan, base, { now: plan.openedAt, basePdfScopeSha256: plan.basePdfScopeSha256 });
    if (phase === 'appointment') {
      check(plan.slot.oneTime === true && plan.slot.type === 'Presencial');
      return [];
    }
    check(plan.runId === previous.runId && isDeepStrictEqual(plan.slot, previous.slot) &&
      plan.basePdfScopeSha256 === previous.basePdfScopeSha256 && hex.test(plan.attestationQuoteSha256));
    return [[plan.steps.attest.requestId, 'attest'], [plan.steps.consent.requestId, 'issuance'], [plan.steps.mint.requestId, 'issuance']];
  }

  const common = ['schemaVersion','runId','openedAt','until','network','contractId','registryId','relayer','patient','doctor',
    'historyId','doctorId','doctorValidUntil','grantRequestId','noteRequestId','note'];
  const pdf = phase === 'pdf';
  check(exact(plan, [...common, ...(pdf ? ['pdfRequestId','grantTransactionHash','noteTransactionHash','pdf'] : [])]) &&
    plan.contractId === CLINICAL && plan.registryId === PRIVATE_REGISTRY_ID && epoch(plan.doctorValidUntil) &&
    plan.until < plan.doctorValidUntil && plan.until - plan.openedAt <= (pdf ? 900 : 3600) && exactNote(plan.note));
  if (!pdf) return [[plan.grantRequestId, phase], [plan.noteRequestId, phase]];
  check(plan.grantRequestId === base?.grantRequestId && plan.noteRequestId === base?.noteRequestId &&
    plan.doctorValidUntil === base?.doctorValidUntil && isDeepStrictEqual(plan.note, base?.note) &&
    hex.test(plan.grantTransactionHash) && hex.test(plan.noteTransactionHash) && plan.grantTransactionHash !== plan.noteTransactionHash &&
    exact(plan.pdf, ['fileName','mediaType','byteLength','sha256']) && plan.pdf.fileName === 'synthetic-clinical-demo.pdf' &&
    plan.pdf.mediaType === 'application/pdf' && plan.pdf.byteLength === 964 &&
    plan.pdf.sha256 === 'ff33beb1f5c938fc0b3d264b2b21ab02e3bb3e0e4447a1dacdeb30172bf1c93c');
  return [[plan.pdfRequestId, phase]];
}

const latestSql = 'SELECT sha256,phase FROM hosted_capture_activations ORDER BY id DESC LIMIT 1';
async function latest(client) {
  try { return (await client.query(latestSql)).rows[0] ?? null; }
  catch (error) {
    if (error.code === '42P01') fail('hosted_capture_schema_unavailable');
    throw error;
  }
}

const selected = [
  'm.sha256,m.run_id,m.phase AS manifest_phase,m.bytes,m.predecessor_sha256,m.base_sha256,m.base_receipt_hash,m.expires_at',
  'base.bytes AS base_bytes',
  '(SELECT FLOOR(EXTRACT(EPOCH FROM MAX(a.activated_at)))::bigint FROM hosted_capture_activations a WHERE a.sha256=m.sha256 AND a.phase=$2) AS approved_at',
].join(',');
const byShaSql = 'SELECT ' + selected + ' FROM hosted_capture_manifests m LEFT JOIN hosted_capture_manifests base ON base.sha256=m.base_sha256 WHERE m.sha256=$1';

async function snapshot(client, hash, phaseOverride, state) {
  const stagedPhase = phaseOverride ?? (await client.query('SELECT phase FROM hosted_capture_manifests WHERE sha256=$1', [hash])).rows[0]?.phase;
  if (!stagedPhase) return null;
  const phase = phaseOverride ?? (state?.sha256 === hash && state.phase !== 'shutdown' ? state.phase : stagedPhase);
  const row = (await client.query(byShaSql, [hash, phase])).rows[0];
  if (!row) return null;
  const approvedAt = row.approved_at === null ? null : Number(row.approved_at);
  const plan = parse(row.bytes);
  const base = row.base_bytes && parse(row.base_bytes);
  check(digest(row.bytes) === row.sha256 && row.sha256 === hash &&
    (!row.base_sha256 || row.base_bytes && digest(row.base_bytes) === row.base_sha256) &&
    Number(row.expires_at) === plan.until && (approvedAt === null || epoch(approvedAt)));
  const pair = phase === 'close' ? base : plan;
  return {
    phase, sha256: hash, bytes: row.bytes, approvalSha256: approvedAt === null ? null : hash,
    approvedAt, expiresAt: plan.until, predecessorSha256: row.predecessor_sha256, baseSha256: row.base_sha256,
    baseBytes: row.base_bytes, baseReceiptHash: row.base_receipt_hash, runId: row.run_id,
    patient: pair.patient, doctor: pair.doctor, relayer: pair.relayer, historyId: pair.historyId, doctorId: pair.doctorId,
    origin: HOSTED_CAPTURE_ORIGIN, active: state?.sha256 === hash && state.phase === phase,
  };
}

export async function readHostedCaptureActive(client) {
  const state = await latest(client);
  return state && state.phase !== 'shutdown' ? snapshot(client, state.sha256, state.phase, state) : null;
}

export async function readHostedCaptureBySha(client, hash) {
  check(hex.test(hash));
  return snapshot(client, hash, undefined, await latest(client));
}

export async function readHostedCaptureByRequest(client, requestId) {
  if (!uuid.test(requestId)) return null;
  const state = await latest(client);
  const row = (await client.query('SELECT sha256,phase FROM hosted_capture_requests WHERE request_id=$1', [requestId])).rows[0];
  if (!row) return null;
  const stored = await snapshot(client, row.sha256, row.phase, state);
  return stored?.approvalSha256 ? stored : null;
}

async function assertActive(client, phase, sha256) {
  const scope = await readHostedCaptureActive(client);
  check(scope?.phase === phase && scope.sha256 === sha256 && scope.approvalSha256 === sha256, 'hosted_capture_not_active');
  check(now() < scope.expiresAt, 'hosted_capture_expired');
  return scope;
}

async function assertHistorical(client, requestId, sha256) {
  const historical = await readHostedCaptureByRequest(client, requestId);
  check(historical?.sha256 === sha256 && historical.approvalSha256 === sha256, 'hosted_capture_recovery_rejected');
  return historical;
}

export async function lockHostedCaptureMutation(client, phase, sha256) {
  await client.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))', [lockKey]);
  return assertActive(client, phase, sha256);
}

export async function lockHostedCaptureRecovery(client, requestId, sha256) {
  await client.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))', [lockKey]);
  return assertHistorical(client, requestId, sha256);
}

async function lockSession(client, verify) {
  const unlock = async () => {
    const result = await client.query('SELECT pg_advisory_unlock_shared(hashtext($1)) AS released', [lockKey]);
    check(result.rows[0]?.released === true, 'hosted_capture_lock_lost');
  };
  await client.query('SELECT pg_advisory_lock_shared(hashtext($1))', [lockKey]);
  try { await verify(); }
  catch (error) { await unlock(); throw error; }
  return unlock;
}

export const lockHostedCaptureSession = (client, phase, sha256) => lockSession(client, () => assertActive(client, phase, sha256));
export const lockHostedCaptureRecoverySession = (client, requestId, sha256) => lockSession(client, () => assertHistorical(client, requestId, sha256));

async function lockOperator(client) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
}


function planOf(scope) { return parse(scope.bytes); }

async function previousFor(client, phase) {
  const state = await latest(client);
  if (phase === 'create') {
    check(!state || state.phase === 'shutdown', 'hosted_capture_phase_order');
    if (state) {
      const { rows } = await client.query(
        "SELECT EXISTS(SELECT 1 FROM hosted_capture_requests r JOIN hosted_capture_manifests m ON m.sha256=r.sha256 JOIN hosted_capture_manifests retired ON retired.sha256=$1 JOIN sponsorship_reservations s ON s.request_id=r.request_id WHERE m.run_id=retired.run_id AND s.state IN ('signed','submitted')) AS unresolved",
        [state.sha256],
      );
      check(rows[0]?.unresolved === false, 'hosted_capture_prior_attempt_pending');
    }
    return null;
  }
  check(state?.phase === priorPhase[phase], 'hosted_capture_phase_order');
  const previous = await snapshot(client, state.sha256, state.phase, state);
  check(previous?.approvalSha256 === previous.sha256, 'hosted_capture_phase_order');
  return previous;
}

async function phaseBase(client, phase, previous) {
  if (phase === 'pdf' || phase === 'appointment') return previous;
  if (phase === 'attest' || phase === 'close') return readHostedCaptureBySha(client, previous.baseSha256);
  return null;
}

function verifyParticipantAllowlist(scope, env) {
  const legacy = new Set((env.TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS ?? '').split(','));
  check(!legacy.has(scope.patient.address) && !legacy.has(scope.doctor.address), 'hosted_capture_legacy_overlap');
}

async function verifyParticipants(client, scope) {
  const rows = (await client.query("SELECT id FROM doctors WHERE LOWER(email)='cabscryptocontacto@gmail.com' AND status='active' LIMIT 2")).rows;
  check(rows.length === 1 && Number(rows[0].id) === scope.doctorId, 'hosted_capture_doctor_profile');
  const bindings = (await client.query(
    "SELECT user_id,wallet_id,address FROM privy_stellar_wallet_bindings WHERE app_id='cmrix722m03d30clewd1fuffq' AND (user_id=ANY($1::text[]) OR address=ANY($2::text[]))",
    [[scope.patient.userId, scope.doctor.userId], [scope.patient.address, scope.doctor.address]],
  )).rows;
  check(bindings.length === 2 && [scope.patient, scope.doctor].every(person =>
    bindings.some(row => row.user_id === person.userId && row.wallet_id === person.walletId && row.address === person.address)),
  'hosted_capture_actor_binding');
}

async function requireReceipt(client, requestId, action, person, scope, expectedHash) {
  const row = (await client.query(
    "SELECT transaction_hash,expected,signed_xdr,actor_user_id,wallet_id,source_wallet FROM clinical_web_operations WHERE id=$1 AND state='confirmed' AND action=$2 AND method=$2 AND network='testnet' AND contract_id=$3",
    [requestId, action, CLINICAL],
  )).rows[0];
  check(row && row.actor_user_id === person.userId && row.wallet_id === person.walletId &&
    row.source_wallet === person.address && row.expected?.historyId === scope.historyId &&
    row.expected.patient === scope.patient.address && row.signed_xdr && hex.test(row.transaction_hash) &&
    (!expectedHash || expectedHash === row.transaction_hash), 'hosted_capture_predecessor_receipt');
  const hold = await requireSettlement(client, requestId, row.transaction_hash, person.address, scope, action, CLINICAL);
  if (action === 'create_history') {
    const server = new rpc.Server(clinicalRpcUrl('gateway'), { timeout: 10_000 });
    const auditor = createClinicalWebAuditor({ server, relayer: scope.relayer });
    const proof = await auditor.operation({ state: 'confirmed', action, transactionHash: row.transaction_hash },
      { action, patient: scope.patient.address, doctor: scope.doctor });
    check(proof.chainProofVerified && proof.historyId === scope.historyId &&
      proof.operationId === row.expected.operationId && proof.ledger === hold.ledger, 'hosted_capture_predecessor_receipt');
  }
  return row.transaction_hash;
}

async function requireSettlement(client, requestId, transactionHash, source, scope, method, contract, issuanceId) {
  const row = (await client.query(
    "SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1 AND network='testnet' AND state='settled' AND transaction_hash=$2",
    [requestId, transactionHash],
  )).rows[0];
  const hold = row && decodeSponsorshipReservation(row);
  check(hold?.outcome === 'SUCCESS' && epoch(hold.ledger) &&
    hold.binding.contractId === contract && hold.binding.action === method && hold.binding.sponsorAddress === scope.relayer &&
    hold.binding.sourceAddress === source && hold.binding.patientAddress === scope.patient.address &&
    (!issuanceId || hold.binding.encounterId === issuanceId), 'hosted_capture_predecessor_settlement');
  return hold;
}

async function exactBooking(client, plan, confirmed) {
  const row = (await client.query(
    "SELECT b.*, a.status AS appointment_state, a.date::text AS appointment_date, a.time_slot, a.type, a.doctor_id, a.started_by, a.attendance_user_id FROM prescription_booking_requests b JOIN appointments a ON a.id=b.appointment_id WHERE b.appointment_id=$1 AND b.issuance_id=$2 AND b.network='testnet' AND b.contract_id=$3",
    [plan.appointmentId, plan.issuanceId, plan.contractId],
  )).rows[0];
  check(row?.appointment_state === 'in_progress' && row.appointment_date === plan.slot.date && row.time_slot === plan.slot.timeSlot &&
    row.type === plan.slot.type && Number(row.doctor_id) === plan.doctorId && row.started_by === plan.doctor.userId &&
    row.attendance_user_id === plan.patient.userId && Number(row.valid_until) === plan.bookingValidUntil &&
    row.patient_requested_by === plan.patient.userId && row.patient_wallet_id === plan.patient.walletId && row.patient_wallet === plan.patient.address &&
    row.doctor_user_id === plan.doctor.userId && row.doctor_wallet_id === plan.doctor.walletId && row.doctor_wallet === plan.doctor.address &&
    !row.cancellation_requested_at && !row.transaction_hash && !row.prepared_xdr &&
    Array.isArray(row.attempts), 'hosted_capture_booking_unverified');
  if (!confirmed) {
    check(row.state === 'prepared' && !row.attestation_hash && row.attempts.length === 0 && now() < plan.bookingValidUntil,
      'hosted_capture_booking_unverified');
    return;
  }
  const attempt = row.attempts[0];
  check(row.state === 'confirmed' && hex.test(row.attestation_hash) && row.attempts.length === 1 &&
    attempt?.kind === 'attest' && attempt.hash === row.attestation_hash, 'hosted_capture_attestation_unverified');
  const outer = TransactionBuilder.fromXDR(attempt.xdr, Networks.TESTNET);
  const invocation = privateRxInvocation(plan, 'attest').body().invokeHostFunctionOp().hostFunction();
  const operation = outer instanceof FeeBumpTransaction ? outer.innerTransaction.operations[0] : null;
  check(outer instanceof FeeBumpTransaction && outer.hash().toString('hex') === row.attestation_hash &&
    outer.feeSource === plan.relayer && outer.innerTransaction.source === plan.authority &&
    outer.innerTransaction.operations.length === 1 && operation?.type === 'invokeHostFunction' &&
    operation.func.toXDR().equals(invocation.toXDR()), 'hosted_capture_attestation_unverified');
  const hold = await requireSettlement(client, plan.steps.attest.requestId, row.attestation_hash, plan.authority, plan,
    'attest_booking', plan.contractId, plan.issuanceId);
  const server = new rpc.Server(clinicalRpcUrl('gateway'), { timeout: 10_000 });
  check((await server.getNetwork()).passphrase === Networks.TESTNET, 'hosted_capture_attestation_unverified');
  const live = verifyPrivateRxReceipt(await server.getTransaction(row.attestation_hash), outer, row.attestation_hash);
  check(live.status === 'SUCCESS' && live.ledger === hold.ledger && live.feeChargedStroops === hold.chargedStroops,
    'hosted_capture_attestation_unverified');
  return row.attestation_hash;
}

async function requireMint(client, previous, plan) {
  const row = (await client.query(
    "SELECT o.transaction_hash,o.expected FROM private_operations o JOIN private_prescriptions p ON p.id=o.prescription_id JOIN prescription_booking_requests b ON b.appointment_id=o.appointment_id AND b.issuance_id=p.issuance_id WHERE o.id=$1 AND o.appointment_id=$2 AND o.prescription_id=$3 AND o.action='mint' AND o.method='mint_prescription' AND o.state='confirmed' AND o.contract_id=$4 AND o.actor_user_id=$5 AND o.wallet_id=$6 AND o.source_wallet=$7 AND p.state='confirmed' AND p.contract_id=$4 AND p.network='testnet' AND p.transaction_hash=o.transaction_hash AND b.state='consumed' AND b.network='testnet' AND b.contract_id=$4",
    [plan.steps.mint.requestId, plan.appointmentId, plan.prescriptionId, plan.contractId, plan.doctor.userId, plan.doctor.walletId, plan.doctor.address],
  )).rows[0];
  check(row?.expected?.rxScopeSha256 === previous.sha256 && row.expected.issuanceId === plan.issuanceId &&
    row.expected.patient === plan.patient.address && row.expected.doctor === plan.doctor.address &&
    hex.test(row.transaction_hash), 'hosted_capture_mint_unverified');
  await requireSettlement(client, plan.steps.mint.requestId, row.transaction_hash, plan.doctor.address, plan,
    'mint_prescription', plan.contractId, plan.issuanceId);
}

async function transitionProof(client, phase, plan, previous, base) {
  switch (phase) {
    case 'create': {
      const existing = (await client.query("SELECT (EXISTS(SELECT 1 FROM clinical_web_histories WHERE contract_id=$1 AND network='testnet' AND (owner_user_id=$2 OR patient_wallet=$3 OR history_id=$4)) OR EXISTS(SELECT 1 FROM clinical_web_operations WHERE contract_id=$1 AND network='testnet' AND source_wallet=$3)) AS present",
        [CLINICAL, plan.patient.userId, plan.patient.address, plan.historyId])).rows[0];
      check(existing?.present === false, 'hosted_capture_patient_exists');
      return null;
    }
    case 'grant-note':
      return requireReceipt(client, planOf(previous).requestId, 'create_history', plan.patient, plan);
    case 'pdf':
      await requireReceipt(client, plan.grantRequestId, 'set_permissions', plan.patient, plan, plan.grantTransactionHash);
      await requireReceipt(client, plan.noteRequestId, 'append_version', plan.doctor, plan, plan.noteTransactionHash);
      return null;
    case 'appointment':
      return requireReceipt(client, planOf(base).pdfRequestId, 'append_version', plan.doctor, plan);
    case 'attest':
      await exactBooking(client, plan, false);
      return base.baseReceiptHash ?? previous.baseReceiptHash;
    case 'issuance':
      await exactBooking(client, plan, true);
      return null;
    case 'close':
      await requireMint(client, previous, planOf(previous));
      return requireReceipt(client, planOf(base).pdfRequestId, 'append_version', base.doctor, base, plan.pdfTransactionHash);
    default:
      fail();
  }
}

export async function stageHostedCapture(client, { phase, bytes, sha256, env = process.env }) {
  check((phase === 'create' || Object.hasOwn(priorPhase, phase)) && phase !== 'issuance' && hex.test(sha256) && Buffer.isBuffer(bytes) &&
    digest(bytes) === sha256, 'hosted_capture_stage_rejected');
  const plan = parse(bytes);
  check(['appointment', 'attest'].includes(phase) || bytes.length <= 4096, 'hosted_capture_stage_rejected');
  await lockOperator(client);
  const previous = await previousFor(client, phase);
  const existing = await readHostedCaptureBySha(client, sha256);
  if (existing) {
    check(existing.phase === phase && existing.predecessorSha256 === (previous?.sha256 ?? null) && !existing.approvalSha256,
      'hosted_capture_manifest_already_registered');
    return existing;
  }
  const base = await phaseBase(client, phase, previous);
  const parent = previous && planOf(previous);
  check(!previous || plan.runId !== parent.runId || phase === 'attest', 'hosted_capture_manifest_run_reused');
  const baseline = base && planOf(base);
  check(!previous || samePair(previous, phase === 'close' ? baseline : plan), 'hosted_capture_pair_changed');
  check(phase !== 'appointment' && phase !== 'attest' && phase !== 'close' || plan.basePdfScopeSha256 === base?.sha256,
    'hosted_capture_base_rejected');
  check(plan.until > now() && plan.openedAt <= now(), 'hosted_capture_expired');
  const requests = validateManifest(phase, plan, parent, baseline);
  const requestIds = requests.map(([id]) => id);
  check(requestIds.every(id => uuid.test(id) && id !== plan.runId) && new Set(requestIds).size === requestIds.length,
    'hosted_capture_request_rejected');
  const pair = phase === 'close' ? baseline : plan;
  if (phase === 'create') {
    const row = (await client.query("SELECT 1 FROM hosted_capture_manifests WHERE phase='create' AND run_id<>$1 AND EXISTS (SELECT 1 FROM hosted_capture_activations a WHERE a.sha256=hosted_capture_manifests.sha256 AND a.phase='create') AND (convert_from(bytes,'UTF8')::jsonb->'patient'->>'address'=$2 OR convert_from(bytes,'UTF8')::jsonb->'patient'->>'userId'=$3) LIMIT 1", [plan.runId, pair.patient.address, pair.patient.userId])).rows[0];
    check(!row, 'hosted_capture_patient_used');
  }
  verifyParticipantAllowlist(pair, env);
  await verifyParticipants(client, pair);
  const receipt = await transitionProof(client, phase, plan, previous, base);
  check(now() < plan.until, 'hosted_capture_expired');
  const runId = previous?.runId ?? plan.runId;
  if (phase === 'create') {
    const duplicateRun = (await client.query("SELECT 1 FROM hosted_capture_manifests WHERE run_id=$1 AND phase='create' LIMIT 1", [runId])).rows[0];
    check(!duplicateRun, 'hosted_capture_run_exists');
  }
  await client.query('INSERT INTO hosted_capture_manifests (sha256,run_id,phase,bytes,predecessor_sha256,base_sha256,base_receipt_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [sha256, runId, phase, bytes, previous?.sha256 ?? null, base?.sha256 ?? null, receipt, plan.until]);
  for (const [id, requestPhase] of requests) {
    await client.query('INSERT INTO hosted_capture_requests (request_id,sha256,phase) VALUES ($1,$2,$3)', [id, sha256, requestPhase]);
  }
  return readHostedCaptureBySha(client, sha256);
}

export async function recordHostedCaptureVerification(client, sha256) {
  await client.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))', [lockKey]);
  const staged = await readHostedCaptureBySha(client, sha256);
  check(staged && requiresVerification.has(staged.phase) && !staged.approvalSha256 && now() < staged.expiresAt, 'hosted_capture_verification_rejected');
  const previous = await previousFor(client, staged.phase);
  check(staged.predecessorSha256 === previous.sha256 && staged.runId === previous.runId, 'hosted_capture_verification_rejected');
  await client.query('INSERT INTO hosted_capture_verifications (sha256,predecessor_sha256) VALUES ($1,$2) ON CONFLICT (sha256) DO NOTHING', [sha256, previous.sha256]);
}

export async function activateHostedCapture(client, { phase, sha256, env = process.env }) {
  check((phase === 'create' || Object.hasOwn(priorPhase, phase)) && hex.test(sha256), 'hosted_capture_activation_rejected');
  await lockOperator(client);
  const staged = await readHostedCaptureBySha(client, sha256);
  if (staged?.active && staged.phase === phase && staged.approvalSha256 === sha256 && now() < staged.expiresAt) return staged;
  const previous = await previousFor(client, phase);
  check(staged && now() < staged.expiresAt && planOf(staged).openedAt <= now(), 'hosted_capture_activation_rejected');
  if (phase === 'issuance') {
    check(staged.phase === 'attest' && previous.sha256 === sha256 && staged.active, 'hosted_capture_activation_rejected');
  } else {
    check(staged.phase === phase && staged.predecessorSha256 === (previous?.sha256 ?? null) &&
      !staged.approvalSha256 && (!previous || staged.runId === previous.runId), 'hosted_capture_activation_rejected');
  }
  if (requiresVerification.has(phase)) {
    const { rows } = await client.query('SELECT 1 FROM hosted_capture_verifications WHERE sha256=$1 AND predecessor_sha256=$2', [sha256, previous.sha256]);
    check(rows.length === 1, 'hosted_capture_verification_required');
  }
  const base = staged.baseSha256 ? await readHostedCaptureBySha(client, staged.baseSha256) : null;
  verifyParticipantAllowlist(staged, env);
  await verifyParticipants(client, staged);
  const receipt = await transitionProof(client, phase, planOf(staged), previous, base);
  if (phase !== 'issuance') check(receipt === staged.baseReceiptHash, 'hosted_capture_predecessor_receipt');
  check(now() < staged.expiresAt, 'hosted_capture_expired');
  await client.query('INSERT INTO hosted_capture_activations (sha256,phase) VALUES ($1,$2)', [sha256, phase]);
  return readHostedCaptureActive(client);
}

export async function closeHostedCapture(client, sha256) {
  check(hex.test(sha256));
  await lockOperator(client);
  const active = await latest(client);
  check(active?.sha256 === sha256, 'hosted_capture_not_active');
  if (active.phase === 'shutdown') return;
  await client.query("INSERT INTO hosted_capture_activations (sha256,phase) VALUES ($1,'shutdown')", [sha256]);
}
