'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { ClinicalHistory } from './ClinicalHistory';
import { ClinicalDraftWorkspace } from './ClinicalDraftWorkspace';
import { useDoctorClinicalInbox } from './DoctorClinicalInbox';
import { usePortalWallet } from './WalletBoundary';

const spanish = {
  title: 'Fichas compartidas',
  loading: 'Comprobando fichas compartidas…',
  empty: 'Todavía no hay fichas compartidas contigo.',
  unavailable: 'No pudimos comprobar tus fichas compartidas. Vuelve a consultar.',
  denied: 'No tienes acceso a esta ficha.',
  unnamedRecord: 'Ficha compartida',
  refresh: 'Actualizar fichas',
  open: 'Abrir ficha',
  close: 'Cerrar ficha',
  reading: 'Lectura',
  appending: 'Agregar aportes',
  pending: 'Consulta o termina el intento pendiente antes de cambiar de ficha.',
  openFirst: 'Abre primero la ficha correspondiente.',
  reopen: 'Abre la ficha correspondiente para consultar la publicación del borrador.',
  signIn: 'Ingresa con tu cuenta médica para ver las fichas compartidas.',
};
const english: typeof spanish = {
  title: 'Shared records',
  loading: 'Checking shared records…',
  empty: 'No records have been shared with you yet.',
  unavailable: 'We could not check your shared records. Try again.',
  denied: 'You do not have access to this record.',
  unnamedRecord: 'Shared record',
  refresh: 'Refresh records',
  open: 'Open record',
  close: 'Close record',
  reading: 'Read',
  appending: 'Add contributions',
  pending: 'Check or finish the pending attempt before switching records.',
  openFirst: 'Open the relevant record first.',
  reopen: 'Open the relevant record to check the draft publication.',
  signIn: 'Sign in with your doctor account to view shared records.',
};
const copy = { es: spanish, en: english };
const recordId = /^[a-f0-9]{64}$/;
const button = 'min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50';

function DoctorHistorySelection({ identity, requestedRecord }: { identity: string; requestedRecord?: string | null }) {
  const language = usePortalLanguage();
  const text = copy[language];
  const router = useRouter();
  const { data, loading, error, refresh, setRecordNavigationBlocked, canNavigateToRecord } = useDoctorClinicalInbox();
  const [lockedRecord, setLockedRecord] = useState<string | null>(null);
  const [draftError, setDraftError] = useState('');
  const records = error ? [] : data?.records ?? [];
  const requested = typeof requestedRecord === 'string' && recordId.test(requestedRecord)
    ? records.find(record => record.historyId === requestedRecord)
    : undefined;
  const activeId = lockedRecord ?? requested?.historyId;
  const activeRecord = activeId && records.find(record => record.historyId === activeId);
  const recordDenied = !!data && !error && requestedRecord !== undefined && !requested;
  const href = useCallback((id?: string) =>
    '/doctor?tab=historial' + (id ? '&record=' + id : '') + '&lang=' + language, [language]);

  useEffect(() => () => setRecordNavigationBlocked(false), [setRecordNavigationBlocked]);
  useEffect(() => {
    if (lockedRecord && requestedRecord !== lockedRecord) router.replace(href(lockedRecord), { scroll: false });
  }, [href, lockedRecord, requestedRecord, router]);
  const trackPending = useCallback((pending: boolean) => {
    if (!activeId) return;
    setLockedRecord(pending ? activeId : null);
    setRecordNavigationBlocked(pending);
  }, [activeId, setRecordNavigationBlocked]);

  function navigate(id?: string) {
    if (lockedRecord || !canNavigateToRecord(id) ||
        (id !== undefined && (!recordId.test(id) || !records.some(record => record.historyId === id)))) return;
    setDraftError('');
    router.push(href(id), { scroll: false });
  }
  const recordRows = records.map((record, index) => {
    if (record.historyId === activeId) return null;
    const label = record.patientLabel ?? text.unnamedRecord + ' ' + (index + 1);
    return <li key={record.historyId} className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="break-words font-semibold text-slate-900">{label}</p>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-medium text-emerald-800">
          {record.canRead && <span className="rounded-md bg-emerald-50 px-2 py-1">{text.reading}</span>}
          {record.canAppend && <span className="rounded-md bg-emerald-50 px-2 py-1">{text.appending}</span>}
        </div>
      </div>
      <button type="button" className={button + ' text-sky-800 hover:bg-sky-50'} disabled={!!lockedRecord}
        aria-label={text.open + ' · ' + label} onClick={() => navigate(record.historyId)}>{text.open}</button>
    </li>;
  });
  return <div className="space-y-6">
    {activeId
      ? <button type="button" className={button + ' text-sky-800'} disabled={!!lockedRecord} onClick={() => navigate()}>{text.close}</button>
      : <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">{text.title}</h1>
        <button type="button" className={button} disabled={loading} onClick={() => void refresh()}>{text.refresh}</button>
      </header>}
    {!data && loading && <p role="status" className="rounded-2xl bg-white p-4 text-sm text-slate-600">{text.loading}</p>}
    {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{text.unavailable}</p>}
    {recordDenied && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{text.denied}</p>}
    {lockedRecord && <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{text.pending}</p>}
    {draftError && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{draftError}</p>}
    {activeId && <ClinicalHistory key={activeId} historyId={activeId} recordLabel={activeRecord ? activeRecord.patientLabel : null}
      doctorAccess={activeRecord || null} onPendingChange={trackPending} />}
    {!activeId && !!records.length && <ul aria-label={text.title} className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">{recordRows}</ul>}
    {activeId && recordRows.some(Boolean) && <details className="rounded-2xl border border-slate-200 bg-white">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{text.title}</summary>
      <ul aria-label={text.title} className="divide-y divide-slate-200 border-t border-slate-200">{recordRows}</ul>
    </details>}
    {!activeId && data && !error && records.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{text.empty}</p>}
    {!activeId && <ClinicalDraftWorkspace identity={identity} role="doctor" canPublish={false} disabled={false}
      onPrepare={async () => { throw new Error(text.openFirst); }} onReopen={() => setDraftError(text.reopen)} />}
  </div>;
}

export function DoctorClinicalHistory({ requestedRecord }: { requestedRecord?: string | null } = {}) {
  const text = copy[usePortalLanguage()];
  const { ready, authenticated, user } = usePrivy();
  const wallet = usePortalWallet();
  if (!ready || !authenticated || !user?.id) return <p role="status">{text.signIn}</p>;
  const identity = [user.id, wallet.walletId, wallet.address].join(':');
  return <DoctorHistorySelection key={identity} identity={identity} requestedRecord={requestedRecord} />;
}
