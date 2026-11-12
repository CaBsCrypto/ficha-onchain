import { createHash } from 'node:crypto';
import { clinicalInput, clinicalNote } from './input';
import type { ClinicalFile, ClinicalNote } from '@/types/clinical';

export interface EpisodeContext {
  historyId: string; patient: string; author: string; grantRevision: number;
  episodeId: string; version: number; previousCommitment: string | null;
}
export interface EpisodeAttachment { id: string; fileName: string; mediaType: ClinicalFile['mediaType']; byteLength: number; sha256: string }
export interface ClinicalEpisodeManifest extends EpisodeContext { kind: 'episode/v1'; note: ClinicalNote; attachments: EpisodeAttachment[] }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const WALLET = /^G[A-Z2-7]{55}$/;
const fail = (): never => { throw new Error('clinical_episode_invalid'); };
const fingerprint = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function checkContext(c: EpisodeContext) {
  if (!c || !HASH.test(c.historyId) || !WALLET.test(c.patient) || !WALLET.test(c.author) || !UUID.test(c.episodeId) ||
    !Number.isSafeInteger(c.grantRevision) || c.grantRevision < 0 || (c.author !== c.patient && c.grantRevision < 1) ||
    !Number.isSafeInteger(c.version) || c.version < 1 ||
    (c.version === 1 ? c.previousCommitment !== null : !c.previousCommitment || !HASH.test(c.previousCommitment))) fail();
}
function checkedAttachment(id: string, file: ClinicalFile): { descriptor: EpisodeAttachment; bytes: Buffer } {
  if (!UUID.test(id)) fail();
  const checked = clinicalInput({ requestId: id, action: 'append_version', file }).file!;
  const bytes = Buffer.from(checked.base64, 'base64');
  return { descriptor: { id, fileName: checked.fileName, mediaType: checked.mediaType, byteLength: bytes.length, sha256: fingerprint(bytes) }, bytes };
}
/** Laboratory format only. Resolve already stored private bytes before constructing the manifest.
 * This does not grant consent, create an operation or publish an episode to a current reader. */
export async function buildClinicalEpisode(context: EpisodeContext, noteInput: ClinicalNote, attachmentIds: string[], deps: {
  readStoredAttachment: (id: string) => Promise<ClinicalFile | null>;
  prescriptionAllowed: (id: string, patient: string, author: string) => Promise<boolean>;
}): Promise<ClinicalEpisodeManifest> {
  checkContext(context);
  if (!Array.isArray(attachmentIds) || attachmentIds.length > 8 || new Set(attachmentIds).size !== attachmentIds.length) fail();
  const note = clinicalNote(noteInput);
  if (note.prescriptionId && !await deps.prescriptionAllowed(note.prescriptionId, context.patient, context.author)) fail();
  const attachments: EpisodeAttachment[] = [];
  for (const id of attachmentIds) {
    if (!UUID.test(id)) fail();
    const stored = await deps.readStoredAttachment(id);
    if (!stored) return fail();
    const checked = checkedAttachment(id, stored);
    attachments.push(checked.descriptor); checked.bytes.fill(0);
  }
  return { kind: 'episode/v1', historyId: context.historyId, patient: context.patient, author: context.author,
    grantRevision: context.grantRevision, episodeId: context.episodeId, version: context.version,
    previousCommitment: context.previousCommitment, note, attachments };
}
/** Call before encrypting/anclaring a new version and again before serving a private attachment. */
export async function verifyEpisodeAttachments(manifest: ClinicalEpisodeManifest, read: (id: string) => Promise<ClinicalFile | null>) {
  checkContext(manifest);
  if (manifest.kind !== 'episode/v1' || !Array.isArray(manifest.attachments) || manifest.attachments.length > 8 ||
      new Set(manifest.attachments.map(a => a.id)).size !== manifest.attachments.length) fail();
  for (const expected of manifest.attachments) {
    const file = await read(expected.id); if (!file) return fail();
    const checked = checkedAttachment(expected.id, file);
    const same = JSON.stringify(checked.descriptor) === JSON.stringify(expected); checked.bytes.fill(0);
    if (!same) fail();
  }
}
/** Canonical private plaintext. Hashes and RX identifiers must remain inside the encrypted manifest. */
export function canonicalEpisodeBytes(manifest: ClinicalEpisodeManifest): Buffer {
  checkContext(manifest); const note = clinicalNote(manifest.note);
  if (manifest.kind !== 'episode/v1' || !Array.isArray(manifest.attachments) || manifest.attachments.length > 8) fail();
  return Buffer.from(JSON.stringify({ kind: 'episode/v1', historyId: manifest.historyId, patient: manifest.patient,
    author: manifest.author, grantRevision: manifest.grantRevision, episodeId: manifest.episodeId,
    version: manifest.version, previousCommitment: manifest.previousCommitment, note,
    attachments: manifest.attachments.map(a => ({ id: a.id, fileName: a.fileName, mediaType: a.mediaType, byteLength: a.byteLength, sha256: a.sha256 })) }), 'utf8');
}
export function compareInitialEpisodeAnchors(attachments: number) {
  if (!Number.isSafeInteger(attachments) || attachments < 0 || attachments > 8) fail();
  // Current V1: one new Entry, Version and Operation per new contribution.
  return { scenario: 'new-note-with-attachments', separateAnchors: 1 + attachments, episodeAnchors: 1,
    separateNewEntries: 3 * (1 + attachments), episodeNewEntries: 3,
    feeEstimate: null, publishable: false,
    limitation: 'Counts describe the current V1 layout, not a measured fee or a replacement for the pending rehearsal.' } as const;
}
