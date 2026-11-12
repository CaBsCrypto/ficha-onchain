/**
 * fetch() that proves who is calling.
 *
 * Attaches the caller's Privy access token, which the server verifies with
 * `requireUser()` in `src/lib/auth/privy-auth.ts`. Any route that reads or
 * writes someone's data should be called through this rather than plain
 * fetch(), because the alternative — passing `?email=` and having the server
 * trust it — is what let anyone read any patient's record.
 *
 * `getAccessToken` is Privy's standalone export, so this works outside React
 * and does not need `usePrivy()` threaded down through the component tree.
 *
 * Usage is identical to fetch():
 *
 *   const res = await authedFetch("/api/patient/ficha");
 */
import { getAccessToken } from "@privy-io/react-auth";
import { clientClinicalReadDiagnostics, createClientClinicalReadTrace } from '@/lib/clinical/read-trace-client';
import { CLINICAL_READ_DIAGNOSTICS_HEADER, clinicalReadStage, emitClinicalReadTrace, type ClinicalReadTrace } from '@/lib/clinical/read-trace';

export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  suppliedTrace?: ClinicalReadTrace,
): Promise<Response> {
  init.signal?.throwIfAborted();
  const enabled = clientClinicalReadDiagnostics(input, init);
  const diagnostic = enabled && !suppliedTrace ? createClientClinicalReadTrace(input, init) : undefined;
  const trace = enabled ? suppliedTrace ?? diagnostic?.trace : undefined;
  try {
    const token = await clinicalReadStage(trace, 'token', () => getAccessToken());
    init.signal?.throwIfAborted();
    const headers = new Headers(init.headers);
    headers.delete(CLINICAL_READ_DIAGNOSTICS_HEADER);
    if (enabled) headers.set(CLINICAL_READ_DIAGNOSTICS_HEADER, '1');
    if (token) headers.set('Authorization', 'Bearer ' + token);
    // A missing token still reaches the existing server-side denial.
    const response = await clinicalReadStage(trace, 'fetch', () => fetch(input, { ...init, headers }));
    emitClinicalReadTrace(trace, 'headers', 'ok');
    return response;
  } finally { diagnostic?.close(); }
}
