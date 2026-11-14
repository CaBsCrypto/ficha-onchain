'use client';
import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { authedFetch } from '@/lib/auth/authed-fetch';
import type { ClinicalOperation } from '@/types/clinical';
import { usePortalWallet } from './WalletBoundary';
import { ClinicalDraftWorkspace } from './ClinicalDraftWorkspace';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const TIMEOUT_MS = 15_000;
const labels: Record<ClinicalOperation['state'], string> = { awaiting_signature: 'Pendiente de firma', submitted: 'Enviado; resultado pendiente',
  confirmed: 'Confirmado en Stellar Testnet', failed: 'Fallido', cancelled: 'Cancelado' };
const unavailable = 'No recibimos un estado verificable. Consulta el mismo intento antes de continuar.';
const button = 'min-h-11 rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50';
function operation(value: unknown, id: string): ClinicalOperation {
  const op = value as ClinicalOperation;
  if (!op || op.id !== id || !UUID.test(op.id) || !['create_history','append_version','set_permissions'].includes(op.action) ||
      !Object.hasOwn(labels, op.state) || !Number.isSafeInteger(op.expiresAt) || op.expiresAt <= 0 ||
      op.transactionHash !== null && (typeof op.transactionHash !== 'string' || !HASH.test(op.transactionHash)) ||
      op.errorCode !== null && (typeof op.errorCode !== 'string' || !/^[a-z][a-z0-9_]{0,95}$/.test(op.errorCode)) ||
      (['submitted','confirmed','failed'].includes(op.state) ? op.transactionHash === null : op.transactionHash !== null)) throw Error();
  // Signing material and any unexpected response content are never retained.
  return { id: op.id, action: op.action, state: op.state, expiresAt: op.expiresAt, transactionHash: op.transactionHash, errorCode: op.errorCode };
}
function RecoveryScope({ identity }: { identity: string }) {
  const [selected, setSelected] = useState<string | null>(null), [saved, setSaved] = useState<ClinicalOperation | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [review, setReview] = useState(false);
  const alive = useRef(false), locked = useRef(false), active = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { alive.current = true; return () => {
    alive.current = false; active.current?.abort(); if (timer.current !== null) clearTimeout(timer.current);
  }; }, [identity]);

  async function requestOwn(id: string, cancel = false) {
    if (!UUID.test(id) || locked.current || !alive.current) return;
    if (cancel && (!saved || saved.id !== id || saved.state !== 'awaiting_signature' || saved.transactionHash !== null || !review)) return;
    const controller = new AbortController(); active.current?.abort(); active.current = controller; locked.current = true;
    const current = () => alive.current && active.current === controller;
    setSelected(id); setBusy(true); setSaved(null); setError(''); setNotice(''); setReview(false);
    const deadline = setTimeout(() => {
      if (current()) { setBusy(false); setSaved(null); setError(unavailable); locked.current = false; active.current = null; }
      controller.abort();
    }, TIMEOUT_MS); timer.current = deadline;
    let message = unavailable;
    try {
      const response = await authedFetch('/api/private-clinical-operations/' + encodeURIComponent(id) + (cancel ? '/cancel' : ''), {
        method: cancel ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        ...(cancel ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) } : {}),
      });
      if (!response.ok) {
        if (response.status === 401) message = 'Tu sesión venció. Vuelve a ingresar para recuperar tus borradores.';
        if (response.status === 403) message = 'Esta cuenta no puede consultar ese intento.';
        if (response.status === 404) message = 'No encontramos ese intento para tu cuenta.';
        throw Error();
      }
      const body = await response.json(), result = operation(body.operation, id);
      if (!current() || controller.signal.aborted) return;
      setSaved(result);
      if (cancel) {
        if (result.state !== 'cancelled' || result.transactionHash !== null) {
          setError('El intento cambió. Conservamos su estado y debes consultarlo antes de continuar.');
        } else setNotice('Solicitud cancelada sin firma ni envío. Revisa el borrador vinculado para continuar en un nuevo borrador.');
      }
    } catch { if (current() && !controller.signal.aborted) setError(message); }
    finally {
      clearTimeout(deadline); if (timer.current === deadline) timer.current = null;
      if (current()) { setBusy(false); locked.current = false; active.current = null; }
    }
  }
  const canCancel = saved?.state === 'awaiting_signature' && saved.transactionHash === null;
  return <section aria-label="Recuperación de mis borradores" className="mt-5 space-y-3 text-left">
    <h2 className="text-lg font-semibold text-slate-900">Recuperar contenido de tu cuenta</h2>
    <p className="text-sm text-slate-600">Puedes abrir tus borradores y consultar sus intentos. Publicar requiere volver a comprobar la autorización médica y los permisos del paciente.</p>
    <ClinicalDraftWorkspace key={identity} identity={identity} role="doctor" recoveryOnly canPublish={false} disabled={false}
      onPrepare={async () => { throw new Error('La recuperación no prepara publicaciones ni solicita firmas.'); }}
      onReopen={id => { void requestOwn(id); }} />
    {(selected || busy || error) && <section aria-label="Intento propio vinculado" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">Estado de tu intento</h3>
      {busy && <p role="status" className="text-sm text-slate-600">Consultando el mismo intento…</p>}
      {saved && <div className="space-y-2 text-sm">
        <p role="status" className="text-slate-800">{saved.state === 'cancelled' && saved.errorCode === 'signature_request_expired' ? 'Solicitud de firma vencida' : labels[saved.state]}</p>
        {saved.transactionHash && <p className="break-all text-xs text-slate-600">{saved.state === 'confirmed' ? 'Comprobante: ' : 'Referencia de transacción: '}<code>{saved.transactionHash}</code></p>}
        {canCancel && <button type="button" disabled={busy} className={button} onClick={() => setReview(true)}>Cancelar solicitud pendiente</button>}
      </div>}
      {review && canCancel && <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <p>Cancelaremos sólo la solicitud que aún no tiene firma ni envío. Después podrás conservar su contenido en un nuevo borrador.</p>
        <button type="button" disabled={busy} className={button} onClick={() => { if (saved) void requestOwn(saved.id, true); }}>Confirmar cancelación sin firma</button>
        <button type="button" disabled={busy} className={button + ' ml-2'} onClick={() => setReview(false)}>Conservar solicitud</button>
      </div>}
      {selected && <button type="button" disabled={busy} className={button} onClick={() => void requestOwn(selected)}>Consultar el mismo intento</button>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    </section>}
  </section>;
}
/** Author-only recovery remains separate from medical privileges and never loads a patient context. */
export function DoctorDraftRecovery() {
  const { ready, authenticated, user } = usePrivy(), wallet = usePortalWallet();
  const identity = ready && authenticated && user?.id ? user.id + ':' + wallet.walletId + ':' + wallet.address : '';
  if (!identity) return <p role="status" className="mt-4 text-sm text-slate-600">Ingresa con tu cuenta para recuperar tus borradores privados.</p>;
  return <RecoveryScope key={identity} identity={identity} />;
}
