'use client';
import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { portalErrorMessage } from './errors';

export class PortalApiError extends Error {
  constructor(public readonly code: string, status: number) {
    super(portalErrorMessage(code, status));
  }
}

export async function portalApi<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await authedFetch(url, { cache: 'no-store', ...init }); }
  catch { throw new Error('No se pudo conectar. Conservamos el estado para que puedas volver a consultar.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    const code = body && typeof body.error === 'string' ? body.error : '';
    throw new PortalApiError(code, response.status);
  }
  return body as T;
}
export const jsonBody = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function usePortalData<T>(path: string | null, interval = 3000, { pauseWhenHidden = false } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingFreshness, setCheckingFreshness] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { setData(null); setError(''); setResultPath(null); setLoading(true); setCheckingFreshness(false); }, [path]);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    const url = path;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastStartedAt = -Infinity;
    let disposed = false;
    let resumeNeeded = true;
    let awaitingPageShow = false;
    function canPoll() {
      return !disposed && (!pauseWhenHidden || (!awaitingPageShow && document.visibilityState === 'visible'));
    }
    async function poll() {
      if (!canPoll() || request) return;
      clearTimeout(timer);
      const controller = new AbortController();
      request = controller;
      lastStartedAt = Date.now();
      try {
        const next = await portalApi<T>(url, { signal: controller.signal });
        if (request === controller && canPoll()) {
          setData(next); setResultPath(url); setError('');
        }
      } catch (failure) {
        if (request === controller && canPoll()) setError(failure instanceof Error ? failure.message : 'No se pudo consultar.');
      } finally {
        if (request === controller) {
          request = undefined;
          if (canPoll()) {
            setLoading(false);
            setCheckingFreshness(false);
            if (interval > 0) timer = setTimeout(() => void poll(), interval);
          }
        }
      }
    }
    function stop() {
      clearTimeout(timer);
      const current = request;
      request = undefined;
      current?.abort();
    }
    function suspend() {
      stop();
      resumeNeeded = true;
      setCheckingFreshness(true);
    }
    function resume() {
      if (!resumeNeeded || !canPoll()) return;
      resumeNeeded = false;
      void poll();
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') resume();
      else suspend();
    }
    function onFocus() {
      if (!canPoll()) return;
      if (resumeNeeded) resume();
      else if (interval > 0 && Date.now() - lastStartedAt >= interval) {
        setCheckingFreshness(true);
        void poll();
      }
    }
    function onPageHide(event: PageTransitionEvent) {
      if (!event.persisted) return;
      awaitingPageShow = true;
      suspend();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      if (!awaitingPageShow) suspend();
      awaitingPageShow = false;
      resume();
    }
    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('focus', onFocus);
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('pageshow', onPageShow);
      onVisibilityChange();
    } else void poll();
    return () => {
      disposed = true;
      stop();
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
      }
    };
  }, [path, revision, interval, pauseWhenHidden]);
  return {
    data: path && resultPath === path ? data : null,
    error, loading: !!path && (loading || resultPath !== path && !error),
    checkingFreshness: pauseWhenHidden && checkingFreshness, refresh,
  };
}
export function localDate(timestamp?: number | null, language: 'es' | 'en' = 'es') {
  if (!timestamp) return language === 'en' ? 'Pending' : 'Pendiente';
  return new Date(timestamp * 1000).toLocaleString(language === 'en' ? 'en-US' : 'es-CL', { timeZone: 'America/Santiago' });
}
export function chileDateTime(timestamp: number, language: 'es' | 'en') {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23',
  }).format(timestamp * 1000);
}
export function santiagoToday() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}

/** Calendar dates are already in Santiago; UTC prevents shifting their calendar day. */
export function appointmentDate(date: string, language: 'es' | 'en' = 'es') {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-CL', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date.slice(0, 10) + 'T12:00:00Z'));
}
