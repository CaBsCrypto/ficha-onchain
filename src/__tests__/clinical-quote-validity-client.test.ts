import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalOperation } from '@/types/clinical';
import { reviewedOperation } from './fixtures/clinical-operation-review';
vi.mock('@privy-io/react-auth/extended-chains', () => ({ useSignRawHash: vi.fn() }));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: vi.fn() }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: vi.fn() }));
import { ClinicalOperationController, verifiedClinicalOperation } from '@/components/private-portal/clinical-client';
const at=1_800_000_000,id='09fedaff-8110-4415-8b5c-3409bf0a5731',address='G'+'A'.repeat(55);
const note={title:'Synthetic review',text:'Exact approved content',eventDate:null};
function pending(extended=true,maxTime=at+600):ClinicalOperation{
 const expires=Math.min(at+(extended?300:90),maxTime);
 return reviewedOperation({id,action:'append_version',state:'awaiting_signature',expiresAt:maxTime,transactionHash:null,errorCode:null,
  signing:{address,hash:'1'.repeat(64),network:'testnet',expiresAt:maxTime},
  sponsorship:{maxFeeStroops:'4001000',quotePreparedAt:at,quoteExpiresAt:expires,...(extended?{quoteValidUntil:expires}:{})}},note);
}
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(at*1000);});
afterEach(()=>vi.restoreAllMocks());
describe('immutable clinical quote validity DTO',()=>{
 it('accepts legacy90s, persisted300s and the earlier original envelope boundary',()=>{
  for(const input of [pending(false),pending(),pending(true,at+45)]){
   const verified=verifiedClinicalOperation(input);expect(verified.sponsorship).toEqual(input.sponsorship);
   expect(Object.isFrozen(verified.sponsorship)).toBe(true);
  }
 });
 it('does not reinterpret a legacy quote as300s without the persisted-expiry marker',()=>{
  const input=pending();delete input.sponsorship!.quoteValidUntil;
  expect(()=>verifiedClinicalOperation(input)).toThrow();
 });
 it.each([
  {quoteValidUntil:at+299},{quoteValidUntil:at+301},{quoteValidUntil:at+300.5},{quoteValidUntil:'300'},
  {quoteExpiresAt:at+301,quoteValidUntil:at+301},{quoteExpiresAt:at+90,quoteValidUntil:at+90},
  {quotePreparedAt:at+1},{quoteValidUntil:null},{unexpectedExpiry:at+300},
 ])('rejects a changed or invalid expiry shape%j',patch=>{
  const input=pending();Object.assign(input.sponsorship!,patch);expect(()=>verifiedClinicalOperation(input)).toThrow();
 });
 it('checks the persisted quote deadline before opening Privy for both old and new quotes',async()=>{
  for(const extended of [false,true]){
   const op=pending(extended),request=vi.fn().mockResolvedValue({operation:op}),sign=vi.fn();
   const controller=new ClinicalOperationController(request,()=>{},()=>id,{address,sign});
   await controller.prepare({action:'append_version',note});
   vi.mocked(Date.now).mockReturnValue(op.sponsorship!.quoteExpiresAt*1000);
   expect(controller.snapshot().canSign).toBe(false);
   await expect(controller.sign()).rejects.toThrow('cotización venció');
   expect(sign).not.toHaveBeenCalled();expect(request).toHaveBeenCalledOnce();
   vi.mocked(Date.now).mockReturnValue(at*1000);
  }
 });
 it('accepts a human confirmation after90s only for the new persisted300s quote',async()=>{
  const op=pending(),receipt:ClinicalOperation={id,action:'append_version',state:'submitted',expiresAt:op.expiresAt,transactionHash:'a'.repeat(64),errorCode:null};
  const request=vi.fn().mockResolvedValueOnce({operation:op}).mockResolvedValueOnce({operation:receipt}),sign=vi.fn().mockResolvedValue({signature:'0x'+'7'.repeat(128)});
  const controller=new ClinicalOperationController(request,()=>{},()=>id,{address,sign});
  await controller.prepare({action:'append_version',note});vi.mocked(Date.now).mockReturnValue((at+150)*1000);
  await controller.sign();expect(sign).toHaveBeenCalledOnce();expect(request.mock.calls[1][0]).toBe('/api/private-clinical-operations/'+id+'/sign');
 });
 it('does not deliver a late signature if the persisted expiry passes while Privy is open',async()=>{
  const op=pending(),request=vi.fn().mockResolvedValue({operation:op}),sign=vi.fn(async()=>{
   vi.mocked(Date.now).mockReturnValue(op.sponsorship!.quoteExpiresAt*1000);return{signature:'0x'+'7'.repeat(128)};
  });
  const controller=new ClinicalOperationController(request,()=>{},()=>id,{address,sign});
  await controller.prepare({action:'append_version',note});await expect(controller.sign()).rejects.toThrow('cotización venció');
  expect(sign).toHaveBeenCalledOnce();expect(request).toHaveBeenCalledOnce();
 });
});
