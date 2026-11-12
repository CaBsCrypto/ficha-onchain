import 'server-only';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import type { ClinicalActor } from '@/types/clinical';
import { getDb } from '@/lib/db';
import { resolveDoctor } from '@/lib/doctor-authorizations';
import { PrivateFlowError } from '@/lib/private-config';
import { CLINICAL_ID } from './config';
import { createClinicalWebChain } from './chain';

const denied = () => new PrivateFlowError('clinical_context_unavailable', 404);

/** Resolve the current app doctor from the verified session and wallet only. */
export async function clinicalDoctorIdentity(user: AuthedUser, actor: ClinicalActor) {
  if (user.userId !== actor.userId || !user.email) throw denied();
  const sql = getDb();
  const candidates = await sql.query('SELECT id FROM doctors WHERE LOWER(email)=$1 LIMIT 2', [user.email.toLowerCase()]);
  if (candidates.length !== 1) throw denied();
  const doctor = await resolveDoctor(sql, Number(candidates[0].id));
  if (Number(doctor.doctor.id) !== Number(candidates[0].id) || !Number.isSafeInteger(Number(doctor.doctor.id)) || Number(doctor.doctor.id) < 1 ||
      doctor.userId !== actor.userId || doctor.walletId !== actor.walletId || doctor.address !== actor.address ||
      String(doctor.doctor.email).toLowerCase() !== user.email.toLowerCase() || doctor.doctor.status !== 'active') throw denied();
  return { doctorId: Number(doctor.doctor.id) };
}
/** A selected history is a locator, never authority. No patient directory,
 * clinical content, wallet supplied by the browser, or write capability here.
 * Document/append handlers must recheck this gate for their own action. */
export async function clinicalDoctorContext(user: AuthedUser, actor: ClinicalActor, historyId: string, verifiedRequestChain?: ReturnType<typeof createClinicalWebChain>) {
  if (!/^[a-f0-9]{64}$/.test(historyId)) throw new PrivateFlowError('clinical_request_invalid', 400);
  const sql = getDb();
  // Reuse deployment verification only within the caller's current request.
  // Every observe() still reads current identity, authorization and grant.
  const chain = verifiedRequestChain ?? createClinicalWebChain();
  async function observe() {
    const doctor = await clinicalDoctorIdentity(user, actor);
    // Registry expiry/revocation is independent of the app's approved profile.
    if (!await chain.doctorAuthorized(actor.address)) throw denied();
    const rows = await sql.query(`SELECT history_id,patient_wallet FROM clinical_web_histories
      WHERE history_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2`, [historyId, CLINICAL_ID]);
    if (rows.length !== 1) throw denied();
    const history = await chain.history(historyId);
    if (!history || history.id !== historyId || history.patient !== rows[0].patient_wallet || history.patient === actor.address) throw denied();
    const grant = await chain.grant(historyId, actor.address);
    if (!grant || (!grant.canRead && !grant.canAppend)) throw denied();
    if (!await chain.doctorAuthorized(actor.address)) throw denied();
    return { doctorId: doctor.doctorId, patient: history.patient,
      historyId, canRead: grant.canRead, canAppend: grant.canAppend, grantRevision: grant.revision };
  }
  const before = await observe();
  const after = await observe();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw denied();
  const { patient: _patient, ...context } = after;
  // Permission to append must not turn into permission to read the timeline.
  // These are observed permissions, not authorization to skip later checks.
  return { ...context, verifiedAt: new Date().toISOString() };
}
