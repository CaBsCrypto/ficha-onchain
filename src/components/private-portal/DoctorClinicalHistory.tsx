'use client';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { ClinicalHistory } from './ClinicalHistory';
import { ClinicalDraftWorkspace } from './ClinicalDraftWorkspace';
import { usePortalWallet } from './WalletBoundary';

const spanish = {
  title: 'Fichas de pacientes',
  instructions: 'Pide al paciente el código que aparece en su ficha. Para abrirla necesitas autorización médica vigente y el permiso del paciente para consultar o agregar aportes.',
  code: 'Código de la ficha',
  incompleteCode: 'Pide al paciente el código de su ficha y cópialo completo.',
  change: 'Cambiar de ficha',
  check: 'Comprobar acceso',
  close: 'Cerrar ficha',
  pending: 'Consulta o termina el intento pendiente antes de cambiar de ficha. Así conservamos el mismo aporte y evitamos duplicarlo.',
  openFirst: 'Abre y comprueba primero la ficha correspondiente.',
  reopen: 'Abre la ficha indicada en el borrador para consultar su publicación.',
  signIn: 'Ingresa con tu cuenta médica para comprobar el acceso.',
};
const english: typeof spanish = {
  title: 'Patient records',
  instructions: 'Ask the patient for their record code. Opening the record requires current medical authorization and the patient’s permission to read or add information.',
  code: 'Record code',
  incompleteCode: 'Ask the patient for their record code and copy it in full.',
  change: 'Switch record',
  check: 'Check access',
  close: 'Close record',
  pending: 'Check or finish the pending attempt before switching records. This keeps the same contribution and prevents duplicates.',
  openFirst: 'Open the relevant record and verify access first.',
  reopen: 'Open the record named in the draft to check its publication.',
  signIn: 'Sign in with your doctor account to check access.',
};
const copy = { es: spanish, en: english };

/** Explicit patient-supplied opaque ID only. The server checks both grant capabilities independently. */
function DoctorHistorySelection({ identity }: { identity: string }) {
  const text = copy[usePortalLanguage()];
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  function open(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const next = draft.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(next)) { setError(text.incompleteCode); return; }
    setError(''); setSelected(next);
  }
  return <div className="space-y-5">
    <section aria-labelledby="doctor-history-select-title" className="rounded-2xl border border-slate-200 bg-white p-5">
      <h1 id="doctor-history-select-title" className="text-xl font-semibold text-slate-900">{text.title}</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">{text.instructions}</p>
      <form onSubmit={open} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm font-medium text-slate-700" htmlFor="doctor-history-id">{text.code}<input id="doctor-history-id" value={draft} onChange={event => setDraft(event.target.value)} disabled={pending} autoComplete="off" spellCheck={false} maxLength={64} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50" /></label>
        <button type="submit" disabled={pending || draft.trim().toLowerCase() === selected} className="min-h-11 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50">{selected ? text.change : text.check}</button>
        {selected && <button type="button" disabled={pending} onClick={() => { setSelected(''); setDraft(''); setError(''); }} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50">{text.close}</button>}
      </form>
      {pending && <p role="status" className="mt-3 text-sm text-slate-600">{text.pending}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}
    </section>
    {!selected && <ClinicalDraftWorkspace identity={identity} role="doctor" canPublish={false} disabled={pending} onPrepare={async () => { throw new Error(text.openFirst); }} onReopen={() => setError(text.reopen)} />}
    {selected && <ClinicalHistory key={selected} historyId={selected} onPendingChange={setPending} />}
  </div>;
}
export function DoctorClinicalHistory() {
  const text = copy[usePortalLanguage()];
  const { ready, authenticated, user } = usePrivy();
  const wallet = usePortalWallet();
  if (!ready || !authenticated || !user?.id) return <p role="status">{text.signIn}</p>;
  return <DoctorHistorySelection key={`${user.id}:${wallet.walletId}:${wallet.address}`} identity={`${user.id}:${wallet.walletId}:${wallet.address}`} />;
}
