'use client';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useId, useRef, useState, type ReactNode, type Ref } from 'react';
import type { ClinicalGrant, ClinicalPermissionAppointment, ClinicalPrepareRequest } from '@/types/clinical';
import { chileDateTime } from './client';
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
  readHistory: 'Leer mi ficha',
  readHelp: 'Ver mis antecedentes y archivos.',
  appendHistory: 'Agregar información',
  appendHelp: 'Añadir sus propias notas y archivos.',
  readOnlyHelp: 'Estos controles muestran los permisos consultados. Confirmar cambios está deshabilitado en esta demostración.',
  independentReadOnly: 'Lectura y agregado son independientes. Conceder nuevos permisos requiere una autorización médica vigente.',
  withdrawBoth: 'Puedes retirar los permisos existentes desmarcando ambas opciones. No puedes conceder nuevos permisos a este médico.',
  withdrawOnly: 'Puedes retirar los permisos existentes. Para concederlos, el médico necesita una autorización vigente.',
  independent: 'Los cambios se aplican después de tu confirmación.',
  reset: 'Restablecer selección',
  preparing: 'Preparando cambio…',
  reviewChange: 'Revisar cambios',
  title: 'Permisos del médico',
  description: 'Tú eliges quién puede leer y quién puede agregar información a tu historial.',
  empty: 'Sin médicos con estado verificado disponibles en esta consulta.',
  withdrawalNotice: 'Retirar permisos impide nuevos accesos por TrustLeaf. No elimina copias que el médico ya haya descargado.',
  doctorWallet: 'Wallet del médico',
  observedRead: 'Permisos consultados: lectura',
  observedAppend: 'agregado',
  accessFor: (name: string) => `Acceso de ${name}`,
  startedAt: 'Inicio',
  chileTime: 'Hora de Chile',
  doctorsWithAccess: 'Médicos con acceso',
  previousAppointments: 'Consultas anteriores',
  chooseDoctor: 'Elegir un médico',
  searchDoctor: 'Buscar por nombre',
  noDoctorMatches: 'No encontramos médicos con ese nombre.',
  removeAccess: 'Retirar acceso',
  currentStatus: 'Estado actual',
  active: 'Vigente',
  inactive: 'Sin permiso',
  pendingChanges: 'Cambios por confirmar',
  grantChange: 'Conceder',
  removeChange: 'Retirar',
  readAccess: 'lectura',
  appendAccess: 'permiso para agregar información',
  verificationDetails: 'Identidad verificada',
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
  readHelp: 'View my entries and files.',
  appendHistory: 'Add information',
  appendHelp: 'Add their own notes and files.',
  readOnlyHelp: 'These controls show verified permissions. Confirming changes is disabled in this demo.',
  independentReadOnly: 'Reading and adding are separate permissions. Granting new permissions requires active medical authorization.',
  withdrawBoth: 'Clear both options to withdraw existing permissions. New permissions are unavailable for this doctor.',
  withdrawOnly: 'You can withdraw existing permissions. The doctor needs active authorization for you to grant permissions.',
  independent: 'Changes take effect after you confirm.',
  reset: 'Reset selection',
  preparing: 'Preparing change…',
  reviewChange: 'Review changes',
  title: 'Doctor permissions',
  description: 'Choose who can read and who can add information to your record.',
  empty: 'No doctors with verified status are available in this view.',
  withdrawalNotice: 'Withdrawing permissions blocks future access through TrustLeaf. Previously downloaded copies remain with the doctor.',
  doctorWallet: 'Doctor’s wallet',
  observedRead: 'Verified permissions: read',
  observedAppend: 'add',
  accessFor: (name: string) => `Access for ${name}`,
  startedAt: 'Started',
  chileTime: 'Chile time',
  doctorsWithAccess: 'Doctors with access',
  previousAppointments: 'Previous appointments',
  chooseDoctor: 'Choose a doctor',
  searchDoctor: 'Search by name',
  noDoctorMatches: 'No doctors match that name.',
  removeAccess: 'Remove access',
  currentStatus: 'Current access',
  active: 'Granted',
  inactive: 'No permission',
  pendingChanges: 'Changes to confirm',
  grantChange: 'Grant',
  removeChange: 'Withdraw',
  readAccess: 'read access',
  appendAccess: 'permission to add information',
  verificationDetails: 'Verified identity',
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
export interface ClinicalPermissionsProps {
  grants: ClinicalGrant[]; disabled: boolean; readOnly?: boolean; onPrepare: PreparePermission;
  appointment?: ClinicalPermissionAppointment; appointmentHeading?: Ref<HTMLHeadingElement>; appointmentReturn?: ReactNode;
}
const controlClass = 'min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';
const summaryClass = 'min-h-11 cursor-pointer break-words rounded-xl px-4 py-3 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';

function visitStarts(grant: ClinicalGrant) {
  if (!Array.isArray(grant.previousVisitStarts)) return [];
  return [...new Set(grant.previousVisitStarts.filter(value => typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value))].sort().reverse();
}

function AppointmentTimes({ starts, language }: { starts: string[]; language: 'en' | 'es' }) {
  return <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
    {starts.map(start => <li key={start}><time dateTime={start}>{chileDateTime(Date.parse(start) / 1000, language)}</time></li>)}
  </ul>;
}

function permissionStatus(grant: ClinicalGrant, text: typeof spanish) {
  return <>{text.observedRead} <strong>{grant.canRead ? text.readGranted : text.notGranted}</strong>; {text.observedAppend} <strong>{grant.canAppend ? text.appendGranted : text.notGranted}</strong>.</>;
}

function searchableDoctorName(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function ClinicalDoctorPermission({ grant, previousStarts = [], disabled, readOnly, onPrepare, appointment, appointmentHeading, appointmentReturn }: {
  grant: ClinicalGrant; previousStarts?: string[];
} & Omit<ClinicalPermissionsProps, 'grants'>) {
  const language = usePortalLanguage();
  const text = copy[language];
  const [draft, setDraft] = useState(() => initialClinicalPermissionDraft(grant));
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const flight = useRef(false), id = useId();
  const busy = disabled || preparing;
  const canReview = clinicalPermissionCanReview(grant, draft);
  const hasAccess = grant.canRead || grant.canAppend;
  const shortAddress = `${grant.address.slice(0, 8)}…${grant.address.slice(-8)}`;
  const withdrawalIncomplete = !grant.authorized && (draft.canRead || draft.canAppend);
  const choices = [
    { key: 'canRead', label: text.readHistory, help: text.readHelp, access: text.readAccess },
    { key: 'canAppend', label: text.appendHistory, help: text.appendHelp, access: text.appendAccess },
  ] as const;
  const changes = choices.filter(({ key }) => draft[key] !== grant[key]);
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
  return <form onSubmit={review} className="min-w-0 scroll-mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    {appointment && appointmentReturn}
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 ref={appointmentHeading} tabIndex={appointment ? -1 : undefined}
          className="break-words text-lg font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
          {appointment ? text.accessFor(grant.doctorName) : grant.doctorName}
        </h3>
        {appointment && <p className="mt-1 text-sm text-slate-600">{text.startedAt}{' '}
          <time dateTime={appointment.startedAt}>{chileDateTime(Date.parse(appointment.startedAt) / 1000, language)}</time> · {text.chileTime}
        </p>}
      </div>
      {!grant.authorized && <span className="max-w-full rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">{text.inactiveAuthorization}</span>}
    </div>
    {previousStarts.length > 0 && <AppointmentTimes starts={previousStarts} language={language} />}
    <p className="sr-only" id={`${id}-observed`}>{permissionStatus(grant, text)}</p>
    <fieldset disabled={busy || readOnly} aria-describedby={`${id}-observed ${id}-help`} className="min-w-0 divide-y divide-slate-200 rounded-xl border border-slate-200">
      <legend className="sr-only">{readOnly ? text.observedFor : text.chooseFor} {grant.doctorName}</legend>
      {choices.map(({ key, label, help }) => <label key={key}
        className="flex min-h-11 cursor-pointer items-start gap-3 p-3 focus-within:outline-2 focus-within:outline-sky-600">
        <input type="checkbox" checked={readOnly ? grant[key] : draft[key]} disabled={readOnly || busy || (!grant.authorized && !draft[key])}
          onChange={event => { const checked = event.target.checked; setDraft(current => ({ ...current, [key]: checked })); setError(null); setNotice(false); }}
          className="mt-0.5 h-5 w-5 shrink-0 accent-sky-700" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-slate-900">{label}</span>
            <span aria-hidden="true" title={text.currentStatus} className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${grant[key] ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{grant[key] ? text.active : text.inactive}</span>
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-600">{help}</span>
        </span>
      </label>)}
    </fieldset>
    {!readOnly && changes.length > 0 && !notice && <p role="status" className="text-sm text-slate-700">
      <strong>{text.pendingChanges}</strong>{' '}
      {changes.map(({ key, access }) => `${draft[key] ? text.grantChange : text.removeChange} ${access}`).join(' · ')}
    </p>}
    <div className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={readOnly || busy || !canReview} className="min-h-11 w-full rounded-xl bg-[#0369a1] px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
        {preparing ? text.preparing : text.reviewChange}
      </button>
      {!readOnly && changes.length > 0 && <button type="button" disabled={busy}
        onClick={() => { setDraft(initialClinicalPermissionDraft(grant)); setError(null); setNotice(false); }}
        className="min-h-11 rounded-xl px-3 text-sm text-slate-600 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50">{text.reset}</button>}
    </div>
    {!readOnly && !grant.authorized && hasAccess && <div>
      <button type="button" disabled={busy || !draft.canRead && !draft.canAppend} className={controlClass}
        onClick={() => { setDraft({ canRead: false, canAppend: false }); setError(null); setNotice(false); }}>
        {text.removeAccess}
      </button>
    </div>}
    {readOnly && <p className="text-xs leading-5 text-sky-800">{text.readOnlyHelp}</p>}
    <p id={`${id}-help`} className="text-xs leading-5 text-slate-600">
      {readOnly ? text.independentReadOnly : !grant.authorized ? withdrawalIncomplete ? text.withdrawBoth
        : text.withdrawOnly
        : text.independent}
    </p>
    {!readOnly && error && <p role="alert" className="text-sm leading-6 text-rose-700">{error}</p>}
    {!readOnly && notice && <p role="status" className="text-sm leading-6 text-sky-800">{text.reviewNotice}</p>}
    <details className="border-t border-slate-200 text-sm text-slate-600">
      <summary className="min-h-11 cursor-pointer content-center font-medium text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{text.verificationDetails}</summary>
      <p>{grant.authorized ? text.activeAuthorization : text.inactiveAuthorization}</p>
      <p className="break-all" title={grant.address}><span aria-hidden="true">{text.doctorWallet}: {shortAddress}</span><span className="sr-only">{text.doctorWallet}: {grant.address}</span></p>
    </details>
  </form>;
}
export function ClinicalPermissions({ grants, disabled, readOnly, onPrepare, appointment, appointmentHeading, appointmentReturn }: ClinicalPermissionsProps) {
  const language = usePortalLanguage();
  const text = copy[language];
  const id = useId();
  const [doctorSearch, setDoctorSearch] = useState('');
  const doctors = grants.map(grant => ({
    grant, starts: visitStarts(grant), hasAccess: grant.canRead || grant.canAppend,
  }));
  const focalDoctor = doctors.find(({ grant }) => grant.doctorId === appointment?.doctorId);
  const additionalDoctors = doctors.filter(doctor => doctor !== focalDoctor);
  const active = additionalDoctors.filter(doctor => doctor.hasAccess);
  const previous = doctors.filter(doctor => doctor.starts.length > 0)
    .sort((left, right) => right.starts[0].localeCompare(left.starts[0]));
  const directory = additionalDoctors.filter(doctor => !doctor.hasAccess && doctor.starts.length === 0);
  const searchTerm = searchableDoctorName(doctorSearch);
  const matchingDoctors = searchTerm ? directory.filter(({ grant }) => searchableDoctorName(grant.doctorName).includes(searchTerm)) : directory;
  function doctorForm({ grant }: typeof doctors[number],
    context?: Pick<ClinicalPermissionsProps, 'appointment' | 'appointmentHeading' | 'appointmentReturn'> & { previousStarts?: string[] }) {
    return <ClinicalDoctorPermission key={clinicalPermissionKey(grant)} grant={grant} disabled={disabled}
      readOnly={readOnly} onPrepare={onPrepare} {...context} />;
  }
  return <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4">
    <div className={focalDoctor ? 'sr-only' : ''}><h2 id={`${id}-title`} className="text-lg font-semibold text-slate-900">{text.title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text.description}</p>
    </div>
    {grants.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm leading-6 text-slate-500">
      {text.empty}
    </p> : <>
      {focalDoctor && doctorForm(focalDoctor, { appointment, appointmentHeading, appointmentReturn })}
      {active.length > 0 && <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className={summaryClass}>{text.doctorsWithAccess}</summary>
        <div className="divide-y divide-slate-200 px-4 pb-3">
        {active.map(doctor => <details key={doctor.grant.doctorId}>
          <summary className={summaryClass}>{doctor.grant.doctorName} <span className="ml-1 break-words font-normal text-slate-600">
            · {permissionStatus(doctor.grant, text)}</span></summary>
          {doctorForm(doctor)}
        </details>)}
        </div>
      </details>}
      {previous.length > 0 && <details className="rounded-xl border border-slate-200 bg-white">
        <summary className={summaryClass}>{text.previousAppointments}</summary>
        <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2">
          {previous.map(doctor => doctor === focalDoctor || doctor.hasAccess ? <div key={doctor.grant.doctorId} className="rounded-xl border border-slate-200 p-4">
            <h3 className="break-words font-semibold text-slate-900">{doctor.grant.doctorName}</h3>
            <AppointmentTimes starts={doctor.starts} language={language} />
          </div> : doctorForm(doctor, { previousStarts: doctor.starts }))}
        </div>
      </details>}
      {directory.length > 0 && <details className="rounded-xl border border-slate-200 bg-white">
        <summary className={summaryClass}>{text.chooseDoctor}</summary>
        <div className="space-y-3 p-3">
          <label className="block max-w-sm text-sm font-medium text-slate-900">
            {text.searchDoctor}
            <input type="search" value={doctorSearch} onChange={event => setDoctorSearch(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600" />
          </label>
          {matchingDoctors.length === 0 ? <p role="status" className="text-sm text-slate-600">{text.noDoctorMatches}</p>
            : <div className="grid min-w-0 gap-3 sm:grid-cols-2">{matchingDoctors.map(doctor => doctorForm(doctor))}</div>}
        </div>
      </details>}
    </>}
    <p className="text-xs leading-5 text-slate-500">{text.withdrawalNotice}</p>
  </section>;
}

