'use client';

import { useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { WalletBoundary, usePortalWallet } from './WalletBoundary';
import { jsonBody, localDate, portalApi, usePortalData } from './client';
import { verifiedOperation } from './operation-recovery';
import { signingPayload } from './state';
import type { PrivateOperation } from './types';

type Item = {
  id: string; version: number; commitment: string; role: 'patient' | 'doctor'; state: 'pending' | 'confirmed';
  bookingReady: boolean; consentConfirmed: boolean; transactionHash: string | null; rxId: string | null; operation: PrivateOperation | null;
  doctorName: string; patientName: string; authorizationExpiresAt: number;
};
const endpoint = '/api/v1/me/partner-prescriptions';
const actionable = 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';

function PrescriptionCard({ record, refresh }: { record: Item; refresh: () => void }) {
  const wallet = usePortalWallet();
  const { signRawHash } = useSignRawHash();
  const [review, setReview] = useState<PrivateOperation | null>(null);
  const [uncertain, setUncertain] = useState<PrivateOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const operation = record.operation;
  const patient = record.role === 'patient';
  const eligible = record.state === 'pending' && record.bookingReady && (patient ? !record.consentConfirmed : record.consentConfirmed) &&
    (!operation || operation.state === 'awaiting_signature');
  const action = patient ? 'Autorizar una emisión' : 'Emitir receta sintética';

  async function perform(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try { await work(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos completar la operación.'); }
    finally { running.current = false; setBusy(false); refresh(); }
  }

  async function prepare() {
    const next = await portalApi<Item>(`${endpoint}/${record.id}`, jsonBody({ action: 'prepare' }));
    const checked = verifiedOperation(next.operation, { action: patient ? 'consent' : 'mint' });
    if (checked.state === 'awaiting_signature') setReview(checked);
  }

  async function sign() {
    if (!review) return;
    if (!review.sponsorship || review.sponsorship.quoteExpiresAt * 1000 <= Date.now()) {
      setReview(null);
      throw new Error('La cotización venció. Vuelve a revisar la operación.');
    }
    const { signature } = await signRawHash(signingPayload(review, wallet.address));
    setUncertain(review);
    setReview(null);
    await portalApi<Item>(`${endpoint}/${record.id}`, jsonBody({ action: 'confirm', operationId: review.id, signature }));
    setUncertain(null);
  }

  async function reconcile() {
    const pending = uncertain ?? operation;
    if (!pending) return;
    await portalApi<Item>(`${endpoint}/${record.id}`, jsonBody({ action: 'reconcile', operationId: pending.id }));
    setUncertain(null);
  }

  return <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Documento sintético · Versión {record.version}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {record.state === 'confirmed' ? `Emisión confirmada · Receta ${record.rxId}` :
          operation?.state === 'submitted' || uncertain ? 'Consultando la confirmación de la firma.' :
          operation?.state === 'failed' || operation?.state === 'cancelled' ? 'El intento terminó sin confirmación.' :
          !record.bookingReady ? 'La consulta no está disponible para firmar.' :
          record.consentConfirmed ? 'Autorización de emisión confirmada.' : 'Pendiente de autorización del paciente.'}
      </p>
    </div>
    <details className="text-sm text-slate-600">
      <summary className="cursor-pointer">Huella de la versión del documento</summary>
      <p className="mt-2 break-all font-mono">{record.commitment}</p>
    </details>
    {review && eligible && !uncertain && <div className="space-y-3 rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-700">{patient
        ? `Autorizas a ${record.doctorName} a emitir una vez la receta de esta consulta con tu cuenta de prueba. El permiso vence el ${localDate(record.authorizationExpiresAt)}.`
        : `Emites esta versión de la receta para ${record.patientName}. Confirma que la revisaste en TrustLeaf Cannabis y que corresponde a la huella indicada.`}</p>
      {review.sponsorship && <p className="text-sm text-slate-600">Comisión máxima patrocinada por TrustLeaf · {Number(review.sponsorship.maxFeeStroops) / 10_000_000} XLM de Testnet</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} className={actionable} onClick={() => void perform(sign)}>Confirmar y firmar con Privy</button>
        <button type="button" disabled={busy} className="rounded-lg px-4 py-2 text-sm text-slate-600 underline" onClick={() => setReview(null)}>Volver</button>
      </div>
    </div>}
    {eligible && !review && !uncertain && <button type="button" disabled={busy} className={actionable} onClick={() => void perform(prepare)}>{action}</button>}
    {record.state === 'pending' && (operation?.state === 'submitted' || uncertain) && <button type="button" disabled={busy} className={actionable} onClick={() => void perform(reconcile)}>Consultar la confirmación</button>}
    {record.state === 'confirmed' && record.transactionHash && /^[0-9a-f]{64}$/.test(record.transactionHash) &&
      <a href={`https://stellar.expert/explorer/testnet/tx/${record.transactionHash}`} target="_blank" rel="noreferrer" className="text-sm underline">Recibo en Stellar Testnet</a>}
    {busy && <p role="status" className="text-sm text-slate-600">Verificando operación…</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </article>;
}

function PrescriptionsList() {
  const { data, loading, error, refresh } = usePortalData<{ prescriptions: Item[] }>(endpoint, 8000, { pauseWhenHidden: true });
  if (loading) return <p role="status" className="text-sm text-slate-600">Buscando consultas y recetas…</p>;
  if (error) return <p role="alert" className="text-sm text-red-800">{error} <button type="button" onClick={refresh} className="underline">Volver a consultar</button></p>;
  if (!data?.prescriptions.length) return <p className="text-sm text-slate-600">Tu cuenta no tiene recetas de este piloto.</p>;
  return <div className="space-y-4">{data.prescriptions.map(record => <PrescriptionCard key={record.id} record={record} refresh={refresh} />)}</div>;
}

export function PartnerPrescriptions() {
  const { ready, authenticated, login, user, logout } = usePrivy();
  return <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-10 sm:px-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold text-slate-900">Recetas de TrustLeaf Cannabis</h1>
      <p className="text-sm text-slate-600">Piloto con datos sintéticos en Stellar Testnet.</p>
    </header>
    {!ready ? <p role="status">Verificando sesión…</p> : !authenticated || !user ?
      <button type="button" className={actionable} onClick={() => login()}>Ingresar con Privy</button> : <>
        <button type="button" className="text-sm text-slate-600 underline" onClick={() => void logout()}>Cambiar de cuenta</button>
        <WalletBoundary key={user.id}><PrescriptionsList /></WalletBoundary>
      </>}
  </main>;
}
