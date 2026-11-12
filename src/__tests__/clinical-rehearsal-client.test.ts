// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalClientError, ClinicalOperationController, clinicalRequestId, useClinicalOperation, type ClinicalIntent, type ClinicalRehearsal } from '@/components/private-portal/clinical-client';
import { reviewedOperation } from './fixtures/clinical-operation-review';
import type { ClinicalOperation } from '@/types/clinical';
const deps=vi.hoisted(()=>({fetch:vi.fn(),sign:vi.fn()}));
vi.mock('@privy-io/react-auth/extended-chains',()=>({useSignRawHash:()=>({signRawHash:deps.sign})}));
vi.mock('@/lib/auth/authed-fetch',()=>({authedFetch:deps.fetch}));
const IDs=['09fedaff-8110-4415-8b5c-3409bf0a5731','18d482c5-aeae-448b-a37c-a17bfc8042d2','251d3138-0b77-4e20-894f-c2574ac25a38','3f2bc862-b025-494c-a983-23bc4a9572c8'];
const now=1800000000000, wallet='G'+'D'.repeat(55), entryId='1'.repeat(64);
const note={title:'Nota sintética',text:'Sin uso clínico',eventDate:null};
const intent:ClinicalIntent={action:'append_version',historyId:'a'.repeat(64),note};
function plan(steps:ClinicalRehearsal['steps']=[{requestId:IDs[0],action:'append_version',kind:'note'}]):ClinicalRehearsal{return{runId:IDs[3],until:Math.floor(now/1000)+100,steps};}
function op(id=IDs[0],state:ClinicalOperation['state']='awaiting_signature'):ClinicalOperation{return reviewedOperation({id,action:'append_version',state,expiresAt:Math.floor(now/1000)+500,transactionHash:state==='submitted'||state==='confirmed'?'f'.repeat(64):null,errorCode:null,...(state==='awaiting_signature'?{signing:{address:wallet,hash:'a'.repeat(64),network:'testnet' as const,expiresAt:Math.floor(now/1000)+500}}:{})});}
let roots:Array<{root:Root;host:HTMLDivElement}>=[];
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(async()=>{for(const {root,host} of roots){await act(async()=>root.unmount());host.remove();}roots=[];vi.restoreAllMocks();vi.useRealTimers();});
describe('fixed rehearsal intent identity',()=>{
 it('preserves normal UUID generation when the snapshot has no rehearsal',()=>{const factory=vi.fn(()=>IDs[2]);expect(clinicalRequestId(intent,undefined,factory)).toBe(IDs[2]);expect(factory).toHaveBeenCalledOnce();});
 it('selects exactly the matching note, file or own correction without using a UUID factory',()=>{
  const factory=vi.fn(()=>IDs[3]),scope=plan([{requestId:IDs[0],action:'append_version',kind:'note'},{requestId:IDs[1],action:'append_version',kind:'file'},{requestId:IDs[2],action:'append_version',kind:'note',entryId,expectedVersion:1}]);
  expect(clinicalRequestId(intent,scope,factory)).toBe(IDs[0]);expect(clinicalRequestId({action:'append_version',file:{fileName:'test.pdf',mediaType:'application/pdf',base64:'AA=='}},scope,factory)).toBe(IDs[1]);expect(clinicalRequestId({...intent,entryId,expectedVersion:1},scope,factory)).toBe(IDs[2]);expect(factory).not.toHaveBeenCalled();
 });
 it('matches exact permission capabilities and uses the one cleanup UUID after an early stop',()=>{
  const scope=plan([{requestId:IDs[0],action:'set_permissions',expectedRevision:3,canRead:true,canAppend:false},{requestId:IDs[1],action:'set_permissions',expectedRevision:4,canRead:false,canAppend:true},{requestId:IDs[2],action:'set_permissions',expectedRevision:6,canRead:false,canAppend:false}]);
  expect(clinicalRequestId({action:'set_permissions',expectedRevision:3,canRead:true,canAppend:false},scope)).toBe(IDs[0]);
  for(const expectedRevision of [4,5,6]) expect(clinicalRequestId({action:'set_permissions',expectedRevision,canRead:false,canAppend:false},scope)).toBe(IDs[2]);
  expect(()=>clinicalRequestId({action:'set_permissions',expectedRevision:3,canRead:false,canAppend:false},scope)).toThrow();
 });
 it.each(['unmatched','ambiguous','wrong_version','both_payloads'] as const)('rejects %s preparation without falling back or making a network write',async mode=>{
  const scope=mode==='ambiguous'?plan([{requestId:IDs[0],action:'append_version',kind:'note'},{requestId:IDs[1],action:'append_version',kind:'note'}]):plan();
  const input:ClinicalIntent=mode==='unmatched'?{action:'create_history'}:mode==='wrong_version'?{...intent,expectedVersion:2,entryId}:mode==='both_payloads'?{...intent,file:{fileName:'test.pdf',mediaType:'application/pdf',base64:'AA=='}}:intent;
  const request=vi.fn(),fallback=vi.fn(()=>IDs[2]);const client=new ClinicalOperationController(request,()=>{},value=>clinicalRequestId(value,scope,fallback),undefined,()=>scope);
  await expect(client.prepare(input)).rejects.toMatchObject({code:'clinical_rehearsal_scope_rejected'});expect(fallback).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();expect(client.snapshot().operation).toBeNull();
 });
 it('reuses exactly the same fixed request and payload after a lost response',async()=>{
  const scope=plan(),request=vi.fn().mockRejectedValueOnce(new ClinicalClientError(0,'network_unavailable')).mockResolvedValueOnce({operation:op()});
  const client=new ClinicalOperationController(request,()=>{},value=>clinicalRequestId(value,scope),undefined,()=>scope);await expect(client.prepare(intent)).rejects.toThrow();await expect(client.prepare(intent)).rejects.toThrow('intento anterior');await client.prepareSaved();
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(JSON.parse(request.mock.calls[1][1].body));expect(JSON.parse(request.mock.calls[0][1].body).requestId).toBe(IDs[0]);
 });
});
describe('rehearsal expiry and recovery',()=>{
 it('blocks preparation, signing and retry after expiry while preserving read and unsigned cancellation',async()=>{
  const scope=plan(),request=vi.fn().mockResolvedValueOnce({operation:op()}).mockResolvedValueOnce({operation:op()}).mockResolvedValueOnce({operation:op(IDs[0],'cancelled')}),sign=vi.fn();
  const client=new ClinicalOperationController(request,()=>{},value=>clinicalRequestId(value,scope),{address:wallet,sign},()=>scope);await client.prepare(intent);expect(client.snapshot().canSign).toBe(true);vi.mocked(Date.now).mockReturnValue((scope.until+1)*1000);
  expect(client.snapshot().canSign).toBe(false);await expect(client.sign()).rejects.toMatchObject({code:'clinical_rehearsal_expired'});await expect(client.prepareSaved()).rejects.toMatchObject({code:'clinical_rehearsal_expired'});expect(sign).not.toHaveBeenCalled();expect(request).toHaveBeenCalledOnce();await client.check();await client.cancel();expect(client.snapshot().operation?.state).toBe('cancelled');
  const submitted=new ClinicalOperationController(request,()=>{},()=>IDs[0],{address:wallet,sign},()=>scope);submitted.reopen(op(IDs[0],'submitted'));await expect(submitted.retry()).rejects.toMatchObject({code:'clinical_rehearsal_expired'});expect(request).toHaveBeenCalledTimes(3);
 });
 it('does not deliver a Privy signature if the rehearsal expires during the prompt',async()=>{
  const scope=plan(),request=vi.fn().mockResolvedValue({operation:op()}),sign=vi.fn(async()=>{vi.mocked(Date.now).mockReturnValue((scope.until+1)*1000);return{signature:'0x'+'7'.repeat(128)};});
  const client=new ClinicalOperationController(request,()=>{},value=>clinicalRequestId(value,scope),{address:wallet,sign},()=>scope);await client.prepare(intent);await expect(client.sign()).rejects.toMatchObject({code:'clinical_rehearsal_expired'});expect(request).toHaveBeenCalledOnce();expect(client.snapshot().canSign).toBe(false);
 });
 it('blocks a recovered operation outside the current rehearsal before requesting a signature',async()=>{
  const scope=plan(),request=vi.fn(),sign=vi.fn();const client=new ClinicalOperationController(request,()=>{},()=>IDs[0],{address:wallet,sign},()=>scope);client.reopen(op(IDs[1]));expect(client.snapshot().canSign).toBe(false);await expect(client.sign()).rejects.toMatchObject({code:'clinical_rehearsal_scope_rejected'});expect(request).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
 });
 it('updates canSign when the rehearsal timer expires without losing the saved attempt',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);const scope=plan();deps.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({operation:op()})});
  let latest!:ReturnType<typeof useClinicalOperation>;function View(){latest=useClinicalOperation('timer-identity',wallet,scope);return null;}
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});await act(async()=>root.render(createElement(View)));await act(async()=>latest.controller.prepare(intent));expect(latest.canSign).toBe(true);
  await act(async()=>vi.advanceTimersByTimeAsync(100000));expect(latest.canSign).toBe(false);expect(latest.operation?.id).toBe(IDs[0]);expect(deps.fetch).toHaveBeenCalledOnce();expect(deps.sign).not.toHaveBeenCalled();
 });
 it('retains a loaded plan across snapshot refresh without replacing the controller or pending UUID',async()=>{
  const scope=plan();deps.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({operation:op()})});
  let latest!:ReturnType<typeof useClinicalOperation>;function View({current}:{current?:ClinicalRehearsal}){latest=useClinicalOperation('identity',wallet,current);return null;}
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});await act(async()=>root.render(createElement(View,{current:scope})));const controller=latest.controller;await act(async()=>controller.prepare(intent));
  await act(async()=>root.render(createElement(View,{})));expect(latest.controller).toBe(controller);expect(latest.operation?.id).toBe(IDs[0]);expect(latest.canSign).toBe(true);
  vi.mocked(Date.now).mockReturnValue((scope.until+1)*1000);await expect(controller.sign()).rejects.toMatchObject({code:'clinical_rehearsal_expired'});expect(deps.sign).not.toHaveBeenCalled();expect(deps.fetch).toHaveBeenCalledOnce();
 });
});


it('reports attempt expiry separately while the approved rehearsal remains active and never delivers a late signature', async () => {
  const scope = plan(), expiry = Math.floor(now / 1000) + 10, prepared = op();
  prepared.expiresAt = expiry; prepared.signing = { ...prepared.signing!, expiresAt: expiry }; prepared.sponsorship = { ...prepared.sponsorship!, quoteExpiresAt: expiry };
  const request = vi.fn().mockResolvedValue({ operation: prepared }), diagnostic = vi.fn();
  const sign = vi.fn(async () => { vi.mocked(Date.now).mockReturnValue((expiry + 1) * 1000); return { signature: '0x' + '7'.repeat(128) }; });
  const client = new ClinicalOperationController(request, () => {}, value => clinicalRequestId(value, scope), { address: wallet, sign }, () => scope, diagnostic);
  await client.prepare(intent); await expect(client.sign()).rejects.toMatchObject({ code: 'signature_request_expired', status: 400 });
  expect(Date.now()).toBeLessThan(scope.until * 1000);
  expect(client.snapshot().error).toContain('Venció el tiempo para firmar este intento');
  expect(client.snapshot().error).not.toContain('ventana del ensayo venció'); expect(client.snapshot().canSign).toBe(false);
  expect(client.snapshot().operation?.id).toBe(IDs[0]); expect(request).toHaveBeenCalledOnce(); expect(sign).toHaveBeenCalledOnce();
  expect(diagnostic).toHaveBeenCalledExactlyOnceWith({ phase: 'review', status: 400, code: 'signature_request_expired' });
});

it('renders server-side attempt expiry without relabeling an active plan or replacing its fixed slot', async () => {
  const scope = plan(), request = vi.fn().mockResolvedValueOnce({ operation: op() }).mockRejectedValueOnce(new ClinicalClientError(409, 'signature_request_expired'));
  const sign = vi.fn().mockResolvedValue({ signature: '0x' + '7'.repeat(128) }), diagnostic = vi.fn();
  const client = new ClinicalOperationController(request, () => {}, value => clinicalRequestId(value, scope), { address: wallet, sign }, () => scope, diagnostic);
  await client.prepare(intent); await expect(client.sign()).rejects.toMatchObject({ code: 'signature_request_expired', status: 409 });
  expect(Date.now()).toBeLessThan(scope.until * 1000); expect(client.snapshot().operation?.id).toBe(IDs[0]);
  expect(client.snapshot().error).not.toContain('ventana del ensayo venció'); expect(client.snapshot().canSign).toBe(false);
  expect(diagnostic).toHaveBeenCalledExactlyOnceWith({ phase: 'delivery', status: 409, code: 'signature_request_expired' });
  expect(request).toHaveBeenCalledTimes(2); expect(sign).toHaveBeenCalledOnce();
});
