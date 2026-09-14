import { describe, it, expect, vi } from 'vitest';
import { probeDocumentAccess, probeMedicalAction, MEDICAL_PROBE_PRESCRIPTION_ID } from '../components/private-portal/access-probe';
const id='01234567-89ab-cdef-0123-456789abcdef';
describe('D3 document probe',()=>{
  it('rejects URLs and malformed IDs before sending a request',async()=>{
    const request=vi.fn(); await expect(probeDocumentAccess('https://elsewhere.invalid',request,new AbortController().signal)).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  });
  it.each([[200,'allowed'],[403,'denied'],[404,'denied'],[401,'inconclusive'],[503,'inconclusive']])('reports HTTP %s without retaining content',async(status,outcome)=>{
    const cancel=vi.fn().mockResolvedValue(undefined);const json=vi.fn();
    const request=vi.fn().mockResolvedValue({status,body:{cancel},json});const signal=new AbortController().signal;
    expect(await probeDocumentAccess(id,request,signal)).toEqual({status,outcome});
    expect(request).toHaveBeenCalledWith(`/api/private-prescriptions/${id}/document`,{method:'GET',cache:'no-store',signal});
    expect(json).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalled();
  });
});

describe('D3 patient medical action probe', () => {
  it.each([
    [403, { error: 'forbidden' }, 'denied'],
    [403, { error: 'doctor_not_authorized' }, 'inconclusive'],
    [401, { error: 'unauthorized' }, 'inconclusive'],
    [404, { error: 'resource_not_found' }, 'inconclusive'],
    [409, { error: 'another_operation_pending' }, 'inconclusive'],
    [503, { error: 'private_writes_paused' }, 'inconclusive'],
    [200, { operation: { signingHash: 'never-read' } }, 'unexpected'],
  ])('classifies %s precisely without signing or following up', async (status, payload, outcome) => {
    const json = vi.fn().mockResolvedValue(payload), cancel = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ status, json, body: { cancel } });
    const signal = new AbortController().signal;
    expect(await probeMedicalAction(request, signal)).toEqual({ status, outcome });
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/private-operations', {
      method: 'POST', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', prescriptionId: MEDICAL_PROBE_PRESCRIPTION_ID, confirmed: true }),
    });
    if (status !== 403) { expect(json).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce(); }
  });
  it('does not treat a malformed 403 as proof of permission rejection', async () => {
    const request = vi.fn().mockResolvedValue({ status: 403, json: async () => { throw Error('not JSON'); } });
    expect(await probeMedicalAction(request, new AbortController().signal)).toEqual({ status: 403, outcome: 'inconclusive' });
  });
});
