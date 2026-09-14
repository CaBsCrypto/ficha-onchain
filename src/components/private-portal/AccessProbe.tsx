'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { probeDocumentAccess, probeMedicalAction, type AccessProbeResult, type MedicalProbeResult } from './access-probe';

/** Temporary D3 evidence aid. Existing API authorization remains authoritative. */
export function AccessProbe() {
  const search = useSearchParams();
  const { ready, authenticated, user } = usePrivy();
  const enabled = search.get('access-check') === '1';
  const [id, setId] = useState('');
  const [result, setResult] = useState<AccessProbeResult | null>(null);
  const [medicalResult, setMedicalResult] = useState<MedicalProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current?.abort(); active.current = null;
    setResult(null); setMedicalResult(null); setError(''); setBusy(false);
    return () => { active.current?.abort(); active.current = null; };
  }, [user?.id, authenticated, enabled]);
  if (!enabled) return null;
  const isRehearsalPatient = user?.email?.address?.toLowerCase() === 'brownsstudiocontact@gmail.com';
  async function check(medical = false) {
    if (!ready || !authenticated || !user || active.current) return;
    if (medical && !isRehearsalPatient) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setResult(null); setMedicalResult(null);
    try {
      if (medical) {
        const next = await probeMedicalAction(authedFetch, controller.signal);
        if (active.current === controller && !controller.signal.aborted) setMedicalResult(next);
      } else {
        const next = await probeDocumentAccess(id.trim(), authedFetch, controller.signal);
        if (active.current === controller && !controller.signal.aborted) setResult(next);
      }
    } catch {
      if (active.current === controller && !controller.signal.aborted) setError('Comprobación inconclusa. Revisa el identificador y la conexión.');
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  return <aside className="m-4 rounded-xl border border-sky-200 bg-sky-50 p-5 text-slate-900" aria-label="Comprobación temporal D3">
    <h2 className="font-semibold">Comprobación temporal de acceso · D3</h2>
    <p className="my-2 text-sm">Cuenta: {authenticated ? user?.email?.address ?? 'Sesión Privy' : 'Sin sesión'}. No firma ni transmite transacciones a Stellar.</p>
    <label className="block text-sm">Identificador interno de receta del ensayo
      <input value={id} disabled={busy} onChange={event => { setId(event.target.value); setResult(null); }} className="m-2 w-80 max-w-full rounded border bg-white p-2" autoComplete="off" />
    </label>
    <button disabled={!ready || !authenticated || busy || !id.trim()} onClick={() => void check()} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-40">{busy ? 'Comprobando…' : 'Comprobar acceso al documento'}</button>
    {result && <p role="status" className="mt-3 font-semibold">HTTP {result.status} · {result.outcome === 'allowed' ? 'Acceso permitido; contenido no mostrado' : result.outcome === 'denied' ? 'Recurso no accesible para esta sesión' : 'Resultado inconcluso; no acredita permisos'}</p>}
    <div className="mt-4 border-t border-sky-200 pt-3">
      <p className="mb-2 text-sm">Paciente del ensayo: comprobar rechazo a preparar la revocación de #7. No confirma la operación ni solicita firma. Una aceptación inesperada obliga a detener el ensayo.</p>
      <button disabled={!ready || !authenticated || !isRehearsalPatient || busy || medicalResult?.outcome === 'unexpected'} onClick={() => void check(true)} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-40">Comprobar bloqueo de acción médica</button>
      {!isRehearsalPatient && <p className="mt-1 text-xs">Disponible sólo con la cuenta del paciente del ensayo.</p>}
      {medicalResult && <p role="status" className="mt-3 font-semibold">HTTP {medicalResult.status} · {medicalResult.outcome === 'denied' ? 'Acción médica rechazada por permisos' : medicalResult.outcome === 'unexpected' ? 'Preparación aceptada inesperadamente. Detener ensayo; no firmar.' : 'Resultado inconcluso; no acredita rechazo por permisos'}</p>}
    </div>
    {error && <p role="alert">{error}</p>}
    <p className="mt-2 text-xs">Usar sólo un ID de prueba cuya existencia se haya verificado. Un 401 indica falta de autenticación; un 404 requiere contrastar que el recurso existe. No se muestra ni guarda el contenido recibido. Retirar este control tras la validación D3.</p>
  </aside>;
}
