import { isApprovedDoctor } from '@/lib/doctor-access';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { getDbConnection, sqlForConnection, type Sql } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { verifiedWallet, resolveDoctor, readPrivateDoctor } from '@/lib/doctor-authorizations';
import { assertPrivateEnvironment, assertPrivateWrites, PRIVY_APP, RX_PRIVATE } from '@/lib/private-config';
import { assertPrivateRxActor, assertPrivateRxContext, assertPrivateRxCreate, assertPrivateRxScopeOpen, lockHostedPrivateRxMutation, privateRxRole,
  type PrivateRxAppointmentScope } from '@/lib/digital-cabs-rx';
import { assertRegularAppointments, classifyHostedAppointment, hostedAppointmentManifestMatchesSql, lockRegularAppointments } from '@/lib/regular-appointments';
import { privateRxHostedContext } from '../../scripts/lib/digital-cabs-rx-scope.mjs';

export class BookingPreparationError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

type AppointmentMutationPolicy = PrivateRxAppointmentScope | 'regular';
export type AppointmentInput = { doctorId: number; date: string; timeSlot: string; type?: string };

function assertAppointmentMutation(policy?: AppointmentMutationPolicy) {
  if (policy === 'regular') assertRegularAppointments();
  else if (policy) assertPrivateRxScopeOpen(policy);
  else assertPrivateWrites();
}

/** Keep role checks, appointment updates and any authorized queue insertion in one transaction. */
export async function bookingTransaction<T>(run: (sql: Sql, client: PoolClient) => Promise<T>, policy?: AppointmentMutationPolicy): Promise<T> {
  assertAppointmentMutation(policy);
  const client = await getDbConnection();
  try {
    await client.query('BEGIN');
    if (policy === 'regular') await lockRegularAppointments(client);
    else if (policy) await lockHostedPrivateRxMutation(client, policy);
    const result = await run(sqlForConnection(client), client);
    assertAppointmentMutation(policy);
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

const bookedClockSql = `CASE WHEN a.time_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN a.time_slot::time END`;
/** The caller's SQL must alias the appointment row as `a`. */
export const appointmentCheckInOpenSql = `a.date=(NOW() AT TIME ZONE 'America/Santiago')::date
  AND a.date+(${bookedClockSql})<=(NOW() AT TIME ZONE 'America/Santiago')+INTERVAL '30 minutes'`;
export const appointmentAttendanceConfirmedSql = `a.attendance_at IS NOT NULL AND a.attendance_at<=NOW()
  AND a.attendance_user_id=a.patient_user_id`;

function bookedDurationSql(clock: string, protectHosted: boolean, unknownDuration: 30 | 240) {
  const gridDuration = `COALESCE((SELECT MAX(grid.slot_minutes) FROM doctor_availability grid
    WHERE LOWER(grid.doctor_email)=LOWER(a.doctor_email) AND grid.weekday=EXTRACT(DOW FROM a.date) AND grid.slot_minutes BETWEEN 5 AND 240
      AND (${clock})>=grid.start_time
      AND a.date+(${clock})+make_interval(mins=>grid.slot_minutes)<=a.date+grid.end_time
      AND MOD(EXTRACT(EPOCH FROM (${clock})-grid.start_time)::integer,NULLIF(grid.slot_minutes*60,0))=0),${unknownDuration})`;
  return protectHosted ? `CASE WHEN EXISTS (
      SELECT 1 FROM hosted_capture_manifests m
      JOIN hosted_capture_activations h ON h.sha256=m.sha256 AND h.phase='appointment'
      CROSS JOIN LATERAL (SELECT convert_from(m.bytes,'UTF8')::jsonb AS data) manifest
      WHERE m.phase='appointment' AND (${hostedAppointmentManifestMatchesSql})
    ) THEN 30 ELSE ${gridDuration} END` : gridDuration;
}

/** The caller owns the doctor row lock and has not replaced the weekly grid yet. */
export async function retainBookedAppointmentDurations(sql: Sql, doctorEmail: string) {
  await sql.query(`UPDATE appointments a SET booked_slot_minutes=${bookedDurationSql(bookedClockSql, true, 240)}
    WHERE LOWER(a.doctor_email)=$1 AND a.booked_slot_minutes IS NULL AND a.status<>'cancelled'
      AND a.date>=(NOW() AT TIME ZONE 'America/Santiago')::date`, [doctorEmail]);
}

/** PostgreSQL supplies the clock and Santiago timezone, independent of the host. */
export async function availableAppointmentSlots(sql: Sql, doctorEmail: string, date: string, nextAvailable = false,
  options?: { protectHosted?: boolean; includeDuration?: boolean }) {
  if (!validBookingDate(date)) throw new BookingPreparationError('invalid_date', 400);
  const fallbackDuration = bookedDurationSql('booked.clock_time', options?.protectHosted === true, options?.protectHosted ? 240 : 30);
  const bookedDuration = options?.protectHosted ? `COALESCE(a.booked_slot_minutes,${fallbackDuration})` : fallbackDuration;
  const slots = await sql.query(`WITH free AS (SELECT DISTINCT day::date AS date, TO_CHAR(slot,'HH24:MI') AS time,av.slot_minutes,true AS available
    FROM generate_series(CASE WHEN $3::boolean THEN GREATEST($2::date,(NOW() AT TIME ZONE 'America/Santiago')::date) ELSE $2::date END,CASE WHEN $3::boolean THEN (NOW() AT TIME ZONE 'America/Santiago')::date+90 ELSE $2::date END,INTERVAL '1 day') day
    JOIN doctor_availability av ON av.weekday=EXTRACT(DOW FROM day)
    CROSS JOIN LATERAL generate_series(
      day::date+av.start_time,day::date+av.end_time-make_interval(mins=>av.slot_minutes),
      make_interval(mins=>av.slot_minutes)) slot
    WHERE LOWER(av.doctor_email)=$1
      AND slot>=(NOW() AT TIME ZONE 'America/Santiago') AND day::date<=(NOW() AT TIME ZONE 'America/Santiago')::date+90
      AND NOT EXISTS(SELECT 1 FROM doctor_time_off off WHERE LOWER(off.doctor_email)=$1 AND off.date=day::date)
      AND NOT EXISTS(SELECT 1 FROM appointments a
        CROSS JOIN LATERAL (SELECT ${bookedClockSql} AS clock_time) booked
        WHERE LOWER(a.doctor_email)=$1 AND a.date BETWEEN day::date-1 AND day::date AND a.status<>'cancelled'
          AND ((booked.clock_time IS NULL AND a.date=day::date) OR (a.date+booked.clock_time<slot+make_interval(mins=>av.slot_minutes)
            AND a.date+booked.clock_time+make_interval(mins=>${bookedDuration})>slot))))
    SELECT TO_CHAR(date,'YYYY-MM-DD') AS date,time,slot_minutes,true AS available FROM free
    WHERE date=(SELECT MIN(date) FROM free) ORDER BY time`, [doctorEmail, date, nextAvailable]);
  const resultSlots = slots.map(s => ({ time: s.time, available: true, ...(options?.includeDuration ? { slotMinutes: Number(s.slot_minutes) } : {}) }));
  if (nextAvailable) {
    const [limit] = await sql.query(`SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Santiago')::date+90,'YYYY-MM-DD') AS search_until`);
    return { date: slots[0]?.date ?? null, search_until: limit.search_until,
      slots: resultSlots, time_off: null };
  }
  return { date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), slot_minutes: slots[0]?.slot_minutes ?? null,
    slots: resultSlots, time_off: null };
}

/** A scoped extra half hour is derived, never persisted in the weekly grid.
 * Call under the doctor row lock when using it as a reservation prerequisite. */
export async function privateRxOneTimeSlotAvailable(sql: Sql, scope: PrivateRxAppointmentScope, doctorEmail: string) {
  if (scope.phase !== 'appointment' || scope.slot.oneTime !== true) return false;
  assertPrivateRxScopeOpen(scope);
  const hosted = !!privateRxHostedContext(scope);
  const fallbackDuration = bookedDurationSql('booked.clock_time', hosted, 240);
  const duration = hosted ? `COALESCE(a.booked_slot_minutes,${fallbackDuration})` : fallbackDuration;
  const rows = await sql.query<{ available: boolean }>(`WITH wanted AS (
    SELECT $2::date + $3::time AS starts, $2::date + $3::time + INTERVAL '30 minutes' AS ends
  ), occupied AS (
    SELECT a.date+booked.clock_time AS starts, ${duration} AS minutes FROM appointments a
    CROSS JOIN LATERAL (SELECT ${bookedClockSql} AS clock_time) booked
    WHERE LOWER(a.doctor_email)=$1 AND a.status IS DISTINCT FROM 'cancelled'
      AND (a.date=$2::date OR (a.date=$2::date-1 AND $3::time<'04:00'::time))
  ) SELECT ($2::date=(NOW() AT TIME ZONE 'America/Santiago')::date
    AND w.starts>=(NOW() AT TIME ZONE 'America/Santiago')
    AND NOT EXISTS (SELECT 1 FROM doctor_time_off o WHERE LOWER(o.doctor_email)=$1 AND o.date=$2::date)
    AND NOT EXISTS (SELECT 1 FROM occupied o WHERE o.starts IS NULL OR
      (o.starts<w.ends AND o.starts+make_interval(mins=>o.minutes)>w.starts))) AS available FROM wanted w`,
    [doctorEmail.toLowerCase(), scope.slot.date, scope.slot.timeSlot]);
  assertPrivateRxScopeOpen(scope);
  return rows.length === 1 && rows[0].available === true;
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

export async function listPrivateAppointments(sql: Sql, actor: AuthedUser, role: 'doctor' | 'patient', options?: { existingOnly?: boolean }) {
  assertPrivateEnvironment();
  if (!actor.email) throw new BookingPreparationError('verified_email_required', 403);
  const wallet = options?.existingOnly ? await verifiedWallet(sql, actor.userId, actor.email, options)
    : await verifiedWallet(sql, actor.userId, actor.email);
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

export async function createPrivateAppointment(sql: Sql, actor: AuthedUser, input: AppointmentInput, policy?: AppointmentMutationPolicy) {
  const regular = policy === 'regular';
  const scope = regular ? undefined : policy;
  if (scope) assertPrivateRxCreate(scope, actor, input); else assertAppointmentMutation(policy);
  if (!actor.email) throw new BookingPreparationError('verified_email_required', 403);
  if (!validBookingDate(input.date) || !validBookingTime(input.timeSlot) || !Number.isSafeInteger(input.doctorId) || input.doctorId < 1)
    throw new BookingPreparationError('invalid_appointment', 400);
  const type = input.type ?? 'Telemedicina';
  if (!['Telemedicina','Presencial'].includes(type)) throw new BookingPreparationError('invalid_appointment_type', 400);
  const doctor = regular ? await resolveDoctor(sql, input.doctorId, { existingOnly: true }) : await resolveDoctor(sql, input.doctorId);
  if (doctor.userId === actor.userId) throw new BookingPreparationError('distinct_participants_required', 403);
  const patient = regular ? await verifiedWallet(sql, actor.userId, actor.email, { existingOnly: true })
    : await verifiedWallet(sql, actor.userId, actor.email);
  if (scope) {
    assertPrivateRxActor(scope, actor, patient, 'patient');
    assertPrivateRxActor(scope, { userId: doctor.userId, email: String(doctor.doctor.email) }, doctor, 'doctor');
  }
  if (!(await isApprovedDoctor(sql,Number(doctor.doctor.id),{...doctor,email:String(doctor.doctor.email)}))) throw new BookingPreparationError('doctor_not_authorized', 403);
  // Availability updates lock this same doctor row; slot selection cannot race a grid replacement.
  const [locked] = await sql`SELECT id FROM doctors WHERE id=${input.doctorId} AND LOWER(email)=${doctor.doctor.email} FOR UPDATE`;
  if (!locked) throw new BookingPreparationError('doctor_identity_changed', 409);
  if (scope) {
    // Lock the existing doctor/slot before checking idempotency, including terminal rows.
    const existing = await sql.query(`SELECT a.*,TO_CHAR(a.date,'YYYY-MM-DD') AS date FROM appointments a
      WHERE a.doctor_id=$1 AND a.date=$2::date AND a.time_slot=$3 ORDER BY a.id LIMIT 2 FOR UPDATE`, [scope.doctorId, scope.slot.date, scope.slot.timeSlot]);
    if (existing.length > 1) throw new BookingPreparationError('private_rx_scope_rejected', 403);
    if (existing.length) {
      assertPrivateRxContext(scope, existing[0]);
      if (!['scheduled','in_progress'].includes(existing[0].status)) throw new BookingPreparationError('private_rx_scope_rejected', 403);
      return { appointment: publicAppointment(await ownedAppointment(sql, actor, Number(existing[0].id))) };
    }
  }
  if (regular) {
    const existing = await sql.query(`SELECT a.*,b.appointment_id IS NOT NULL AS has_rx_booking FROM appointments a
      LEFT JOIN prescription_booking_requests b ON b.appointment_id=a.id
      WHERE a.doctor_id=$1 AND a.date=$2::date AND a.time_slot=$3 AND a.status<>'cancelled'
      ORDER BY a.id LIMIT 2 FOR UPDATE OF a`, [input.doctorId, input.date, input.timeSlot]);
    if (existing.length > 0) {
      const [appointment] = existing;
      if (existing.length !== 1 || !['scheduled', 'in_progress'].includes(appointment.status) || appointment.type !== type ||
        appointment.has_rx_booking !== false || appointment.patient_user_id !== actor.userId || appointment.patient_email !== actor.email ||
        appointment.patient_wallet_id !== patient.walletId || appointment.patient_wallet !== patient.address ||
        appointment.doctor_user_id !== doctor.userId || appointment.doctor_email !== doctor.doctor.email ||
        appointment.doctor_wallet_id !== doctor.walletId || appointment.doctor_wallet !== doctor.address) {
        throw new BookingPreparationError('slot_not_available');
      }
      const classification = await classifyHostedAppointment(sql, { actor, appointmentId: Number(appointment.id) });
      if (classification.kind !== 'regular') throw new BookingPreparationError('private_rx_scope_rejected', 403);
      return { appointment: publicAppointment(await ownedAppointment(sql, actor, Number(appointment.id))) };
    }
  }
  const doctorEmail = String(doctor.doctor.email);
  const persistDuration = regular || !!(scope && privateRxHostedContext(scope));
  let slotMinutes: number | undefined;
  if (scope?.slot.oneTime === true) {
    if (!await privateRxOneTimeSlotAvailable(sql, scope, doctorEmail)) throw new BookingPreparationError('slot_not_available');
    slotMinutes = 30;
  } else {
    const { slots } = await availableAppointmentSlots(sql, doctorEmail, input.date, false,
      persistDuration ? { protectHosted: true, includeDuration: true } : undefined);
    const selected = slots.find(slot => slot.time === input.timeSlot);
    if (!selected) throw new BookingPreparationError('slot_not_available');
    slotMinutes = selected.slotMinutes;
  }
  if (persistDuration && (slotMinutes == null || !Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 240)) {
    throw new BookingPreparationError('slot_not_available');
  }
  if (scope) assertPrivateRxScopeOpen(scope);
  const [inserted] = persistDuration
    ? await sql`INSERT INTO appointments(doctor_id,doctor_email,doctor_user_id,doctor_wallet_id,doctor_wallet,
        patient_email,patient_user_id,patient_wallet_id,patient_wallet,patient_name,date,time_slot,type,status,booked_slot_minutes)
      VALUES(${input.doctorId},${doctor.doctor.email},${doctor.userId},${doctor.walletId},${doctor.address},
        ${actor.email},${actor.userId},${patient.walletId},${patient.address},${regular ? '' : 'Paciente de prueba TrustLeaf'},
        ${input.date},${input.timeSlot},${type},'scheduled',${slotMinutes}) RETURNING id`
    : await sql`INSERT INTO appointments(doctor_id,doctor_email,doctor_user_id,doctor_wallet_id,doctor_wallet,
        patient_email,patient_user_id,patient_wallet_id,patient_wallet,patient_name,date,time_slot,type,status)
      VALUES(${input.doctorId},${doctor.doctor.email},${doctor.userId},${doctor.walletId},${doctor.address},
        ${actor.email},${actor.userId},${patient.walletId},${patient.address},'Paciente de prueba TrustLeaf',
        ${input.date},${input.timeSlot},${type},'scheduled') RETURNING id`;
  if (!inserted) throw new BookingPreparationError('appointment_not_created', 503);
  return { appointment: publicAppointment(await ownedAppointment(sql, actor, Number(inserted.id))) };
}

/** Caller holds the appointment lock. Attendance establishes identity only, never consent. */
export async function preparePrescriptionBooking(sql: Sql, actor: AuthedUser, appointmentId: number, scope?: PrivateRxAppointmentScope) {
  if (scope) { assertPrivateRxScopeOpen(scope); privateRxRole(scope, actor); } else assertPrivateWrites();
  const a = await ownedAppointment(sql, actor, appointmentId, true);
  if (scope) assertPrivateRxContext(scope, a);
  if (a.status !== 'in_progress' || !a.attendance_at || a.attendance_user_id !== a.patient_user_id || a.started_by !== a.doctor_user_id)
    throw new BookingPreparationError('booking_not_eligible');
  const patient = await verifiedWallet(sql, a.patient_user_id, a.patient_email);
  const doctor = await verifiedWallet(sql, a.doctor_user_id, a.doctor_email);
  if (patient.walletId !== a.patient_wallet_id || patient.address !== a.patient_wallet || doctor.walletId !== a.doctor_wallet_id || doctor.address !== a.doctor_wallet)
    throw new BookingPreparationError('appointment_wallet_changed', 403);
  if (!(await isApprovedDoctor(sql,Number(a.doctor_id),{...doctor,userId:a.doctor_user_id,email:a.doctor_email}))) throw new BookingPreparationError('doctor_not_authorized', 403);
  if (scope) {
    const role = privateRxRole(scope, actor);
    assertPrivateRxActor(scope, actor, role === 'patient' ? patient : doctor, role);
    assertPrivateRxScopeOpen(scope);
  }
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

export type AppointmentAction = 'attend' | 'start' | 'complete' | 'cancel';

export async function changePrivateAppointment(sql: Sql, actor: AuthedUser, id: number, action: AppointmentAction, policy?: AppointmentMutationPolicy) {
  const regular = policy === 'regular';
  const scope = regular ? undefined : policy;
  if (scope) {
    assertPrivateRxScopeOpen(scope);
    if (action !== 'attend' && action !== 'start') throw new BookingPreparationError('private_rx_scope_rejected', 403);
    assertPrivateRxActor(scope, actor, undefined, action === 'attend' ? 'patient' : 'doctor');
  } else assertAppointmentMutation(policy);
  if (!regular && action === 'cancel') return requestBookingCancellation(sql, actor, id);
  const a = await ownedAppointment(sql, actor, id, true);
  if (scope) assertPrivateRxContext(scope, a);
  const role = action === 'attend' || action === 'cancel' ? 'patient' : 'doctor';
  if (a[`${role}_user_id`] !== actor.userId || a[`${role}_email`] !== actor.email) throw new BookingPreparationError('wrong_consultation_role', 403);
  const wallet = regular ? await verifiedWallet(sql, actor.userId, actor.email!, { existingOnly: true })
    : await verifiedWallet(sql, actor.userId, actor.email!);
  if (wallet.walletId !== a[`${role}_wallet_id`] || wallet.address !== a[`${role}_wallet`]) throw new BookingPreparationError('appointment_wallet_changed', 403);
  if (scope) assertPrivateRxActor(scope, actor, wallet, role);
  if (role === 'doctor' && !(await isApprovedDoctor(sql,Number(a.doctor_id),{...wallet,userId:actor.userId,email:actor.email!}))) throw new BookingPreparationError('doctor_not_authorized', 403);
  if (regular && a.booking) throw new BookingPreparationError('appointment_has_prescription_booking');
  if (regular && action === 'cancel') {
    if (a.started_at || a.started_by || !['scheduled', 'cancelled'].includes(a.status)) throw new BookingPreparationError('consultation_not_open');
    if (a.status === 'scheduled') {
      const [cancelled] = await sql`UPDATE appointments SET status='cancelled'
        WHERE id=${id} AND status='scheduled' AND started_at IS NULL AND started_by IS NULL RETURNING id`;
      if (!cancelled) throw new BookingPreparationError('consultation_not_open');
    }
    return { appointment: publicAppointment({ ...a, status: 'cancelled' }), state: 'cancelled', onchainRevoked: false, bookingPending: false };
  }
  if (regular && action === 'complete') {
    if (a.status === 'completed' && a.completed_at && a.started_by === actor.userId) {
      return { appointment: publicAppointment(a), bookingPending: false };
    }
    const [completed] = await sql`UPDATE appointments SET status='completed',completed_at=NOW()
      WHERE id=${id} AND status='in_progress' AND started_by=${actor.userId} AND started_at<=NOW() RETURNING *`;
    if (!completed) throw new BookingPreparationError('consultation_not_open');
    return { appointment: publicAppointment({ ...a, status: 'completed', completed_at: completed.completed_at }), bookingPending: false };
  }
  if (['cancelled','cancel_requested','completed'].includes(a.status)) throw new BookingPreparationError('consultation_not_open');
  if (action === 'complete') {
    const [b] = await sql`SELECT state FROM prescription_booking_requests WHERE appointment_id=${id} FOR UPDATE`;
    if (!b || b.state !== 'consumed') throw new BookingPreparationError('complete_requires_issued_prescription');
    const [completed] = await sql`UPDATE appointments SET status='completed',completed_at=NOW() WHERE id=${id} AND status='in_progress' RETURNING id`;
    if (!completed) throw new BookingPreparationError('consultation_not_open');
  } else {
    if (scope) assertPrivateRxScopeOpen(scope);
    if (action === 'start' && (!a.attendance_at || a.attendance_user_id !== a.patient_user_id)) {
      throw new BookingPreparationError('consultation_attendance_required');
    }
    const [updated] = action === 'attend'
      ? await sql.query(`UPDATE appointments a SET attendance_at=COALESCE(a.attendance_at,NOW()),attendance_user_id=$2
          WHERE a.id=$1 AND a.status IN ('scheduled','in_progress') AND ${appointmentCheckInOpenSql}
            AND (a.attendance_at IS NULL OR (${appointmentAttendanceConfirmedSql})) RETURNING a.*`, [id, actor.userId])
      : await sql.query(`UPDATE appointments a SET status='in_progress',started_at=COALESCE(a.started_at,NOW()),started_by=$2
          WHERE a.id=$1 AND a.status IN ('scheduled','in_progress') AND ${appointmentCheckInOpenSql}
            AND (${appointmentAttendanceConfirmedSql}) AND (a.started_at IS NULL OR (a.started_by=$2 AND a.started_at<=NOW()))
          RETURNING a.*`, [id, actor.userId]);
    if (!updated) throw new BookingPreparationError('consultation_outside_checkin_window');
    if (!regular && updated.attendance_at && updated.started_at) await preparePrescriptionBooking(sql, actor, id, scope);
  }
  const result = await ownedAppointment(sql, actor, id);
  return { appointment: publicAppointment(result), bookingPending: !regular && result.booking?.state === 'prepared' };
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
