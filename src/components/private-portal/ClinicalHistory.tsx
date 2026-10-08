'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { ClinicalGrant, ClinicalOperation, ClinicalVersion } from '@/types/clinical';
import { usePortalWallet } from './WalletBoundary';
import { localDate, appointmentDate } from './client';
import { ReceiptLink } from './Operation';
import { ClinicalEntryForm } from './ClinicalEntryForm';
import { readClinicalDownload, useClinicalOperation, useClinicalSnapshot, type ClinicalIntent } from './clinical-client';

const button = 'min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';
const labels: Record<ClinicalOperation['state'], string> = { awaiting_signature: 'Pendiente de tu firma', submitted: 'Enviado; confirmación pendiente', confirmed: 'Confirmado en Stellar Testnet', failed: 'No se confirmó el cambio', cancelled: 'Firma cancelada' };
const actionLabels: Record<ClinicalOperation['action'], string> = { create_history: 'Crear mi historial', append_version: 'Guardar aporte', set_permissions: 'Actualizar permisos' };
export interface ClinicalPermissionsProps {
  grants: ClinicalGrant[]; disabled: boolean; onPrepare: (input: ClinicalIntent) => Promise<ClinicalOperation>;
}
export interface ClinicalHistoryProps { renderPermissions?: (props: ClinicalPermissionsProps) => ReactNode }

function ClinicalDownload({ entry, onUnavailable }: { entry: ClinicalVersion; onUnavailable: () => void }) {
  const [readyUrl, setReadyUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = useRef('');
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const revokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current?.abort(); if (revokeTimer.current) clearTimeout(revokeTimer.current); if (url.current) URL.revokeObjectURL(url.current); };
  }, []);
  useEffect(() => { if (readyUrl) link.current?.focus(); }, [readyUrl]);
  async function prepareDownload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setReadyUrl('');
    if (url.current) { URL.revokeObjectURL(url.current); url.current = ''; }
    const abort = new AbortController(); request.current = abort;
    try {
      const blob = await readClinicalDownload(entry.entryId, entry.version, abort.signal);
      if (!alive.current || abort.signal.aborted) return;
      const next = URL.createObjectURL(blob); url.current = next; setReadyUrl(next);
    } catch (failure) {
      if (alive.current && !abort.signal.aborted) { setError(failure instanceof Error ? failure.message : 'No pudimos verificar el archivo.'); onUnavailable(); }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function downloaded() {
    revokeTimer.current = setTimeout(() => {
      if (url.current) URL.revokeObjectURL(url.current); url.current = '';
      if (alive.current) setReadyUrl('');
    }, 1500);
  }
  return <div className="mt-3 space-y-2">
    {readyUrl ? <a ref={link} href={readyUrl} download={entry.fileName} onClick={downloaded} className="inline-flex min-h-11 max-w-full items-center break-all rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 underline focus-visible:outline-2 focus-visible:outline-sky-600">Descargar {entry.fileName}</a> :
      <button type="button" disabled={busy} onClick={() => void prepareDownload()} className={`${button} border border-sky-200 bg-sky-50 text-sky-800`}>{busy ? 'Comprobando archivo…' : 'Preparar descarga privada'}</button>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
  </div>;
}
function VersionContent({ entry, onUnavailable }: { entry: ClinicalVersion; onUnavailable: () => void }) {
  return <div className="min-w-0">
    <h3 className="break-words font-semibold text-slate-900">{entry.title}</h3>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="rounded-lg bg-sky-50 px-2.5 py-1 font-medium text-sky-800">{entry.source === 'patient' ? 'Aportado por ti' : 'Registrado por médico'}</span><span className="text-slate-500">Versión {entry.version}</span></div>
    <p className="mt-2 text-sm text-slate-500">Registrado: {localDate(entry.createdAt)} · Hora de Chile</p>
    {entry.note ? <><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{entry.note.text}</p>{entry.note.eventDate && <p className="mt-3 text-sm text-slate-500">Fecha del antecedente: {appointmentDate(entry.note.eventDate)}</p>}</> :
      <><p className="mt-3 break-all text-sm text-slate-600">Archivo {entry.mediaType === 'application/pdf' ? 'PDF' : 'de imagen'}: {entry.fileName}</p><ClinicalDownload entry={entry} onUnavailable={onUnavailable} /></>}
    <ReceiptLink hash={entry.transactionHash} />
    {entry.source === 'doctor' && <details className="mt-2 text-sm text-slate-500"><summary className="flex min-h-11 cursor-pointer items-center font-medium focus-visible:outline-2 focus-visible:outline-sky-600">Identificador del autor</summary><p className="break-all pb-2">{entry.author}</p></details>}
  </div>;
}
export function ClinicalHistory({ renderPermissions }: ClinicalHistoryProps = {}) {
  const { ready, authenticated, user } = usePrivy();
  const wallet = usePortalWallet();
  const identity = ready && authenticated && user?.id ? `${user.id}:${wallet.walletId}:${wallet.address}` : '';
  const snapshot = useClinicalSnapshot(identity);
  const operation = useClinicalOperation(identity);
  const [editing, setEditing] = useState<ClinicalVersion | 'new' | null>(null);
  const [filter, setFilter] = useState('all');
  const [actionError, setActionError] = useState('');
  const [signReview, setSignReview] = useState(false);
  const [preparedFocus, setPreparedFocus] = useState<{ identity: string; operationId: string } | null>(null);
  const lastRefresh = useRef('');
  const signButton = useRef<HTMLButtonElement>(null);
  const formOpener = useRef<HTMLButtonElement | null>(null);
  const signHeading = useRef<HTMLHeadingElement>(null);
  const operationHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (signReview) signHeading.current?.focus(); }, [signReview]);
  useEffect(() => { setEditing(null); setFilter('all'); setActionError(''); setSignReview(false); setPreparedFocus(null); lastRefresh.current = ''; }, [identity]);
  useEffect(() => {
    if (!preparedFocus) return;
    if (preparedFocus.identity !== identity || operation.accessLost) { setPreparedFocus(null); return; }
    if (operation.busy || operation.operation?.id !== preparedFocus.operationId) return;
    const heading = operationHeading.current;
    if (!heading) return;
    setPreparedFocus(null);
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'center' });
  }, [preparedFocus, identity, operation.operation?.id, operation.busy, operation.accessLost]);
  useEffect(() => {
    const current = operation.operation;
    if (current && ['confirmed', 'cancelled', 'failed'].includes(current.state) && lastRefresh.current !== `${current.id}:${current.state}`) {
      lastRefresh.current = `${current.id}:${current.state}`; setEditing(null); setSignReview(false); snapshot.refresh();
    }
  }, [operation.operation?.id, operation.operation?.state, snapshot.refresh]);
  const data = operation.accessLost ? null : snapshot.data;
  const pending = data?.operations.filter(op => ['awaiting_signature', 'submitted'].includes(op.state)) ?? [];
  const blocked = snapshot.loading || !!snapshot.error || !data || operation.busy || operation.uncertain || operation.accessLost;
  const newBlocked = blocked || pending.length > 0 || !!operation.operation && ['awaiting_signature', 'submitted'].includes(operation.operation.state);
  async function prepare(input: ClinicalIntent) {
    const result = await operation.controller.prepare(input);
    setEditing(null); setSignReview(false); setActionError('');
    setPreparedFocus({ identity, operationId: result.id }); return result;
  }
  async function act(action: 'sign' | 'cancel' | 'check' | 'retry' | 'prepareSaved') {
    setActionError('');
    try { await operation.controller[action](); setSignReview(false); }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : 'No pudimos comprobar el resultado.'); }
  }
  const groups = new Map<string, ClinicalVersion[]>();
  for (const entry of data?.entries ?? []) groups.set(entry.entryId, [...(groups.get(entry.entryId) ?? []), entry]);
  const chronology = [...groups.values()].map(versions => versions.sort((a, b) => b.version - a.version)).sort((a, b) => b[0].createdAt - a[0].createdAt);
  const shown = chronology.filter(([head]) => filter === 'all' || filter === 'notes' && !!head.note || filter === 'files' && !head.note || filter === 'mine' && head.source === 'patient' || filter === 'doctor' && head.source === 'doctor');
  const current = operation.operation;
  if (!identity) return <p role="status" className="text-sm text-slate-600">Ingresa con Privy para abrir tu historial privado.</p>;
  return <section key={identity} className="space-y-5 pb-4" aria-labelledby="clinical-history-title">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 id="clinical-history-title" className="text-2xl font-semibold tracking-tight text-slate-900">Mi historial privado</h1><p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">Tus antecedentes y archivos, con su autor y sus versiones. Tú decides los permisos de los médicos.</p></div>
      <button type="button" disabled={snapshot.loading || operation.busy} onClick={snapshot.refresh} className={`${button} border border-slate-200 bg-white text-slate-700`}>{snapshot.loading ? 'Consultando…' : 'Actualizar'}</button>
    </header>
    {(snapshot.error || operation.accessLost) && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm leading-relaxed text-rose-800">{operation.accessLost ? operation.error : snapshot.error}<p className="mt-2">No mostramos información anterior como verificada. {operation.accessLost ? 'Vuelve a ingresar con Privy antes de continuar.' : 'Puedes actualizar para volver a comprobar el historial.'}</p></div>}
    {snapshot.loading && <p role="status" className="rounded-xl bg-sky-50 p-4 text-sm text-sky-800">Comprobando acceso, versiones y recibos…</p>}
    {current || operation.uncertain ? <section aria-label="Intento clínico actual" className={`space-y-3 rounded-xl border p-4 ${current?.state === 'confirmed' ? 'border-emerald-200 bg-emerald-50' : 'border-sky-200 bg-sky-50'}`}>
      <h2 ref={operationHeading} tabIndex={-1} className="font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{current ? `${actionLabels[current.action]} · ${labels[current.state]}` : 'Preparación sin resultado comprobado'}</h2>
      {operation.uncertain && <p className="text-sm leading-relaxed text-slate-700">No recibimos un resultado verificable. Consultaremos el mismo intento; no prepares ni firmes otro.</p>}
      {current?.state === 'submitted' && <p className="text-sm leading-relaxed text-slate-700">El cambio sigue pendiente. Puedes recargar y consultar este mismo intento; todavía no está confirmado.</p>}
      {current?.state === 'awaiting_signature' && !operation.canSign && <p className="text-sm leading-relaxed text-slate-700">Este intento se recuperó sin su revisión de contenido. Puedes consultar su estado o cancelar la firma pendiente.</p>}
      {(operation.error || actionError) && <p role="alert" className="text-sm leading-relaxed text-rose-800">{operation.error || actionError}</p>}
      {current && <ReceiptLink hash={current.transactionHash} />}
      <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
        {(operation.uncertain || current && ['awaiting_signature', 'submitted'].includes(current.state)) && <button type="button" disabled={operation.busy || operation.accessLost} onClick={() => void act('check')} className={`${button} border border-sky-200 bg-white text-sky-800`}>Consultar confirmación</button>}
        {!current && operation.uncertain && <button type="button" disabled={operation.busy} onClick={() => void act('prepareSaved')} className={`${button} border border-sky-200 bg-white text-sky-800`}>Retomar la misma preparación</button>}
        {current?.state === 'submitted' && !operation.uncertain && <button type="button" disabled={operation.busy} onClick={() => void act('retry')} className={`${button} border border-sky-200 bg-white text-sky-800`}>Reintentar envío del mismo intento</button>}
        {current?.state === 'awaiting_signature' && !operation.uncertain && <>
          {operation.canSign && <button ref={signButton} type="button" disabled={operation.busy || blocked} onClick={() => setSignReview(true)} className={`${button} bg-sky-700 text-white`}>Revisar confirmación</button>}
          <button type="button" disabled={operation.busy} onClick={() => void act('cancel')} className={`${button} border border-slate-200 bg-white text-slate-700`}>Cancelar firma pendiente</button>
        </>}
      </div>
      {signReview && current?.state === 'awaiting_signature' && <div onKeyDown={event => { if (event.key === "Escape" && !operation.busy) { setSignReview(false); signButton.current?.focus(); } }} className="space-y-3 border-t border-sky-200 pt-4">
        <h2 ref={signHeading} tabIndex={-1} className="font-semibold text-slate-900">{actionLabels[current.action]}</h2><p className="text-sm leading-relaxed text-slate-700">Confirmarás {current.action === 'create_history' ? 'la creación de tu historial' : current.action === 'set_permissions' ? 'los permisos que acabas de revisar' : 'el aporte que acabas de revisar'} con tu cuenta Privy. TrustLeaf cubre la comisión. Espera el recibo antes de considerar el cambio guardado.</p>
        <div className="flex flex-col gap-3 sm:flex-row"><button type="button" disabled={operation.busy || blocked} onClick={() => void act('sign')} className={`${button} bg-sky-700 text-white`}>{operation.busy ? 'Confirmando…' : 'Confirmar con mi cuenta Privy'}</button><button type="button" disabled={operation.busy} onClick={() => { setSignReview(false); signButton.current?.focus(); }} className={`${button} border border-sky-200 bg-white text-sky-800`}>Volver</button></div>
      </div>}
    </section> : null}
    {data && !data.history && <section className="rounded-2xl border border-sky-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-slate-900">Comienza tu historial</h2><p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">Crea tu espacio privado para agregar antecedentes y archivos. El contenido clínico permanece cifrado; Stellar registra los permisos y comprobantes.</p><button type="button" disabled={newBlocked} onClick={() => void prepare({ action: 'create_history' }).catch(failure => setActionError(failure.message))} className={`${button} mt-4 bg-sky-700 text-white`}>Preparar mi historial</button></section>}
    {data?.history && <>
      <div className="flex flex-wrap items-end justify-between gap-4"><label className="block min-w-0 flex-1 text-sm font-medium text-slate-700" htmlFor="clinical-filter">Mostrar<select id="clinical-filter" value={filter} onChange={event => setFilter(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-600 sm:max-w-xs"><option value="all">Todo el historial</option><option value="mine">Mis aportes</option><option value="doctor">Aportes médicos</option><option value="notes">Antecedentes escritos</option><option value="files">PDF e imágenes</option></select></label><button type="button" disabled={newBlocked} onClick={event => { formOpener.current = event.currentTarget; setEditing('new'); }} className={`${button} w-full bg-sky-700 text-white sm:w-auto`}>Agregar antecedente o archivo</button></div>
      {editing && !operation.accessLost && <ClinicalEntryForm key={typeof editing === 'string' ? 'new' : `${editing.entryId}:${editing.version}`} correction={editing === 'new' ? null : editing} disabled={newBlocked} onPrepare={prepare} onCancel={() => { setEditing(null); formOpener.current?.focus(); }} />}
      <p className="text-sm text-slate-500">Contenido y recibos comprobados: {new Date(data.verifiedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} · Hora de Chile</p>
      {shown.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">{chronology.length ? 'No hay aportes en este filtro. Puedes elegir «Todo el historial».' : 'Aún no hay antecedentes ni archivos. Agrega tu primer aporte cuando quieras.'}</div>}
      <ol aria-label="Cronología de antecedentes" className="space-y-4">
        {shown.map(([head, ...previous]) => <li key={head.entryId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><VersionContent entry={head} onUnavailable={snapshot.refresh} />
          {head.canCorrect && head.source === 'patient' && <button type="button" disabled={newBlocked} onClick={event => { formOpener.current = event.currentTarget; setEditing(head); }} className={`${button} mt-3 border border-sky-200 text-sky-800`}>Corregir mi aporte</button>}
          {previous.length > 0 && <details className="mt-3 border-t border-slate-100 pt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600">Ver {previous.length} {previous.length === 1 ? 'versión anterior' : 'versiones anteriores'}</summary><div className="mt-2 space-y-5 border-l-2 border-sky-100 pl-4">{previous.map(entry => <VersionContent key={entry.version} entry={entry} onUnavailable={snapshot.refresh} />)}</div></details>}
        </li>)}
      </ol>
      {renderPermissions?.({ grants: data.grants, disabled: newBlocked, onPrepare: prepare })}
    </>}
    {pending.filter(op => op.id !== current?.id).map(op => <section key={op.id} className="rounded-xl border border-sky-200 bg-sky-50 p-4"><p className="text-sm font-semibold text-slate-800">{actionLabels[op.action]} · {labels[op.state]}</p><button type="button" disabled={operation.busy || operation.uncertain} onClick={() => { operation.controller.reopen(op); setSignReview(false); }} className={`${button} mt-3 border border-sky-200 bg-white text-sky-800`}>Consultar intento pendiente</button></section>)}
    {actionError && !current && !operation.uncertain && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
    <p className="max-w-prose text-xs leading-relaxed text-slate-500">Demostración en Stellar Testnet con datos sintéticos. Los aportes del paciente se distinguen de los registros médicos. Retirar un permiso bloquea accesos posteriores; no elimina copias ya descargadas.</p>
  </section>;
}
