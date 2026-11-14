import { createClinicalReadTrace, isClinicalReadPath, isLoopbackHost } from './read-trace';
/** Exact local fragment is an observation switch, never an access capability. */
export function clientClinicalReadDiagnostics(input: RequestInfo | URL, init: RequestInit = {}) {
  if (typeof window === 'undefined' || window.location.hash !== '#clinical-read-diagnostics' || !isLoopbackHost(window.location.hostname)) return false;
  try {
    const method = init.method ?? (input instanceof Request ? input.method : 'GET');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
    return method.toUpperCase() === 'GET' && url.origin === window.location.origin && isLoopbackHost(url.hostname) && isClinicalReadPath(url.pathname);
  } catch { return false; }
}
export function createClientClinicalReadTrace(input: RequestInfo | URL, init: RequestInit = {}) {
  return clientClinicalReadDiagnostics(input, init) ? createClinicalReadTrace('client') : undefined;
}
