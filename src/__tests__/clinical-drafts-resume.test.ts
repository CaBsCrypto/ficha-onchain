import { beforeEach, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
const m=vi.hoisted(()=>({auth:vi.fn(),actor:vi.fn(),environment:vi.fn(),get:vi.fn(),save:vi.fn(),query:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/privy-auth',()=>({requireUser:m.auth}));
vi.mock('@/lib/clinical/identity',()=>({resolveClinicalActor:m.actor}));
vi.mock('@/lib/clinical/api',()=>({clinicalJson:(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store',Vary:'Authorization'}})}));
vi.mock('@/lib/clinical/config',()=>({CLINICAL_ID:'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U',assertClinicalEnvironment:m.environment}));
vi.mock('@/lib/clinical/drafts',()=>({getClinicalDraft:m.get,saveClinicalDraft:m.save}));
vi.mock('@/lib/db',()=>({getDb:()=>({query:m.query})}));
import { PrivateFlowError } from '@/lib/private-config';
import { createClinicalDraftResumeService } from '@/lib/clinical/drafts-resume';
import { POST } from '@/app/api/private-clinical-drafts/[id]/resume/route';
import { CLINICAL_ID } from '@/lib/clinical/config';
import type { ClinicalDraft } from '@/lib/clinical/drafts-types';
const originalId='11111111-1111-4111-8111-111111111111',publication='22222222-2222-4222-8222-222222222222',newId='33333333-3333-4333-8333-333333333333';
const actor={userId:'did:privy:doctor',walletId:'wallet:doctor',address:Keypair.fromRawEd25519Seed(Buffer.alloc(32,90)).publicKey()};
const patient=Keypair.fromRawEd25519Seed(Buffer.alloc(32,91)).publicKey(),user={userId:actor.userId,email:'synthetic@example.test'};
const body={expectedRevision:3,id:newId},context={params:Promise.resolve({id:originalId})};
const request=(supplied:unknown=body,origin='http://localhost')=>new Request('http://localhost/api/private-clinical-drafts/'+originalId+'/resume',{method:'POST',headers:{origin,host:'localhost'},body:JSON.stringify(supplied)});
let original:ClinicalDraft,operation:Record<string,unknown>;
beforeEach(()=>{
 vi.resetAllMocks();
 original={id:originalId,revision:3,historyId:'ab'.repeat(32),patient,author:actor.address,state:'draft',publicationRequestId:publication,
   createdAt:'2026-10-25T10:00:00Z',updatedAt:'2026-10-25T10:00:00Z',
   payload:{entryId:'cd'.repeat(32),expectedVersion:2,note:{title:'Synthetic correction',text:'PRIVATE CONTENT',eventDate:null,prescriptionId:'44444444-4444-4444-8444-444444444444'}}};
 operation={id:publication,state:'cancelled',action:'append_version',actor_user_id:actor.userId,wallet_id:actor.walletId,source_wallet:actor.address,
   contract_id:CLINICAL_ID,network:'testnet',expected:{historyId:original.historyId,patient,author:actor.address,entryId:original.payload.entryId,expectedVersion:2},
   signed_xdr:null,transaction_hash:null};
 m.auth.mockResolvedValue(user);m.actor.mockResolvedValue(actor);m.get.mockImplementation(async()=>structuredClone(original));
 m.query.mockImplementation(async()=>[structuredClone(operation)]);
 m.save.mockImplementation(async(_user,_actor,input)=>({id:input.id,revision:1,historyId:input.historyId,patient:input.patient,author:actor.address,
   state:'draft',publicationRequestId:null,createdAt:original.createdAt,updatedAt:original.updatedAt}));
});
const service=()=>createClinicalDraftResumeService({sql:{query:m.query},getDraft:m.get,saveDraft:m.save});
it('copies a cancelled never-signed correction to revision1 and returns private payload without altering the original or allocating intent',async()=>{
 const before=structuredClone(original),response=await POST(request(),context);
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
 expect(await response.json()).toEqual({draft:{...before,id:newId,revision:1,publicationRequestId:null}});
 expect(original).toEqual(before);expect(m.get).toHaveBeenCalledWith(actor,originalId);
 expect(m.save).toHaveBeenCalledWith(user,actor,{id:newId,expectedRevision:0,historyId:original.historyId,patient,payload:original.payload});
 const [sql,params]=m.query.mock.calls[0];
 expect(params).toEqual([publication,actor.userId,actor.walletId,actor.address,CLINICAL_ID,'testnet']);
 expect(sql).toContain('signed_xdr');expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|operation_id|prepareTransaction|sendTransaction/);
 expect(m.environment).toHaveBeenCalledWith(false);
});
it('rejects every non-cancelled or potentially signed/hash-bound operation',async()=>{
 for(const patch of [
   ...['awaiting_signature','submitted','confirmed','failed','UNKNOWN'].map(state=>({state})),
   {signed_xdr:'signed-envelope'},{transaction_hash:'ef'.repeat(32)},{signed_xdr:undefined},{transaction_hash:undefined},
 ]){
   m.query.mockResolvedValueOnce([{...operation,...patch}]);
   await expect(service().resume(user,actor,originalId,body)).rejects.toMatchObject({message:'clinical_draft_resume_unavailable',status:409});
 }
 expect(m.save).not.toHaveBeenCalled();
});
it('enforces author/wallet/source/contract/network and exact target binding even if a query returns the wrong row',async()=>{
 for(const field of ['actor_user_id','wallet_id','source_wallet','contract_id','network','id','action']){
   m.query.mockResolvedValueOnce([{...operation,[field]:'changed'}]);
   await expect(service().resume(user,actor,originalId,body)).rejects.toThrow('clinical_draft_resume_unavailable');
 }
 m.query.mockResolvedValueOnce([{...operation,expected:{...(operation.expected as object),entryId:'00'.repeat(32)}}]);
 await expect(service().resume(user,actor,originalId,body)).rejects.toThrow('clinical_draft_resume_unavailable');
 m.get.mockRejectedValueOnce(new PrivateFlowError('clinical_draft_not_found',404));
 await expect(service().resume(user,actor,originalId,body)).rejects.toMatchObject({status:404});
 expect(m.save).not.toHaveBeenCalled();
});
it('requires current revision, a different UUID and closed input; a revoked initial grant prevents creating the copy',async()=>{
 for(const input of [{...body,expectedRevision:2},{...body,id:originalId},{...body,operationId:'forbidden'},{id:newId},{...body,id:'invalid'}])
   await expect(service().resume(user,actor,originalId,input)).rejects.toThrow();
 expect(m.save).not.toHaveBeenCalled();
 m.save.mockRejectedValueOnce(new PrivateFlowError('clinical_draft_not_found',404));
 await expect(service().resume(user,actor,originalId,body)).rejects.toMatchObject({status:404});
 expect(m.save).toHaveBeenCalledWith(user,actor,expect.objectContaining({expectedRevision:0}));
});
it('reuses the exact new UUID after a lost reply through the existing idempotent create API',async()=>{
 const copies=new Map<string,unknown>();m.save.mockImplementation(async(_u,_a,input)=>{
   const meta={id:input.id,revision:1,historyId:input.historyId,patient:input.patient,author:actor.address,state:'draft',publicationRequestId:null,createdAt:original.createdAt,updatedAt:original.updatedAt};
   if(!copies.has(input.id))copies.set(input.id,meta);
   return copies.get(input.id);
 });
 const first=await service().resume(user,actor,originalId,body),again=await service().resume(user,actor,originalId,body);
 expect(again).toEqual(first);expect(copies.size).toBe(1);expect(m.save.mock.calls.every(call=>call[2].id===newId&&call[2].expectedRevision===0)).toBe(true);
});
it('API requires strict same-origin auth and hides content after a session or wallet switch',async()=>{
 m.auth.mockResolvedValueOnce(null);expect((await POST(request(),context)).status).toBe(401);expect(m.get).not.toHaveBeenCalled();
 expect((await POST(request(body,'http://other.test'),context)).status).toBe(403);expect(m.get).not.toHaveBeenCalled();
 m.actor.mockResolvedValueOnce(actor).mockResolvedValueOnce({...actor,walletId:'switched'});
 const response=await POST(request(),context);expect(response.status).toBe(403);expect(await response.text()).not.toContain('PRIVATE CONTENT');
});
