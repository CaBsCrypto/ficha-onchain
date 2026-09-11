import { isApprovedDoctor } from '@/lib/doctor-access';
import { randomBytes } from 'node:crypto';
import { getDbConnection, sqlForConnection, type Sql } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { verifiedWallet, resolveDoctor, readPrivateDoctor } from '@/lib/doctor-authorizations';
import { assertPrivateEnvironment, assertPrivateWrites, PRIVY_APP, RX_PRIVATE } from '@/lib/private-config';

export class BookingPreparationError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

/** Keep role checks, attendance/start changes and queue insertion in one transaction. */
export async function bookingTransaction<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  assertPrivateWrites();
  const client = await getDbConnection();
  try {
    await client.query('BEGIN');
    const result = await run(sqlForConnection(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export function validBookingDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export const validBookingTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** PostgreSQL supplies the clock and Santiago timezone, independent of the host. */
export async function availableAppointmentSlots(sql: Sql, doctorEmail: string, date: string, nextAvailable = false) {
  if (!validBookingDate(date)) throw new BookingPreparationError('invalid_date', 400);
  const slots = await sql.query(`WITH free AS (SELECT DISTINCT day::date AS date, TO_CHAR(slot,'HH24:MI') AS time,av.slot_minutes,true AS available
    FROM generate_series(CASE WHEN $3::boolean THEN GREATEST($2::date,(NOW() AT TIME ZONE 'America/Santiago')::date) ELSE $2::date END,CASE WHEN $3::boolean THEN (NOW() AT TIME ZONE 'America/Santiago')::date+90 ELSE $2::date END,INTERVAL '1 day') day
    JOIN doctor_availability av ON av.weekday=EXTRACT(DOW FROM day)
    CROSS JOIN LATERAL generate_series(
      day::date+av.start_time,day::date+av.end_time-make_interval(mins=>av.slot_minutes),
      make_interval(mins=>av.slot_minutes)) slot
    WHERE LOWER(av.doctor_email)=$1
      AND slot>=(NOW() AT TIME ZONE 'America/Santiago') AND day::date<=(NOW() AT TIME ZONE 'America/Santiago')::date+90
      AND NOT EXISTS(SELECT 1 FROM doctor_time_off off WHERE LOWER(off.doctor_email)=$1 AND off.date=day::date)
      AND NOT EXISTS(SELECT 1 FROM appointments a WHERE LOWER(a.doctor_email)=$1 AND a.date=day::date
        AND a.time_slot=TO_CHAR(slot,'HH24:MI') AND a.status<>'cancelled'))
    SELECT TO_CHAR(date,'YYYY-MM-DD') AS date,time,slot_minutes,true AS available FROM free
    WHERE date=(SELECT MIN(date) FROM free) ORDER BY time`, [doctorEmail, date, nextAvailable]);
  if (nextAvailable) {
    const [limit] = await sql.query(`SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Santiago')::date+90,'YYYY-MM-DD') AS search_until`);
    return { date: slots[0]?.date ?? null, search_until: limit.search_until,
      slots: slots.map(s => ({ time: s.time, available: true })), time_off: null };
  }
  return { date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), slot_minutes: slots[0]?.slot_minutes ?? null,
    slots: slots.map(s => ({ time: s.time, available: true })), time_off: null };
}

const appointmentSelect = `SELECT a.*,TO_CHAR(a.date,'YYYY-MM-DD') AS date,d.name AS doctor_name,
  CASE WHEN b.appointment_id IS NULL THEN NULL ELSE jsonb_build_object('issuance_id',b.issuance_id,'state',b.state,
    'valid_until',b.valid_until,'attestation_hash',b.attestation_hash,'revocation_hash',b.revocation_hash,
    'cancellation_requested_at',b.cancellation_requested_at) END AS booking
  FROM appointments a JOIN doctors d ON d.id=a.doctor_id
  LEFT JOIN prescription_booking_requests b ON b.appointment_id=a.id`;

export function publicAppointment(row: Record<string, unknown>) {
  const fields = ['id','doctor_id','doctor_name','doctor_email','patient_email','patient_name','date','time_slot','type','status',
    'attendance_at','started_at','completed_at','booking'];
  return Object.fromEntries(fields.map(key => [key, row[key] ?? null]));
}

export async function listPrivateAppointments(sql: Sql, actor: AuthedUser, role: 'doctor' | 'patient') {
  assertPrivateEnvironment();
  if (!actor.email) throw new BookingPreparationError('verified_email_required', 403);
  const wallet = await verifiedWallet(sql, actor.userId, actor.email);
  const rows = await sql.query(`${appointmentSelect} WHERE a.${role}_user_id=$1 AND a.${role}_email=$2
    AND a.${role}_wallet_id=$3 AND a.${role}_wallet=$4 ORDER BY a.date,a.time_slot,a.id`,
  [actor.userId, actor.email, wallet.walletId, wallet.address]);
  return { count: rows.length, appointments: rows.map(publicAppointment) };
}

async function ownedAppointment(sql: Sql, actor: AuthedUser, id: number, lock = false) {
  if (!actor.email) throw new BookingPreparationError('verified_email_required', 403);
  const [row] = await sql.query(`${appointmentSelect} WHERE a.id=$1
    AND ((a.patient_user_id=$2 AND a.patient_email=$3) OR (a.doctor_user_id=$2 AND a.doctor_email=$3))
    ${lock ? 'FOR UPDATE OF a' : ''}`, [id, actor.userId, actor.email]);
  if (!row) throw new BookingPreparationError('appointment_not_found', 404);
  return row;
}

export async function createPrivateAppointment(sql: Sql, actor: AuthedUser,
  input: { doctorId: number; date: string; timeSlot: string; type?: string }) {
  assertPrivateWrites();
  if (!actor.email) throw new BookingPreparationError('verified_email_required', 403);
  if (!validBookingDate(input.date) || !validBookingTime(input.timeSlot) || !Number.isSafeInteger(input.doctorId) || input.doctorId < 1)
    throw new BookingPreparationError('invalid_appointment', 400);
  const type = input.type ?? 'Telemedicina';
  if (!['Telemedicina','Presencial'].includes(type)) throw new BookingPreparationError('invalid_appointment_type', 400);
  const doctor = await resolveDoctor(sql, input.doctorId);
  if (doctor.userId === actor.userId) throw new BookingPreparationError('distinct_participants_required', 403);
  const patient = await verifiedWallet(sql, actor.userId, actor.email);
  if (!(await isApprovedDoctor(sql,Number(doctor.doctor.id),{...doctor,email:String(doctor.doctor.email)}))) throw new BookingPreparationError('doctor_not_authorized', 403);
  // Availability updates lock this same doctor row; slot selection cannot race a grid replacement.
  const [locked] = await sql`SELECT id FROM doctors WHERE id=${input.doctorId} AND LOWER(email)=${doctor.doctor.email} FOR UPDATE`;
  if (!locked) throw new BookingPreparationError('doctor_identity_changed', 409);
  const slots = await availableAppointmentSlots(sql, String(doctor.doctor.email), input.date);
  if (!slots.slots.some(s => s.time === input.timeSlot)) throw new BookingPreparationError('slot_not_available', 409);
  const [inserted] = await sql`INSERT INTO appointments(doctor_id,doctor_email,doctor_user_id,doctor_wallet_id,doctor_wallet,
    patient_email,patient_user_id,patient_wallet_id,patient_wallet,patient_name,date,time_slot,type,status)
    VALUES(${input.doctorId},${doctor.doctor.email},${doctor.userId},${doctor.walletId},${doctor.address},
      ${actor.email},${actor.userId},${patient.walletId},${patient.address},'Paciente de prueba TrustLeaf',
      ${input.date},${input.timeSlot},${type},'scheduled') RETURNING id`;
  if (!inserted) throw new BookingPreparationError('appointment_not_created', 503);
  return { appointment: publicAppointment(await ownedAppointment(sql, actor, Number(inserted.id))) };
}

/** Caller holds the appointment lock. Attendance establishes identity only, never consent. */
export async function preparePrescriptionBooking(sql: Sql, actor: AuthedUser, appointmentId: number) {
  assertPrivateWrites();
  const a = await ownedAppointment(sql, actor, appointmentId, true);
  if (a.status !== 'in_progress' || !a.attendance_at || a.attendance_user_id !== a.patient_user_id || a.started_by !== a.doctor_user_id)
    throw new BookingPreparationError('booking_not_eligible');
  const patient = await verifiedWallet(sql, a.patient_user_id, a.patient_email);
  const doctor = await verifiedWallet(sql, a.doctor_user_id, a.doctor_email);
  if (patient.walletId !== a.patient_wallet_id || patient.address !== a.patient_wallet || doctor.walletId !== a.doctor_wallet_id || doctor.address !== a.doctor_wallet)
    throw new BookingPreparationError('appointment_wallet_changed', 403);
  if (!(await isApprovedDoctor(sql,Number(a.doctor_id),{...doctor,userId:a.doctor_user_id,email:a.doctor_email}))) throw new BookingPreparationError('doctor_not_authorized', 403);
  const [row] = await sql`INSERT INTO prescription_booking_requests(appointment_id,issuance_id,network,contract_id,
    patient_requested_by,patient_email,doctor_email,patient_wallet,doctor_wallet,doctor_user_id,doctor_wallet_id,patient_wallet_id,valid_until,state)
    SELECT a.id,${randomBytes(32).toString('hex')},'testnet',${RX_PRIVATE},a.patient_user_id,a.patient_email,a.doctor_email,
      a.patient_wallet,a.doctor_wallet,a.doctor_user_id,a.doctor_wallet_id,a.patient_wallet_id,
      FLOOR(EXTRACT(EPOCH FROM NOW()+INTERVAL '30 minutes'))::bigint,'prepared'
    FROM appointments a JOIN doctors dr ON dr.id=a.doctor_id AND LOWER(dr.email)=a.doctor_email
    JOIN privy_stellar_wallet_bindings p ON p.app_id=${PRIVY_APP} AND p.user_id=a.patient_user_id AND p.wallet_id=a.patient_wallet_id AND p.address=a.patient_wallet
    JOIN privy_stellar_wallet_bindings d ON d.app_id=${PRIVY_APP} AND d.user_id=a.doctor_user_id AND d.wallet_id=a.doctor_wallet_id AND d.address=a.doctor_wallet
    WHERE a.id=${appointmentId} AND a.status='in_progress' AND a.attendance_at<=NOW() AND a.attendance_user_id=a.patient_user_id
      AND a.started_by=a.doctor_user_id AND a.started_at<=NOW() AND a.started_at>NOW()-INTERVAL '24 hours'
      AND a.date=(NOW() AT TIME ZONE 'America/Santiago')::date
    ON CONFLICT(appointment_id) DO UPDATE SET updated_at=prescription_booking_requests.updated_at
      WHERE prescription_booking_requests.patient_requested_by=EXCLUDED.patient_requested_by
        AND prescription_booking_requests.doctor_user_id=EXCLUDED.doctor_user_id
        AND prescription_booking_requests.patient_wallet_id=EXCLUDED.patient_wallet_id
        AND prescription_booking_requests.doctor_wallet_id=EXCLUDED.doctor_wallet_id
        AND prescription_booking_requests.patient_wallet=EXCLUDED.patient_wallet
        AND prescription_booking_requests.doctor_wallet=EXCLUDED.doctor_wallet
        AND prescription_booking_requests.contract_id=EXCLUDED.contract_id
    RETURNING issuance_id,state,valid_until,patient_wallet,doctor_wallet,contract_id,attestation_hash,transaction_hash`;
  if (!row) throw new BookingPreparationError('booking_not_eligible');
  return { issuanceId: row.issuance_id, state: row.state, validUntil: Number(row.valid_until), network: 'testnet', contractId: row.contract_id,
    doctor: row.doctor_wallet, patient: row.patient_wallet, submitted: !!row.transaction_hash,
    onchainConfirmed: row.state === 'confirmed' && !!row.attestation_hash, consentVerified: false };
}

/** The transaction locks appointment before booking, matching operation confirmation. */
export async function requestBookingCancellation(sql: Sql, actor: AuthedUser, appointmentId: number) {
  assertPrivateWrites();
  const a = await ownedAppointment(sql, actor, appointmentId, true);
  const wallet = await verifiedWallet(sql, actor.userId, actor.email!);
  const role = a.patient_user_id === actor.userId ? 'patient' : 'doctor';
  if (wallet.walletId !== a[`${role}_wallet_id`] || wallet.address !== a[`${role}_wallet`]) throw new BookingPreparationError('appointment_wallet_changed', 403);
  const [booking] = await sql`SELECT * FROM prescription_booking_requests WHERE appointment_id=${appointmentId} FOR UPDATE`;
  if (booking?.state === 'consumed' || a.status === 'completed') throw new BookingPreparationError('booking_already_consumed');
  if (a.status === 'cancelled') return { appointment: publicAppointment(a), state: 'cancelled', onchainRevoked: booking?.state === 'revoked' };
  if (!booking) {
    await sql`UPDATE appointments SET status='cancelled' WHERE id=${appointmentId}`;
    return { appointment: publicAppointment({ ...a, status: 'cancelled' }), state: 'cancelled', onchainRevoked: false };
  }
  if (!['prepared','submitted','confirmed','cancel_requested'].includes(booking.state)) throw new BookingPreparationError('booking_not_cancellable');
  const [changed] = await sql`UPDATE prescription_booking_requests SET state='cancel_requested',
    cancellation_requested_by=COALESCE(cancellation_requested_by,${actor.userId}),
    cancellation_requested_at=COALESCE(cancellation_requested_at,NOW()),updated_at=NOW()
    WHERE appointment_id=${appointmentId} AND state IN ('prepared','submitted','confirmed','cancel_requested') RETURNING issuance_id,state`;
  if (!changed) throw new BookingPreparationError('booking_not_cancellable');
  await sql`UPDATE appointments SET status='cancel_requested' WHERE id=${appointmentId}`;
  return { appointment: publicAppointment(await ownedAppointment(sql, actor, appointmentId)), issuanceId: changed.issuance_id,
    state: changed.state, onchainRevoked: false, nextAction: 'reconcile_booking_before_confirming_cancellation' };
}

export async function changePrivateAppointment(sql: Sql, actor: AuthedUser, id: number, action: 'attend' | 'start' | 'complete' | 'cancel') {
  assertPrivateWrites();
  if (action === 'cancel') return requestBookingCancellation(sql, actor, id);
  const a = await ownedAppointment(sql, actor, id, true);
  const role = action === 'attend' ? 'patient' : 'doctor';
  if (a[`${role}_user_id`] !== actor.userId || a[`${role}_email`] !== actor.email) throw new BookingPreparationError('wrong_consultation_role', 403);
  const wallet = await verifiedWallet(sql, actor.userId, actor.email!);
  if (wallet.walletId !== a[`${role}_wallet_id`] || wallet.address !== a[`${role}_wallet`]) throw new BookingPreparationError('appointment_wallet_changed', 403);
  if (role === 'doctor' && !(await isApprovedDoctor(sql,Number(a.doctor_id),{...wallet,userId:actor.userId,email:actor.email!}))) throw new BookingPreparationError('doctor_not_authorized', 403);
  if (['cancelled','cancel_requested','completed'].includes(a.status)) throw new BookingPreparationError('consultation_not_open');
  if (action === 'complete') {
    const [b] = await sql`SELECT state FROM prescription_booking_requests WHERE appointment_id=${id} FOR UPDATE`;
    if (!b || b.state !== 'consumed') throw new BookingPreparationError('complete_requires_issued_prescription');
    const [completed] = await sql`UPDATE appointments SET status='completed',completed_at=NOW() WHERE id=${id} AND status='in_progress' RETURNING id`;
    if (!completed) throw new BookingPreparationError('consultation_not_open');
  } else {
    const [updated] = action === 'attend'
      ? await sql`UPDATE appointments SET attendance_at=COALESCE(attendance_at,NOW()),attendance_user_id=${actor.userId}
          WHERE id=${id} AND status IN ('scheduled','in_progress') AND date=(NOW() AT TIME ZONE 'America/Santiago')::date
            AND date+time_slot::time<=(NOW() AT TIME ZONE 'America/Santiago')+INTERVAL '30 minutes' RETURNING *`
      : await sql`UPDATE appointments SET status='in_progress',started_at=COALESCE(started_at,NOW()),started_by=${actor.userId}
          WHERE id=${id} AND status IN ('scheduled','in_progress') AND date=(NOW() AT TIME ZONE 'America/Santiago')::date
            AND date+time_slot::time<=(NOW() AT TIME ZONE 'America/Santiago')+INTERVAL '30 minutes' RETURNING *`;
    if (!updated) throw new BookingPreparationError('consultation_outside_checkin_window');
    if (updated.attendance_at && updated.started_at) await preparePrescriptionBooking(sql, actor, id);
  }
  const result = await ownedAppointment(sql, actor, id);
  return { appointment: publicAppointment(result), bookingPending: result.booking?.state === 'prepared' };
}

export async function privateBookingStatus(sql: Sql, actor: AuthedUser, appointmentId: number) {
  assertPrivateEnvironment();
  const a = await ownedAppointment(sql, actor, appointmentId);
  const role = a.patient_user_id === actor.userId ? 'patient' : 'doctor';
  const wallet = await verifiedWallet(sql, actor.userId, actor.email!);
  if (wallet.address !== a[`${role}_wallet`] || wallet.walletId !== a[`${role}_wallet_id`]) throw new BookingPreparationError('appointment_wallet_changed', 403);
  if (!a.booking) throw new BookingPreparationError('booking_not_found', 404);
  return { booking: a.booking, consentVerified: false, notice: 'La asistencia y la reserva no conceden consentimiento.' };
}
