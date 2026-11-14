import type { PoolClient } from '@neondatabase/serverless';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import type { Sql } from '@/lib/db';
import type { PrivateRxAppointmentScope } from '@/lib/digital-cabs-rx';
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';
import { loadHostedPrivateRxScope } from '../../scripts/lib/digital-cabs-rx-scope.mjs';
import {
  assertRegularAppointmentWeb, HOSTED_CAPTURE_ORIGIN, lockHostedCaptureShared, readHostedCaptureActive,
  type HostedCaptureSnapshot,
} from '../../scripts/lib/hosted-capture-store.mjs';

const hostedHost = new URL(HOSTED_CAPTURE_ORIGIN).host;

export function assertRegularAppointments() {
  assertPrivateEnvironment();
  try {
    assertRegularAppointmentWeb();
  } catch {
    throw new PrivateFlowError('regular_appointments_unavailable', 503);
  }
}

export function regularAppointmentsEnabled(request: Request) {
  if (process.env.TRUSTLEAF_REGULAR_APPOINTMENTS_ENABLED !== 'true' ||
      process.env.VERCEL_ENV !== 'production' || request.headers.get('host') !== hostedHost) return false;
  if (request.method !== 'GET' && request.headers.get('origin') !== HOSTED_CAPTURE_ORIGIN) {
    throw new PrivateFlowError('forbidden', 403);
  }
  assertRegularAppointments();
  return true;
}

export async function lockRegularAppointments(client: PoolClient) {
  assertRegularAppointments();
  await lockHostedCaptureShared(client);
}

type Booking = { doctorId: number; date: string; timeSlot: string; type?: string };
type AppointmentInput = { actor: AuthedUser; appointmentId: number } | { actor: AuthedUser; booking: Booking };
type Classification = { kind: 'regular' } | { kind: 'protected' } | { kind: 'scoped'; scope: PrivateRxAppointmentScope };

async function hostedAppointmentScope(sql: Sql) {
  const snapshot: HostedCaptureSnapshot | null = await readHostedCaptureActive({
    query: async (statement, values) => ({ rows: await sql.query(statement, values) }),
  });
  if (!snapshot || snapshot.expiresAt * 1000 <= Date.now() || snapshot.approvalSha256 !== snapshot.sha256) {
    return { snapshot: null, scope: null };
  }
  if (snapshot.phase !== 'appointment' || process.env.TRUSTLEAF_HOSTED_CAPTURE_ENABLED !== 'true') {
    return { snapshot, scope: null };
  }
  const scope = loadHostedPrivateRxScope(snapshot);
  if (scope.phase !== 'appointment') throw new PrivateFlowError('private_rx_scope_rejected', 403);
  return { snapshot, scope };
}

export async function canBookHostedAppointment(sql: Sql, actor: AuthedUser) {
  const { snapshot, scope } = await hostedAppointmentScope(sql);
  if (actor.userId === snapshot?.patient.userId) return scope !== null;
  return actor.userId !== snapshot?.doctor.userId;
}

/** Matches the approved manifest to an appointment aliased as `a`. */
export const hostedAppointmentManifestMatchesSql = `manifest.data->>'doctorId'=a.doctor_id::text
  AND manifest.data#>>'{slot,date}'=to_char(a.date,'YYYY-MM-DD')
  AND manifest.data#>>'{slot,timeSlot}'=a.time_slot
  AND manifest.data#>>'{slot,type}'=a.type
  AND manifest.data->'patient'=jsonb_build_object('userId',a.patient_user_id,'walletId',a.patient_wallet_id,'address',a.patient_wallet)
  AND manifest.data->'doctor'=jsonb_build_object('userId',a.doctor_user_id,'walletId',a.doctor_wallet_id,'address',a.doctor_wallet)`;

export async function classifyHostedAppointment(sql: Sql, input: AppointmentInput): Promise<Classification> {
  if ('appointmentId' in input) {
    const [protectedAppointment] = await sql.query<{ sha256: string }>(`
      SELECT m.sha256
      FROM appointments a
      JOIN hosted_capture_manifests m ON m.phase='appointment'
      JOIN hosted_capture_activations h ON h.sha256=m.sha256 AND h.phase='appointment'
      CROSS JOIN LATERAL (SELECT convert_from(m.bytes,'UTF8')::jsonb AS data) manifest
      WHERE a.id=$1 AND ((a.patient_user_id=$2 AND a.patient_email=$3) OR (a.doctor_user_id=$2 AND a.doctor_email=$3))
        AND ${hostedAppointmentManifestMatchesSql}
      ORDER BY h.id DESC LIMIT 1`, [input.appointmentId, input.actor.userId, input.actor.email]);
    if (!protectedAppointment) return { kind: 'regular' };
    const { scope } = await hostedAppointmentScope(sql);
    return scope?.policyHash === protectedAppointment.sha256 ? { kind: 'scoped', scope } : { kind: 'protected' };
  }

  const { snapshot, scope } = await hostedAppointmentScope(sql);
  if (!snapshot) return { kind: 'regular' };
  const { booking, actor } = input;
  if (actor.userId === snapshot.patient.userId || actor.userId === snapshot.doctor.userId) {
    if (scope && actor.userId === scope.patient.userId && booking.doctorId === scope.doctorId &&
        booking.date === scope.slot.date && booking.timeSlot === scope.slot.timeSlot &&
        (booking.type ?? 'Telemedicina') === scope.slot.type) return { kind: 'scoped', scope };
    return { kind: 'protected' };
  }
  if (scope && booking.doctorId === scope.doctorId && booking.date === scope.slot.date) {
    // Serialize the overlap check with weekly grid edits and reservations.
    await sql.query('SELECT id FROM doctors WHERE id=$1 FOR UPDATE', [booking.doctorId]);
    const [overlap] = await sql.query<{ reserved: boolean }>(`
      SELECT $3::time=$4::time OR EXISTS(
        SELECT 1 FROM doctor_availability av JOIN doctors d ON lower(d.email)=lower(av.doctor_email)
        WHERE d.id=$1 AND av.weekday=extract(dow FROM $2::date)
          AND $3::time>=av.start_time AND $3::time<av.end_time
          AND $2::date+$3::time<$2::date+$4::time+interval '30 minutes'
          AND $2::date+$3::time+make_interval(mins=>av.slot_minutes)>$2::date+$4::time
      ) AS reserved`, [booking.doctorId, booking.date, booking.timeSlot, scope.slot.timeSlot]);
    if (overlap?.reserved) return { kind: 'protected' };
  }
  return { kind: 'regular' };
}
