import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { StrKey } from '@stellar/stellar-sdk';
import { databaseConnectionString } from './database-connection.mjs';
import { assertHostedCaptureOperator } from './hosted-capture-store.mjs';
import { partnerPrescriptionAppointment } from './clinical-links-mint-policy.mjs';

export const PRIVATE_RX_SCOPE_ENV = Object.freeze({
  file: 'TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_FILE',
  hash: 'TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_SHA256',
  approval: 'TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_APPROVED_SHA256',
});
export const DIGITAL_CABS_RX_DOCUMENT = Object.freeze({
  medication: 'TrustLeaf synthetic sample — no medication',
  dosage: 'None. Demonstration only.',
  instructions: 'Synthetic Testnet record. Do not use for treatment or dispensing.',
});
export const PRIVATE_RX_CONTRACT_ID = 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE';
export const PRIVATE_RX_REGISTRY_ID = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
export const PRIVATE_RX_AUTHORITY = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const APP = 'cmrix722m03d30clewd1fuffq';
const santiagoClock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const CAP = 10_000_000n;
const STEPS = ['attest', 'consent', 'mint'];
const approvedScopes = new WeakSet();
const hostedScopes = new WeakMap();
const partnerScopes = new WeakMap();
const hex = /^[0-9a-f]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const epoch = value => Number.isSafeInteger(value) && value > 0;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const nonzeroDigest = value => typeof value === 'string' && hex.test(value) && !/^0+$/.test(value);
const check = (condition, code = 'private_rx_scope_rejected') => { if (!condition) throw Error(code); };
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const match = (value, reference) => exact(value, Object.keys(reference)) && Object.keys(reference).every(k => value[k] === reference[k]);

function actor(value, reference) {
  return exact(value, ['userId', 'walletId', 'address']) && /^did:privy:[A-Za-z0-9_-]{10,80}$/.test(value.userId) &&
    typeof value.walletId === 'string' && /^[A-Za-z0-9_-]{6,100}$/.test(value.walletId) &&
    typeof value.address === 'string' && StrKey.isValidEd25519PublicKey(value.address) && match(value, reference);
}
function amount(value) {
  check(typeof value === 'string' && /^[1-9][0-9]{0,7}$/.test(value));
  const result = BigInt(value); check(result <= CAP); return result;
}

export function privateRxAppointmentEpoch(slot) {
  const oneTime = slot && typeof slot === 'object' && Object.hasOwn(slot, 'oneTime');
  check(exact(slot, ['date', 'timeSlot', 'type', ...(oneTime ? ['oneTime'] : [])]) && (!oneTime || slot.oneTime === true) &&
    typeof slot.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(slot.date) &&
    typeof slot.timeSlot === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.timeSlot) && ['Presencial', 'Telemedicina'].includes(slot.type) &&
    (!oneTime || slot.timeSlot <= '23:30'));
  const local = Date.parse(`${slot.date}T${slot.timeSlot}:00Z`);
  check(Number.isFinite(local));
  const matches = [];
  for (let offset = 120; offset <= 360; offset += 15) {
    const candidate = local + offset * 60_000;
    const parts = Object.fromEntries(santiagoClock.formatToParts(candidate).map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` === slot.date && `${parts.hour}:${parts.minute}` === slot.timeSlot) matches.push(candidate / 1000);
  }
  check(matches.length === 1); // Reject impossible dates and ambiguous or skipped local times.
  return matches[0];
}

/** Pure schema check. The loader independently pins the verified base bytes. */
export function validatePrivateRxManifest(plan, verifiedBase, { now, basePdfScopeSha256, requireApproval = true, allowExpired = false }) {
  const common = ['schemaVersion', 'phase', 'runId', 'openedAt', 'until', 'network', 'basePdfScopeSha256',
    'contractId', 'registryId', 'authority', 'relayer', 'patient', 'doctor', 'historyId', 'doctorId', 'slot', 'document'];
  const issuance = plan?.phase === 'issuance';
  check(exact(plan, [...common, ...(issuance ? ['appointmentId', 'issuanceId', 'bookingValidUntil', 'prescriptionId',
    'maxTotalFeeStroops', 'steps', 'attestationQuoteSha256'] : [])]));
  check(plan.schemaVersion === 1 && (plan.phase === 'appointment' || issuance) && uuid.test(plan.runId) &&
    plan.network === 'testnet' && nonzeroDigest(basePdfScopeSha256) && plan.basePdfScopeSha256 === basePdfScopeSha256 &&
    plan.contractId === PRIVATE_RX_CONTRACT_ID && plan.registryId === PRIVATE_RX_REGISTRY_ID &&
    plan.authority === PRIVATE_RX_AUTHORITY && epoch(plan.doctorId) && plan.doctorId === verifiedBase?.doctorId &&
    nonzeroDigest(plan.historyId) && plan.historyId === verifiedBase.historyId &&
    typeof plan.relayer === 'string' && StrKey.isValidEd25519PublicKey(plan.relayer) && plan.relayer === verifiedBase.relayer &&
    actor(plan.patient, verifiedBase.patient) && actor(plan.doctor, verifiedBase.doctor) &&
    plan.patient.userId !== plan.doctor.userId && plan.patient.walletId !== plan.doctor.walletId &&
    new Set([plan.patient.address, plan.doctor.address, plan.authority, plan.relayer]).size === 4 && match(plan.document, DIGITAL_CABS_RX_DOCUMENT));
  const slot = privateRxAppointmentEpoch(plan.slot);
  const baseIds = [verifiedBase.runId, verifiedBase.grantRequestId, verifiedBase.noteRequestId, verifiedBase.pdfRequestId];
  check(!baseIds.includes(plan.runId));
  check(epoch(now) && epoch(plan.openedAt) && epoch(plan.until) && plan.openedAt < plan.until &&
    plan.openedAt <= now && (now < plan.until || !requireApproval && allowExpired), 'private_rx_scope_expired');
  if (!issuance) {
    check(plan.openedAt <= slot && plan.until <= slot + 1800 && plan.until - plan.openedAt <= 36 * 3600);
    return;
  }
  check(epoch(plan.appointmentId) && nonzeroDigest(plan.issuanceId) && epoch(plan.bookingValidUntil) &&
    plan.openedAt >= slot - 1800 && plan.until <= plan.bookingValidUntil && plan.bookingValidUntil <= slot + 3600 &&
    plan.until - plan.openedAt <= 1800 && uuid.test(plan.prescriptionId) && exact(plan.steps, STEPS) &&
    (nonzeroDigest(plan.attestationQuoteSha256) || !requireApproval && plan.attestationQuoteSha256 === null));
  const ids = [plan.runId, plan.prescriptionId];
  const total = amount(plan.maxTotalFeeStroops);
  for (const step of STEPS) {
    check(exact(plan.steps[step], ['requestId', 'maxFeeStroops']) && uuid.test(plan.steps[step].requestId));
    ids.push(plan.steps[step].requestId);
    // Each is a ceiling, not a simultaneous reservation. The lifetime encounter
    // bucket atomically limits the sum of real reservations and settled charges.
    check(amount(plan.steps[step].maxFeeStroops) <= total);
  }
  check(new Set(ids).size === ids.length && ids.every(id => !baseIds.includes(id)));
}

export function privateRxScopeConfigured(env = process.env) {
  return Object.values(PRIVATE_RX_SCOPE_ENV).some(name => Object.hasOwn(env, name));
}

export function assertPrivateRxOperatorEnvironment(env, { scopeInputs = false } = {}) {
  if (env.TRUSTLEAF_HOSTED_CAPTURE_OPERATOR === 'true') {
    const operatorEnv = { ...env };
    if (scopeInputs) for (const name of Object.values(PRIVATE_RX_SCOPE_ENV)) delete operatorEnv[name];
    return assertHostedCaptureOperator(operatorEnv);
  }
  check(env.TRUSTLEAF_ENV === 'local' && !Object.hasOwn(env, 'VERCEL') && !Object.hasOwn(env, 'VERCEL_ENV'));
  return { connectionString: databaseConnectionString(env) };
}
function readExact(file, expected) {
  check(typeof file === 'string' && isAbsolute(file) && resolve(file) === realpathSync(file) && /\.private\.json$/i.test(file));
  const stat = statSync(file); check(stat.isFile() && stat.size > 0 && stat.size <= 8192);
  const bytes = readFileSync(file);
  check(bytes.length <= 8192 && sha(bytes) === expected);
  return JSON.parse(bytes.toString('utf8'));
}
function freeze(value) {
  for (const item of Object.values(value)) if (item !== null && typeof item === 'object') freeze(item);
  return Object.freeze(value);
}

/** Bind a server-selected phase to the same schema and exact PDF baseline as local capture. */
export function loadHostedPrivateRxScope(snapshot, { now = Math.floor(Date.now() / 1000), historical = false } = {}) {
  const { phase, bytes, sha256, approvalSha256, approvedAt, active, expiresAt, baseBytes, baseSha256, origin } = snapshot ?? {};
  check(['appointment', 'attest', 'issuance'].includes(phase) && origin === 'https://www.trustleaf.org' &&
    Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 8192 && sha(bytes) === sha256 && approvalSha256 === sha256 &&
    Buffer.isBuffer(baseBytes) && baseBytes.length > 0 && baseBytes.length <= 8192 && sha(baseBytes) === baseSha256 &&
    epoch(approvedAt) && approvedAt <= now && epoch(expiresAt) && (historical || active === true));
  check(historical || now < expiresAt, 'private_rx_scope_expired');
  const plan = JSON.parse(bytes.toString('utf8')), base = JSON.parse(baseBytes.toString('utf8'));
  check(plan.phase === (phase === 'appointment' ? 'appointment' : 'issuance') &&
    plan.doctorId === snapshot.doctorId && plan.historyId === snapshot.historyId && plan.relayer === snapshot.relayer &&
    expiresAt <= plan.until && approvedAt >= plan.openedAt && approvedAt < expiresAt &&
    match(plan.patient, snapshot.patient) && match(plan.doctor, snapshot.doctor));
  validatePrivateRxManifest(plan, base, { now, basePdfScopeSha256: baseSha256, requireApproval: !historical, allowExpired: historical });
  check(plan.phase !== 'issuance' || nonzeroDigest(plan.attestationQuoteSha256));
  Object.defineProperties(plan, { policyHash: { value: sha256 }, approved: { value: !historical } });
  if (!historical) approvedScopes.add(plan);
  hostedScopes.set(plan, Object.freeze({ phase, expiresAt, origin, historical }));
  return freeze(plan);
}

export function privateRxHostedContext(scope) {
  return hostedScopes.get(scope);
}

/** Scope a pair of owner-authorized transactions to one approved pilot appointment.
 * Callers must obtain the context from locked Ficha records, not request JSON. */
export function loadPartnerPrivateRxScope(plan, context, { env = process.env, historical = false } = {}) {
  const { consultationRef, attestationHash, commitment, bindingId, partnerId, expiresAt } = context;
  check(consultationRef && partnerPrescriptionAppointment(consultationRef, env) === plan.appointmentId &&
    plan.phase === 'issuance' && plan.network === 'testnet' &&
    plan.contractId === PRIVATE_RX_CONTRACT_ID && plan.registryId === PRIVATE_RX_REGISTRY_ID && plan.authority === PRIVATE_RX_AUTHORITY &&
    StrKey.isValidEd25519PublicKey(plan.relayer) && plan.relayer === env.TRUSTLEAF_PARTNER_RX_RELAYER_ADDRESS &&
    partnerId === 'trustleaf-cannabis' && uuid.test(bindingId) && nonzeroDigest(attestationHash) && nonzeroDigest(commitment) &&
    nonzeroDigest(plan.issuanceId) && uuid.test(plan.prescriptionId) && uuid.test(plan.steps.consent.requestId) &&
    uuid.test(plan.steps.mint.requestId) && plan.steps.consent.requestId !== plan.steps.mint.requestId &&
    actor(plan.patient, plan.patient) && actor(plan.doctor, plan.doctor) && plan.patient.userId !== plan.doctor.userId &&
    plan.patient.address !== plan.doctor.address && epoch(plan.openedAt) && epoch(plan.until) &&
    plan.until === plan.bookingValidUntil && plan.openedAt < plan.until && epoch(expiresAt) && expiresAt > plan.until);
  check(amount(plan.steps.consent.maxFeeStroops) + amount(plan.steps.mint.maxFeeStroops) <= amount(plan.maxTotalFeeStroops));
  const scope = { ...plan, policyHash: sha(JSON.stringify([plan, context])), approved: !historical };
  if (!historical) approvedScopes.add(scope);
  partnerScopes.set(scope, Object.freeze({ ...context, historical }));
  return freeze(scope);
}

export function privateRxPartnerContext(scope) {
  return partnerScopes.get(scope);
}

export function assertHostedPrivateRxReceiptScope(scope, step) {
  const partner = privateRxPartnerContext(scope);
  if (partner) {
    check(partner.historical === true && (step === 'consent' || step === 'mint'));
    return;
  }
  const context = privateRxHostedContext(scope);
  check(context?.historical === true && scope.phase === 'issuance' &&
    (step === 'attest' || context.phase === 'issuance' && (step === 'consent' || step === 'mint')));
}

export function loadPrivateRxScope({ env = process.env, now = Math.floor(Date.now() / 1000), requireApproval = true, allowExpired = false } = {}) {
  if (!privateRxScopeConfigured(env)) return null;
  try {
    const { file, hash, approval } = PRIVATE_RX_SCOPE_ENV;
    const policyHash = env[hash], provided = env[approval];
    const basePdfScopeSha256 = env.TRUSTLEAF_DEMO_PDF_SCOPE_SHA256;
    const database = new URL(databaseConnectionString(env));
    const hostedOperator = env.TRUSTLEAF_HOSTED_CAPTURE_OPERATOR === 'true';
    assertPrivateRxOperatorEnvironment(env, { scopeInputs: true });
    const competing = Object.keys(env).some(key => /^TRUSTLEAF_(?:CLINICAL_(?:CAPTURE|CREATE_ONCE|HOSTED_CREATE_ONCE|PATIENT_DEMO|REHEARSAL|MIGRATION|WEB_MIGRATION)|INITIAL_DOCTOR_SCOPE)(?:_|$)/.test(key));
    check(typeof requireApproval === 'boolean' && typeof allowExpired === 'boolean' && !(requireApproval && allowExpired) &&
      !competing && (!hostedOperator || !requireApproval) &&
      env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'false' && env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet' &&
      env.PRIVY_APP_ID === APP && env.NEXT_PUBLIC_PRIVY_APP_ID === APP &&
      env.PRESCRIPTION_PRIVATE_CONTRACT_ID === PRIVATE_RX_CONTRACT_ID && env.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID === PRIVATE_RX_REGISTRY_ID &&
      env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY === PRIVATE_RX_AUTHORITY && env.BOOKING_AUTHORITY_PUBLIC_KEY === PRIVATE_RX_AUTHORITY &&
      ['postgres:', 'postgresql:'].includes(database.protocol) && env.TRUSTLEAF_DB_HOST === database.hostname &&
      env.TRUSTLEAF_DEMO_DB_HOST === database.hostname &&
      /^ep-[a-z0-9-]+\.c-3\.us-east-1\.aws\.neon\.tech$/.test(database.hostname) &&
      ![...database.searchParams.keys()].some(key => /^(?:host|hostaddr|port|options|service|sslmode)$/i.test(key) && !(key.toLowerCase() === 'sslmode' && ['require', 'verify-full'].includes(database.searchParams.get(key)))) &&
      nonzeroDigest(policyHash) && nonzeroDigest(basePdfScopeSha256) &&
      (!Object.hasOwn(env, approval) || provided === policyHash) && (!requireApproval || provided === policyHash));
    const source = env[file];
    const plan = readExact(source, policyHash);
    const baseFile = join(dirname(source), 'digital-cabs-pdf-scope.private.json');
    check(resolve(source) !== baseFile);
    const base = readExact(baseFile, basePdfScopeSha256);
    check(epoch(base?.doctorId) && String(base.doctorId) === env.TRUSTLEAF_DEMO_DOCTOR_ID);
    validatePrivateRxManifest(plan, base, { now, basePdfScopeSha256, requireApproval, allowExpired });
    Object.defineProperties(plan, { policyHash: { value: policyHash }, approved: { value: requireApproval } });
    if (requireApproval) approvedScopes.add(plan);
    return freeze(plan);
  } catch (error) {
    throw Error(error?.message === 'private_rx_scope_expired' ? 'private_rx_scope_expired' : 'private_rx_scope_rejected');
  }
}

/** Never accept a preview object or an expired/stale policy at a mutation. */
export function assertPrivateRxScopeOpen(scope, { env = process.env, now, step } = {}) {
  const partner = privateRxPartnerContext(scope);
  if (partner) {
    const clock = now ?? Math.floor(Date.now() / 1000);
    check(approvedScopes.has(scope) && scope.approved === true &&
      partnerPrescriptionAppointment(partner.consultationRef, env) === scope.appointmentId &&
      scope.relayer === env.TRUSTLEAF_PARTNER_RX_RELAYER_ADDRESS &&
      (step === undefined || step === 'consent' || step === 'mint'));
    check(clock >= scope.openedAt && clock < scope.until, 'private_rx_scope_expired');
    return scope;
  }
  const hosted = privateRxHostedContext(scope);
  if (hosted) {
    const clock = now ?? Math.floor(Date.now() / 1000);
    check(approvedScopes.has(scope) && scope.approved === true);
    check(clock >= scope.openedAt && clock < Math.min(scope.until, hosted.expiresAt), 'private_rx_scope_expired');
    check(step === undefined || hosted.phase === 'attest' && step === 'attest' ||
      hosted.phase === 'issuance' && (step === 'consent' || step === 'mint'));
    return scope;
  }
  const current = loadPrivateRxScope({ env, now });
  check(scope?.approved === true && approvedScopes.has(scope) && current?.policyHash === scope.policyHash && current.phase === scope.phase &&
    (step === undefined || current.phase === 'issuance' && STEPS.includes(step)));
  return current;
}
