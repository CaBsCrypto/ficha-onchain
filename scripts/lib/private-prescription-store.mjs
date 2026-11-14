import { randomBytes, randomUUID } from 'node:crypto';
import { encryptPrescription, prescriptionCommitment } from './private-prescription.mjs';

/** SQL client is the existing connected pg client; no second DB connector.
 * The actor must come from an authenticated service boundary, not request JSON.
 * Keys are required: no plaintext fallback. The payload is encrypted before SQL.
 */
export async function preparePrivatePrescription(client, {actor, appointmentId, document, expiresAt, key}) {
  if (!actor?.userId || !actor.email || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()/1000) throw Error('invalid_private_issuance');
  await client.query('BEGIN');
  try {
    const {rows} = await client.query(`SELECT r.* FROM prescription_booking_requests r
      JOIN stellar_verified_bindings d ON d.email=r.doctor_email AND d.role='doctor'
      JOIN stellar_verified_bindings p ON p.email=r.patient_email AND p.role='patient'
      JOIN appointments a ON a.id=r.appointment_id
      WHERE r.appointment_id=$1 AND r.doctor_email=$2 AND d.user_id=$3
        AND r.network='testnet' AND r.state='confirmed' AND r.attestation_hash IS NOT NULL
        AND r.cancellation_requested_at IS NULL AND r.valid_until>EXTRACT(EPOCH FROM NOW())
        AND d.wallet=r.doctor_wallet AND p.wallet=r.patient_wallet AND p.user_id=r.patient_requested_by
        AND d.revoked_at IS NULL AND p.revoked_at IS NULL
        AND d.verified_at<=NOW() AND p.verified_at<=NOW()
        AND d.verification_reference<>'' AND p.verification_reference<>''
        AND a.status='in_progress' AND a.doctor_email=r.doctor_email AND a.patient_email=r.patient_email
      FOR UPDATE OF r, d, p, a`, [appointmentId,actor.email,actor.userId]);
    if (rows.length!==1) throw Error('private_issuance_not_eligible');
    const b=rows[0];
    // Existing preparations must be explicitly reconciled. Never replace their
    // clinical content or blinding on retry after a possible chain submission.
    const prior=await client.query('SELECT id FROM private_prescriptions WHERE issuance_id=$1',[b.issuance_id]);
    if (prior.rows.length) throw Error('private_issuance_already_prepared');
    const id=randomUUID();
    const payload={schemaVersion:1,network:'testnet',contractId:b.contract_id,doctor:b.doctor_wallet,
      patient:b.patient_wallet,issuanceId:b.issuance_id,expiresAt,document,blinding:randomBytes(32).toString('hex')};
    const commitment=prescriptionCommitment(payload);
    const context=JSON.stringify(['TrustLeaf/PrivatePrescriptionStorage/v1',id,'testnet',b.contract_id]);
    const ciphertext=encryptPrescription(payload,key,context);
    await client.query(`INSERT INTO private_prescriptions
      (id,network,contract_id,appointment_id,issuance_id,doctor_wallet,patient_wallet,expires_at,commitment,ciphertext,state)
      VALUES($1,'testnet',$2,$3,$4,$5,$6,$7,$8,$9,'prepared')`,
      [id,b.contract_id,appointmentId,b.issuance_id,b.doctor_wallet,b.patient_wallet,expiresAt,commitment,ciphertext]);
    await client.query('COMMIT');
    return {id,commitment,issuanceId:b.issuance_id,doctor:b.doctor_wallet,patient:b.patient_wallet,contractId:b.contract_id,expiresAt};
  } catch (error) {await client.query('ROLLBACK');throw error;}
}

export function privateReadAdapters(client) {
  return {
    findBinding: async actor => (await client.query(`SELECT * FROM stellar_verified_bindings
      WHERE user_id=$1 AND email=$2 AND role='patient' AND revoked_at IS NULL`,[actor.userId,actor.email])).rows[0],
    loadRecord: async (id,wallet) => {
      const {rows}=await client.query(`SELECT id, network, contract_id AS "contractId", patient_wallet AS patient,
        doctor_wallet AS doctor, issuance_id AS "issuanceId", expires_at AS "expiresAt", commitment,
        ciphertext, state, rx_id AS "rxId" FROM private_prescriptions WHERE id=$1 AND patient_wallet=$2`,[id,wallet]);
      if (!rows[0]) return null;
      return {...rows[0],expiresAt:Number(rows[0].expiresAt)};
    },
  };
}
