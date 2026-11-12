'use client';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useId, useRef, useState } from 'react';
import type { ClinicalGrant, ClinicalPrepareRequest } from '@/types/clinical';
import { clinicalPermissionCanReview, clinicalPermissionChange, clinicalPermissionError,
  clinicalPermissionKey, initialClinicalPermissionDraft } from './clinical-permission-state';

const spanish = {
  reviewNotice: 'Revisa el cambio y firma para confirmarlo.',
  activeAuthorization: 'Autorización vigente',
  inactiveAuthorization: 'Sin autorización vigente',
  readGranted: 'concedida',
  appendGranted: 'concedido',
  notGranted: 'sin conceder',
  observedFor: 'Permisos consultados para',
  chooseFor: 'Elegir permisos para',
  readHistory: 'Leer mi historial',
  readHelp: 'Consultar antecedentes y abrir sus archivos privados.',
  appendHistory: 'Agregar información',
  appendHelp: 'Añadir sus propios aportes; no editar lo que tú agregaste.',
  readOnlyHelp: 'Estos controles muestran los permisos consultados. Confirmar cambios está deshabilitado en esta demostración.',
  independentReadOnly: 'Lectura y agregado son independientes. Conceder nuevos permisos requiere una autorización médica vigente.',
  withdrawBoth: 'Puedes retirar los permisos existentes desmarcando ambas opciones. No puedes conceder nuevos permisos a este médico.',
  withdrawOnly: 'Puedes retirar los permisos existentes. Para concederlos, el médico necesita una autorización vigente.',
  independent: 'Lectura y agregado son independientes. La selección sólo cambia tus permisos después de firmar y confirmar.',
  reset: 'Restablecer selección',
  preparing: 'Preparando cambio…',
  reviewChange: 'Revisar cambio de permisos',
  title: 'Permisos para médicos',
  description: 'Tú eliges quién puede leer y quién puede agregar información a tu historial.',
  empty: 'Sin médicos con estado verificado disponibles en esta consulta.',
  withdrawalNotice: 'Retirar permisos impide nuevos accesos por TrustLeaf. No elimina copias que el médico ya haya descargado.',
  doctorWallet: 'Wallet del médico',
  observedRead: 'Permisos consultados: lectura',
  observedAppend: 'agregado',
};
const english: typeof spanish = {
  reviewNotice: 'Review the change and sign to confirm it.',
  activeAuthorization: 'Authorization active',
  inactiveAuthorization: 'No active authorization',
  readGranted: 'granted',
  appendGranted: 'granted',
  notGranted: 'not granted',
  observedFor: 'Verified permissions for',
  chooseFor: 'Choose permissions for',
  readHistory: 'Read my record',
  readHelp: 'View entries and open their private files.',
  appendHistory: 'Add information',
  appendHelp: 'Add their own entries. Your entries stay as you wrote them.',
  readOnlyHelp: 'These controls show verified permissions. Confirming changes is disabled in this demo.',
  independentReadOnly: 'Reading and adding are separate permissions. Granting new permissions requires active medical authorization.',
  withdrawBoth: 'Clear both options to withdraw existing permissions. New permissions are unavailable for this doctor.',
  withdrawOnly: 'You can withdraw existing permissions. The doctor needs active authorization for you to grant permissions.',
  independent: 'Reading and adding are separate permissions. Changes take effect after you sign and they are confirmed.',
  reset: 'Reset selection',
  preparing: 'Preparing change…',
  reviewChange: 'Review permission change',
  title: 'Doctor permissions',
  description: 'Choose who can read and who can add information to your record.',
  empty: 'No doctors with verified status are available in this view.',
  withdrawalNotice: 'Withdrawing permissions blocks future access through TrustLeaf. Previously downloaded copies remain with the doctor.',
  doctorWallet: 'Doctor’s wallet',
  observedRead: 'Verified permissions: read',
  observedAppend: 'add',
};
const copy = { es: spanish, en: english };

function permissionErrorInEnglish(error: unknown) {
  let code: unknown = error instanceof Error ? error.message : '';
  try { if (error instanceof Error && 'code' in error) code = error.code; }
  catch { code = ''; }
  switch (code) {
    case 'clinical_permission_conflict':
    case 'clinical_identity_changed':
      return 'Permissions changed. Refresh the record and review your selection again.';
    case 'doctor_not_authorized':
      return 'The doctor no longer has active authorization. Refresh the record to withdraw permissions.';
    case 'clinical_permission_withdrawal_only':
      return 'Clear both options to withdraw this doctor’s permissions.';
    case 'private_writes_paused':
    case 'clinical_writes_paused':
      return 'Changes are temporarily paused. Verified permissions are still in effect.';
    case 'clinical_rehearsal_scope_rejected':
    case 'clinical_rehearsal_order_conflict':
      return 'This change is outside the approved rehearsal steps. Check the previous receipts before continuing.';
    case 'clinical_rehearsal_expired':
      return 'The rehearsal window expired. Check the same attempt before continuing.';
    case 'clinical_sponsorship_budget_exceeded':
    case 'clinical_rehearsal_budget_exceeded':
      return 'This change exceeds the available sponsorship budget.';
    default:
      return 'We could not prepare the change. Refresh the record and try again.';
  }
}

type PreparePermission = (input: Omit<ClinicalPrepareRequest, 'requestId'>) => Promise<unknown>;
export interface ClinicalPermissionsProps { grants: ClinicalGrant[]; disabled: boolean; readOnly?: boolean; onPrepare: PreparePermission }
const controlClass = 'min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';

function ClinicalDoctorPermission({ grant, disabled, readOnly, onPrepare }: { grant: ClinicalGrant; disabled: boolean; readOnly?: boolean; onPrepare: PreparePermission }) {
  const language = usePortalLanguage();
  const text = copy[language];
  const [draft, setDraft] = useState(() => initialClinicalPermissionDraft(grant));
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const flight = useRef(false), id = useId();
  const busy = disabled || preparing;
  const canReview = clinicalPermissionCanReview(grant, draft);
  const shortAddress = `${grant.address.slice(0, 8)}…${grant.address.slice(-8)}`;
  const withdrawalIncomplete = !grant.authorized && (draft.canRead || draft.canAppend);
  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || busy || flight.current || !canReview) return;
    flight.current = true; setPreparing(true); setError(null); setNotice(false);
    try {
      // The parent owns explicit confirmation and the signature. This form only
      // prepares a change and never changes the observed permission labels.
      await onPrepare(clinicalPermissionChange(grant, draft));
      setNotice(true);
    } catch (failure) { setError(language === 'en' ? permissionErrorInEnglish(failure) : clinicalPermissionError(failure)); }
    finally { flight.current = false; setPreparing(false); }
  }
  return <form onSubmit={review} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words font-semibold text-slate-900">{grant.doctorName}</h3>
        <p className="mt-1 break-all text-xs text-slate-500" title={grant.address}>
          <span aria-hidden="true">Wallet: {shortAddress}</span><span className="sr-only">{text.doctorWallet}: {grant.address}</span>
        </p>
      </div>
      <span className={`max-w-full rounded-full px-3 py-1 text-xs font-medium ${grant.authorized ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800'}`}>
        {grant.authorized ? text.activeAuthorization : text.inactiveAuthorization}
      </span>
    </div>
    <p className="text-sm leading-6 text-slate-600" id={`${id}-observed`}>
      {text.observedRead} <strong>{grant.canRead ? text.readGranted : text.notGranted}</strong>; {text.observedAppend} <strong>{grant.canAppend ? text.appendGranted : text.notGranted}</strong>.
    </p>
    <fieldset disabled={busy || readOnly} aria-describedby={`${id}-observed ${id}-help`} className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-slate-900">{readOnly ? text.observedFor : text.chooseFor} {grant.doctorName}</legend>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200">
        <input type="checkbox" checked={readOnly ? grant.canRead : draft.canRead} disabled={readOnly || busy || (!grant.authorized && !draft.canRead)}
          onChange={event => { setDraft(current => ({ ...current, canRead: event.target.checked })); setError(null); setNotice(false); }}
          className="mt-1 h-4 w-4 shrink-0 accent-sky-600" />
        <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{text.readHistory}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">{text.readHelp}</span></span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200">
        <input type="checkbox" checked={readOnly ? grant.canAppend : draft.canAppend} disabled={readOnly || busy || (!grant.authorized && !draft.canAppend)}
          onChange={event => { setDraft(current => ({ ...current, canAppend: event.target.checked })); setError(null); setNotice(false); }}
          className="mt-1 h-4 w-4 shrink-0 accent-sky-600" />
        <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{text.appendHistory}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">{text.appendHelp}</span></span>
      </label>
    </fieldset>
    {readOnly && <p className="text-xs leading-5 text-sky-800">{text.readOnlyHelp}</p>}
    <p id={`${id}-help`} className="text-xs leading-5 text-slate-500">
      {readOnly ? text.independentReadOnly : !grant.authorized ? withdrawalIncomplete ? text.withdrawBoth
        : text.withdrawOnly
        : text.independent}
    </p>
    {!readOnly && error && <p role="alert" className="text-sm leading-6 text-rose-700">{error}</p>}
    {!readOnly && notice && <p role="status" className="text-sm leading-6 text-sky-800">{text.reviewNotice}</p>}
    {!readOnly && (canReview || draft.canRead !== grant.canRead || draft.canAppend !== grant.canAppend) ? <button type="button" disabled={busy} onClick={() => { setDraft(initialClinicalPermissionDraft(grant)); setError(null); setNotice(false); }} className="min-h-11 rounded-xl px-3 text-sm text-slate-600 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50">{text.reset}</button> : null}
    <button type="submit" disabled={readOnly || busy || !canReview} className={`${controlClass} w-full sm:w-auto`}>
      {preparing ? text.preparing : text.reviewChange}
    </button>
  </form>;
}
export function ClinicalPermissions({ grants, disabled, readOnly, onPrepare }: ClinicalPermissionsProps) {
  const text = copy[usePortalLanguage()];
  const id = useId();
  return <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4">
    <div><h2 id={`${id}-title`} className="text-lg font-semibold text-slate-900">{text.title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text.description}</p>
    </div>
    {grants.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm leading-6 text-slate-500">
      {text.empty}
    </p> : <div className="grid min-w-0 gap-4 lg:grid-cols-2">{grants.map(grant => <ClinicalDoctorPermission
      key={clinicalPermissionKey(grant)} grant={grant} disabled={disabled} readOnly={readOnly} onPrepare={onPrepare} />)}</div>}
    <p className="text-xs leading-5 text-slate-500">{text.withdrawalNotice}</p>
  </section>;
}

