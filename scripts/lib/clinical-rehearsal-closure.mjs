import { payloadHash, assertRehearsalAggregateBudget, assertRehearsalResumeBudget } from './clinical-rehearsal-policy.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const denied = () => { throw new Error('clinical_rehearsal_scope_rejected'); };
/** The same PostgreSQL advisory key is used by transaction-scoped web work and
 * session-scoped runner work. V1 keeps its original independent behavior. */
export function rehearsalRunLockKey(policy) {
  if (policy?.schemaVersion === 1) return null;
  if (policy?.schemaVersion !== 2 || typeof policy.runId !== 'string' || !UUID.test(policy.runId)) return denied();
  return 'clinical-rehearsal:' + policy.runId;
}
/** The caller MUST already own an explicit SQL transaction. This helper never
 * starts or commits one, and never acquires source/email/row locks afterwards. */
export async function lockClinicalRehearsalRun(client, policy) {
  const key = rehearsalRunLockKey(policy);
  if (key !== null) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}
/** Call before each new prepare/sign/submit/enqueue while retaining the run
 * lock. lock:false is internal to the runner, whose FIXED PG SESSION must
 * already hold pg_advisory_lock(hashtext(rehearsalRunLockKey(policy))) until
 * its outer finally. It is not a read/reconciliation bypass. */
export async function assertRehearsalOpen(client, policy, { lock = true, step } = {}) {
  const key = rehearsalRunLockKey(policy);
  if (key === null) return;
  if (typeof lock !== 'boolean') return denied();
  if (policy.resumeContinuation !== undefined) {
    if (!step || !['append_pdf','correct_note','revoke',...(policy.restoredCompletion ? ['renew'] : [])].includes(step.key)) return denied();
    assertRehearsalResumeBudget(policy, { step });
  }
  // The amended budget covers only the five unexecuted clinical actions.
  // Historical renewal reconciliation does not call this mutation guard.
  if (policy.feeAmendment && (step === undefined || step.actor === 'admin' || step.key === 'renew')) {
    if (!policy.completionContinuation || step?.key !== 'renew' || step.actor !== 'admin') return denied();
    // New administrative authority exists only on the loader's exact approved schema12 object.
    assertRehearsalAggregateBudget(policy, { step });
  }
  const final = policy.steps?.find(item => item.key === 'revoke');
  if (!final || !UUID.test(final.requestId)) return denied();
  let withdrawal = false;
  if (step !== undefined) {
    const declared = policy.steps.find(item => item.requestId === step.requestId);
    if (!declared || payloadHash(declared) !== payloadHash(step)) return denied();
    withdrawal = declared.requestId === final.requestId;
  }
  if (lock) await lockClinicalRehearsalRun(client, policy);
  const result = await client.query('SELECT id FROM clinical_web_operations WHERE id=$1', [final.requestId]);
  // Any persisted withdrawal slot seals the run, including cancelled/failed or
  // unsigned ones. Only that exact withdrawal may finish/reconcile itself.
  if (result.rows.length && !withdrawal) throw new Error('clinical_rehearsal_order_conflict');
}
