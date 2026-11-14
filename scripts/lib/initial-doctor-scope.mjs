import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { StrKey } from '@stellar/stellar-sdk';
import { PRIVATE_REGISTRY_ID } from './private-registry.mjs';
import { rehearsalConfigured } from './clinical-rehearsal-policy.mjs';

const ADMIN = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const fileKey = 'TRUSTLEAF_INITIAL_DOCTOR_SCOPE_FILE';
const hashKey = 'TRUSTLEAF_INITIAL_DOCTOR_SCOPE_SHA256';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
const userId = /^did:privy:[a-z0-9]{10,80}$/;
const fail = () => new Error('initial_doctor_scope_rejected');
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const wallet = value => typeof value === 'string' && StrKey.isValidEd25519PublicKey(value);
const epoch = value => Number.isSafeInteger(value) && value > 0;
const validEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function initialDoctorScopeConfigured(env = process.env) {
  return Object.hasOwn(env, fileKey) || Object.hasOwn(env, hashKey);
}

export function loadInitialDoctorScope({ env = process.env, allowExpired = false, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!initialDoctorScopeConfigured(env)) return null;
  try {
    const file = env[fileKey], policyHash = env[hashKey];
    if (env.TRUSTLEAF_ENV !== 'local' || env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false'
      || env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' || env.VERCEL || env.VERCEL_ENV
      || rehearsalConfigured(env) || Object.keys(env).some(key => /^TRUSTLEAF_CLINICAL_(?:CREATE_ONCE|HOSTED_CREATE_ONCE|PATIENT_DEMO|MIGRATION)(?:_|$)/.test(key))
      || typeof file !== 'string' || !isAbsolute(file) || resolve(file) !== realpathSync(file)
      || !hash.test(policyHash ?? '') || !epoch(now)) throw fail();
    const bytes = readFileSync(file);
    if (bytes.byteLength > 4096 || createHash('sha256').update(bytes).digest('hex') !== policyHash) throw fail();
    const plan = JSON.parse(bytes);
    const { doctor, reviewer, authorization: action } = plan;
    const doctorEmail = env.TRUSTLEAF_DEMO_DOCTOR_EMAIL, reviewerEmail = env.TRUSTLEAF_DEMO_REVIEWER_EMAIL;
    const reopened = Object.hasOwn(plan, 'executionOpenedAt');
    const executionStart = reopened ? plan.executionOpenedAt : plan.createdAt;
    const planKeys = ['schemaVersion', 'network', 'doctorId', 'doctor', 'reviewer', 'admin', 'relayer', 'registryId', 'createdAt', 'until', 'authorization', 'maxFeeStroops'];
    if (reopened) planKeys.push('executionOpenedAt');
    if (!sameKeys(plan, planKeys)
      || plan.schemaVersion !== 1 || plan.network !== 'testnet' || !epoch(plan.doctorId) || String(plan.doctorId) !== env.TRUSTLEAF_DEMO_DOCTOR_ID
      || plan.admin !== ADMIN || env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY !== ADMIN || !wallet(plan.relayer) || plan.relayer === plan.admin
      || plan.registryId !== PRIVATE_REGISTRY_ID || env.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID !== PRIVATE_REGISTRY_ID
      || plan.maxFeeStroops !== '10000000' || !epoch(plan.createdAt) || !epoch(plan.until)
      || !epoch(executionStart) || executionStart > now
      || (reopened && executionStart < plan.createdAt + 3600)
      || plan.until <= executionStart || plan.until - executionStart > 3600
      || (!allowExpired && now >= plan.until)
      || !sameKeys(doctor, ['email', 'userId', 'walletId', 'address'])
      || !validEmail(doctorEmail) || doctor.email !== doctorEmail || !userId.test(doctor.userId) || !/^[a-zA-Z0-9_-]{6,100}$/.test(doctor.walletId)
      || !wallet(doctor.address) || [plan.admin, plan.relayer].includes(doctor.address)
      || !sameKeys(reviewer, ['email', 'userId']) || !validEmail(reviewerEmail) || reviewer.email !== reviewerEmail || !userId.test(reviewer.userId)
      || reviewer.userId === doctor.userId || !env.ADMIN_EMAILS?.split(',').map(email => email.trim().toLowerCase()).includes(reviewer.email)
      || !sameKeys(action, ['requestId', 'dossierId', 'method', 'expectedVersion', 'targetVersion', 'validUntil'])
      || !uuid.test(action.requestId) || !uuid.test(action.dossierId) || action.requestId === action.dossierId
      || action.method !== 'authorize_doctor' || action.expectedVersion !== 0 || action.targetVersion !== 1
      || action.validUntil !== plan.createdAt + 30 * 86400 || plan.until >= action.validUntil) throw fail();
    return Object.freeze({ ...plan, doctor: Object.freeze(doctor), reviewer: Object.freeze(reviewer),
      authorization: Object.freeze(action), policyHash });
  } catch { throw fail(); }
}

export function assertInitialDoctorJob(plan, row) {
  const { doctor, reviewer, authorization } = plan;
  if (!row || row.id !== authorization.requestId || row.dossier_id !== authorization.dossierId
    || row.action !== 'authorize' || row.method !== authorization.method || row.contract_id !== plan.registryId
    || row.network !== 'testnet' || Number(row.doctor_id) !== plan.doctorId || row.doctor_user_id !== doctor.userId
    || row.doctor_email !== doctor.email || row.wallet_id !== doctor.walletId || row.wallet !== doctor.address
    || row.requested_by !== reviewer.userId || row.requested_email !== reviewer.email || row.onboarding_submission_id != null
    || Number(row.expected_version) !== 0 || Number(row.target_version) !== 1 || Number(row.valid_until) !== authorization.validUntil
    || !hash.test(row.commitment ?? '') || /^0+$/.test(row.commitment)) throw fail();
}
