import type { Sql } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { PrivateFlowError } from '@/lib/private-config';
import { resolveDoctor, requestDoctorAuthorization } from '@/lib/doctor-authorizations';
import { approveDoctorOnboarding, onboardingTransaction, readDoctorSubmission } from '@/lib/doctor-onboarding';

/** Public administrative entry: every new application requires its reviewed revision. */
export async function requestReviewedDoctorAuthorization(sql: Sql, actor: AuthedUser, doctorId: number, action: string, submissionId?: string) {
  const resolved = await resolveDoctor(sql, doctorId);
  const email = String(resolved.doctor.email).toLowerCase();
  const [hint] = await sql.query(`SELECT * FROM doctor_onboarding_requests WHERE doctor_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`, [doctorId]);
  if (hint && ['submitted', 'authorization_pending'].includes(hint.state)) {
    if (action === 'revoke') throw new PrivateFlowError('application_not_authorized');
    return approveDoctorOnboarding(sql, actor, doctorId, submissionId ?? '', (tx, submission) =>
      requestDoctorAuthorization(tx, actor, doctorId, action, { submission, transactional: true }));
  }
  return onboardingTransaction(email, async tx => {
    const [doctor] = await tx.query('SELECT id,status,email FROM doctors WHERE id=$1 AND LOWER(email)=$2 FOR UPDATE', [doctorId, email]);
    const [current] = await tx.query('SELECT * FROM doctor_onboarding_requests WHERE doctor_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE', [doctorId]);
    if (!doctor) throw new PrivateFlowError('doctor_identity_changed');
    if (current) {
      if (!['authorized', 'revoked'].includes(current.state) || current.current_submission_id !== submissionId) throw new PrivateFlowError('onboarding_state_changed');
      const submission = await readDoctorSubmission(tx, current);
      if (submission.owner.userId !== resolved.userId || submission.owner.walletId !== resolved.walletId || submission.owner.address !== resolved.address) throw new PrivateFlowError('doctor_identity_mismatch', 403);
      return requestDoctorAuthorization(tx, actor, doctorId, action, { submission, transactional: true });
    }
    // Preserve previously approved profiles, but never authorize a legacy pending insert.
    if (submissionId || !['active', 'blocked', 'revoked', 'expired'].includes(doctor.status)) throw new PrivateFlowError('onboarding_submission_required');
    return requestDoctorAuthorization(tx, actor, doctorId, action, { transactional: true });
  });
}
