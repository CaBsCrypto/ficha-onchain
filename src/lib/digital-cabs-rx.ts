import type { AuthedUser } from '@/lib/auth/privy-auth';
import { getDbConnection } from '@/lib/db';
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';
import type { PoolClient } from '@neondatabase/serverless';
import { loadPrivateRxScope, loadHostedPrivateRxScope, privateRxHostedContext, assertPrivateRxScopeOpen as assertOpen,
  privateRxScopeConfigured as localRxScopeConfigured,
  type PrivateRxAppointmentScope, type PrivateRxIssuanceScope, type PrivateRxRole, type PrivateRxScope,
  type PrivateRxStepKey, type PartnerPrivateRxScope, type PrivateRxOperationScope } from '../../scripts/lib/digital-cabs-rx-scope.mjs';
import { assertHostedCaptureWeb, hostedCaptureWebConfigured, lockHostedCaptureMutation, lockHostedCaptureRecovery,
  readHostedCaptureActive, readHostedCaptureByRequest } from '../../scripts/lib/hosted-capture-store.mjs';

export type { PrivateRxAppointmentScope, PrivateRxIssuanceScope, PrivateRxScope, PrivateRxRole, PrivateRxStepKey, PartnerPrivateRxScope, PrivateRxOperationScope };
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

export function privateRxScopeConfigured() {
  return hostedCaptureWebConfigured() || localRxScopeConfigured();
}

export function assertHostedPrivateRxStatusHost(request: Request) {
  if (!hostedCaptureWebConfigured()) return;
  const environment = scoped(() => assertHostedCaptureWeb());
  if (request.headers.get('host') !== new URL(environment.origin).host) throw denied();
}

export async function currentPrivateRxScope() {
  if (!hostedCaptureWebConfigured()) {
    if (!localRxScopeConfigured()) return null;
    return scoped(() => { assertPrivateEnvironment(); return loadPrivateRxScope(); });
  }
  assertPrivateEnvironment();
  scoped(() => assertHostedCaptureWeb());
  const client = await getDbConnection();
  try {
    const snapshot = await readHostedCaptureActive(client);
    if (!snapshot || !['appointment', 'issuance'].includes(snapshot.phase)) return null;
    return scoped(() => loadHostedPrivateRxScope(snapshot));
  } finally { client.release(); }
}

export async function historicalHostedPrivateRxScope(id: string) {
  if (!hostedCaptureWebConfigured()) return null;
  assertPrivateEnvironment();
  scoped(() => assertHostedCaptureWeb());
  const client = await getDbConnection();
  try {
    const snapshot = await readHostedCaptureByRequest(client, id);
    if (!snapshot || !['issuance', 'attest'].includes(snapshot.phase)) return null;
    const scope = scoped(() => loadHostedPrivateRxScope(snapshot, { historical: true }));
    return scope.phase === 'issuance' && [scope.steps.consent.requestId, scope.steps.mint.requestId].includes(id) ? scope : null;
  } finally { client.release(); }
}

export async function lockHostedPrivateRxMutation(client: PoolClient, scope: PrivateRxScope | PartnerPrivateRxScope) {
  const context = privateRxHostedContext(scope);
  if (!context) return;
  if (context.phase === 'attest' || context.historical) throw denied();
  try {
    const snapshot = await lockHostedCaptureMutation(client, context.phase, scope.policyHash);
    if (context.phase === 'appointment') {
      const { verifyHostedClinicalBaseline } = await import('@/lib/hosted-capture-proof');
      await verifyHostedClinicalBaseline(client, snapshot, 'appointment');
    }
  } catch (error) {
    if (error instanceof PrivateFlowError) throw error;
    throw denied();
  }
  assertPrivateRxScopeOpen(scope);
}

export async function lockHostedPrivateRxRecovery(client: PoolClient, scope: PrivateRxIssuanceScope, requestId: string) {
  const context = privateRxHostedContext(scope);
  if (context?.phase !== 'issuance' || !context.historical) throw denied();
  try { await lockHostedCaptureRecovery(client, requestId, scope.policyHash); }
  catch { throw denied(); }
}

export function assertPrivateRxScopeOpen<T extends PrivateRxScope | PartnerPrivateRxScope>(scope: T, step?: PrivateRxStepKey): T {
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

/** Scoped writes accept the exact hosted Origin or the existing local loopback. */
export function assertPrivateRxOrigin(request: Request, scope: PrivateRxScope) {
  let origin: URL;
  try { origin = new URL(request.headers.get('origin') ?? ''); } catch { throw denied(); }
  const hosted = privateRxHostedContext(scope);
  if (hosted) {
    if (request.headers.get('origin') !== hosted.origin ||
        origin.host !== request.headers.get('host')) throw denied();
    return;
  }
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
      origin.host !== request.headers.get('host')) throw denied();
}

export function privateRxSlotHost(request: Request, scope: PrivateRxScope) {
  const host = request.headers.get('host') ?? '';
  const hosted = privateRxHostedContext(scope);
  if (hosted) return host === new URL(hosted.origin).host;
  return /^(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?$/.test(host);
}

export function privateRxRole(scope: PrivateRxScope | PartnerPrivateRxScope, user: AuthedUser): PrivateRxRole {
  if (!user.email) throw denied();
  if (scope.patient.userId === user.userId) return 'patient';
  if (scope.doctor.userId === user.userId) return 'doctor';
  throw denied();
}

export function assertPrivateRxActor(scope: PrivateRxScope | PartnerPrivateRxScope, user: AuthedUser, wallet: Wallet | undefined, role: PrivateRxRole) {
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
export function assertPrivateRxContext(scope: PrivateRxScope | PartnerPrivateRxScope, appointment: Row, booking?: Row | null, prescription?: Row | null) {
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

export function assertPrivateRxOperationIntent(scope: PrivateRxOperationScope, user: AuthedUser, action: string,
  resource: { appointmentId?: number; prescriptionId?: string }) {
  if (action === 'consent' && resource.appointmentId === scope.appointmentId && resource.prescriptionId === undefined) {
    assertPrivateRxScopeOpen(scope, 'consent'); assertPrivateRxActor(scope, user, undefined, 'patient'); return;
  }
  if (action === 'mint' && resource.prescriptionId === scope.prescriptionId && resource.appointmentId === undefined) {
    assertPrivateRxScopeOpen(scope, 'mint'); assertPrivateRxActor(scope, user, undefined, 'doctor'); return;
  }
  throw denied();
}

export function assertPrivateRxConfirmationIntent(scope: PrivateRxOperationScope, user: AuthedUser, id: string) {
  const step = id === scope.steps.consent.requestId ? 'consent' : id === scope.steps.mint.requestId ? 'mint' : null;
  if (!step) throw denied();
  assertPrivateRxScopeOpen(scope, step);
  assertPrivateRxActor(scope, user, undefined, step === 'consent' ? 'patient' : 'doctor');
  return step;
}
