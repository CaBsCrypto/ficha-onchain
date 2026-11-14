import 'server-only';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import type { ClinicalActor, ClinicalPrescriptionReference } from '@/types/clinical';
import { getDb } from '@/lib/db';
import { PrivateFlowError, RX_PRIVATE } from '@/lib/private-config';
import { privateActorWallet, prescriptionView, type PrivateRow } from '@/lib/private-prescriptions';
import { createPrivateChain } from '@/lib/stellar/private-chain';
import { uuid } from '@/lib/private-api';
import { CLINICAL_ID } from './config';
import { createClinicalWebChain } from './chain';
import { assertClinicalOwner } from './identity';
import { clinicalDoctorContext } from './doctor-context';

const denied = () => new PrivateFlowError('clinical_prescription_unavailable', 404);
const unavailable = () => new PrivateFlowError('clinical_prescription_verification_unavailable', 503);
const MAX_OPTIONS = 50;

async function currentWallet(user: AuthedUser, actor: ClinicalActor) {
  if (user.userId !== actor.userId || !user.email) throw denied();
  const wallet = await privateActorWallet(user);
  if (wallet.address !== actor.address || wallet.walletId !== actor.walletId) throw denied();
}

/** A clinical grant never grants access to a prescription. Scope candidates by
 * the original prescription's patient AND its independently bound participant. */
async function prescriptionRows(actor: ClinicalActor, patient: string, id?: string): Promise<PrivateRow[]> {
  const rows = await getDb().query(`SELECT p.*,b.doctor_user_id,b.patient_requested_by,b.doctor_wallet_id,b.patient_wallet_id,
    a.patient_name,d.name AS doctor_name
    FROM private_prescriptions p
    JOIN prescription_booking_requests b ON b.appointment_id=p.appointment_id AND b.issuance_id=p.issuance_id
    JOIN appointments a ON a.id=p.appointment_id
    JOIN doctors d ON LOWER(d.email)=LOWER(a.doctor_email)
    WHERE p.contract_id=$1 AND p.network='testnet' AND p.state='confirmed' AND p.patient_wallet=$2
      AND b.contract_id=$1 AND b.network='testnet' AND b.patient_wallet=p.patient_wallet AND b.doctor_wallet=p.doctor_wallet
      AND ((p.patient_wallet=$3 AND b.patient_requested_by=$4 AND b.patient_wallet_id=$5)
        OR (p.doctor_wallet=$3 AND b.doctor_user_id=$4 AND b.doctor_wallet_id=$5))
      ${id ? 'AND p.id=$6' : ''}
    ORDER BY p.created_at DESC,p.id LIMIT ${id ? 2 : MAX_OPTIONS + 1}`,
    [RX_PRIVATE, patient, actor.address, actor.userId, actor.walletId, ...(id ? [id] : [])]);
  if (rows.length > (id ? 1 : MAX_OPTIONS) || new Set(rows.map(row => row.id)).size !== rows.length) throw unavailable();
  for (const row of rows) {
    const participant = (row.patient_wallet === actor.address && row.patient_requested_by === actor.userId && row.patient_wallet_id === actor.walletId) ||
      (row.doctor_wallet === actor.address && row.doctor_user_id === actor.userId && row.doctor_wallet_id === actor.walletId);
    if (!participant || row.patient_wallet !== patient || row.contract_id !== RX_PRIVATE || row.network !== 'testnet' || row.state !== 'confirmed' ||
        !uuid(row.id) || (id !== undefined && row.id !== id) || !/^[1-9][0-9]*$/.test(String(row.rx_id)) ||
        !Number.isSafeInteger(Number(row.appointment_id)) || Number(row.appointment_id) < 1 ||
        !Number.isSafeInteger(Number(row.expires_at)) || Number(row.expires_at) < 1 ||
        (typeof row.transaction_hash !== 'string' || !/^[a-f0-9]{64}$/i.test(row.transaction_hash))) throw unavailable();
  }
  return rows;
}

function fingerprint(rows: PrivateRow[]) {
  return JSON.stringify(rows.map(row => [row.id, String(row.rx_id), Number(row.appointment_id), row.issuance_id,
    row.patient_wallet, row.doctor_wallet, row.patient_requested_by, row.doctor_user_id,
    row.patient_wallet_id, row.doctor_wallet_id, row.contract_id, row.network, row.state,
    row.commitment, Number(row.expires_at), row.transaction_hash, row.doctor_name, row.patient_name]));
}

async function verifiedReferences(rows: PrivateRow[]): Promise<ClinicalPrescriptionReference[]> {
  const chain = createPrivateChain();
  await chain.verifyDeployment();
  const result: ClinicalPrescriptionReference[] = [];
  for (let offset = 0; offset < rows.length; offset += 3) {
    const batch = await Promise.all(rows.slice(offset, offset + 3).map(async row => {
      // Reuse the prescription flow's live record/commitment verification and
      // status semantics. Do not decrypt, reissue, or change a prescription.
      const view = await prescriptionView(row, row, chain);
      if (!['Pending', 'Registered', 'Active', 'Revoked', 'Blocked'].includes(view.status)) throw unavailable();
      return { id: view.id as string, rxId: view.rxId, appointmentId: Number(view.appointmentId),
        doctorName: String(view.doctorName), patientName: String(view.patientName),
        status: view.status as ClinicalPrescriptionReference['status'], expired: view.expired, expiresAt: view.expiresAt,
        transactionHash: view.transactionHash as string | null };
    }));
    result.push(...batch);
  }
  return result;
}

/** Private UUID lives only in the encrypted clinical note. A link is valid only
 * for this patient and an independently entitled, currently verified RX actor.
 * Both preparation and signing/retry must invoke this gate with the saved note. */
export async function clinicalPrescriptionReference(user: AuthedUser, actor: ClinicalActor, patient: string, id: string): Promise<ClinicalPrescriptionReference> {
  if (!uuid(id)) throw denied();
  id = id.toLowerCase();
  try {
    await currentWallet(user, actor);
    const rows = await prescriptionRows(actor, patient, id);
    if (rows.length !== 1) throw denied();
    const [reference] = await verifiedReferences(rows);
    await currentWallet(user, actor);
    const after = await prescriptionRows(actor, patient, id);
    if (fingerprint(rows) !== fingerprint(after)) throw denied();
    return reference;
  } catch (error) {
    if (error instanceof PrivateFlowError && error.message === 'clinical_prescription_unavailable') throw error;
    throw unavailable();
  }
}

async function prescriptionContext(user: AuthedUser, actor: ClinicalActor, historyId?: string) {
  const sql = getDb(), chain = createClinicalWebChain();
  if (historyId !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(historyId)) throw new PrivateFlowError('clinical_request_invalid', 400);
    const context = await clinicalDoctorContext(user, actor, historyId);
    if (context.historyId !== historyId || (!context.canRead && !context.canAppend)) throw denied();
    const rows = await sql.query(`SELECT history_id,patient_wallet FROM clinical_web_histories
      WHERE history_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2`, [historyId, CLINICAL_ID]);
    if (rows.length !== 1) throw denied();
    const history = await chain.history(historyId);
    if (!history || history.id !== historyId || history.patient !== rows[0].patient_wallet || history.patient === actor.address) throw denied();
    return { historyId, patient: history.patient, canRead: context.canRead, canAppend: context.canAppend, revision: context.grantRevision };
  }
  const rows = await sql.query(`SELECT * FROM clinical_web_histories
    WHERE owner_user_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2`, [actor.userId, CLINICAL_ID]);
  if (rows.length !== 1) throw denied();
  assertClinicalOwner(rows[0] as { owner_user_id: string; patient_wallet: string; wallet_id: string }, actor);
  const historyIdOwned = String(rows[0].history_id);
  const history = await chain.history(historyIdOwned);
  if (!history || history.id !== historyIdOwned || history.patient !== actor.address) throw denied();
  return { historyId: historyIdOwned, patient: history.patient, canRead: true, canAppend: true, revision: null };
}

/** This is a patient-context selector, never a cross-patient prescription list. */
export async function clinicalPrescriptionOptions(user: AuthedUser, actor: ClinicalActor, historyId?: string, prescriptionId?: string) {
  if (prescriptionId !== undefined && !uuid(prescriptionId)) throw new PrivateFlowError('clinical_request_invalid', 400);
  const selectedId = prescriptionId?.toLowerCase();
  try {
    await currentWallet(user, actor);
    const context = await prescriptionContext(user, actor, historyId);
    const rows = await prescriptionRows(actor, context.patient, selectedId);
    const prescriptions = await verifiedReferences(rows);
    await currentWallet(user, actor);
    const afterContext = await prescriptionContext(user, actor, historyId);
    const afterRows = await prescriptionRows(actor, context.patient, selectedId);
    if (JSON.stringify(context) !== JSON.stringify(afterContext) || fingerprint(rows) !== fingerprint(afterRows)) throw denied();
    return { prescriptions, verifiedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof PrivateFlowError) throw error;
    throw unavailable();
  }
}
