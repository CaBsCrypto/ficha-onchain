'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { probeDocumentAccess, type AccessProbeResult } from './access-probe';

/** Temporary D3 evidence aid. Existing API authorization remains authoritative. */
export function AccessProbe() {
  const search = useSearchParams();
  const { ready, authenticated, user } = usePrivy();
  const enabled = search.get('access-check') === '1';
  const [id, setId] = useState('');
  const [result, setResult] = useState<AccessProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current?.abort(); active.current = null;
    setResult(null); setError(''); setBusy(false);
    return () => { active.current?.abort(); active.current = null; };
  }, [user?.id, authenticated, enabled]);
  if (!enabled) return null;
  async function check() {
    if (!ready || !authenticated || !user || active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setResult(null);
    try {
      const next = await probeDocumentAccess(id.trim(), authedFetch, controller.signal);
      if (active.current === controller && !controller.signal.aborted) setResult(next);
    } catch {
      if (active.current === controller && !controller.signal.aborted) setError('Comprobación inconclusa. Revisa el identificador y la conexión.');
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  return <aside className="m-4 rounded-xl border border-sky-200 bg-sky-50 p-5 text-slate-900" aria-label="Comprobación temporal D3">
    <h2 className="font-semibold">Comprobación temporal de acceso · D3</h2>
    <p className="my-2 text-sm">Cuenta: {authenticated ? user?.email?.address ?? 'Sesión Privy' : 'Sin sesión'}. Consulta de lectura; no firma ni transmite transacciones.</p>
    <label className="block text-sm">Identificador interno de receta del ensayo
      <input value={id} disabled={busy} onChange={event => { setId(event.target.value); setResult(null); }} className="m-2 w-80 max-w-full rounded border bg-white p-2" autoComplete="off" />
    </label>
    <button disabled={!ready || !authenticated || busy || !id.trim()} onClick={() => void check()} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-40">{busy ? 'Comprobando…' : 'Comprobar acceso al documento'}</button>
    {result && <p role="status" className="mt-3 font-semibold">HTTP {result.status} · {result.outcome === 'allowed' ? 'Acceso permitido; contenido no mostrado' : result.outcome === 'denied' ? 'Recurso no accesible para esta sesión' : 'Resultado inconcluso; no acredita permisos'}</p>}
    {error && <p role="alert">{error}</p>}
    <p className="mt-2 text-xs">Usar sólo un ID de prueba cuya existencia se haya verificado. Un 401 indica falta de autenticación; un 404 requiere contrastar que el recurso existe. No se muestra ni guarda el contenido recibido. Retirar este control tras la validación D3.</p>
  </aside>;
}
