'use client';
import type { ClinicalDraft, ClinicalDraftMetadata, ClinicalDraftPayload, ClinicalDraftSave } from '@/lib/clinical/drafts-types';
import { clinicalApi, ClinicalClientError } from './clinical-client';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const WALLET = /^G[A-Z2-7]{55}$/;
const PATH = '/api/private-clinical-drafts';
const messages: Record<string, string> = {
  clinical_draft_conflict: 'El borrador cambió en otra ventana. Vuelve a abrir su versión guardada antes de editar.',
  clinical_draft_not_found: 'Este borrador ya no está disponible para tu cuenta.',
  clinical_draft_publication_pending: 'Este borrador ya tiene una publicación vinculada. Consulta ese mismo intento.',
  clinical_draft_invalid: 'Revisa los campos del borrador.',
  clinical_drafts_unavailable: 'Los borradores privados no están disponibles. Conserva esta pantalla y vuelve a comprobar.',
  clinical_draft_unavailable: 'No pudimos guardar o recuperar el borrador privado. Conserva esta pantalla y vuelve a comprobar.',
};
export function draftFailure(error: unknown) {
  return error instanceof ClinicalClientError ? messages[error.code] ?? error.message : 'No pudimos comprobar el borrador privado.';
}
export function verifiedDraftMetadata(value: unknown): ClinicalDraftMetadata {
  const d = value as ClinicalDraftMetadata;
  if (!d || !UUID.test(d.id) || !Number.isSafeInteger(d.revision) || d.revision < 1 || !HASH.test(d.historyId) ||
      !WALLET.test(d.patient) || !WALLET.test(d.author) || d.state !== 'draft' ||
      (d.publicationRequestId !== null && !UUID.test(d.publicationRequestId)) ||
      !Number.isFinite(Date.parse(d.createdAt)) || !Number.isFinite(Date.parse(d.updatedAt))) {
    throw new Error('No pudimos verificar el borrador recibido.');
  }
  return { id: d.id, revision: d.revision, historyId: d.historyId, patient: d.patient, author: d.author, state: 'draft',
    publicationRequestId: d.publicationRequestId, createdAt: d.createdAt, updatedAt: d.updatedAt };
}
export async function listClinicalDrafts(signal?: AbortSignal, before?: string) {
  if (before && !UUID.test(before)) throw new Error('Cursor de borradores no válido.');
  const result = await clinicalApi<{ drafts: unknown[]; hasMore: boolean; nextBefore: string | null }>(PATH + (before ? '?before=' + before : ''), { signal });
  if (!Array.isArray(result.drafts)) throw new Error('No pudimos comprobar la lista de borradores.');
  if (typeof result.hasMore !== 'boolean' || (result.hasMore ? !result.nextBefore || !UUID.test(result.nextBefore) : result.nextBefore !== null)) throw new Error('No pudimos comprobar la página de borradores.');
  return { drafts: result.drafts.map(verifiedDraftMetadata), nextBefore: result.nextBefore };
}
export async function readClinicalDraft(id: string, signal?: AbortSignal): Promise<ClinicalDraft> {
  if (!UUID.test(id)) throw new Error('Borrador no válido.');
  const result = await clinicalApi<{ draft: ClinicalDraft }>(PATH + '/' + id, { signal });
  const metadata = verifiedDraftMetadata(result.draft);
  if (metadata.id !== id || !result.draft.payload || typeof result.draft.payload !== 'object' ||
      (!!result.draft.payload.note === !!result.draft.payload.file)) throw new Error('No pudimos verificar el contenido del borrador.');
  return { ...metadata, payload: result.draft.payload };
}
export async function deleteClinicalDraft(draft: ClinicalDraftMetadata) {
  const result = await clinicalApi<{ deleted: boolean; id: string; revision: number }>(PATH + '/' + draft.id, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: draft.revision }),
  });
  if (result.deleted !== true || result.id !== draft.id || result.revision !== draft.revision + 1) throw new Error('No pudimos comprobar el descarte.');
}
type Requester = typeof clinicalApi;
/** A lost response retries exactly the same save; no plaintext is put in browser storage. */
export class ClinicalDraftSaveController {
  private saved: ClinicalDraftMetadata | null;
  private pending: (Omit<ClinicalDraftSave, 'patient'> & { patient?: string }) | null = null;
  private busy = false;
  private disposed = false;
  private generation = 0;
  private abort = new AbortController();
  constructor(private target: { historyId: string; patient?: string }, initial: ClinicalDraftMetadata | null = null,
    private request: Requester = clinicalApi, private newId: () => string = () => crypto.randomUUID()) { this.saved = initial; }
  activate() { if (this.disposed) { this.disposed = false; this.abort = new AbortController(); } }
  dispose() { this.disposed = true; this.generation++; this.abort.abort(); }
  get metadata() { return this.saved; }
  get uncertain() { return this.pending !== null; }
  async save(payload: ClinicalDraftPayload): Promise<ClinicalDraftMetadata> {
    if (this.disposed) throw new Error('La sesión del borrador cambió.');
    if (this.busy) throw new Error('Ya estamos guardando este borrador.');
    if (this.saved?.publicationRequestId) throw new Error(messages.clinical_draft_publication_pending);
    if (this.pending && JSON.stringify(payload) !== JSON.stringify(this.pending.payload)) {
      throw new Error('Comprueba primero el guardado anterior antes de cambiar su contenido.');
    }
    if (!this.pending) this.pending = { ...this.target, ...(this.saved ? { patient: this.saved.patient } : {}), id: this.saved?.id ?? this.newId(), expectedRevision: this.saved?.revision ?? 0,
      payload: structuredClone(payload) };
    this.busy = true;
    const attempted = this.pending, generation = this.generation;
    try {
      const { id, ...update } = attempted;
      const result = await this.request<{ draft: ClinicalDraftMetadata }>(attempted.expectedRevision === 0 ? PATH : PATH + '/' + id, {
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(20_000)]), method: attempted.expectedRevision === 0 ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempted.expectedRevision === 0 ? attempted : update),
      });
      if (this.disposed || generation !== this.generation) throw new Error('La sesión del borrador cambió.');
      const saved = verifiedDraftMetadata(result.draft);
      if (saved.id !== id || saved.revision !== attempted.expectedRevision + 1 || saved.historyId !== attempted.historyId ||
          (attempted.patient !== undefined && saved.patient !== attempted.patient)) throw new Error('No pudimos verificar el guardado del borrador.');
      this.saved = saved; this.pending = null; return saved;
    } catch (error) {
      if (error instanceof ClinicalClientError && error.status >= 400 && error.status < 500) this.pending = null;
      throw error;
    } finally { this.busy = false; }
  }
  retry() {
    if (!this.pending) throw new Error('No hay un guardado pendiente.');
    return this.save(this.pending.payload);
  }
}
