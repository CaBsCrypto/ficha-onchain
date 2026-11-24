'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { privyEmail } from '@/lib/auth/privy-email';
import { ClinicalLinksPanel } from './ClinicalLinksPanel';
import { jsonBody, portalApi, PortalApiError } from './client';

type Source = {
  partnerId: string;
  source: string;
  associationStatus: 'active' | 'revoked' | 'expired' | 'not_authorized';
  bindingId: string | null;
};
type Account = {
  accountStatus: 'active' | 'not_enrolled';
  recordStatus: 'ready' | 'not_created';
  hasNativeWallet?: boolean;
  sources: Source[];
};

const copy = {
  es: {
    title: 'Mi cuenta', loading: 'Consultando tu cuenta…', error: 'No pudimos comprobar tu cuenta.', retry: 'Volver a consultar',
    record: 'Ficha clínica', recordReady: 'Tu ficha está abierta.', recordPending: 'Puedes abrir tu ficha cuando la necesites.',
    viewRecord: 'Ver mi ficha', createRecord: 'Abrir mi ficha', prescriptions: 'Mis recetas', viewPrescriptions: 'Ver mis recetas',
    integrations: 'Portales vinculados', revoke: 'Retirar permiso', active: 'Recetas autorizadas', revoked: 'Permiso retirado',
    expired: 'Permiso vencido', not_authorized: 'Permiso pendiente',
  },
  en: {
    title: 'My account', loading: 'Checking your account…', error: 'We could not verify your account.', retry: 'Check again',
    record: 'Clinical record', recordReady: 'Your record is open.', recordPending: 'You can open your record when you need it.',
    viewRecord: 'View my record', createRecord: 'Open my record', prescriptions: 'My prescriptions', viewPrescriptions: 'View my prescriptions',
    integrations: 'Connected portals', revoke: 'Withdraw permission', active: 'Prescriptions authorized', revoked: 'Permission withdrawn',
    expired: 'Permission expired', not_authorized: 'Permission pending',
  },
} as const;
const surface = 'space-y-3 rounded-2xl border border-slate-200 bg-white p-5';
const action = 'inline-flex min-h-11 items-center rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50';
const unavailableCodes = new Set(['module_outside_current_delivery', 'pilot_disabled', 'not_found']);

export function PatientAccountEntry({ tab, native }: { tab: 'perfil' | 'recetas'; native: ReactNode }) {
  const { user } = usePrivy();
  const text = copy[usePortalLanguage()];
  const [account, setAccount] = useState<Account | null>();
  const [revision, setRevision] = useState(0);
  const [failure, setFailure] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setFailure(false);
    portalApi<Account>('/api/v1/me/account', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setAccount(data);
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof PortalApiError && unavailableCodes.has(error.code)) setAccount(null);
      else setFailure(true);
    });
    return () => controller.abort();
  }, [revision]);

  async function withdraw(bindingId: string) {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      await portalApi('/api/v1/me/binding', { ...jsonBody({ bindingId }), method: 'DELETE' });
      setAccount(current => current && ({ ...current, sources: current.sources.map(source =>
        source.bindingId === bindingId ? { ...source, associationStatus: 'revoked' } : source) }));
      setRevision(value => value + 1);
    } catch { setFailure(true); }
    finally { setWithdrawing(false); }
  }

  if (failure) return <p role="alert" className="text-sm text-rose-800">{text.error}{' '}
    <button type="button" className="min-h-11 font-semibold underline" onClick={() => setRevision(value => value + 1)}>{text.retry}</button>
  </p>;
  if (account === undefined) return <p role="status" className="text-sm text-slate-600">{text.loading}</p>;
  if (!account || account.accountStatus === 'not_enrolled') return native;

  const recordReady = account.recordStatus === 'ready';
  if (tab === 'recetas') return <div className="space-y-5">
    {recordReady || account.hasNativeWallet ? native : <h1 className="text-xl font-semibold text-slate-900">{text.prescriptions}</h1>}
    <ClinicalLinksPanel />
  </div>;

  return <div className="space-y-5">
    <section className={surface}>
      <h1 className="text-xl font-semibold text-slate-900">{text.title}</h1>
      <p className="break-all text-sm text-slate-700">{privyEmail(user)}</p>
    </section>
    <section className={surface}>
      <h2 className="font-semibold text-slate-900">{text.record}</h2>
      <p className="text-sm text-slate-700">{recordReady ? text.recordReady : text.recordPending}</p>
      <div className="flex flex-wrap gap-3">
        <Link className={action} href="/patient?tab=historial">{recordReady ? text.viewRecord : text.createRecord}</Link>
        <Link className={action} href="/patient?tab=recetas">{text.viewPrescriptions}</Link>
      </div>
    </section>
    {!!account.sources.length && <section className={surface}>
      <h2 className="font-semibold text-slate-900">{text.integrations}</h2>
      <ul className="divide-y divide-slate-200">
        {account.sources.map(source => <li key={source.partnerId} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><p className="text-sm font-medium text-slate-800">{source.source}</p><p className="text-sm text-slate-600">{text[source.associationStatus]}</p></div>
          {source.associationStatus === 'active' && source.bindingId && <button type="button" className={action} disabled={withdrawing}
            onClick={() => void withdraw(source.bindingId!)}>{text.revoke}</button>}
        </li>)}
      </ul>
    </section>}
  </div>;
}
