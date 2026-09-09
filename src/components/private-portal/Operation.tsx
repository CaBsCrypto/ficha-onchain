'use client';
import { useEffect, useRef, useState } from 'react';
import { useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { usePortalWallet } from './WalletBoundary';
import { portalApi, jsonBody } from './client';
import { signingPayload } from './state';
import { mergeOperation, recoverPrivateOperation, verifiedOperation } from './operation-recovery';
import { operationNoticeDetail } from './errors';
import type { OperationAction, PrivateOperation } from './types';

export function usePrivateOperation(initialOperation?: PrivateOperation | null) {
  const wallet = usePortalWallet();
  const { signRawHash } = useSignRawHash();
  const lock = useRef(false);
  const lastInitialId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [operation, setOperation] = useState<PrivateOperation | null>(null);
  useEffect(() => {
    if (initialOperation && !lock.current) {
      try {
        const incoming = verifiedOperation(initialOperation);
        const changed = lastInitialId.current !== incoming.id;
        lastInitialId.current = incoming.id;
        setOperation(current => current?.id === incoming.id ? mergeOperation(current, incoming) : changed ? incoming : current);
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo verificar la operación.'); }
    }
  }, [initialOperation?.id, initialOperation?.state, busy]);
  useEffect(() => {
    if (!operation) return;
    const controller = new AbortController();
    void recoverPrivateOperation(operation, {
      read: async (id, signal) => (await portalApi<{ operation: PrivateOperation }>(`/api/private-operations/${encodeURIComponent(id)}`, { signal })).operation,
      onUpdate: next => { setOperation(current => mergeOperation(current, next)); setError(''); if (next.state !== 'submitted') setReconciling(false); },
      onError: setError, signal: controller.signal, reconcileUncertain: reconciling,
    });
    return () => controller.abort();
  }, [operation?.id, operation?.state, reconciling]);
  async function run(action: OperationAction, resource: { appointmentId: number } | { prescriptionId: string }) {
    if (lock.current || reconciling) throw new Error('Estamos consultando la confirmación anterior. Espera su resultado antes de continuar.');
    lock.current = true; setBusy(true); setError('');
    let stage = 'prepare';
    try {
      const prepared = await portalApi<{ operation: PrivateOperation }>('/api/private-operations', jsonBody({ action, ...resource, confirmed: true }));
      verifiedOperation(prepared.operation, { action });
      setOperation(prepared.operation);
      if (['submitted', 'confirmed'].includes(prepared.operation.state)) return prepared.operation;
      const payload = signingPayload(prepared.operation, wallet.address);
      stage = 'sign';
      const { signature } = await signRawHash(payload);
      stage = 'confirm';
      const result = await portalApi<{ operation: PrivateOperation }>(`/api/private-operations/${encodeURIComponent(prepared.operation.id)}/confirm`, jsonBody({ signature }));
      verifiedOperation(result.operation, prepared.operation);
      setOperation(result.operation);
      if (!['submitted', 'confirmed'].includes(result.operation.state)) throw new Error('La operación no se confirmó. Revisa su estado antes de continuar.');
      return result.operation;
    } catch (failure) {
      if (stage === 'confirm') setReconciling(true);
      const message = stage === 'sign' ? 'No se completó tu firma. Puedes revisar y confirmar nuevamente.' : stage === 'confirm' ? 'La confirmación no devolvió un resultado verificable. Estamos consultando esta misma operación; no vuelvas a firmarla todavía.' :
        failure instanceof Error ? failure.message : 'No se completó la operación. Consulta el estado antes de repetir.';
      setError(message); throw new Error(message);
    } finally { lock.current = false; setBusy(false); }
  }
  return { run, busy: busy || reconciling, error, operation, reconciling };
}

export function ReceiptLink({ hash }: { hash?: string | null }) {
  return hash && /^[a-f0-9]{64}$/i.test(hash) ? <a href={`https://stellar.expert/explorer/testnet/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-sky-700 underline">Ver recibo en Stellar Testnet</a> : null;
}
export function OperationNotice({ operation }: { operation?: PrivateOperation | null }) {
  if (!operation) return null;
  try { verifiedOperation(operation); } catch { return <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">No se pudo verificar el estado de esta operación. Actualiza antes de continuar.</p>; }
  const detail = operationNoticeDetail(operation);
  const labels: Record<PrivateOperation['state'], string> = { awaiting_signature: 'Pendiente de tu firma', submitted: 'Enviada · esperando confirmación', confirmed: 'Operación confirmada', failed: 'Operación fallida', cancelled: 'Operación cancelada' };
  const actionLabels: Record<OperationAction, string> = { consent: 'Permiso de emisión', withdraw_consent: 'Retirada del permiso', mint: 'Emisión de receta', activate: 'Activación', revoke: 'Revocación' };
  return <div role="status" className={`rounded-xl p-3 text-sm ${operation.state === 'confirmed' ? 'bg-emerald-50 text-emerald-800' : operation.state === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-800'}`}>
    <p className="font-medium">{actionLabels[operation.action]} · {labels[operation.state]}</p>
    {operation.state === 'submitted' && <p className="mt-1 text-xs">Puedes recargar. Recuperaremos esta misma operación.</p>}
    {detail && <p className="mt-1 text-xs">{detail}</p>}
    <ReceiptLink hash={operation.transactionHash} />
  </div>;
}

export function ConfirmationButton({ label, title, children, onConfirm, disabled = false, confirmDisabled = false, danger = false }: {
  label: string; title: string; children: React.ReactNode; onConfirm: () => Promise<unknown>; disabled?: boolean; confirmDisabled?: boolean; danger?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    if (lock.current || disabled || confirmDisabled) return;
    lock.current = true; setBusy(true); setError('');
    try { await onConfirm(); dialog.current?.close(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se completó la confirmación.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <button disabled={disabled || busy} onClick={() => { setError(''); dialog.current?.showModal(); }} className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${danger ? 'border border-rose-200 text-rose-700 hover:bg-rose-50' : 'bg-sky-600 text-white hover:bg-sky-700'}`}>{label}</button>
    <dialog ref={dialog} aria-label={title} onCancel={event => { if (busy) event.preventDefault(); }} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-lg rounded-2xl bg-white p-6 shadow-xl backdrop:bg-slate-950/50">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-3 text-sm text-slate-600">{children}</div>
      <p className="mt-4 text-xs text-slate-500">Tu wallet Stellar firma con Privy. TrustLeaf paga la comisión. Solo datos de prueba.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button disabled={busy} onClick={() => dialog.current?.close()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-40">Volver</button>
        <button disabled={busy || disabled || confirmDisabled} onClick={() => void confirm()} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${danger ? 'bg-rose-600' : 'bg-sky-600'}`}>{busy ? 'Confirmando…' : 'Confirmar con mi cuenta'}</button>
      </div>
    </dialog>
  </>;
}
