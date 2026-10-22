/** Restricted clinical writes: expiring creation or a bounded patient demo.
 * Neither mode enables ordinary private writes. */
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { ClinicalAction } from '@/types/clinical';
import { PrivateFlowError } from '@/lib/private-config';
import { assertClinicalEnvironment } from './config';
import { clinicalWebFeeQuote } from '../../../scripts/lib/clinical-web-fee-policy.mjs';
import { databaseConnectionString } from '@/lib/database-config';

const VARIABLES = ['TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET', 'TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER', 'TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL'] as const;
const HOSTED_VARIABLES = ['TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_WALLET', 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_RELAYER', 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_UNTIL'] as const;
export const CLINICAL_CREATE_ONCE_MAX_FEE = BigInt(10_000_000);
export type ClinicalCreateOncePolicy = { wallet: string; relayer: string; until: number; mode?: 'once' } |
  { wallet: string; relayer: string; mode: 'patient_demo'; allowlist: string };
export const CLINICAL_PATIENT_DEMO_VARIABLES = ['TRUSTLEAF_CLINICAL_PATIENT_DEMO_ENABLED', 'TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS', 'TRUSTLEAF_CLINICAL_PATIENT_DEMO_RELAYER'] as const;
export const CLINICAL_PATIENT_DEMO_MAX_OPERATIONS = 20;
const denied = () => new PrivateFlowError('clinical_create_once_scope_rejected', 403);

// Kept as the compatibility entry point used by the four restricted POST routes.
export function clinicalCreateOnceConfigured() { return [...VARIABLES, ...HOSTED_VARIABLES, ...CLINICAL_PATIENT_DEMO_VARIABLES].some(key => process.env[key] !== undefined); }
function assertHostedClinicalDatabase() {
  const env = process.env, database = new URL(databaseConnectionString(env) ?? '');
  if (env.VERCEL_ENV !== 'production' || env.TRUSTLEAF_ENV !== 'test' ||
      database.hostname !== 'ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech' ||
      [...database.searchParams.keys()].some(key => !['sslmode', 'channel_binding', 'connect_timeout', 'pgbouncer'].includes(key))) throw denied();
}
function patientDemoScope(action: ClinicalAction, wallet: string): ClinicalCreateOncePolicy {
  const env = process.env;
  try {
    if ([...VARIABLES, ...HOSTED_VARIABLES].some(key => env[key] !== undefined) ||
        env.TRUSTLEAF_CLINICAL_MIGRATION === 'true' || env.TRUSTLEAF_CLINICAL_WEB_MIGRATION === 'true') throw denied();
    assertHostedClinicalDatabase();
    const wallets = (env.TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS ?? '').split(',');
    const relayer = env.TRUSTLEAF_CLINICAL_PATIENT_DEMO_RELAYER;
    if (env.TRUSTLEAF_CLINICAL_PATIENT_DEMO_ENABLED !== 'true' || env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false' ||
        env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' || !['create_history', 'append_version'].includes(action) ||
        wallets.length < 1 || wallets.length > 3 || new Set(wallets).size !== wallets.length ||
        wallets.some(value => Keypair.fromPublicKey(value).publicKey() !== value) || !wallets.includes(wallet) ||
        !relayer || Keypair.fromPublicKey(relayer).publicKey() !== relayer ||
        Keypair.fromSecret(env.RELAYER_SECRET ?? '').publicKey() !== relayer) throw denied();
    return Object.freeze({ mode: 'patient_demo', wallet, relayer, allowlist: [...wallets].sort().join(',') });
  } catch { throw denied(); }
}

/** Presentation capability only; every mutation still checks the policy again. */
export function clinicalWriteCapabilities(wallet: string): Record<ClinicalAction, boolean> {
  const allowed = (action: ClinicalAction) => {
    try { assertClinicalWriteScope(action, wallet); return true; } catch { return false; }
  };
  return { create_history: allowed('create_history'), append_version: allowed('append_version'), set_permissions: allowed('set_permissions') };
}

export function assertClinicalWriteScope(action: ClinicalAction, wallet: string): ClinicalCreateOncePolicy | null {
  if (!clinicalCreateOnceConfigured()) { assertClinicalEnvironment(true); return null; }
  assertClinicalEnvironment();
  if (CLINICAL_PATIENT_DEMO_VARIABLES.some(key => process.env[key] !== undefined)) return patientDemoScope(action, wallet);
  let policy: Extract<ClinicalCreateOncePolicy, { until: number }>;
  try {
    const env = process.env;
    const hosted = HOSTED_VARIABLES.some(key => env[key] !== undefined);
    if (hosted && VARIABLES.some(key => env[key] !== undefined)) throw denied();
    const keys = hosted ? HOSTED_VARIABLES : VARIABLES;
    const selected = env[keys[0]];
    const relayer = env[keys[1]];
    const untilText = env[keys[2]] ?? '';
    const until = Number(untilText), now = Math.floor(Date.now() / 1000);
    if (hosted) {
      assertHostedClinicalDatabase();
    } else if (env.TRUSTLEAF_ENV !== 'local' || env.VERCEL_ENV) throw denied();
    if (env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' || env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false' || action !== 'create_history' || selected !== wallet ||
        !selected || !relayer || !/^\d{10}$/.test(untilText) || !Number.isSafeInteger(until) || until > now + 600 ||
        Keypair.fromPublicKey(selected).publicKey() !== selected || Keypair.fromPublicKey(relayer).publicKey() !== relayer ||
        Keypair.fromSecret(env.RELAYER_SECRET ?? '').publicKey() !== relayer) throw denied();
    policy = Object.freeze({ wallet: selected, relayer, until });
  } catch { throw denied(); }
  if (policy.until <= Math.floor(Date.now() / 1000)) throw new PrivateFlowError('clinical_create_once_expired', 409);
  return policy;
}

/** Check the real fee bump budget before asking for the patient signature. */
export function assertClinicalCreateOnceFee(policy: ClinicalCreateOncePolicy | null, unsigned: Transaction) {
  if (!policy) return;
  const current = assertClinicalWriteScope('create_history', policy.wallet);
  if (!current || current.relayer !== policy.relayer || current.mode !== policy.mode) throw denied();
  if (policy.mode === 'patient_demo') {
    if (current.mode !== 'patient_demo' || current.allowlist !== policy.allowlist) throw denied();
  } else if (current.mode === 'patient_demo' || current.until !== policy.until) throw denied();
  try {
    if (!(unsigned instanceof Transaction) || unsigned.networkPassphrase !== Networks.TESTNET || unsigned.source !== policy.wallet ||
        !unsigned.timeBounds || BigInt(unsigned.timeBounds.maxTime) <= BigInt(0) ||
        clinicalWebFeeQuote(unsigned).sponsored > CLINICAL_CREATE_ONCE_MAX_FEE) throw denied();
  } catch { throw new PrivateFlowError('clinical_create_once_fee_exceeded', 409); }
  if (policy.mode !== 'patient_demo' && BigInt(unsigned.timeBounds!.maxTime) > BigInt(policy.until)) throw new PrivateFlowError('clinical_create_once_window_too_short', 409);
}

/** Recheck the persisted inner transaction before retransmitting the same envelope. */
export function assertClinicalCreateOnceSavedFee(policy: ClinicalCreateOncePolicy | null, unsignedXdr: string) {
  if (!policy) return;
  const unsigned = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
  if (!(unsigned instanceof Transaction)) throw denied();
  assertClinicalCreateOnceFee(policy, unsigned);
}
