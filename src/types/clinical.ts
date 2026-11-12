/** Public view models only. Ciphertext, keys, raw envelopes and Privy tokens never belong here. */
export type ClinicalAction = 'create_history' | 'append_version' | 'set_permissions';
export type ClinicalOperationState = 'awaiting_signature' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';
export interface ClinicalActor { userId: string; walletId: string; address: string }
export interface ClinicalNote { title: string; text: string; eventDate: string | null; prescriptionId?: string }
export interface ClinicalFile { fileName: string; mediaType: 'application/pdf' | 'image/png' | 'image/jpeg'; base64: string }
export interface ClinicalPrepareRequest {
  requestId: string; action: ClinicalAction; historyId?: string; entryId?: string; expectedVersion?: number;
  draftId?: string; draftRevision?: number;
  note?: ClinicalNote; file?: ClinicalFile;
  doctorId?: number; canRead?: boolean; canAppend?: boolean; expectedRevision?: number;
}
export interface ClinicalOperationReview {
  network: 'testnet'; contractId: string; historyId: string; patient: string; author: string; operationId: string;
  entryId?: string; version?: number;
  content: { kind: 'file'; fileName: string; mediaType: 'application/pdf' | 'image/png' | 'image/jpeg'; byteLength: number; sha256: string } |
    { kind: 'note'; note: ClinicalNote } |
    { kind: 'permissions'; doctor: string; canRead: boolean; canAppend: boolean; expectedRevision: number } |
    { kind: 'history' };
}
export interface ClinicalOperation {
  id: string; action: ClinicalAction; state: ClinicalOperationState; expiresAt: number;
  transactionHash: string | null; errorCode: string | null;
  sponsorship?: { maxFeeStroops: string; quotePreparedAt: number; quoteExpiresAt: number; quoteValidUntil?: number };
  review?: ClinicalOperationReview;
  signing?: { address: string; hash: string; network: 'testnet'; expiresAt: number };
}
export interface ClinicalPrescriptionReference {
  id: string; rxId: string | null; appointmentId: number;
  status: 'Pending' | 'Registered' | 'Active' | 'Revoked' | 'Blocked';
  doctorName: string; patientName: string; expired: boolean; expiresAt: number; transactionHash: string | null;
}
export interface ClinicalVersion {
  entryId: string; version: number; author: string; source: 'patient' | 'doctor';
  createdAt: number; title: string; mediaType: string; fileName: string;
  note: ClinicalNote | null; transactionHash: string; canCorrect: boolean;
  prescription?: ClinicalPrescriptionReference | null; prescriptionUnavailable?: boolean;
}
export interface ClinicalGrant {
  doctorId: number; doctorName: string; address: string; authorized: boolean;
  canRead: boolean; canAppend: boolean; revision: number;
}
export interface ClinicalSnapshot {
  draftsEnabled?: boolean;
  rehearsal?: { runId: string; until: number; signingCheck?: true; steps: Array<{ requestId: string; action: ClinicalAction; entryId?: string; expectedVersion?: number; expectedRevision?: number; canRead?: boolean; canAppend?: boolean; kind?: 'note' | 'file' }> };
  context?: { role: 'doctor'; canRead: boolean; canAppend: boolean; grantRevision: number };
  writes: Record<ClinicalAction, boolean>;
  /** Incomplete doctor directory checks never stand in for verified permissions. */
  grantsUnavailable?: boolean;
  history: { id: string; patient: string; createdAt: number; creationTransactionHash?: string | null } | null;
  entries: ClinicalVersion[]; grants: ClinicalGrant[]; operations: ClinicalOperation[];
  verifiedAt: string;
}
/** Immutable server intent. No plaintext note or filename is persisted here. */
export interface ClinicalExpected {
  historyId: string; patient: string; operationId: string;
  entryId?: string; author?: string; commitment?: string; previousCommitment?: string | null;
  expectedVersion?: number; expectedGrantRevision?: number;
  /** Server-only target selection; it is not a Soroban argument. */
  doctorId?: number; doctor?: string; canRead?: boolean; canAppend?: boolean; expectedRevision?: number;
}
