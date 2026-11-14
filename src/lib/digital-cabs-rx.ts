import type { AuthedUser } from '@/lib/auth/privy-auth';
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';
import { loadPrivateRxScope, assertPrivateRxScopeOpen as assertOpen, privateRxScopeConfigured,
  type PrivateRxAppointmentScope, type PrivateRxIssuanceScope, type PrivateRxRole, type PrivateRxScope,
  type PrivateRxStepKey } from '../../scripts/lib/digital-cabs-rx-scope.mjs';

export { privateRxScopeConfigured };
export type { PrivateRxAppointmentScope, PrivateRxIssuanceScope, PrivateRxScope, PrivateRxRole, PrivateRxStepKey };
const denied = () => new PrivateFlowError('private_rx_scope_rejected', 403);
type Wallet = { walletId: string; address: string };
type Row = Record<string, unknown>;

function scoped<T>(work: () => T): T {
  try { return work(); }
  catch (error) {
    if (error instanceof PrivateFlowError) throw error;
    if (error instanceof Error && error.message === 'private_rx_scope_expired') throw new PrivateFlowError('private_rx_scope_expired', 409);
    throw denied();
  }
}

export function currentPrivateRxScope() {
  if (!privateRxScopeConfigured()) return null;
  return scoped(() => { assertPrivateEnvironment(); return loadPrivateRxScope(); });
}

export function assertPrivateRxScopeOpen<T extends PrivateRxScope>(scope: T, step?: PrivateRxStepKey): T {
  return scoped(() => { assertPrivateEnvironment(); return assertOpen(scope, { step }) as T; });
}

export function privateRxAppointmentScope(scope: PrivateRxScope | null): PrivateRxAppointmentScope | undefined {
  if (!scope) return undefined;
  if (scope.phase !== 'appointment') throw denied();
  return assertPrivateRxScopeOpen(scope);
}

export function privateRxIssuanceScope(scope: PrivateRxScope | null): PrivateRxIssuanceScope | undefined {
  if (!scope) return undefined;
  if (scope.phase !== 'issuance') throw denied();
  return assertPrivateRxScopeOpen(scope);
}

/** An active capture mutation is reachable only from the local browser. */
export function assertPrivateRxLoopback(request: Request) {
  let origin: URL;
  try { origin = new URL(request.headers.get('origin') ?? ''); } catch { throw denied(); }
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
      origin.host !== request.headers.get('host')) throw denied();
}

export function privateRxRole(scope: PrivateRxScope, user: AuthedUser): PrivateRxRole {
  if (!user.email) throw denied();
  if (scope.patient.userId === user.userId) return 'patient';
  if (scope.doctor.userId === user.userId) return 'doctor';
  throw denied();
}

export function assertPrivateRxActor(scope: PrivateRxScope, user: AuthedUser, wallet: Wallet | undefined, role: PrivateRxRole) {
  if (privateRxRole(scope, user) !== role || (wallet && (wallet.walletId !== scope[role].walletId || wallet.address !== scope[role].address))) throw denied();
}

export function assertPrivateRxCreate(scope: PrivateRxAppointmentScope, user: AuthedUser,
  input: { doctorId: number; date: string; timeSlot: string; type?: string }) {
  assertPrivateRxScopeOpen(scope);
  assertPrivateRxActor(scope, user, undefined, 'patient');
  if (input.doctorId !== scope.doctorId || input.date !== scope.slot.date || input.timeSlot !== scope.slot.timeSlot ||
      (input.type ?? 'Telemedicina') !== scope.slot.type) throw denied();
}

function appointmentDate(value: unknown) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : value;
}

/** Validate the exact protected row inside the existing resource lock. */
export function assertPrivateRxContext(scope: PrivateRxScope, appointment: Row, booking?: Row | null, prescription?: Row | null) {
  if (!appointment || Number(appointment.doctor_id) !== scope.doctorId ||
      appointmentDate(appointment.date) !== scope.slot.date || appointment.time_slot !== scope.slot.timeSlot || appointment.type !== scope.slot.type ||
      appointment.patient_user_id !== scope.patient.userId || appointment.patient_wallet_id !== scope.patient.walletId || appointment.patient_wallet !== scope.patient.address ||
      appointment.doctor_user_id !== scope.doctor.userId || appointment.doctor_wallet_id !== scope.doctor.walletId || appointment.doctor_wallet !== scope.doctor.address) throw denied();
  if (scope.phase === 'appointment') return;
  if (Number(appointment.id) !== scope.appointmentId || !booking || Number(booking.appointment_id) !== scope.appointmentId ||
      booking.contract_id !== scope.contractId || booking.network !== scope.network || booking.issuance_id !== scope.issuanceId ||
      Number(booking.valid_until) !== scope.bookingValidUntil || booking.patient_requested_by !== scope.patient.userId ||
      booking.patient_wallet_id !== scope.patient.walletId || booking.patient_wallet !== scope.patient.address ||
      booking.doctor_user_id !== scope.doctor.userId || booking.doctor_wallet_id !== scope.doctor.walletId || booking.doctor_wallet !== scope.doctor.address) throw denied();
  if (prescription && (prescription.id !== scope.prescriptionId || Number(prescription.appointment_id) !== scope.appointmentId ||
      prescription.contract_id !== scope.contractId || prescription.network !== scope.network || prescription.issuance_id !== scope.issuanceId ||
      prescription.patient_wallet !== scope.patient.address || prescription.doctor_wallet !== scope.doctor.address)) throw denied();
}

export function assertPrivateRxDocument(scope: PrivateRxIssuanceScope, document: unknown) {
  if (!document || typeof document !== 'object' || Array.isArray(document) || Object.keys(document).length !== 3 ||
      !(['medication', 'dosage', 'instructions'] as const).every(key => Object.hasOwn(document, key) && (document as Row)[key] === scope.document[key])) throw denied();
}

export function assertPrivateRxOperationIntent(scope: PrivateRxIssuanceScope, user: AuthedUser, action: string,
  resource: { appointmentId?: number; prescriptionId?: string }) {
  if (action === 'consent' && resource.appointmentId === scope.appointmentId && resource.prescriptionId === undefined) {
    assertPrivateRxScopeOpen(scope, 'consent'); assertPrivateRxActor(scope, user, undefined, 'patient'); return;
  }
  if (action === 'mint' && resource.prescriptionId === scope.prescriptionId && resource.appointmentId === undefined) {
    assertPrivateRxScopeOpen(scope, 'mint'); assertPrivateRxActor(scope, user, undefined, 'doctor'); return;
  }
  throw denied();
}

export function assertPrivateRxConfirmationIntent(scope: PrivateRxIssuanceScope, user: AuthedUser, id: string) {
  const step = id === scope.steps.consent.requestId ? 'consent' : id === scope.steps.mint.requestId ? 'mint' : null;
  if (!step) throw denied();
  assertPrivateRxScopeOpen(scope, step);
  assertPrivateRxActor(scope, user, undefined, step === 'consent' ? 'patient' : 'doctor');
  return step;
}
