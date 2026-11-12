'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import type { ClinicalFile, ClinicalOperation, ClinicalVersion, ClinicalPrescriptionReference } from '@/types/clinical';
import { prescriptionLabel } from './state';
import { formatClinicalFileSize } from './clinical-file-size';
import type { ClinicalDraftPayload } from '@/lib/clinical/drafts-types';
import { localizedClinicalError, readClinicalFile, readClinicalPrescriptions, type ClinicalIntent } from './clinical-client';

const entryCopy = {
  es: {
    prescriptionsFailed: 'No pudimos comprobar las recetas.',
    fileReadFailed: 'No pudimos leer el archivo.',
    chooseFileFirst: 'Selecciona y revisa un archivo antes de continuar.',
    noteFields: 'Agrega un título y el contenido del antecedente.',
    noteDateInvalid: 'Revisa la fecha del antecedente.',
    prescriptionUnverified: 'Vuelve a comprobar la receta o elige «Sin receta vinculada» antes de continuar.',
    draftFileRequired: 'Selecciona un archivo antes de guardar el borrador.',
    saveDraftFailed: 'No se pudo guardar el borrador.',
    invalidFields: 'Revisa los campos.',
    prepareFailed: 'No se pudo preparar el antecedente.',
    correct: 'Corregir mi aporte',
    add: 'Agregar al historial',
    correctionPreview: 'Puedes revisar un borrador de corrección. Las versiones guardadas no cambiarán.',
    entryPreview: 'Explora cómo agregar un antecedente o seleccionar un archivo, sin guardarlo.',
    nextVersion: (version: number) => `Crearemos la versión ${version}. Las versiones anteriores permanecerán guardadas.`,
    doctorContribution: 'Tu aporte conservará tu autoría médica y su versión. Sólo puedes corregir aportes propios.',
    patientContribution: 'Agrega información que quieras conservar. Tus aportes se identifican como información declarada por ti.',
    close: 'Cerrar',
    temporaryDraft: 'Borrador temporal: sólo existe en esta pantalla. No se guarda, no se firma ni genera transacciones. Al cerrar el formulario se descarta.',
    privateDraft: 'Puedes guardar un borrador privado y recuperarlo con tu cuenta. Todavía no es un aporte publicado ni confirmado.',
    reviewDraft: 'Revisa tu borrador',
    reviewForSignature: 'Revisa antes de preparar la firma',
    eventDate: 'Fecha del antecedente',
    image: 'Imagen',
    linkedPrescription: (id: string | number) => `Receta vinculada: ${id}. El vínculo conserva el documento y sus permisos propios.`,
    privateDraftReview: 'Puedes conservar el borrador privado. Para publicar volveremos a comprobar permisos, firma y presupuesto.',
    readOnlyReview: 'Las confirmaciones están deshabilitadas en esta demostración. Puedes volver a editar o cerrar sin guardar.',
    signatureReview: 'El contenido quedará cifrado en el almacenamiento privado. Después confirmarás con tu cuenta Privy; el comprobante del cambio se registrará en Stellar Testnet.',
    edit: 'Volver a editar',
    preparing: 'Preparando…',
    prepare: 'Preparar firma',
    entryKind: 'Qué quieres agregar',
    note: 'Antecedente escrito',
    pdfOrImage: 'PDF o imagen',
    title: 'Título',
    noteBody: 'Antecedente',
    optional: '(opcional)',
    linkPrescription: 'Vincular una receta existente',
    existingPrescription: 'Receta existente',
    noPrescription: 'Sin receta vinculada',
    oldPrescriptionUnverified: 'Vínculo anterior sin acceso comprobado',
    prescriptionNumber: (id: string) => `Receta #${id}`,
    preparedDocument: 'Documento preparado',
    consultation: 'Consulta',
    prescriptionExplanation: 'Sólo aparecen recetas cuyo acceso fue comprobado para esta ficha. Vincular conserva su documento, estado y permisos; no la emite de nuevo.',
    checkingPrescriptions: 'Comprobando recetas existentes…',
    recheck: 'Volver a comprobar',
    backToLinked: 'Volver a la receta vinculada',
    otherPrescriptions: 'Ver otras recetas',
    newVersionFile: 'Archivo de la nueva versión',
    file: 'Archivo',
    earlierVersion: 'Versión anterior',
    sizeLimit: 'PDF, PNG o JPEG de hasta 3 MB. No reduciremos su tamaño ni cambiaremos su contenido automáticamente.',
    checkingFile: 'Leyendo y comprobando el archivo…',
    selectedPreview: 'Vista previa del archivo seleccionado',
    downloadSelection: 'Descargar selección para revisarla',
    reviewEntry: 'Revisar antecedente',
    saveDraft: 'Guardar borrador privado',
  },
  en: {
    prescriptionsFailed: 'We couldn’t verify the prescriptions.',
    fileReadFailed: 'We couldn’t read the file. Select a complete PDF, PNG or JPEG of up to 3 MB.',
    chooseFileFirst: 'Select and review a file before continuing.',
    noteFields: 'Add a title and the content of the note.',
    noteDateInvalid: 'Check the date of the note.',
    prescriptionUnverified: 'Verify the prescription again or choose “No linked prescription” before continuing.',
    draftFileRequired: 'Select a file before saving the draft.',
    saveDraftFailed: 'We couldn’t save the draft.',
    invalidFields: 'Check the fields.',
    prepareFailed: 'We couldn’t prepare this entry.',
    correct: 'Correct my entry',
    add: 'Add to clinical history',
    correctionPreview: 'You can review a draft correction. Saved versions will stay in the history.',
    entryPreview: 'You can preview a note or file before saving it.',
    nextVersion: (version: number) => `This will create version ${version}. Earlier versions will remain in the history.`,
    doctorContribution: 'Your entry will show you as its author and include a version number. You can correct your own entries.',
    patientContribution: 'Add information you want to keep. Your entries are marked as patient-reported.',
    close: 'Close',
    temporaryDraft: 'This temporary draft exists on this screen. Closing the form discards it. Saving, signing and transactions are unavailable in this mode.',
    privateDraft: 'You can save a private draft and reopen it with your account. A draft stays private until you publish it.',
    reviewDraft: 'Review your draft',
    reviewForSignature: 'Review before preparing the signature',
    eventDate: 'Event date',
    image: 'Image',
    linkedPrescription: (id: string | number) => `Linked prescription: ${id}. The prescription keeps its own document and permissions.`,
    privateDraftReview: 'You can keep this as a private draft. Publishing requires another check of permissions, signature and budget.',
    readOnlyReview: 'Confirmations are disabled for this demo. You can return to editing or close without saving.',
    signatureReview: 'The content will be encrypted in private storage. Confirm with your Privy account to record a receipt on Stellar Testnet.',
    edit: 'Back to editing',
    preparing: 'Preparing…',
    prepare: 'Prepare signature',
    entryKind: 'What would you like to add?',
    note: 'Written note',
    pdfOrImage: 'PDF or image',
    title: 'Title',
    noteBody: 'Note',
    optional: '(optional)',
    linkPrescription: 'Link an existing prescription',
    existingPrescription: 'Existing prescription',
    noPrescription: 'No linked prescription',
    oldPrescriptionUnverified: 'Previous link with unverified access',
    prescriptionNumber: (id: string) => `Prescription #${id}`,
    preparedDocument: 'Prepared document',
    consultation: 'Consultation',
    prescriptionExplanation: 'The list shows prescriptions with verified access for this record. Linking a prescription preserves its document, status and permissions.',
    checkingPrescriptions: 'Checking existing prescriptions…',
    recheck: 'Check again',
    backToLinked: 'Back to linked prescription',
    otherPrescriptions: 'See other prescriptions',
    newVersionFile: 'File for the new version',
    file: 'File',
    earlierVersion: 'Previous version',
    sizeLimit: 'PDF, PNG or JPEG up to 3 MB. The original file is preserved.',
    checkingFile: 'Reading and checking the file…',
    selectedPreview: 'Selected file preview',
    downloadSelection: 'Download selected file to review it',
    reviewEntry: 'Review entry',
    saveDraft: 'Save private draft',
  },
};

const control = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50';
const button = 'min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';
export interface ClinicalEntryFormProps {
  correction?: ClinicalVersion | null; disabled?: boolean; readOnly?: boolean; historyId?: string; role?: 'patient' | 'doctor';
  onPrepare: (input: ClinicalIntent) => Promise<ClinicalOperation>; onCancel: () => void;
  initialPayload?: ClinicalDraftPayload; disablePrescriptionLookup?: boolean; onSaveDraft?: (payload: ClinicalDraftPayload) => Promise<unknown>;
}
/** Review is local. Preparation encrypts a saved intent; confirmation signs it in the operation panel. */
export function ClinicalEntryForm({ correction = null, disabled = false, readOnly = false, historyId, role = 'patient', onPrepare, onCancel, initialPayload, onSaveDraft, disablePrescriptionLookup = false }: ClinicalEntryFormProps) {
  const language = usePortalLanguage();
  const copy = entryCopy[language];
  const id = useId();
  const [kind, setKind] = useState<'note' | 'file'>(initialPayload?.file || correction && !correction.note ? 'file' : 'note');
  const [title, setTitle] = useState(initialPayload?.note?.title ?? correction?.note?.title ?? '');
  const [text, setText] = useState(initialPayload?.note?.text ?? correction?.note?.text ?? '');
  const [date, setDate] = useState(initialPayload?.note?.eventDate ?? correction?.note?.eventDate ?? '');
  const linkedPrescriptionId = (initialPayload?.note?.prescriptionId ?? correction?.note?.prescriptionId ?? '').toLowerCase();
  const [allPrescriptions, setAllPrescriptions] = useState(!linkedPrescriptionId);
  const selectedPrescriptionId = allPrescriptions ? undefined : linkedPrescriptionId || undefined;
  const prescriptionScope = JSON.stringify([historyId ?? null, selectedPrescriptionId ?? null]);
  const [verifiedPrescriptionScope, setVerifiedPrescriptionScope] = useState<string | null>(null);
  const [prescriptionsOpen, setPrescriptionsOpen] = useState(!!(initialPayload?.note?.prescriptionId || correction?.note?.prescriptionId));
  const [prescriptionId, setPrescriptionId] = useState(linkedPrescriptionId);
  const [prescriptions, setPrescriptions] = useState<ClinicalPrescriptionReference[]>([]);
  const [prescriptionsLoading, setPrescriptionsLoading] = useState(true);
  const [prescriptionFailure, setPrescriptionFailure] = useState<{ failure: unknown } | null>(null);
  const prescriptionsError = prescriptionFailure ? formError(prescriptionFailure.failure, copy.prescriptionsFailed) : '';
  const [prescriptionRevision, setPrescriptionRevision] = useState(0);
  const [file, setFile] = useState<ClinicalFile | null>(initialPayload?.file ?? null);
  const [fileSize, setFileSize] = useState(initialPayload?.file ? atob(initialPayload.file.base64).length : 0);
  const [preview, setPreview] = useState('');
  const [review, setReview] = useState(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const lock = useRef(false);
  const url = useRef('');
  const upload = useRef<AbortController | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const initialHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true; initialHeading.current?.focus();
    if (initialPayload?.file && typeof URL.createObjectURL === 'function') {
      const bytes = Uint8Array.from(atob(initialPayload.file.base64), c => c.charCodeAt(0));
      url.current = URL.createObjectURL(new Blob([bytes], { type: initialPayload.file.mediaType })); setPreview(url.current);
    }
    return () => { alive.current = false; upload.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); };
  }, []);
  useEffect(() => {
    if (kind !== 'note' || !prescriptionsOpen || disablePrescriptionLookup) {
      setPrescriptions([]); setVerifiedPrescriptionScope(null); setPrescriptionsLoading(false); setPrescriptionFailure(null); return;
    }
    const abort = new AbortController(); let live = true;
    setPrescriptions([]); setVerifiedPrescriptionScope(null); setPrescriptionsLoading(true); setPrescriptionFailure(null);
    void readClinicalPrescriptions(historyId, abort.signal, selectedPrescriptionId).then(values => { if (live) { setPrescriptions(values); setVerifiedPrescriptionScope(prescriptionScope); } }).catch(failure => { if (live) setPrescriptionFailure({ failure }); }).finally(() => { if (live) setPrescriptionsLoading(false); });
    return () => { live = false; abort.abort(); };
  }, [historyId, selectedPrescriptionId, prescriptionScope, prescriptionRevision, prescriptionsOpen, kind, disablePrescriptionLookup]);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  function formError(failure: unknown, fallback: string) {
    return language === 'en' ? localizedClinicalError(failure, language, fallback) : failure instanceof Error ? failure.message : fallback;
  }
  async function selectFile(selected?: File) {
    upload.current?.abort(); const abort = new AbortController(); upload.current = abort;
    if (url.current) { URL.revokeObjectURL(url.current); url.current = ''; }
    setPreview(''); setFile(null); setFileSize(0); setError(''); setReview(false);
    if (!selected) { setReading(false); return; }
    setReading(true);
    try {
      const result = await readClinicalFile(selected, abort.signal);
      if (!alive.current || abort.signal.aborted) return;
      const nextUrl = URL.createObjectURL(selected); url.current = nextUrl;
      setFile(result); setFileSize(selected.size); setPreview(nextUrl);
    } catch (failure) {
      if (alive.current && !abort.signal.aborted) setError(formError(failure, copy.fileReadFailed));
    } finally { if (alive.current && !abort.signal.aborted) setReading(false); }
  }
  function intent(): ClinicalIntent {
    const version = correction ? { entryId: correction.entryId, expectedVersion: correction.version } : initialPayload?.entryId ? { entryId: initialPayload.entryId, expectedVersion: initialPayload.expectedVersion } : {};
    if (kind === 'file') {
      if (!file) throw new Error(copy.chooseFileFirst);
      return { action: 'append_version', ...version, file };
    }
    if (!title.trim() || title.length > 120 || !text.trim() || text.length > 20_000) throw new Error(copy.noteFields);
    if (date && (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error(copy.noteDateInvalid);
    if (prescriptionId && (verifiedPrescriptionScope !== prescriptionScope || prescriptionsLoading || prescriptionsError || !prescriptions.some(value => value.id === prescriptionId))) throw new Error(copy.prescriptionUnverified);
    return { action: 'append_version', ...version, note: { title: title.trim(), text: text.trim(), eventDate: date || null, ...(prescriptionId ? { prescriptionId } : {}) } };
  }
  async function saveDraft() {
    if (!onSaveDraft || lock.current || disabled || reading) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (kind === 'file' && !file) throw new Error(copy.draftFileRequired);
      const version = correction ? { entryId: correction.entryId, expectedVersion: correction.version } : initialPayload?.entryId ? { entryId: initialPayload.entryId, expectedVersion: initialPayload.expectedVersion } : {};
      await onSaveDraft({ ...version, ...(kind === 'file' ? { file: file! } : { note: { title, text, eventDate: date || null, ...(prescriptionId ? { prescriptionId } : {}) } }) });
    } catch (failure) { if (alive.current) setError(formError(failure, copy.saveDraftFailed)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function beginReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    try { intent(); setReview(true); } catch (failure) { setError(failure instanceof Error ? failure.message : copy.invalidFields); }
  }
  async function prepare() {
    if (lock.current || disabled || readOnly || reading) return;
    lock.current = true; setBusy(true); setError('');
    try { await onPrepare(intent()); }
    catch (failure) { if (alive.current) setError(formError(failure, copy.prepareFailed)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const unavailable = disabled || busy;
  return <section aria-labelledby={`${id}-heading`} className="rounded-2xl border border-sky-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 ref={initialHeading} tabIndex={-1} id={`${id}-heading`} className="text-lg font-semibold text-slate-900">{correction ? copy.correct : copy.add}</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">{readOnly && !onSaveDraft ? correction ? copy.correctionPreview : copy.entryPreview : correction ? copy.nextVersion(correction.version + 1) : role === 'doctor' ? copy.doctorContribution : copy.patientContribution}</p></div>
      <button type="button" disabled={busy} onClick={onCancel} className={`${button} border border-slate-200 text-slate-600`}>{copy.close}</button>
    </div>
    {readOnly && !onSaveDraft && <p id={`${id}-draft-mode`} role="status" className="mt-4 rounded-xl bg-sky-50 p-3 text-sm leading-relaxed text-sky-900">{copy.temporaryDraft}</p>}
    {onSaveDraft && <p role="status" className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">{copy.privateDraft}</p>}
    {review ? <div className="mt-5 space-y-4">
      <h3 ref={reviewHeading} tabIndex={-1} className="text-base font-semibold text-slate-900 outline-none">{readOnly ? copy.reviewDraft : copy.reviewForSignature}</h3>
      {kind === 'note' ? <div className="rounded-xl bg-sky-50 p-4 text-slate-800"><p className="break-words font-semibold">{title.trim()}</p>{date && <p className="mt-2 text-sm">{copy.eventDate}: {date}</p>}<p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{text.trim()}</p></div> : <div className="rounded-xl bg-sky-50 p-4"><p className="break-all font-semibold text-slate-800">{file?.fileName}</p><p className="mt-2 text-sm text-slate-600">{formatClinicalFileSize(fileSize, language)} · {file?.mediaType === 'application/pdf' ? 'PDF' : copy.image}</p></div>}
      {kind === 'note' && prescriptionId && <p className="text-sm text-slate-700">{copy.linkedPrescription(prescriptions.find(value => value.id === prescriptionId)?.rxId ?? prescriptionId)}</p>}
      <p className="text-sm leading-relaxed text-slate-600">{readOnly ? onSaveDraft ? copy.privateDraftReview : copy.readOnlyReview : copy.signatureReview}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="button" disabled={unavailable} onClick={() => setReview(false)} className={`${button} border border-slate-200 text-slate-700`}>{copy.edit}</button>
        <button type="button" disabled={unavailable || readOnly} aria-describedby={readOnly ? `${id}-draft-mode` : undefined} onClick={() => void prepare()} className={`${button} bg-sky-700 text-white hover:bg-sky-800`}>{busy ? copy.preparing : copy.prepare}</button>
      </div>
    </div> : <form onSubmit={beginReview} className="mt-5 space-y-5">
      {!correction && <fieldset disabled={unavailable} className="flex flex-wrap gap-4"><legend className="mb-2 text-sm font-medium text-slate-700">{copy.entryKind}</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="radio" name={`${id}-kind`} value="note" checked={kind === 'note'} onChange={() => setKind('note')} className="h-4 w-4 accent-sky-700" />{copy.note}</label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="radio" name={`${id}-kind`} value="file" checked={kind === 'file'} onChange={() => setKind('file')} className="h-4 w-4 accent-sky-700" />{copy.pdfOrImage}</label>
      </fieldset>}
      {kind === 'note' ? <>
        <div><label htmlFor={`${id}-title`} className="mb-2 block text-sm font-medium text-slate-700">{copy.title}</label><input id={`${id}-title`} required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} disabled={unavailable} className={control} /></div>
        <div><label htmlFor={`${id}-text`} className="mb-2 block text-sm font-medium text-slate-700">{copy.noteBody}</label><textarea id={`${id}-text`} required maxLength={20_000} rows={5} value={text} onChange={event => setText(event.target.value)} disabled={unavailable} className={`${control} resize-y`} /></div>
        <div className="max-w-sm"><label htmlFor={`${id}-date`} className="mb-2 block text-sm font-medium text-slate-700">{copy.eventDate} <span className="font-normal">{copy.optional}</span></label><input id={`${id}-date`} type="date" value={date} onChange={event => setDate(event.target.value)} disabled={unavailable} className={control} /></div>
        {!prescriptionsOpen && <button type="button" disabled={unavailable} onClick={() => setPrescriptionsOpen(true)} className={`${button} border border-sky-200 text-sky-800`}>{copy.linkPrescription}</button>}
        {prescriptionsOpen && <div><label htmlFor={`${id}-prescription`} className="mb-2 block text-sm font-medium text-slate-700">{copy.existingPrescription} <span className="font-normal">{copy.optional}</span></label><select id={`${id}-prescription`} value={prescriptionId} onChange={event => setPrescriptionId(event.target.value)} disabled={unavailable || prescriptionsLoading} className={control}><option value="">{copy.noPrescription}</option>{prescriptionId && !prescriptions.some(value => value.id === prescriptionId) && <option value={prescriptionId}>{copy.oldPrescriptionUnverified}</option>}{prescriptions.map(value => <option key={value.id} value={value.id}>{value.rxId ? copy.prescriptionNumber(value.rxId) : copy.preparedDocument} · {copy.consultation} {value.appointmentId} · {prescriptionLabel(value, language)}</option>)}</select><p className="mt-2 text-sm text-slate-500">{copy.prescriptionExplanation}</p>{prescriptionsLoading && <p role="status" className="mt-2 text-sm text-slate-600">{copy.checkingPrescriptions}</p>}{prescriptionsError && <p role="alert" className="mt-2 text-sm text-rose-800">{prescriptionsError} <button type="button" onClick={() => setPrescriptionRevision(value => value + 1)} className="min-h-11 font-semibold underline">{copy.recheck}</button></p>}{linkedPrescriptionId && !disablePrescriptionLookup && <button type="button" disabled={unavailable || prescriptionsLoading} onClick={() => { setAllPrescriptions(value => !value); setReview(false); if (allPrescriptions) setPrescriptionId(linkedPrescriptionId); }} className="mt-2 min-h-11 text-sm font-semibold text-sky-800 underline">{allPrescriptions ? copy.backToLinked : copy.otherPrescriptions}</button>}</div>}
      </> : <div className="space-y-3">
        <label htmlFor={`${id}-file`} className="block text-sm font-medium text-slate-700">{correction ? copy.newVersionFile : copy.file}</label>
        {correction && <p className="break-all text-sm text-slate-600">{copy.earlierVersion}: {correction.fileName}</p>}
        <input id={`${id}-file`} type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" disabled={unavailable} onChange={event => void selectFile(event.target.files?.[0])} aria-describedby={`${id}-limit`} className={`${control} file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-800`} />
        <p id={`${id}-limit`} className="text-sm leading-relaxed text-slate-500">{copy.sizeLimit}</p>
        {reading && <p role="status" className="text-sm text-sky-800">{copy.checkingFile}</p>}
        {file && <div className="space-y-3 rounded-xl border border-slate-200 p-4"><p className="break-all text-sm font-medium text-slate-800">{file.fileName}</p><p className="text-sm text-slate-600">{formatClinicalFileSize(fileSize, language)}</p>
          {file.mediaType !== 'application/pdf' && preview && <img src={preview} alt={copy.selectedPreview} className="max-h-64 max-w-full rounded-lg object-contain" />}
          {preview && <a href={preview} download={file.fileName} className="inline-flex min-h-11 items-center text-sm font-semibold text-sky-800 underline focus-visible:outline-2 focus-visible:outline-sky-600">{copy.downloadSelection}</a>}
        </div>}
      </div>}
      <button type="submit" disabled={unavailable || reading || kind === 'file' && !file} className={`${button} w-full bg-sky-700 text-white hover:bg-sky-800 sm:w-auto`}>{copy.reviewEntry}</button>
    </form>}
    {onSaveDraft && <button type="button" disabled={unavailable || reading || kind === 'file' && !file} onClick={() => void saveDraft()} className={button + ' mt-4 border border-sky-200 text-sky-800'}>{copy.saveDraft}</button>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm leading-relaxed text-rose-800">{error}</p>}
  </section>;
}
