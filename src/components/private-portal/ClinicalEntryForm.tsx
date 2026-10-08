'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { ClinicalFile, ClinicalOperation, ClinicalVersion } from '@/types/clinical';
import { readClinicalFile, type ClinicalIntent } from './clinical-client';

const control = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50';
const button = 'min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';
export interface ClinicalEntryFormProps {
  correction?: ClinicalVersion | null; disabled?: boolean;
  onPrepare: (input: ClinicalIntent) => Promise<ClinicalOperation>; onCancel: () => void;
}
/** Review is local. Preparation encrypts a saved intent; confirmation signs it in the operation panel. */
export function ClinicalEntryForm({ correction = null, disabled = false, onPrepare, onCancel }: ClinicalEntryFormProps) {
  const id = useId();
  const [kind, setKind] = useState<'note' | 'file'>(correction && !correction.note ? 'file' : 'note');
  const [title, setTitle] = useState(correction?.note?.title ?? '');
  const [text, setText] = useState(correction?.note?.text ?? '');
  const [date, setDate] = useState(correction?.note?.eventDate ?? '');
  const [file, setFile] = useState<ClinicalFile | null>(null);
  const [fileSize, setFileSize] = useState(0);
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
    return () => { alive.current = false; upload.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); };
  }, []);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
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
      if (alive.current && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'No pudimos leer el archivo.');
    } finally { if (alive.current && !abort.signal.aborted) setReading(false); }
  }
  function intent(): ClinicalIntent {
    const version = correction ? { entryId: correction.entryId, expectedVersion: correction.version } : {};
    if (kind === 'file') {
      if (!file) throw new Error('Selecciona y revisa un archivo antes de continuar.');
      return { action: 'append_version', ...version, file };
    }
    if (!title.trim() || title.length > 120 || !text.trim() || text.length > 20_000) throw new Error('Agrega un título y el contenido del antecedente.');
    if (date && (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Revisa la fecha del antecedente.');
    return { action: 'append_version', ...version, note: { title: title.trim(), text: text.trim(), eventDate: date || null } };
  }
  function beginReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    try { intent(); setReview(true); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Revisa los campos.'); }
  }
  async function prepare() {
    if (lock.current || disabled || reading) return;
    lock.current = true; setBusy(true); setError('');
    try { await onPrepare(intent()); }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'No se pudo preparar el antecedente.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const unavailable = disabled || busy;
  return <section aria-labelledby={`${id}-heading`} className="rounded-2xl border border-sky-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 ref={initialHeading} tabIndex={-1} id={`${id}-heading`} className="text-lg font-semibold text-slate-900">{correction ? 'Corregir mi aporte' : 'Agregar al historial'}</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">{correction ? `Crearemos la versión ${correction.version + 1}. Las versiones anteriores permanecerán guardadas.` : 'Agrega información que quieras conservar. Tus aportes se identifican como información declarada por ti.'}</p></div>
      <button type="button" disabled={busy} onClick={onCancel} className={`${button} border border-slate-200 text-slate-600`}>Cerrar</button>
    </div>
    {review ? <div className="mt-5 space-y-4">
      <h3 ref={reviewHeading} tabIndex={-1} className="text-base font-semibold text-slate-900 outline-none">Revisa antes de preparar la firma</h3>
      {kind === 'note' ? <div className="rounded-xl bg-sky-50 p-4 text-slate-800"><p className="break-words font-semibold">{title.trim()}</p>{date && <p className="mt-2 text-sm">Fecha del antecedente: {date}</p>}<p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{text.trim()}</p></div> : <div className="rounded-xl bg-sky-50 p-4"><p className="break-all font-semibold text-slate-800">{file?.fileName}</p><p className="mt-2 text-sm text-slate-600">{(fileSize / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} MB · {file?.mediaType === 'application/pdf' ? 'PDF' : 'Imagen'}</p></div>}
      <p className="text-sm leading-relaxed text-slate-600">El contenido quedará cifrado en el almacenamiento privado. Después confirmarás con tu cuenta Privy; el comprobante del cambio se registrará en Stellar Testnet.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="button" disabled={unavailable} onClick={() => setReview(false)} className={`${button} border border-slate-200 text-slate-700`}>Volver a editar</button>
        <button type="button" disabled={unavailable} onClick={() => void prepare()} className={`${button} bg-sky-700 text-white hover:bg-sky-800`}>{busy ? 'Preparando…' : 'Preparar firma'}</button>
      </div>
    </div> : <form onSubmit={beginReview} className="mt-5 space-y-5">
      {!correction && <fieldset disabled={unavailable} className="flex flex-wrap gap-4"><legend className="mb-2 text-sm font-medium text-slate-700">Qué quieres agregar</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="radio" name={`${id}-kind`} value="note" checked={kind === 'note'} onChange={() => setKind('note')} className="h-4 w-4 accent-sky-700" />Antecedente escrito</label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="radio" name={`${id}-kind`} value="file" checked={kind === 'file'} onChange={() => setKind('file')} className="h-4 w-4 accent-sky-700" />PDF o imagen</label>
      </fieldset>}
      {kind === 'note' ? <>
        <div><label htmlFor={`${id}-title`} className="mb-2 block text-sm font-medium text-slate-700">Título</label><input id={`${id}-title`} required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} disabled={unavailable} className={control} /></div>
        <div><label htmlFor={`${id}-text`} className="mb-2 block text-sm font-medium text-slate-700">Antecedente</label><textarea id={`${id}-text`} required maxLength={20_000} rows={5} value={text} onChange={event => setText(event.target.value)} disabled={unavailable} className={`${control} resize-y`} /></div>
        <div className="max-w-sm"><label htmlFor={`${id}-date`} className="mb-2 block text-sm font-medium text-slate-700">Fecha del antecedente <span className="font-normal">(opcional)</span></label><input id={`${id}-date`} type="date" value={date} onChange={event => setDate(event.target.value)} disabled={unavailable} className={control} /></div>
      </> : <div className="space-y-3">
        <label htmlFor={`${id}-file`} className="block text-sm font-medium text-slate-700">{correction ? 'Archivo de la nueva versión' : 'Archivo'}</label>
        {correction && <p className="break-all text-sm text-slate-600">Versión anterior: {correction.fileName}</p>}
        <input id={`${id}-file`} type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" disabled={unavailable} onChange={event => void selectFile(event.target.files?.[0])} aria-describedby={`${id}-limit`} className={`${control} file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-800`} />
        <p id={`${id}-limit`} className="text-sm leading-relaxed text-slate-500">PDF, PNG o JPEG de hasta 3 MB. No reduciremos su tamaño ni cambiaremos su contenido automáticamente.</p>
        {reading && <p role="status" className="text-sm text-sky-800">Leyendo y comprobando el archivo…</p>}
        {file && <div className="space-y-3 rounded-xl border border-slate-200 p-4"><p className="break-all text-sm font-medium text-slate-800">{file.fileName}</p><p className="text-sm text-slate-600">{(fileSize / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} MB</p>
          {file.mediaType !== 'application/pdf' && preview && <img src={preview} alt="Vista previa del archivo seleccionado" className="max-h-64 max-w-full rounded-lg object-contain" />}
          {preview && <a href={preview} download={file.fileName} className="inline-flex min-h-11 items-center text-sm font-semibold text-sky-800 underline focus-visible:outline-2 focus-visible:outline-sky-600">Descargar selección para revisarla</a>}
        </div>}
      </div>}
      <button type="submit" disabled={unavailable || reading || kind === 'file' && !file} className={`${button} w-full bg-sky-700 text-white hover:bg-sky-800 sm:w-auto`}>Revisar antecedente</button>
    </form>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm leading-relaxed text-rose-800">{error}</p>}
  </section>;
}
