'use client';
import { useId, useRef, useState } from 'react';
import type { ClinicalGrant, ClinicalPrepareRequest } from '@/types/clinical';
import { clinicalPermissionCanReview, clinicalPermissionChange, clinicalPermissionError,
  clinicalPermissionKey, initialClinicalPermissionDraft } from './clinical-permission-state';

type PreparePermission = (input: Omit<ClinicalPrepareRequest, 'requestId'>) => Promise<unknown>;
export interface ClinicalPermissionsProps { grants: ClinicalGrant[]; disabled: boolean; onPrepare: PreparePermission }
const controlClass = 'min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';

function ClinicalDoctorPermission({ grant, disabled, onPrepare }: { grant: ClinicalGrant; disabled: boolean; onPrepare: PreparePermission }) {
  const [draft, setDraft] = useState(() => initialClinicalPermissionDraft(grant));
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const flight = useRef(false), id = useId();
  const busy = disabled || preparing;
  const canReview = clinicalPermissionCanReview(grant, draft);
  const shortAddress = `${grant.address.slice(0, 8)}…${grant.address.slice(-8)}`;
  const withdrawalIncomplete = !grant.authorized && (draft.canRead || draft.canAppend);
  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || flight.current || !canReview) return;
    flight.current = true; setPreparing(true); setError(null); setNotice(null);
    try {
      // The parent owns explicit confirmation and the signature. This form only
      // prepares a change and never changes the observed permission labels.
      await onPrepare(clinicalPermissionChange(grant, draft));
      setNotice('Revisa el cambio y firma para confirmarlo.');
    } catch (failure) { setError(clinicalPermissionError(failure)); }
    finally { flight.current = false; setPreparing(false); }
  }
  return <form onSubmit={review} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words font-semibold text-slate-900">{grant.doctorName}</h3>
        <p className="mt-1 break-all text-xs text-slate-500" title={grant.address}>
          <span aria-hidden="true">Wallet: {shortAddress}</span><span className="sr-only">Wallet del médico: {grant.address}</span>
        </p>
      </div>
      <span className={`max-w-full rounded-full px-3 py-1 text-xs font-medium ${grant.authorized ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800'}`}>
        {grant.authorized ? 'Autorización vigente' : 'Sin autorización vigente'}
      </span>
    </div>
    <p className="text-sm leading-6 text-slate-600" id={`${id}-observed`}>
      Permisos consultados: lectura <strong>{grant.canRead ? 'concedida' : 'sin conceder'}</strong>; agregado <strong>{grant.canAppend ? 'concedido' : 'sin conceder'}</strong>.
    </p>
    <fieldset disabled={busy} aria-describedby={`${id}-observed ${id}-help`} className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-slate-900">Elegir permisos para {grant.doctorName}</legend>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200">
        <input type="checkbox" checked={draft.canRead} disabled={busy || (!grant.authorized && !draft.canRead)}
          onChange={event => { setDraft(current => ({ ...current, canRead: event.target.checked })); setError(null); setNotice(null); }}
          className="mt-1 h-4 w-4 shrink-0 accent-sky-600" />
        <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">Leer mi historial</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">Consultar antecedentes y abrir sus archivos privados.</span></span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200">
        <input type="checkbox" checked={draft.canAppend} disabled={busy || (!grant.authorized && !draft.canAppend)}
          onChange={event => { setDraft(current => ({ ...current, canAppend: event.target.checked })); setError(null); setNotice(null); }}
          className="mt-1 h-4 w-4 shrink-0 accent-sky-600" />
        <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">Agregar información</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">Añadir sus propios aportes; no editar lo que tú agregaste.</span></span>
      </label>
    </fieldset>
    <p id={`${id}-help`} className="text-xs leading-5 text-slate-500">
      {!grant.authorized ? withdrawalIncomplete ? 'Puedes retirar los permisos existentes desmarcando ambas opciones. No puedes conceder nuevos permisos a este médico.'
        : 'Puedes retirar los permisos existentes. Para concederlos, el médico necesita una autorización vigente.'
        : 'Lectura y agregado son independientes. La selección sólo cambia tus permisos después de firmar y confirmar.'}
    </p>
    {error && <p role="alert" className="text-sm leading-6 text-rose-700">{error}</p>}
    {notice && <p role="status" className="text-sm leading-6 text-sky-800">{notice}</p>}
    {canReview || draft.canRead !== grant.canRead || draft.canAppend !== grant.canAppend ? <button type="button" disabled={busy} onClick={() => { setDraft(initialClinicalPermissionDraft(grant)); setError(null); setNotice(null); }} className="min-h-11 rounded-xl px-3 text-sm text-slate-600 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50">Restablecer selección</button> : null}
    <button type="submit" disabled={busy || !canReview} className={`${controlClass} w-full sm:w-auto`}>
      {preparing ? 'Preparando cambio…' : 'Revisar cambio de permisos'}
    </button>
  </form>;
}
export function ClinicalPermissions({ grants, disabled, onPrepare }: ClinicalPermissionsProps) {
  const id = useId();
  return <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4">
    <div><h2 id={`${id}-title`} className="text-lg font-semibold text-slate-900">Permisos para médicos</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Tú eliges quién puede leer y quién puede agregar información a tu historial.</p>
    </div>
    {grants.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm leading-6 text-slate-500">
      Sin médicos autorizados disponibles para compartir tu historial.
    </p> : <div className="grid min-w-0 gap-4 lg:grid-cols-2">{grants.map(grant => <ClinicalDoctorPermission
      key={clinicalPermissionKey(grant)} grant={grant} disabled={disabled} onPrepare={onPrepare} />)}</div>}
    <p className="text-xs leading-5 text-slate-500">Retirar permisos impide nuevos accesos por TrustLeaf. No elimina copias que el médico ya haya descargado.</p>
  </section>;
}

