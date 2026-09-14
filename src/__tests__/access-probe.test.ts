import { describe, it, expect, vi } from 'vitest';
import { probeDocumentAccess } from '../components/private-portal/access-probe';
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
