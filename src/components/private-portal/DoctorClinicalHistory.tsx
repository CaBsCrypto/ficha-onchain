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
  return <div className="space-y-5">
    <section aria-labelledby="doctor-shared-records-title" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="doctor-shared-records-title" className="text-xl font-semibold text-slate-900">{text.title}</h1>
        <button type="button" className={button} disabled={loading} onClick={() => void refresh()}>{text.refresh}</button>
      </header>
      {!data && loading && <p role="status" className="text-sm text-slate-600">{text.loading}</p>}
      {error && <p role="alert" className="text-sm text-rose-800">{text.unavailable}</p>}
      {data && !error && records.length === 0 && <p className="text-sm text-slate-600">{text.empty}</p>}
      {records.length > 0 && <ul aria-label={text.title} className="space-y-2">
        {records.map((record, index) => {
          const label = record.patientLabel ?? text.unnamedRecord + ' ' + (index + 1);
          return <li key={record.historyId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-slate-900">{label}</p>
            <p className="text-sm text-slate-600">{[record.canRead && text.reading, record.canAppend && text.appending].filter(Boolean).join(' · ')}</p>
          </div>
          {activeId === record.historyId
            ? <button type="button" className={button} disabled={!!lockedRecord} onClick={() => navigate()}>{text.close}</button>
            : <button type="button" className={button} disabled={!!lockedRecord}
              aria-label={text.open + ' · ' + label} onClick={() => navigate(record.historyId)}>{text.open}</button>}
          </li>;
        })}
      </ul>}
      {recordDenied && <p role="alert" className="text-sm text-rose-800">{text.denied}</p>}
      {lockedRecord && <p role="status" className="text-sm text-slate-600">{text.pending}</p>}
      {draftError && <p role="alert" className="text-sm text-rose-800">{draftError}</p>}
    </section>
    {!activeId && <ClinicalDraftWorkspace identity={identity} role="doctor" canPublish={false} disabled={false}
      onPrepare={async () => { throw new Error(text.openFirst); }} onReopen={() => setDraftError(text.reopen)} />}
    {activeId && <ClinicalHistory key={activeId} historyId={activeId} doctorAccess={activeRecord || null} onPendingChange={trackPending} />}
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
