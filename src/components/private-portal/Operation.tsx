'use client';
import { useEffect, useRef, useState } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { usePortalWallet } from './WalletBoundary';
import { portalApi, jsonBody, localDate } from './client';
import { signingPayload } from './state';
import { mergeOperation, recoverPrivateOperation, verifiedOperation } from './operation-recovery';
import { operationNoticeDetail } from './errors';
import type { OperationAction, PrivateOperation, PrivateSponsorshipQuote } from './types';

export type ReviewSponsorshipQuote = (quote: PrivateSponsorshipQuote) => Promise<boolean>;
class SponsorshipQuoteError extends Error {}

function quoteAvailable(quote: PrivateSponsorshipQuote, now = Date.now()) {
  return typeof quote.maxFeeStroops === 'string' && /^[1-9]\d{0,19}$/.test(quote.maxFeeStroops) &&
    Number.isSafeInteger(quote.quotePreparedAt) && quote.quotePreparedAt > 0 &&
    Number.isSafeInteger(quote.quoteExpiresAt) && quote.quoteExpiresAt > quote.quotePreparedAt &&
    quote.quoteExpiresAt - quote.quotePreparedAt <= 300 &&
    quote.quoteExpiresAt * 1000 > now;
}

function xlmQuote(stroops: string) {
  const digits = stroops.padStart(8, '0');
  return digits.slice(0, -7) + '.' + digits.slice(-7);
}

const operationCopy = {
  es: {
    verifyFailed: 'No se pudo verificar la operación.',
    waiting: 'Estamos consultando la confirmación anterior. Espera su resultado antes de continuar.',
    checkStatus: 'La operación no se confirmó. Revisa su estado antes de continuar.',
    signatureFailed: 'No se completó tu firma. Puedes revisar y confirmar nuevamente.',
    confirmUncertain: 'La confirmación no devolvió un resultado verificable. Estamos consultando esta misma operación; no vuelvas a firmarla todavía.',
    operationFailed: 'No se completó la operación. Consulta el estado antes de repetir.',
    receipt: 'Ver recibo en Stellar Testnet',
    statusUnverified: 'No se pudo verificar el estado de esta operación. Actualiza antes de continuar.',
    awaiting_signature: 'Pendiente de tu firma',
    submitted: 'Enviada · esperando confirmación',
    confirmed: 'Operación confirmada',
    failed: 'Operación fallida',
    cancelled: 'Operación cancelada',
    consent: 'Permiso de emisión',
    withdraw_consent: 'Retirada del permiso',
    mint: 'Emisión de receta',
    activate: 'Activación',
    revoke: 'Revocación',
    resume: 'Puedes recargar. Recuperaremos esta misma operación.',
    failedConfirmation: 'No se completó la confirmación.',
    signingAccount: 'Tu wallet Stellar firma con Privy. TrustLeaf paga la comisión. Solo datos de prueba.',
    back: 'Volver',
    confirming: 'Confirmando…',
    confirm: 'Confirmar con mi cuenta',
    confirmQuote: 'Confirmar con Privy',
    quoteExpired: 'La cotización venció. Vuelve a revisar el estado antes de firmar.',
    quoteFee: 'Comisión máxima patrocinada',
    quoteExpires: 'Vence',
  },
  en: {
    verifyFailed: 'We couldn’t verify the operation.',
    waiting: 'We’re checking the previous confirmation. Wait for the result before continuing.',
    checkStatus: 'The operation is unconfirmed. Check its status before continuing.',
    signatureFailed: 'The signature did not complete. You can review and confirm again.',
    confirmUncertain: 'We couldn’t verify the confirmation. We’re checking the same operation. Wait before signing again.',
    operationFailed: 'The operation did not complete. Check its status before trying again.',
    receipt: 'View receipt on Stellar Testnet',
    statusUnverified: 'We couldn’t verify this operation’s status. Refresh before continuing.',
    awaiting_signature: 'Awaiting your signature',
    submitted: 'Submitted · awaiting confirmation',
    confirmed: 'Operation confirmed',
    failed: 'Operation failed',
    cancelled: 'Operation cancelled',
    consent: 'Issuance permission',
    withdraw_consent: 'Permission withdrawal',
    mint: 'Prescription issuance',
    activate: 'Activation',
    revoke: 'Revocation',
    resume: 'You can refresh the page to reopen this operation.',
    failedConfirmation: 'The confirmation did not complete.',
    signingAccount: 'Your Stellar wallet signs through Privy. TrustLeaf covers the fee. Use test data only.',
    back: 'Back',
    confirming: 'Confirming…',
    confirm: 'Confirm with my account',
    confirmQuote: 'Confirm with Privy',
    quoteExpired: 'The quote expired. Review the operation status before signing.',
    quoteFee: 'Maximum sponsored fee',
    quoteExpires: 'Expires',
  },
};

export function usePrivateOperation(initialOperation?: PrivateOperation | null) {
  const language = usePortalLanguage();
  const copy = operationCopy[language];
  const wallet = usePortalWallet();
  const walletAddress = useRef(wallet.address);
  walletAddress.current = wallet.address;
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
      } catch (failure) { setError(language === 'es' && failure instanceof Error ? failure.message : copy.verifyFailed); }
    }
  }, [initialOperation?.id, initialOperation?.state, busy]);
  useEffect(() => {
    if (!operation) return;
    const controller = new AbortController();
    void recoverPrivateOperation(operation, {
      read: async (id, signal) => (await portalApi<{ operation: PrivateOperation }>(`/api/private-operations/${encodeURIComponent(id)}`, { signal })).operation,
      onUpdate: next => { setOperation(current => mergeOperation(current, next)); setError(''); if (next.state !== 'submitted') setReconciling(false); },
      onError: message => setError(language === 'es' ? message : copy.verifyFailed), signal: controller.signal, reconcileUncertain: reconciling,
    });
    return () => controller.abort();
  }, [operation?.id, operation?.state, reconciling]);
  async function run(
    action: OperationAction,
    resource: { appointmentId: number } | { prescriptionId: string },
    reviewQuote: ReviewSponsorshipQuote,
  ) {
    if (lock.current || reconciling) throw new Error(copy.waiting);
    lock.current = true; setBusy(true); setError('');
    let stage = 'prepare';
    try {
      const prepared = await portalApi<{ operation: PrivateOperation }>('/api/private-operations', jsonBody({ action, ...resource, confirmed: true }));
      verifiedOperation(prepared.operation, { action });
      setOperation(prepared.operation);
      if (['submitted', 'confirmed'].includes(prepared.operation.state)) return prepared.operation;
      const quote = prepared.operation.sponsorship;
      if (quote) {
        if (!quoteAvailable(quote) || !prepared.operation.expiresAt || quote.quoteExpiresAt > prepared.operation.expiresAt) {
          throw new SponsorshipQuoteError(copy.quoteExpired);
        }
        if (!await reviewQuote(quote)) return prepared.operation;
        if (!quoteAvailable(quote)) throw new SponsorshipQuoteError(copy.quoteExpired);
      }
      const payload = signingPayload(prepared.operation, walletAddress.current);
      stage = 'sign';
      const { signature } = await signRawHash(payload);
      if (quote && !quoteAvailable(quote)) throw new SponsorshipQuoteError(copy.quoteExpired);
      stage = 'confirm';
      const result = await portalApi<{ operation: PrivateOperation }>(`/api/private-operations/${encodeURIComponent(prepared.operation.id)}/confirm`, jsonBody({ signature }));
      verifiedOperation(result.operation, prepared.operation);
      setOperation(result.operation);
      if (!['submitted', 'confirmed'].includes(result.operation.state)) throw new Error(copy.checkStatus);
      return result.operation;
    } catch (failure) {
      if (stage === 'confirm') setReconciling(true);
      const message = stage === 'sign' ? copy.signatureFailed : stage === 'confirm' ? copy.confirmUncertain :
        language === 'es' && failure instanceof Error ? failure.message : copy.operationFailed;
      if (failure instanceof SponsorshipQuoteError) { setError(failure.message); throw failure; }
      setError(message); throw new Error(message);
    } finally { lock.current = false; setBusy(false); }
  }
  return { run, busy: busy || reconciling, error, operation, reconciling };
}

export function ReceiptLink({ hash, label }: { hash?: string | null; label?: string }) {
  const language = usePortalLanguage();
  const copy = operationCopy[language];
  return hash && /^[a-f0-9]{64}$/i.test(hash) ? <a href={`https://stellar.expert/explorer/testnet/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-sky-700 underline">{label ?? copy.receipt}</a> : null;
}
export function OperationNotice({ operation }: { operation?: PrivateOperation | null }) {
  const language = usePortalLanguage();
  const copy = operationCopy[language];
  if (!operation) return null;
  try { verifiedOperation(operation); } catch { return <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{copy.statusUnverified}</p>; }
  const detail = operationNoticeDetail(operation);
  const labels: Record<PrivateOperation['state'], string> = { awaiting_signature: copy.awaiting_signature, submitted: copy.submitted, confirmed: copy.confirmed, failed: copy.failed, cancelled: copy.cancelled };
  const actionLabels: Record<OperationAction, string> = { consent: copy.consent, withdraw_consent: copy.withdraw_consent, mint: copy.mint, activate: copy.activate, revoke: copy.revoke };
  return <div role="status" className={`rounded-xl p-3 text-sm ${operation.state === 'confirmed' ? 'bg-emerald-50 text-emerald-800' : operation.state === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-800'}`}>
    <p className="font-medium">{actionLabels[operation.action]} · {labels[operation.state]}</p>
    {operation.state === 'submitted' && (language === 'es' || !detail) && <p className="mt-1 text-xs">{copy.resume}</p>}
    {detail && <p className="mt-1 text-xs">{language === 'es' ? detail : operation.state === 'submitted' ? copy.resume : copy.checkStatus}</p>}
    <ReceiptLink hash={operation.transactionHash} />
  </div>;
}

export function ConfirmationButton({ label, title, children, onConfirm, disabled = false, confirmDisabled = false, danger = false }: {
  label: string; title: string; children: React.ReactNode; onConfirm: (reviewQuote: ReviewSponsorshipQuote) => Promise<unknown>; disabled?: boolean; confirmDisabled?: boolean; danger?: boolean;
}) {
  const language = usePortalLanguage();
  const copy = operationCopy[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const active = useRef(true);
  const quoteDecision = useRef<((approve: boolean) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<PrivateSponsorshipQuote | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; quoteDecision.current?.(false); quoteDecision.current = null; };
  }, []);
  useEffect(() => {
    if (!quote) return;
    const timeout = window.setTimeout(() => setQuoteExpired(true), Math.max(0, quote.quoteExpiresAt * 1000 - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [quote]);
  function reviewQuote(next: PrivateSponsorshipQuote) {
    if (!active.current) return Promise.resolve(false);
    setQuoteExpired(!quoteAvailable(next));
    setQuote(next);
    return new Promise<boolean>(resolve => { quoteDecision.current = resolve; });
  }
  function decideQuote(approve: boolean) {
    const resolve = quoteDecision.current;
    if (!resolve) return;
    quoteDecision.current = null;
    setQuote(null);
    resolve(approve);
  }
  async function confirm() {
    if (quote) {
      if (!quoteAvailable(quote)) { setQuoteExpired(true); return; }
      decideQuote(true);
      return;
    }
    if (lock.current || disabled || confirmDisabled) return;
    lock.current = true; setBusy(true); setError('');
    try { await onConfirm(reviewQuote); dialog.current?.close(); }
    catch (failure) {
      setError(failure instanceof SponsorshipQuoteError || (language === 'es' && failure instanceof Error) ? failure.message : copy.failedConfirmation);
    }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <button disabled={disabled || busy} onClick={() => { setError(''); dialog.current?.showModal(); }} className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${danger ? 'border border-rose-200 text-rose-700 hover:bg-rose-50' : 'bg-sky-600 text-white hover:bg-sky-700'}`}>{label}</button>
    <dialog ref={dialog} aria-label={title} onCancel={event => {
      if (quote) decideQuote(false);
      else if (busy) event.preventDefault();
    }} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-lg rounded-2xl bg-white p-6 shadow-xl backdrop:bg-slate-950/50">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-3 text-sm text-slate-600">{children}</div>
      <p className="mt-4 text-xs text-slate-500">{copy.signingAccount}</p>
      {quote && <div role="status" className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <p className="font-medium">{copy.quoteFee}: {xlmQuote(quote.maxFeeStroops)} XLM · Stellar Testnet</p>
        <p className="mt-1 text-xs">{copy.quoteExpires}: {localDate(quote.quoteExpiresAt, language)} · {language === 'en' ? 'Chile time' : 'Hora de Chile'}</p>
        {quoteExpired && <p role="alert" className="mt-2 text-xs text-rose-700">{copy.quoteExpired}</p>}
      </div>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button disabled={busy && !quote} onClick={() => { decideQuote(false); dialog.current?.close(); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-40">{copy.back}</button>
        <button disabled={quote ? quoteExpired || confirmDisabled : busy || disabled || confirmDisabled} onClick={() => void confirm()} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${danger ? 'bg-rose-600' : 'bg-sky-600'}`}>{quote ? copy.confirmQuote : busy ? copy.confirming : copy.confirm}</button>
      </div>
    </dialog>
  </>;
}
