import type { ClinicalPrepareRequest, ClinicalNote } from '@/types/clinical';
import { PrivateFlowError } from '@/lib/private-config';
import { uuid } from '@/lib/private-api';

function fail(code = 'clinical_request_invalid'): never { throw new PrivateFlowError(code, 400); }
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));
export function clinicalNote(value: unknown): ClinicalNote {
  if (!exact(value, ['title', 'text', 'eventDate']) || typeof value.title !== 'string' || typeof value.text !== 'string' ||
      !value.title.trim() || value.title.length > 120 || !value.text.trim() || value.text.length > 20_000 ||
      (value.eventDate !== null && (typeof value.eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.eventDate) ||
        !Number.isFinite(Date.parse(value.eventDate)) || new Date(value.eventDate).toISOString().slice(0, 10) !== value.eventDate))) fail();
  return { title: value.title.trim(), text: value.text.trim(), eventDate: value.eventDate as string | null };
}
export function clinicalInput(supplied: unknown): ClinicalPrepareRequest {
  if (!exact(supplied, ['requestId', 'action', 'entryId', 'expectedVersion', 'note', 'file', 'doctorId', 'canRead', 'canAppend', 'expectedRevision']) || !uuid(supplied.requestId)) fail();
  const value = { ...supplied };
  const allowed = (keys: string[]) => { if (Object.keys(value).some(k => !['requestId', 'action', ...keys].includes(k))) fail(); };
  if (value.action === 'create_history') allowed([]);
  else if (value.action === 'append_version') {
    allowed(['entryId', 'expectedVersion', 'note', 'file']);
    if ((value.note === undefined) === (value.file === undefined) ||
      (value.entryId !== undefined && (typeof value.entryId !== 'string' || !/^[a-f0-9]{64}$/.test(value.entryId))) ||
      (value.entryId === undefined ? value.expectedVersion !== undefined && value.expectedVersion !== 0 :
        !Number.isInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 || Number(value.expectedVersion) >= 0xffff_ffff)) fail();
    if (value.note !== undefined) value.note = clinicalNote(value.note);
    else {
      const f = value.file;
      if (!exact(f, ['fileName', 'mediaType', 'base64']) || typeof f.fileName !== 'string' || !f.fileName ||
          Buffer.byteLength(f.fileName) > 255 || /[\x00-\x1f\x7f/\\]/.test(f.fileName) || ['.', '..'].includes(f.fileName) ||
          !['application/pdf', 'image/png', 'image/jpeg'].includes(String(f.mediaType)) || typeof f.base64 !== 'string' ||
          f.base64.length > 4_000_000 || f.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.base64)) fail('clinical_file_invalid');
      const bytes = Buffer.from(f.base64, 'base64');
      if (!bytes.length || bytes.length > 3_000_000 || bytes.toString('base64') !== f.base64) fail('clinical_file_invalid');
    }
  } else if (value.action === 'set_permissions') {
    allowed(['doctorId', 'canRead', 'canAppend', 'expectedRevision']);
    if (!Number.isSafeInteger(value.doctorId) || Number(value.doctorId) < 1 || typeof value.canRead !== 'boolean' ||
        typeof value.canAppend !== 'boolean' || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) fail();
  } else fail();
  return value as unknown as ClinicalPrepareRequest;
}
/** Bound the raw request before parsing. A 3MB original file fits with canonical base64. */
export async function clinicalBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) fail();
  let total = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > 4_010_000) { await reader.cancel(); throw new PrivateFlowError('clinical_request_too_large', 413); }
      chunks.push(value);
    }
    return clinicalInput(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch (error) { if (error instanceof PrivateFlowError) throw error; fail(); }
  finally { reader.releaseLock(); }
}
