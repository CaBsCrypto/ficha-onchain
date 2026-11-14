import 'server-only';
import { CLINICAL_READ_DIAGNOSTICS_HEADER, createClinicalReadTrace, emitClinicalReadTrace, isClinicalReadPath, isLoopbackHost } from './read-trace';
/** Local opt-in GET diagnostics do not change authentication or allowed routes. */
export function createServerClinicalReadTrace(request: Request) {
  if (process.env.TRUSTLEAF_CLINICAL_READ_DIAGNOSTICS !== 'true' || request.method !== 'GET' || request.headers.get(CLINICAL_READ_DIAGNOSTICS_HEADER) !== '1') return undefined;
  try {
    const url = new URL(request.url), host = request.headers.get('host');
    if (!isLoopbackHost(url.hostname) || !isClinicalReadPath(url.pathname) || !host || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(host)) return undefined;
  } catch { return undefined; }
  const diagnostic = createClinicalReadTrace('server');
  const aborted = () => emitClinicalReadTrace(diagnostic.trace, 'ingress', 'aborted');
  request.signal.addEventListener('abort', aborted, { once: true });
  return { trace: diagnostic.trace, close: () => { request.signal.removeEventListener('abort', aborted); diagnostic.close(); } };
}
