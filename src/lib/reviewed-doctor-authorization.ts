import type { Sql } from '@/lib/db';
import type { PoolClient } from '@neondatabase/serverless';
import { assertRehearsalOpen } from '../../scripts/lib/clinical-rehearsal-closure.mjs';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { PrivateFlowError } from '@/lib/private-config';
import { resolveDoctor, requestDoctorAuthorization, assertRehearsalDoctorAuthorization, assertInitialDoctorAuthorization } from '@/lib/doctor-authorizations';
import { approveDoctorOnboarding, onboardingTransaction, readDoctorSubmission } from '@/lib/doctor-onboarding';

/** Public administrative entry: every new application requires its reviewed revision. */
export async function requestReviewedDoctorAuthorization(sql: Sql, actor: AuthedUser, doctorId: number, action: string, submissionId?: string, options: { rehearsal?: true; initial?: true } = {}) {
  if (options.initial && (options.rehearsal || submissionId !== undefined)) {
    throw new PrivateFlowError('initial_doctor_authorization_rejected', 403);
  }
  const initial = options.initial === true ? assertInitialDoctorAuthorization(actor, doctorId, action) : null;
  const rehearsal = options.rehearsal === true ? assertRehearsalDoctorAuthorization(actor, doctorId, action) : null;
  const resolved = await resolveDoctor(sql, doctorId);
  if (initial) assertInitialDoctorAuthorization(actor, doctorId, action, resolved);
  if (rehearsal) assertRehearsalDoctorAuthorization(actor, doctorId, action, resolved);
  const email = String(resolved.doctor.email).toLowerCase();
  const rehearsalOptions = rehearsal ? { rehearsal: true as const } : {};
  const writeScope = initial ? async () => {
    const current = assertInitialDoctorAuthorization(actor, doctorId, action, await resolveDoctor(sql, doctorId));
    if (current.policyHash !== initial.policyHash) throw new PrivateFlowError('initial_doctor_authorization_rejected', 403);
  } : rehearsal ? async (client?: PoolClient) => {
    const current = assertRehearsalDoctorAuthorization(actor, doctorId, action, await resolveDoctor(sql, doctorId));
    if (current.policyHash !== rehearsal.policyHash || JSON.stringify(current) !== JSON.stringify(rehearsal)) throw new PrivateFlowError('clinical_rehearsal_authorization_rejected',403);
    if (client) {
      try { await assertRehearsalOpen(client, current, current.completionContinuation ? { step: current.steps.find(step => step.key === 'renew') } : undefined); }
      catch (error) {
        if (error instanceof Error && ['clinical_rehearsal_order_conflict','clinical_rehearsal_scope_rejected'].includes(error.message)) throw new PrivateFlowError(error.message,error.message === 'clinical_rehearsal_order_conflict' ? 409 : 403);
        throw error;
      }
    }
  } : undefined;
  const [hint] = await sql.query(`SELECT * FROM doctor_onboarding_requests WHERE doctor_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`, [doctorId]);
  if (initial && hint) throw new PrivateFlowError('onboarding_state_changed');
  if (rehearsal && hint && !['authorized', 'revoked'].includes(hint.state)) throw new PrivateFlowError('onboarding_state_changed');
  if (hint && ['submitted', 'authorization_pending'].includes(hint.state)) {
    if (action === 'revoke') throw new PrivateFlowError('application_not_authorized');
    return approveDoctorOnboarding(sql, actor, doctorId, submissionId ?? '', (tx, submission) =>
      requestDoctorAuthorization(tx, actor, doctorId, action, { ...rehearsalOptions, submission, transactional: true }));
  }
  return onboardingTransaction(email, async tx => {
    const [doctor] = await tx.query('SELECT id,status,email FROM doctors WHERE id=$1 AND LOWER(email)=$2 FOR UPDATE', [doctorId, email]);
    const [current] = await tx.query('SELECT * FROM doctor_onboarding_requests WHERE doctor_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE', [doctorId]);
    if (!doctor) throw new PrivateFlowError('doctor_identity_changed');
    if (initial) {
      if (current || doctor.status !== 'active') throw new PrivateFlowError('onboarding_state_changed');
      return requestDoctorAuthorization(tx, actor, doctorId, action, { initial: true, transactional: true });
    }
    if (current) {
      if (!['authorized', 'revoked'].includes(current.state) || current.current_submission_id !== submissionId) throw new PrivateFlowError('onboarding_state_changed');
      const submission = await readDoctorSubmission(tx, current);
      if (submission.owner.userId !== resolved.userId || submission.owner.walletId !== resolved.walletId || submission.owner.address !== resolved.address) throw new PrivateFlowError('doctor_identity_mismatch', 403);
      return requestDoctorAuthorization(tx, actor, doctorId, action, { ...rehearsalOptions, submission, transactional: true });
    }
    // Preserve previously approved profiles, but never authorize a legacy pending insert.
    if (submissionId || !['active', 'blocked', 'revoked', 'expired'].includes(doctor.status)) throw new PrivateFlowError('onboarding_submission_required');
    return requestDoctorAuthorization(tx, actor, doctorId, action, { ...rehearsalOptions, transactional: true });
  }, writeScope ? { rehearsalWriteScope: writeScope } : {});
}
