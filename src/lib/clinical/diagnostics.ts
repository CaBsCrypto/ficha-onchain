import 'server-only';
import { PrivateFlowError } from '@/lib/private-config';
import type { ClinicalCreateOncePolicy } from './create-once';

const phases = new Set(['prepare_chain', 'prepare_recheck', 'prepare_save', 'sign_policy', 'sign_eligibility', 'sign_validation', 'sign_save']);
type Phase = 'prepare_chain' | 'prepare_recheck' | 'prepare_save' | 'sign_policy' | 'sign_eligibility' | 'sign_validation' | 'sign_save';
const codes = new Set(['signature_request_expired', 'owner_signature_invalid', 'relayer_unavailable',
  'clinical_chain_unavailable', 'clinical_context_unavailable', 'clinical_saved_intent_invalid', 'clinical_identity_changed',
  'clinical_permission_conflict', 'clinical_access_denied', 'clinical_version_conflict', 'clinical_keys_unavailable',
  'clinical_prescription_unavailable', 'clinical_prescription_verification_unavailable', 'clinical_fee_budget_exceeded',
  'clinical_rehearsal_expired', 'clinical_rehearsal_scope_rejected', 'clinical_rehearsal_fee_exceeded', 'clinical_rehearsal_order_conflict']);

/** Call only after the internal rehearsal policy/actor was validated. The log
 * measures this phase, not SQL COMMIT or a Stellar receipt. No payload is logged. */
export async function traceClinicalRehearsalPhase<T>(policy: ClinicalCreateOncePolicy | null, phase: Phase, work: () => Promise<T>): Promise<T> {
  if (policy?.mode !== 'rehearsal' || !phases.has(phase)) return work();
  const startedAt = performance.now();
  function report(outcome: 'ok' | 'error', code: string | null) {
    try { console.info('[TrustLeaf clinical rehearsal phase]', { phase, durationMs: Math.max(0, Math.round(performance.now() - startedAt)), outcome, code }); }
    catch { /* Diagnostics cannot change the operation result. */ }
  }
  try { const result = await work(); report('ok', null); return result; }
  catch (error) {
    report('error', error instanceof PrivateFlowError && codes.has(error.message) ? error.message : 'clinical_service_unavailable');
    throw error;
  }
}
