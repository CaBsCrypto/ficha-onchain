export type AccessProbeResult = { status: number; outcome: 'allowed' | 'denied' | 'inconclusive' };

// No provider payload, document, token or signature is retained by the probe.
export async function probeDocumentAccess(id: string, request: typeof fetch, signal: AbortSignal): Promise<AccessProbeResult> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw Error('invalid_resource');
  const response = await request(`/api/private-prescriptions/${id}/document`, { method: 'GET', cache: 'no-store', signal });
  // A known existing resource must be independently established before interpreting 404 as denial.
  const outcome = response.status === 200 ? 'allowed' : [403, 404].includes(response.status) ? 'denied' : 'inconclusive';
  await response.body?.cancel();
  return { status: response.status, outcome };
}
