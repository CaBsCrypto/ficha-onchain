export type PortalRole = 'doctor' | 'patient';
export type OperationAction = 'consent' | 'withdraw_consent' | 'mint' | 'activate' | 'revoke';
export interface PrivateOperation {
  id: string; action: OperationAction;
  state: 'awaiting_signature' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';
  signingHash?: string; address?: string; expiresAt?: number;
  transactionHash?: string | null; errorCode?: string | null;
}
export interface PrivatePrescription {
  id: string; rxId: string | null; appointmentId: number;
  status: 'Pending' | 'Registered' | 'Active' | 'Revoked' | 'Blocked'; expired: boolean;
  doctorName: string; patientName: string; expiresAt: number;
  transactionHash: string | null; operation?: PrivateOperation | null;
}
export interface PrivateAppointment {
  id: number; doctor_id?: number; doctor_email: string; doctor_name?: string;
  patient_email: string; patient_name: string; date: string; time_slot: string;
  type: string; status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'cancel_requested';
  attendance_at?: string | null; attended_at?: string | null; started_at?: string | null;
  booking?: PrivateBooking | null;
}
export interface PrivateBooking {
  state: string; issuance_id: string; valid_until: number;
  attestation_hash?: string | null; transaction_hash?: string | null; cancellation_requested_at?: string | null;
}
export interface ConsultationState {
  appointment: PrivateAppointment; booking: PrivateBooking | null;
  consent: { status: 'absent' | 'active' | 'expired' | 'consumed'; validUntil?: number | null };
  prescription?: PrivatePrescription | null; operations: PrivateOperation[];
}
export interface PrescriptionDocument { medication: string; dosage: string; instructions: string }
export interface PrescriptionVerification {
  network: 'testnet'; contract: string; rxId: string | null;
  status: PrivatePrescription['status']; expiresAt: number; expired: boolean; checkedAt: string;
  issuanceHash: string | null; revocationHash: string | null;
}
