/** Public view models only. Ciphertext, keys, raw envelopes and Privy tokens never belong here. */
export type ClinicalAction = 'create_history' | 'append_version' | 'set_permissions';
export type ClinicalOperationState = 'awaiting_signature' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';
export interface ClinicalActor { userId: string; walletId: string; address: string }
export interface ClinicalNote { title: string; text: string; eventDate: string | null }
export interface ClinicalFile { fileName: string; mediaType: 'application/pdf' | 'image/png' | 'image/jpeg'; base64: string }
export interface ClinicalPrepareRequest {
  requestId: string; action: ClinicalAction; entryId?: string; expectedVersion?: number;
  note?: ClinicalNote; file?: ClinicalFile;
  doctorId?: number; canRead?: boolean; canAppend?: boolean; expectedRevision?: number;
}
export interface ClinicalOperation {
  id: string; action: ClinicalAction; state: ClinicalOperationState; expiresAt: number;
  transactionHash: string | null; errorCode: string | null;
}
export interface ClinicalVersion {
  entryId: string; version: number; author: string; source: 'patient' | 'doctor';
  createdAt: number; title: string; mediaType: string; fileName: string;
  note: ClinicalNote | null; transactionHash: string; canCorrect: boolean;
}
export interface ClinicalGrant {
  doctorId: number; doctorName: string; address: string; authorized: boolean;
  canRead: boolean; canAppend: boolean; revision: number;
}
export interface ClinicalSnapshot {
  history: { id: string; patient: string; createdAt: number } | null;
  entries: ClinicalVersion[]; grants: ClinicalGrant[]; operations: ClinicalOperation[];
  verifiedAt: string;
}
/** Immutable server intent. No plaintext note or filename is persisted here. */
export interface ClinicalExpected {
  historyId: string; patient: string; operationId: string;
  entryId?: string; author?: string; commitment?: string; previousCommitment?: string | null;
  expectedVersion?: number; expectedGrantRevision?: number;
  doctor?: string; canRead?: boolean; canAppend?: boolean; expectedRevision?: number;
}
