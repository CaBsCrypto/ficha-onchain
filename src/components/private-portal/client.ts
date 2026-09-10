'use client';
import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { portalErrorMessage } from './errors';
export async function portalApi<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await authedFetch(url, { cache: 'no-store', ...init }); }
  catch { throw new Error('No se pudo conectar. Conservamos el estado para que puedas volver a consultar.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    const code = body && typeof body.error === 'string' ? body.error : '';
    throw new Error(portalErrorMessage(code, response.status));
  }
  return body as T;
}
export const jsonBody = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function usePortalData<T>(path: string | null, interval = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { setData(null); setLoading(true); }, [path]);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    const controller = new AbortController();
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await portalApi<T>(path!, { signal: controller.signal });
        if (alive) { setData(next); setError(''); }
      } catch (failure) { if (alive) setError(failure instanceof Error ? failure.message : 'No se pudo consultar.'); }
      finally { if (alive) { setLoading(false); if (interval > 0) timer = setTimeout(() => void poll(), interval); } }
    }
    void poll();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [path, revision, interval]);
  return { data, error, loading, refresh };
}
export function localDate(timestamp?: number | null) {
  return timestamp ? new Date(timestamp * 1000).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Pendiente';
}
export function santiagoToday() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}
