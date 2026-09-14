export type AccessProbeResult = { status: number; outcome: 'allowed' | 'denied' | 'inconclusive' };
export type MedicalProbeResult = { status: number; outcome: 'denied' | 'unexpected' | 'inconclusive' };

// Fixed synthetic rehearsal resource. This probe never signs or confirms an operation.
export const MEDICAL_PROBE_PRESCRIPTION_ID = 'ce47f381-dbd5-4ca6-bdd3-297f28043049';
export async function probeMedicalAction(request: typeof fetch, signal: AbortSignal): Promise<MedicalProbeResult> {
  const response = await request('/api/private-operations', {
    method: 'POST', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'revoke', prescriptionId: MEDICAL_PROBE_PRESCRIPTION_ID, confirmed: true }),
  });
  let denied = false;
  // Only interpret the known permission code; discard successful preparation payloads entirely.
  if (response.status === 403) {
    try { denied = (await response.json())?.error === 'forbidden'; } catch { /* inconclusive */ }
  } else await response.body?.cancel();
  return { status: response.status, outcome: denied ? 'denied' : response.status >= 200 && response.status < 300 ? 'unexpected' : 'inconclusive' };
}

// No provider payload, document, token or signature is retained by the probe.
export async function probeDocumentAccess(id: string, request: typeof fetch, signal: AbortSignal): Promise<AccessProbeResult> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw Error('invalid_resource');
  const response = await request(`/api/private-prescriptions/${id}/document`, { method: 'GET', cache: 'no-store', signal });
  // A known existing resource must be independently established before interpreting 404 as denial.
  const outcome = response.status === 200 ? 'allowed' : [403, 404].includes(response.status) ? 'denied' : 'inconclusive';
  await response.body?.cancel();
  return { status: response.status, outcome };
}
