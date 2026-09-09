import type { ConsultationState, PrivateOperation, PrivatePrescription } from './types';

export function signingPayload(operation: PrivateOperation, expectedAddress: string, now = Date.now()) {
  if (operation.state !== 'awaiting_signature' || operation.address !== expectedAddress ||
      !/^G[A-Z2-7]{55}$/.test(expectedAddress) || !/^0x[a-f0-9]{64}$/i.test(operation.signingHash ?? '') ||
      !Number.isSafeInteger(operation.expiresAt) || (operation.expiresAt ?? 0) * 1000 <= now) {
    throw new Error('La operación no está lista para tu firma. Actualiza su estado.');
  }
  return { chainType: 'stellar' as const, address: expectedAddress, hash: operation.signingHash as `0x${string}` };
}
export function canAuthorizeIssuance(detail: ConsultationState, now = Date.now()) {
  return detail.appointment.status === 'in_progress' && !!(detail.appointment.attended_at ?? detail.appointment.attendance_at) &&
    !!detail.appointment.started_at && detail.booking?.state === 'confirmed' &&
    !detail.booking.cancellation_requested_at && Number(detail.booking.valid_until) * 1000 > now &&
    ['absent', 'expired'].includes(detail.consent.status) && detail.prescription?.rxId == null;
}
export function prescriptionLabel(prescription: PrivatePrescription) {
  if (prescription.rxId == null) return 'Emisión pendiente';
  if (prescription.status === 'Revoked') return 'Revocada';
  if (prescription.status === 'Blocked') return 'Bloqueada';
  if (prescription.expired) return 'Vencida';
  return prescription.status === 'Active' ? 'Activa' : 'Registrada · pendiente de activación';
}
export function rolePath(role: string | null) {
  return role === 'admin' ? '/admin/doctors' : role === 'doctor' ? '/doctor' : '/patient';
}
