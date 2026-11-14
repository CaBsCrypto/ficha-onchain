'use client';
import { useEffect, useRef, useState } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import type { ClinicalDraft, ClinicalDraftMetadata, ClinicalDraftPayload } from '@/lib/clinical/drafts-types';
import type { ClinicalOperation, ClinicalVersion } from '@/types/clinical';
import { ClinicalEntryForm, type ClinicalEntryFormProps } from './ClinicalEntryForm';
import { ClinicalDraftSaveController, deleteClinicalDraft, draftFailure, listClinicalDrafts, readClinicalDraft } from './clinical-drafts-client';
import { clinicalApi, localizedClinicalError, type ClinicalIntent } from './clinical-client';
import { verifiedDraftMetadata } from './clinical-drafts-client';
const draftCopy = {
  es: {
    saved: 'Borrador privado guardado. Todavía no está publicado ni confirmado.',
    saveVerified: 'Guardado comprobado. Puedes seguir editando.',
    sessionChanged: 'El borrador cambió de sesión.',
    saveUncertain: 'No recibimos un guardado verificable. Los campos quedan protegidos hasta comprobar el mismo intento.',
    verifySave: 'Comprobar el mismo guardado',
    resumeBlocked: 'Sólo puedes continuar después de comprobar o cancelar el intento anterior sin firma ni envío. Los intentos enviados o inciertos conservan su publicación original.',
    drafts: 'Borradores privados',
    closeDrafts: 'Cerrar mis borradores',
    myDrafts: 'Mis borradores privados',
    privateExplanation: 'Sólo tú puedes abrir estos borradores. Guardarlos no publica un aporte, no firma ni consume comisión.',
    refresh: 'Actualizar borradores',
    checking: 'Comprobando borradores…',
    empty: 'No hay borradores privados guardados.',
    revision: 'Revisión',
    history: 'Ficha',
    reviewLinkedDraft: 'Revisar borrador vinculado',
    checkLinkedPublication: 'Consultar publicación vinculada',
    openDraft: 'Abrir borrador',
    discardDraft: 'Descartar borrador',
    showMore: 'Mostrar más borradores',
    confirmDiscardLabel: 'Confirmar descarte del borrador',
    discardExplanation: 'Se descartará el contenido privado de este borrador. Las publicaciones y sus versiones permanecerán intactas.',
    confirmDiscard: 'Confirmar descarte',
    keepDraft: 'Conservar borrador',
    draftLinked: 'Borrador vinculado a una publicación',
    linkedExplanation: 'Consulta primero el intento. Si quedó cancelado sin firma ni envío, puedes conservar el contenido en otro borrador y volver a revisarlo. No se preparará otra publicación automáticamente.',
    continueNewDraft: 'Continuar en un nuevo borrador',
    closeReview: 'Cerrar revisión del borrador',
  },
  en: {
    saved: 'Private draft saved. You can publish it when ready.',
    saveVerified: 'Save verified. You can keep editing.',
    sessionChanged: 'The session changed while saving the draft.',
    saveUncertain: 'We couldn’t verify the save. The form stays locked until we check the same attempt.',
    verifySave: 'Check the same save',
    resumeBlocked: 'To continue, verify the previous attempt or cancel it before signing or sending. Submitted or uncertain attempts keep their original publication.',
    drafts: 'Private drafts',
    closeDrafts: 'Close my drafts',
    myDrafts: 'My private drafts',
    privateExplanation: 'Only you can open these drafts. Saving a draft is private, requires no signature and incurs no fee.',
    refresh: 'Refresh drafts',
    checking: 'Checking drafts…',
    empty: 'You have no saved private drafts.',
    revision: 'Revision',
    history: 'Clinical record',
    reviewLinkedDraft: 'Review linked draft',
    checkLinkedPublication: 'Check linked publication',
    openDraft: 'Open draft',
    discardDraft: 'Discard draft',
    showMore: 'Show more drafts',
    confirmDiscardLabel: 'Confirm draft discard',
    discardExplanation: 'This discards the private draft. Published entries and their versions will stay in the history.',
    confirmDiscard: 'Confirm discard',
    keepDraft: 'Keep draft',
    draftLinked: 'Draft linked to a publication',
    linkedExplanation: 'Check the attempt first. If it was cancelled before signing or submission, you can keep the content in another draft and review it. Preparing a new publication requires a separate step.',
    continueNewDraft: 'Continue in a new draft',
    closeReview: 'Close draft review',
  },
};

const button = 'min-h-11 rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-semibold text-sky-800 disabled:opacity-50';
function draftWorkspaceError(failure: unknown, language: 'es' | 'en') {
  return language === 'en' ? localizedClinicalError(failure, language, 'We couldn’t verify the private draft.') : draftFailure(failure);
}

export function ClinicalDraftEntryForm({ identity, target, initialDraft = null, ...props }: ClinicalEntryFormProps & {
  identity: string; target: { historyId: string; patient?: string }; initialDraft?: ClinicalDraft | null;
}) {
  const language = usePortalLanguage();
  const copy = draftCopy[language];
  const [controller] = useState(() => new ClinicalDraftSaveController(target, initialDraft));
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { controller.activate(); alive.current = true; return () => { alive.current = false; controller.dispose(); }; }, [identity]);
  async function save(payload: ClinicalDraftPayload) {
    if (alive.current) { setBusy(true); setError(''); }
    try {
      const result = await controller.save(payload);
      if (alive.current) setStatus(copy.saved);
      return result;
    } catch (failure) { if (alive.current) setError(draftWorkspaceError(failure, language)); throw failure; }
    finally { if (alive.current) { setBusy(false); setUncertain(controller.uncertain); } }
  }
  async function retry() {
    setBusy(true); setError('');
    try { await controller.retry(); if (alive.current) setStatus(copy.saveVerified); }
    catch (failure) { if (alive.current) setError(draftWorkspaceError(failure, language)); }
    finally { if (alive.current) { setBusy(false); setUncertain(controller.uncertain); } }
  }
  async function prepare(input: ClinicalIntent): Promise<ClinicalOperation> {
    const { note, file, entryId, expectedVersion } = input;
    const draft = await save({ ...(note ? { note } : { file }), ...(entryId ? { entryId, expectedVersion } : {}) });
    if (!alive.current) throw new Error(copy.sessionChanged);
    return props.onPrepare({ ...input, draftId: draft.id, draftRevision: draft.revision });
  }
  return <div className="space-y-3">
    <ClinicalEntryForm {...props} initialPayload={initialDraft?.payload} disabled={props.disabled || busy || uncertain}
      onSaveDraft={save} onPrepare={prepare} />
    {status && <p role="status" className="text-sm text-emerald-800">{status}</p>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    {uncertain && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
      {copy.saveUncertain}
      <button type="button" disabled={busy} className={button + ' mt-2'} onClick={() => void retry()}>{copy.verifySave}</button>
    </div>}
  </div>;
}
export function ClinicalDraftWorkspace({ identity, currentHistoryId, canPublish, disabled, role, onPrepare, onReopen, recoveryOnly = false }: {
  identity: string; recoveryOnly?: boolean; currentHistoryId?: string; canPublish: boolean; disabled: boolean; role: 'patient' | 'doctor';
  onPrepare: (input: ClinicalIntent) => Promise<ClinicalOperation>; onReopen: (id: string) => void;
}) {
  const language = usePortalLanguage();
  const copy = draftCopy[language];
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [drafts, setDrafts] = useState<ClinicalDraftMetadata[]>([]);
  const [selected, setSelected] = useState<ClinicalDraft | null>(null), [error, setError] = useState('');
  const [pendingDiscard, setPendingDiscard] = useState<ClinicalDraftMetadata | null>(null);
  const resumeIds = useRef(new Map<string, string>());
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), [identity]);
  async function refresh(before?: string) {
    abort.current?.abort(); const next = new AbortController(); abort.current = next;
    setBusy(true); setError(''); setOpen(true);
    try { const page = await listClinicalDrafts(next.signal, before); if (!next.signal.aborted) { setDrafts(previous => before ? [...previous.filter(d => !page.drafts.some(n => n.id === d.id)), ...page.drafts] : page.drafts); setNextBefore(page.nextBefore); } }
    catch (failure) { if (!next.signal.aborted) setError(draftWorkspaceError(failure, language)); }
    finally { if (!next.signal.aborted) setBusy(false); }
  }
  async function load(d: ClinicalDraftMetadata) {
    abort.current?.abort(); const next = new AbortController(); abort.current = next;
    setBusy(true); setError('');
    try { const value = await readClinicalDraft(d.id, next.signal); if (!next.signal.aborted) setSelected(value); }
    catch (failure) { if (!next.signal.aborted) setError(draftWorkspaceError(failure, language)); }
    finally { if (!next.signal.aborted) setBusy(false); }
  }
  async function resume(d: ClinicalDraft) {
    setBusy(true); setError('');
    const id = resumeIds.current.get(d.id) ?? crypto.randomUUID(); resumeIds.current.set(d.id, id);
    try {
      const result = await clinicalApi<{ draft: ClinicalDraft }>('/api/private-clinical-drafts/' + d.id + '/resume', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: d.revision, id }),
      });
      const metadata = verifiedDraftMetadata(result.draft);
      if (metadata.id !== id || metadata.historyId !== d.historyId || metadata.patient !== d.patient ||
          metadata.author !== d.author || metadata.publicationRequestId || !result.draft.payload) throw new Error();
      setSelected({ ...metadata, payload: result.draft.payload }); setDrafts(previous => [metadata, ...previous.filter(value => value.id !== metadata.id)]);
    } catch { setError(copy.resumeBlocked); }
    finally { setBusy(false); }
  }
  async function discard(d: ClinicalDraftMetadata) {
    setBusy(true); setError('');
    try { await deleteClinicalDraft(d); setDrafts(values => values.filter(value => value.id !== d.id)); setPendingDiscard(null); }
    catch (failure) { setError(draftWorkspaceError(failure, language)); }
    finally { setBusy(false); }
  }
  return <section aria-label={copy.drafts} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
    <button type="button" disabled={busy} onClick={() => open ? setOpen(false) : void refresh()} className={button}>{open ? copy.closeDrafts : copy.myDrafts}</button>
    {open && <>
      <p className="text-sm text-slate-600">{copy.privateExplanation}</p>
      <button type="button" disabled={busy} onClick={() => void refresh()} className={button}>{copy.refresh}</button>
      {busy && <p role="status" className="text-sm text-slate-600">{copy.checking}</p>}
      {!busy && drafts.length === 0 && <p className="text-sm text-slate-600">{copy.empty}</p>}
      <ul className="space-y-2">{drafts.map(d => <li key={d.id} className="rounded-xl bg-slate-50 p-3 text-sm">
        <p>{copy.revision} {d.revision} · {new Date(d.updatedAt).toLocaleString(language === 'en' ? 'en-US' : 'es-CL', { timeZone: 'America/Santiago' })}</p>
        <p className="break-all text-xs text-slate-500">{copy.history}: {d.historyId}</p>
        {d.publicationRequestId ? <><button type="button" disabled={busy || disabled} className={button + ' mt-2 mr-2'} onClick={() => void load(d)}>{copy.reviewLinkedDraft}</button><button type="button" disabled={disabled || !recoveryOnly && d.historyId !== currentHistoryId} className={button + ' mt-2'} onClick={() => onReopen(d.publicationRequestId!)}>{copy.checkLinkedPublication}</button></> :
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy || disabled} className={button} onClick={() => void load(d)}>{copy.openDraft}</button>
            <button type="button" disabled={busy || disabled} className={button} onClick={() => setPendingDiscard(d)}>{copy.discardDraft}</button></div>}
      </li>)}</ul>
      {nextBefore && <button type="button" disabled={busy} className={button} onClick={() => void refresh(nextBefore)}>{copy.showMore}</button>}
    </>}
    {pendingDiscard && <section aria-label={copy.confirmDiscardLabel} className="space-y-3 rounded-xl border border-rose-200 p-4">
      <p className="text-sm text-slate-700">{copy.discardExplanation}</p>
      <button type="button" disabled={busy} className={button} onClick={() => void discard(pendingDiscard)}>{copy.confirmDiscard}</button>
      <button type="button" disabled={busy} className={button + ' ml-2'} onClick={() => setPendingDiscard(null)}>{copy.keepDraft}</button>
    </section>}
    {selected?.publicationRequestId && <section className="space-y-3 rounded-xl border border-sky-200 p-4">
      <h3 className="font-semibold text-slate-900">{copy.draftLinked}</h3>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{selected.payload.note ? selected.payload.note.title + '\n' + selected.payload.note.text : selected.payload.file?.fileName}</p>
      <p className="text-sm text-slate-600">{copy.linkedExplanation}</p>
      <button type="button" disabled={busy || disabled} className={button} onClick={() => void resume(selected)}>{copy.continueNewDraft}</button>
      <button type="button" className={button + ' ml-2'} onClick={() => setSelected(null)}>{copy.closeReview}</button>
    </section>}
    {selected && !selected.publicationRequestId && <ClinicalDraftEntryForm key={identity + ':' + selected.id + ':' + selected.revision} identity={identity}
      target={{ historyId: selected.historyId, patient: selected.patient }} initialDraft={selected} role={role}
      historyId={role === 'doctor' ? selected.historyId : undefined} disabled={disabled}
      disablePrescriptionLookup={recoveryOnly || !canPublish} readOnly={recoveryOnly || !canPublish || selected.historyId !== currentHistoryId}
      onPrepare={onPrepare} onCancel={() => setSelected(null)} />}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
  </section>;
}
