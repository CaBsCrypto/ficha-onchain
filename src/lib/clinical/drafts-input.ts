import { StrKey } from '@stellar/stellar-sdk';
import { PrivateFlowError } from '@/lib/private-config';
import { uuid } from '@/lib/private-api';
import { clinicalInput } from './input';
import type { ClinicalDraftPayload, ClinicalDraftSave, ClinicalDraftSaveRequest } from './drafts-types';

export const DRAFT_BODY_LIMIT = 4_010_000;
export function draftInvalid(): never { throw new PrivateFlowError('clinical_draft_invalid', 400); }
export function draftObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) draftInvalid();
  return value as Record<string, unknown>;
}
export function draftRevision(value: unknown, zero = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (zero ? 0 : 1) || value >= 2_147_483_647) draftInvalid();
  return value;
}
export function draftId(value: unknown): string {
  if (!uuid(value)) draftInvalid();
  return value.toLowerCase();
}
export function draftPayload(value: unknown): ClinicalDraftPayload {
  const p = draftObject(value, ['note', 'file', 'entryId', 'expectedVersion']);
  if ((p.note === undefined) === (p.file === undefined)) draftInvalid();
  if (p.entryId !== undefined) {
    if (typeof p.entryId !== 'string' || !/^[a-f0-9]{64}$/.test(p.entryId)) draftInvalid();
    draftRevision(p.expectedVersion);
  } else if (p.expectedVersion !== undefined) draftInvalid();
  const target = p.entryId === undefined ? {} : { entryId: String(p.entryId), expectedVersion: Number(p.expectedVersion) };
  if (p.file !== undefined) {
    // Reuse the published flow's file limits without allocating any intent or nonce.
    const checked = clinicalInput({ requestId: '00000000-0000-4000-8000-000000000000', action: 'append_version', file: p.file, ...target });
    return { ...target, file: { fileName: checked.file!.fileName, mediaType: checked.file!.mediaType, base64: checked.file!.base64 } };
  }
  const n = draftObject(p.note, ['title', 'text', 'eventDate', 'prescriptionId']);
  if (typeof n.title !== 'string' || n.title.length > 120 || typeof n.text !== 'string' || n.text.length > 20_000 ||
      (n.prescriptionId !== undefined && !uuid(n.prescriptionId)) ||
      (n.eventDate !== null && (typeof n.eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(n.eventDate) ||
      !Number.isFinite(Date.parse(n.eventDate)) || new Date(n.eventDate).toISOString().slice(0, 10) !== n.eventDate))) draftInvalid();
  return { ...target, note: { title: n.title, text: n.text, eventDate: n.eventDate as string | null,
    ...(n.prescriptionId === undefined ? {} : { prescriptionId: String(n.prescriptionId) }) } };
}
export function draftSave(value: unknown): ClinicalDraftSave {
  const v = draftObject(value, ['id', 'expectedRevision', 'historyId', 'patient', 'payload']);
  if (typeof v.historyId !== 'string' || !/^[a-f0-9]{64}$/.test(v.historyId) || typeof v.patient !== 'string' || !StrKey.isValidEd25519PublicKey(v.patient)) draftInvalid();
  return { id: draftId(v.id), expectedRevision: draftRevision(v.expectedRevision, true), historyId: v.historyId, patient: v.patient, payload: draftPayload(v.payload) };
}
/** API input only: a create can resolve patient from verified server history state. */
export function draftSaveRequest(value: unknown): ClinicalDraftSaveRequest {
  const v = draftObject(value, ['id', 'expectedRevision', 'historyId', 'patient', 'payload']);
  if (v.patient !== undefined) return draftSave(value);
  if (draftRevision(v.expectedRevision, true) !== 0 || typeof v.historyId !== 'string' || !/^[a-f0-9]{64}$/.test(v.historyId)) draftInvalid();
  return { id: draftId(v.id), expectedRevision: 0, historyId: v.historyId, payload: draftPayload(v.payload) };
}
export async function draftBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) draftInvalid();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > DRAFT_BODY_LIMIT) { await reader.cancel(); throw new PrivateFlowError('clinical_request_too_large', 413); }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (error instanceof PrivateFlowError) throw error; return draftInvalid(); }
  finally { reader.releaseLock(); }
}

export function draftListOptions(request: Request): { before?: string } {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(k => k !== 'before') || query.getAll('before').length > 1) draftInvalid();
  const before = query.get('before'); return before === null ? {} : { before: draftId(before) };
}
