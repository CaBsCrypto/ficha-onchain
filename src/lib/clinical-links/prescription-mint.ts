import { randomUUID } from 'node:crypto';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { getDb, getDbConnection, sqlForConnection, type Sql } from '@/lib/db';
import { verifiedWallet } from '@/lib/doctor-authorizations';
import { PRIVATE_ADMIN, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';
import { appointmentStartedByDoctorSql } from '@/lib/prescription-booking';
import { assertReviewedPrescriber, publicOperation, type PrivateRow } from '@/lib/private-prescriptions';
import { preparePrivateOperation, confirmPrivateOperation, reconcilePartnerPrivateOperation } from '@/lib/private-operations';
import { PARTNER_PRESCRIPTION_CUSTODY, partnerPrescriptionAppointment } from '../../../scripts/lib/clinical-links-mint-policy.mjs';
import { loadPartnerPrivateRxScope, type PrivateRxSlot } from '../../../scripts/lib/digital-cabs-rx-scope.mjs';
import { ClinicalLinksApiError, getClinicalLinksPilotPartnerOrigin } from './config';
import { requireKeys, requireLinkRef, requireRevision, requireText } from './input';
import type { ClinicalPartner } from './store';

const partnerId = 'trustleaf-cannabis';
const digest = /^(?!0+$)[0-9a-f]{64}$/;
const positiveId = /^[1-9][0-9]{0,19}$/;
const notFound = () => new ClinicalLinksApiError('partner_prescription_not_found', 404);
const notReady = () => new ClinicalLinksApiError('partner_prescription_booking_not_ready', 409);
const conflict = () => new ClinicalLinksApiError('partner_prescription_conflict', 409);

type MintInput = ReturnType<typeof parsePartnerPrescription>;
type ActorCommand = ReturnType<typeof parsePartnerPrescriptionCommand>;

export function parsePartnerPrescription(body: Record<string, unknown>) {
  requireKeys(body, ['consultationRef', 'partnerPatientRef', 'documentId', 'version', 'commitment']);
  return {
    consultationRef: requireLinkRef(body.consultationRef),
    partnerPatientRef: requireLinkRef(body.partnerPatientRef),
    documentId: requireText(body.documentId, /^[A-Za-z0-9_-]{16,64}$/),
    version: requireRevision(body.version),
    commitment: requireText(body.commitment, digest),
  };
}

export function parsePartnerPrescriptionCommand(body: Record<string, unknown>) {
  switch (body.action) {
    case 'prepare':
      requireKeys(body, ['action']);
      return { action: body.action };
    case 'confirm':
      requireKeys(body, ['action', 'operationId', 'signature']);
      return { action: body.action, operationId: requireLinkRef(body.operationId), signature: requireText(body.signature, /^(?:0x)?[0-9a-f]{128}$/i) };
    case 'reconcile':
      requireKeys(body, ['action', 'operationId']);
      return { action: body.action, operationId: requireLinkRef(body.operationId) };
    default:
      throw new ClinicalLinksApiError('invalid_request', 400);
  }
}

function approvedAppointment(ref: string) {
  let id: number | null;
  try { id = partnerPrescriptionAppointment(ref); }
  catch { throw new ClinicalLinksApiError('partner_prescriptions_unavailable', 503); }
  if (!id) throw notFound();
  return id;
}

function checkPartner(partner: ClinicalPartner) {
  if (partner.id !== partnerId || partner.origin !== getClinicalLinksPilotPartnerOrigin()) throw notFound();
}

function confirmedReceipt(row: PrivateRow) {
  if (row.prescription_state !== 'confirmed' || row.mint_state !== 'confirmed' ||
      row.transaction_hash !== row.mint_hash || row.mint_commitment !== row.commitment ||
      !digest.test(row.transaction_hash ?? '') || !positiveId.test(row.rx_id ?? '')) return null;
  return { transactionHash: row.transaction_hash as string, rxId: row.rx_id as string };
}

function receiptView(row: PrivateRow) {
  const confirmed = confirmedReceipt(row);
  return {
    id: row.id as string,
    state: confirmed ? 'confirmed' as const : 'pending' as const,
    consultationRef: row.consultation_ref as string,
    documentId: row.document_id as string,
    version: row.document_version as number,
    commitment: row.commitment as string,
    network: 'testnet' as const,
    contractId: RX_PRIVATE,
    transactionHash: confirmed?.transactionHash ?? null,
    rxId: confirmed?.rxId ?? null,
  };
}

async function findPrescriptions(sql: Sql, { id = null, userId = null, partner = null }:
  { id?: string | null; userId?: string | null; partner?: string | null }) {
  return sql`SELECT m.*, a.patient_email, a.doctor_email, a.doctor_id, to_char(a.date,'YYYY-MM-DD') AS slot_date,
      a.patient_name, d.name AS doctor_name,
      a.time_slot, a.type, a.patient_wallet_id, a.patient_wallet, a.doctor_wallet_id, a.doctor_wallet,
      a.status AS appointment_state,
      b.state AS booking_state, b.valid_until, b.attestation_hash, b.cancellation_requested_at,
      r.state AS prescription_state, r.rx_id::text AS rx_id, r.transaction_hash,
      o.state AS mint_state, o.transaction_hash AS mint_hash, o.expected->>'commitment' AS mint_commitment,
      c.state AS consent_state,
      CASE WHEN m.patient_user_id=${userId} AND c.id IS NOT NULL THEN to_jsonb(c)
        WHEN m.doctor_user_id=${userId} AND o.id IS NOT NULL THEN to_jsonb(o)
        ELSE NULL END AS actor_operation
    FROM clinical_partner_prescriptions m
    JOIN clinical_partner_bindings g ON g.binding_id=m.binding_id AND g.partner_id=m.partner_id
    JOIN clinical_link_partners p ON p.partner_id=m.partner_id
    JOIN appointments a ON a.id=m.appointment_id AND a.patient_user_id=m.patient_user_id AND a.doctor_user_id=m.doctor_user_id
    JOIN doctors d ON d.id=a.doctor_id AND lower(d.email)=a.doctor_email
    JOIN prescription_booking_requests b ON b.appointment_id=m.appointment_id AND b.issuance_id=m.issuance_id
    JOIN private_prescriptions r ON r.id=m.id AND r.appointment_id=m.appointment_id AND r.issuance_id=m.issuance_id
      AND r.commitment=m.commitment AND r.expires_at=m.expires_at
      AND r.contract_id=${RX_PRIVATE} AND r.network='testnet' AND r.ciphertext=${PARTNER_PRESCRIPTION_CUSTODY}
    LEFT JOIN private_operations c ON c.id=m.consent_request_id AND c.actor_user_id=m.patient_user_id
      AND c.appointment_id=m.appointment_id AND c.contract_id=r.contract_id AND c.action='consent' AND c.method='authorize_prescriber'
    LEFT JOIN private_operations o ON o.id=m.mint_request_id AND o.actor_user_id=m.doctor_user_id
      AND o.appointment_id=m.appointment_id AND o.prescription_id=m.id AND o.contract_id=r.contract_id AND o.action='mint' AND o.method='mint_prescription'
      AND o.expected->>'issuanceId'=m.issuance_id AND o.expected->>'doctor'=r.doctor_wallet
      AND o.expected->>'patient'=r.patient_wallet AND o.expected->>'expiresAt'=r.expires_at::text
    WHERE g.status='active' AND g.shared_identity AND g.expires_at>now() AND p.active
      AND g.patient_user_id=m.patient_user_id AND g.partner_patient_ref=m.partner_patient_ref
      AND (${id}::uuid IS NULL OR m.id=${id}::uuid)
      AND (${partner}::text IS NULL OR m.partner_id=${partner})
      AND (${userId}::text IS NULL OR m.patient_user_id=${userId} OR m.doctor_user_id=${userId})
    ORDER BY m.created_at DESC LIMIT 20`;
}

export async function registerPartnerPrescription(partner: ClinicalPartner, doctorUserId: string, input: MintInput) {
  checkPartner(partner);
  const appointmentId = approvedAppointment(input.consultationRef);
  const client = await getDbConnection();
  let prescriptionId: string;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT a.*, b.issuance_id, b.valid_until, b.state AS booking_state,
      b.attestation_hash, b.cancellation_requested_at, (${appointmentStartedByDoctorSql}) AS attended
      FROM appointments a JOIN prescription_booking_requests b ON b.appointment_id=a.id
      WHERE a.id=$1 AND b.contract_id=$2 AND b.network='testnet'
        AND b.patient_requested_by=a.patient_user_id AND b.doctor_user_id=a.doctor_user_id
        AND b.patient_wallet_id=a.patient_wallet_id AND b.doctor_wallet_id=a.doctor_wallet_id
        AND b.patient_wallet=a.patient_wallet AND b.doctor_wallet=a.doctor_wallet
        AND b.patient_email=a.patient_email AND b.doctor_email=a.doctor_email
      FOR UPDATE OF a,b`, [appointmentId, RX_PRIVATE]);
    const appointment = rows[0];
    if (!appointment || appointment.doctor_user_id !== doctorUserId) throw notFound();
    const sql = sqlForConnection(client);
    const [grant] = await sql`SELECT g.binding_id, g.patient_user_id FROM clinical_partner_bindings g
      JOIN clinical_link_partners p ON p.partner_id=g.partner_id
      WHERE g.partner_id=${partner.id} AND g.partner_patient_ref=${input.partnerPatientRef}
        AND g.status='active' AND g.shared_identity AND g.expires_at>now() AND p.active
      FOR SHARE OF g,p`;
    if (!grant || grant.patient_user_id !== appointment.patient_user_id) throw notFound();
    const [existing] = await sql`SELECT * FROM clinical_partner_prescriptions WHERE appointment_id=${appointmentId}`;
    if (existing) {
      if (existing.partner_id !== partner.id || existing.binding_id !== grant.binding_id || existing.partner_patient_ref !== input.partnerPatientRef ||
          existing.document_id !== input.documentId || existing.document_version !== input.version || existing.commitment !== input.commitment ||
          existing.consultation_ref !== input.consultationRef) throw conflict();
      prescriptionId = existing.id;
    } else {
      const now = Math.floor(Date.now() / 1000);
      if (appointment.status !== 'in_progress' || appointment.attended !== true || appointment.booking_state !== 'confirmed' ||
          !digest.test(appointment.attestation_hash ?? '') || appointment.cancellation_requested_at || Number(appointment.valid_until) <= now) throw notReady();
      await assertReviewedPrescriber(client, appointment, appointment);
      prescriptionId = randomUUID();
      const expiresAt = now + 30 * 24 * 60 * 60;
      const [reserved] = await sql`INSERT INTO clinical_partner_prescriptions (id,partner_id,binding_id,partner_patient_ref,patient_user_id,
        doctor_user_id,appointment_id,consultation_ref,document_id,document_version,commitment,issuance_id,consent_request_id,mint_request_id,expires_at)
        VALUES (${prescriptionId},${partner.id},${grant.binding_id},${input.partnerPatientRef},${appointment.patient_user_id},
          ${appointment.doctor_user_id},${appointmentId},${input.consultationRef},${input.documentId},${input.version},
          ${input.commitment},${appointment.issuance_id},${randomUUID()},${randomUUID()},${expiresAt})
        ON CONFLICT DO NOTHING RETURNING id`;
      if (!reserved) throw conflict();
      const [prescription] = await sql`INSERT INTO private_prescriptions (id,network,contract_id,appointment_id,issuance_id,doctor_wallet,
        patient_wallet,expires_at,commitment,ciphertext,state) VALUES (${prescriptionId},'testnet',${RX_PRIVATE},${appointmentId},${appointment.issuance_id},
          ${appointment.doctor_wallet},${appointment.patient_wallet},${expiresAt},${input.commitment},${PARTNER_PRESCRIPTION_CUSTODY},'prepared')
        ON CONFLICT DO NOTHING RETURNING id`;
      if (!prescription) throw conflict();
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return partnerPrescriptionStatus(partner, prescriptionId);
}

export async function partnerPrescriptionStatus(partner: ClinicalPartner, id: string) {
  checkPartner(partner);
  const [row] = await findPrescriptions(getDb(), { id, partner: partner.id });
  if (!row || approvedAppointment(row.consultation_ref) !== row.appointment_id) throw notFound();
  return receiptView(row);
}

export async function requireConfirmedPartnerPrescription(sql: Sql, input: {
  partnerId: string; patientUserId: string; partnerPatientRef: string; documentId: string; version: number; commitment: string;
}) {
  const [record] = await sql`SELECT id FROM clinical_partner_prescriptions
    WHERE partner_id=${input.partnerId} AND patient_user_id=${input.patientUserId} AND partner_patient_ref=${input.partnerPatientRef}
      AND document_id=${input.documentId} AND document_version=${input.version} AND commitment=${input.commitment}`;
  const [row] = record ? await findPrescriptions(sql, { id: record.id, partner: input.partnerId }) : [];
  const confirmed = row && confirmedReceipt(row);
  if (!confirmed) throw new ClinicalLinksApiError('partner_prescription_confirmation_required', 409);
  return confirmed;
}

function actorView(actor: AuthedUser, row: PrivateRow) {
  const role = row.patient_user_id === actor.userId ? 'patient' as const : 'doctor' as const;
  return { ...receiptView(row), role,
    doctorName: String(row.doctor_name), patientName: String(row.patient_name), authorizationExpiresAt: Number(row.valid_until),
    bookingReady: row.appointment_state === 'in_progress' && row.booking_state === 'confirmed' &&
      digest.test(row.attestation_hash ?? '') && !row.cancellation_requested_at && Number(row.valid_until) > Date.now() / 1000,
    consentConfirmed: row.consent_state === 'confirmed',
    operation: row.actor_operation ? publicOperation(row.actor_operation) : null,
  };
}

async function actorRecords(actor: AuthedUser, id?: string) {
  if (!actor.email) throw notFound();
  const sql = getDb();
  const rows = await findPrescriptions(sql, { id, userId: actor.userId });
  if (!rows.length) return [];
  const wallet = await verifiedWallet(sql, actor.userId, actor.email, { existingOnly: true });
  return rows.filter(row => {
    const role = row.patient_user_id === actor.userId ? 'patient' : 'doctor';
    return row[`${role}_wallet`] === wallet.address && row[`${role}_wallet_id`] === wallet.walletId &&
      row[`${role}_email`] === actor.email && approvedAppointment(row.consultation_ref) === row.appointment_id;
  });
}

export async function listActorPartnerPrescriptions(actor: AuthedUser) {
  return { prescriptions: (await actorRecords(actor)).map(row => actorView(actor, row)) };
}

type ActorOperation = Awaited<ReturnType<typeof preparePrivateOperation>>;
export async function actorPartnerPrescription(actor: AuthedUser, id: string, command?: ActorCommand) {
  const [row] = await actorRecords(actor, id);
  if (!row) throw notFound();
  const response = actorView(actor, row);
  if (!command) return response;
  const step = response.role === 'patient' ? 'consent' : 'mint';
  const operationId = response.role === 'patient' ? row.consent_request_id : row.mint_request_id;
  if (command.action !== 'prepare' && operationId !== command.operationId) throw notFound();
  const historical = command.action === 'reconcile' && (!response.bookingReady || response.state === 'confirmed');
  if (!historical && (!response.bookingReady || response.state === 'confirmed' || step === 'mint' && !response.consentConfirmed)) throw notReady();
  const scope = loadPartnerPrivateRxScope({
    schemaVersion: 1, phase: 'issuance', runId: row.id, openedAt: Math.floor(new Date(row.created_at).getTime() / 1000),
    until: Number(row.valid_until), network: 'testnet', contractId: RX_PRIVATE, registryId: REGISTRY_PRIVATE,
    authority: PRIVATE_ADMIN, relayer: process.env.TRUSTLEAF_PARTNER_RX_RELAYER_ADDRESS ?? '',
    patient: { userId: row.patient_user_id, walletId: row.patient_wallet_id, address: row.patient_wallet },
    doctor: { userId: row.doctor_user_id, walletId: row.doctor_wallet_id, address: row.doctor_wallet },
    doctorId: row.doctor_id, slot: { date: row.slot_date, timeSlot: row.time_slot, type: row.type as PrivateRxSlot['type'] },
    appointmentId: row.appointment_id, issuanceId: row.issuance_id, bookingValidUntil: Number(row.valid_until), prescriptionId: row.id,
    maxTotalFeeStroops: '10000000',
    steps: {
      consent: { requestId: row.consent_request_id, maxFeeStroops: '5000000' },
      mint: { requestId: row.mint_request_id, maxFeeStroops: '5000000' },
    },
  }, { consultationRef: row.consultation_ref, attestationHash: row.attestation_hash, commitment: row.commitment,
    bindingId: row.binding_id, partnerId: row.partner_id, expiresAt: Number(row.expires_at) }, { historical });
  let result: ActorOperation;
  if (command.action === 'prepare') {
    result = await preparePrivateOperation(actor, step, step === 'consent' ? { appointmentId: row.appointment_id } : { prescriptionId: id }, scope);
  } else if (command.action === 'confirm') {
    result = await confirmPrivateOperation(actor, operationId, command.signature, scope);
  } else {
    result = await reconcilePartnerPrivateOperation(actor, operationId, scope);
  }
  const [updated] = await actorRecords(actor, id);
  if (!updated) throw notFound();
  return { ...actorView(actor, updated), operation: result.operation };
}
