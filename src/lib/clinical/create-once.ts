/** Local, expiring authority for one new history. General private writes stay off. */
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { ClinicalAction } from '@/types/clinical';
import { PrivateFlowError } from '@/lib/private-config';
import { assertClinicalEnvironment } from './config';
import { clinicalWebFeeQuote } from '../../../scripts/lib/clinical-web-fee-policy.mjs';

const VARIABLES = ['TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET', 'TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER', 'TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL'] as const;
export const CLINICAL_CREATE_ONCE_MAX_FEE = BigInt(10_000_000);
export interface ClinicalCreateOncePolicy { wallet: string; relayer: string; until: number }
const denied = () => new PrivateFlowError('clinical_create_once_scope_rejected', 403);

export function clinicalCreateOnceConfigured() { return VARIABLES.some(key => process.env[key] !== undefined); }

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
  try {
    const env = process.env;
    const selected = env.TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET;
    const relayer = env.TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER;
    const untilText = env.TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL ?? '';
    const until = Number(untilText), now = Math.floor(Date.now() / 1000);
    if (env.TRUSTLEAF_ENV !== 'local' || env.VERCEL_ENV || env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' ||
        env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false' || action !== 'create_history' || selected !== wallet ||
        !selected || !relayer || !/^\d{10}$/.test(untilText) || !Number.isSafeInteger(until) || until <= now || until > now + 600 ||
        Keypair.fromPublicKey(selected).publicKey() !== selected || Keypair.fromPublicKey(relayer).publicKey() !== relayer ||
        Keypair.fromSecret(env.RELAYER_SECRET ?? '').publicKey() !== relayer) throw denied();
    return Object.freeze({ wallet: selected, relayer, until });
  } catch { throw denied(); }
}

/** Check the real fee bump budget before asking for the patient signature. */
export function assertClinicalCreateOnceFee(policy: ClinicalCreateOncePolicy | null, unsigned: Transaction) {
  if (!policy) return;
  try {
    const current = assertClinicalWriteScope('create_history', policy.wallet);
    if (!current || current.relayer !== policy.relayer || current.until !== policy.until) throw denied();
    if (!(unsigned instanceof Transaction) || unsigned.networkPassphrase !== Networks.TESTNET || unsigned.source !== policy.wallet ||
        clinicalWebFeeQuote(unsigned).sponsored > CLINICAL_CREATE_ONCE_MAX_FEE) throw denied();
  } catch { throw new PrivateFlowError('clinical_create_once_fee_exceeded', 403); }
}

/** Recheck the persisted inner transaction before retransmitting the same envelope. */
export function assertClinicalCreateOnceSavedFee(policy: ClinicalCreateOncePolicy | null, unsignedXdr: string) {
  if (!policy) return;
  const unsigned = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
  if (!(unsigned instanceof Transaction)) throw denied();
  assertClinicalCreateOnceFee(policy, unsigned);
}
