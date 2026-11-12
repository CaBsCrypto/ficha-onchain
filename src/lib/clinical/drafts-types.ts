import type { ClinicalFile, ClinicalNote } from '@/types/clinical';

/** Private workspace only. A saved draft is never a published clinical record. */
export interface ClinicalDraftPayload {
  note?: ClinicalNote;
  file?: ClinicalFile;
  entryId?: string;
  expectedVersion?: number;
}
export interface ClinicalDraftMetadata {
  id: string;
  revision: number;
  historyId: string;
  patient: string;
  author: string;
  state: 'draft';
  publicationRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ClinicalDraft extends ClinicalDraftMetadata { payload: ClinicalDraftPayload }
export interface ClinicalDraftSave {
  id: string;
  expectedRevision: number;
  historyId: string;
  patient: string;
  payload: ClinicalDraftPayload;
}

export interface ClinicalDraftPage { drafts: ClinicalDraftMetadata[]; hasMore: boolean; nextBefore: string | null }

/** Only a first create may omit patient; the server resolves it before authorization and encryption. */
export type ClinicalDraftCreate = Omit<ClinicalDraftSave, 'expectedRevision' | 'patient'> & {
  expectedRevision: 0;
  patient?: string;
};
export type ClinicalDraftSaveRequest = ClinicalDraftSave | ClinicalDraftCreate;