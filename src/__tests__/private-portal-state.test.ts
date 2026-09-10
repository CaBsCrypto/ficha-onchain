import { describe, expect, it } from 'vitest';
import { canAuthorizeIssuance, prescriptionLabel, rolePath, signingPayload } from '@/components/private-portal/state';
import type { ConsultationState, PrivateOperation, PrivatePrescription } from '@/components/private-portal/types';

const now = 1_800_000_000_000;
const address = `G${'A'.repeat(55)}`;
const operation: PrivateOperation = { id: 'operation', action: 'consent', state: 'awaiting_signature', signingHash: `0x${'ab'.repeat(32)}`, address, expiresAt: now / 1000 + 60 };
const detail: ConsultationState = {
  appointment: { id: 1, doctor_email: 'doctor@example.test', patient_email: 'patient@example.test', patient_name: 'Paciente sintético', date: '2027-01-15', time_slot: '10:00', type: 'Presencial', status: 'in_progress', attendance_at: '2027-01-15T13:00:00Z', started_at: '2027-01-15T13:01:00Z' },
  booking: { state: 'confirmed', issuance_id: 'issuance', valid_until: now / 1000 + 600 },
  consent: { status: 'absent', validUntil: null }, operations: [],
};
const prescription: PrivatePrescription = { id: 'private-id', rxId: null, appointmentId: 1, status: 'Pending', expired: false, doctorName: 'Médico sintético', patientName: 'Paciente sintético', expiresAt: now / 1000 + 600, transactionHash: null };

describe('Stellar owner signing UI boundary', () => {
  it('uses only the prepared hash for the verified owner', () => {
    expect(signingPayload(operation, address, now)).toEqual({ chainType: 'stellar', address, hash: operation.signingHash });
  });
  it('refuses another user wallet', () => expect(() => signingPayload(operation, `G${'B'.repeat(55)}`, now)).toThrow());
  it('refuses a substituted or malformed hash', () => expect(() => signingPayload({ ...operation, signingHash: 'arbitrary' }, address, now)).toThrow());
  it('refuses a request at its expiration boundary', () => expect(() => signingPayload({ ...operation, expiresAt: now / 1000 }, address, now)).toThrow());
  it.each(['submitted', 'confirmed', 'failed', 'cancelled'] as const)('never signs a %s operation again', state => {
    expect(() => signingPayload({ ...operation, state }, address, now)).toThrow();
  });
});
describe('Separate attendance and one-use consent', () => {
  it('allows consent only after attendance, doctor start and receipt', () => expect(canAuthorizeIssuance(detail, now)).toBe(true));
  it('attendance alone grants no consent', () => expect(canAuthorizeIssuance({ ...detail, appointment: { ...detail.appointment, status: 'scheduled', started_at: null }, booking: null }, now)).toBe(false));
  it('doctor start without patient attendance grants no consent', () => expect(canAuthorizeIssuance({ ...detail, appointment: { ...detail.appointment, attendance_at: null } }, now)).toBe(false));
  it('does not treat a submitted booking as attested', () => expect(canAuthorizeIssuance({ ...detail, booking: { ...detail.booking!, state: 'submitted' } }, now)).toBe(false));
  it('does not offer consent after a booking expires', () => expect(canAuthorizeIssuance({ ...detail, booking: { ...detail.booking!, valid_until: now / 1000 } }, now)).toBe(false));
  it('blocks consent immediately when cancellation has been requested', () => expect(canAuthorizeIssuance({ ...detail, booking: { ...detail.booking!, cancellation_requested_at: '2027-01-15T13:02:00Z' } }, now)).toBe(false));
  it('does not reuse consumed consent', () => expect(canAuthorizeIssuance({ ...detail, consent: { status: 'consumed' } }, now)).toBe(false));
});
describe('Private recipe status and login destination', () => {
  it('never calls a prepared document Registered', () => expect(prescriptionLabel(prescription)).toBe('Emisión pendiente'));
  it('keeps revocation visible even after expiry', () => expect(prescriptionLabel({ ...prescription, rxId: '1', status: 'Revoked', expired: true })).toBe('Revocada'));
  it('distinguishes Registered from Active', () => expect(prescriptionLabel({ ...prescription, rxId: '1', status: 'Registered' })).toBe('Registrada · pendiente de activación'));
  it('routes each approved role to its own portal', () => expect(['doctor', 'patient', 'admin'].map(rolePath)).toEqual(['/doctor', '/patient', '/admin/doctors']));
  it('never uses an arbitrary return destination', () => expect(rolePath('https://example.test/elsewhere')).toBe('/patient'));
});
