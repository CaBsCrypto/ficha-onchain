import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Account, Keypair, Networks, SorobanDataBuilder, TransactionBuilder } from '@stellar/stellar-sdk';
import type { ClinicalActor, ClinicalExpected } from '@/types/clinical';
const m = vi.hoisted(() => ({ get: vi.fn(), query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDb: () => ({ query: m.query }), getDbConnection: vi.fn(() => { throw Error('No real SQL'); }) }));
vi.mock('@/lib/sponsorship', async original => ({ ...await original<typeof import('@/lib/sponsorship')>(),
  SqlSponsorshipStore: class { get = m.get; } }));
import { clinicalInvocation, deriveClinicalEntryId, deriveClinicalHistoryId, CLINICAL_CONTRACT } from '@/lib/clinical/chain';
import { clinicalSponsorshipQuoteView } from '@/lib/clinical/sponsorship';
import { clinicalPreparedOperation, clinicalOperations, clinicalPublicOperation } from '@/lib/clinical/history';
import { newReservation, quoteDigest, sha256, verifySponsorshipPrincipal, type Reservation } from '@/lib/sponsorship/domain';
import { quoteSponsorship } from '@/lib/sponsorship/quote';
import { sealClinicalVersion } from '../../scripts/lib/clinical-crypto.mjs';
import { syntheticClinicalPdf } from '../../scripts/lib/clinical-fixtures.mjs';
const wallet = (n:number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32,n)).publicKey();
const actor:ClinicalActor={userId:'did:privy:synthetic_review',walletId:'synthetic_review_wallet',address:wallet(7)};
const patient=wallet(8),sponsor=wallet(9),id='10000000-0000-4000-8000-000000000007';
const start=Date.parse('2026-10-25T20:40:00Z')/1000,keyring={fixture:'12'.repeat(32)};
const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
async function fixture(kind:'file'|'note'|'permissions'|'history'='file',maxTime=start+300,clinicalWindow=false){
 const historyId=deriveClinicalHistoryId(kind==='history'?actor.address:patient),operationId='ab'.repeat(32);
 const entryId=deriveClinicalEntryId(historyId,actor.address,operationId);
 let expected:ClinicalExpected={historyId,patient:kind==='history'?actor.address:patient,operationId};
 let envelope:unknown=null;
 const note={title:'Synthetic correction',text:'Exact original correction text',eventDate:null,prescriptionId:'20000000-0000-4000-8000-000000000008'};
 const content=kind==='note'?Buffer.from(JSON.stringify(note)):Buffer.from(syntheticClinicalPdf(1));
 if(kind==='file'||kind==='note'){
  expected={...expected,entryId,author:actor.address,expectedVersion:0,expectedGrantRevision:6,previousCommitment:null};
  const sealed=sealClinicalVersion({context:{schemaVersion:1,network:'testnet',contractId:CLINICAL_CONTRACT,historyId,entryId,author:actor.address,patient:expected.patient,version:1,previousCommitment:null},
   content,metadata:kind==='note'?{mediaType:'application/json',fileName:'antecedente.json'}:{mediaType:'application/pdf',fileName:'approved-synthetic.pdf'},activeKeyId:'fixture',keyring});
  expected.commitment=sealed.commitment;envelope=sealed.envelope;
 }
 const action=kind==='history'?'create_history':kind==='permissions'?'set_permissions':'append_version';
 // A patient's removal of permissions is signed by that same patient account.
 if(kind==='permissions')expected={...expected,historyId:deriveClinicalHistoryId(actor.address),patient:actor.address,doctor:patient,doctorId:10,canRead:false,canAppend:false,expectedRevision:6};
 const tx=new TransactionBuilder(new Account(actor.address,'100'),{fee:'1100',networkPassphrase:Networks.TESTNET})
  .addOperation(clinicalInvocation(action,expected)).setSorobanData(new SorobanDataBuilder().setResourceFee('1000').build()).setTimebounds(0,maxTime).build();
 const principal=await verifySponsorshipPrincipal(async()=>({requestId:id,network:'testnet',sourceAddress:actor.address,sponsorAddress:sponsor,patientAddress:expected.patient,
  actorId:actor.userId,walletId:actor.walletId,contractId:CLINICAL_CONTRACT,action,
  operationFingerprint:sha256(tx.operations[0].type==='invokeHostFunction'?tx.operations[0].func.toXDR('base64'):''),
  ...(action==='append_version'?{encounterId:entryId}:{}),intent:kind==='permissions'?'revoke':'standard'}));
 const quote=quoteSponsorship(principal,{unsignedXdr:tx.toXDR(),sponsorBaseFeeStroops:'2000000',preparedAt:start+23,now:start+23,...(clinicalWindow?{validUntil:Math.min(start+323,maxTime)}:{})});
 const reservation=newReservation(principal,quote);m.get.mockResolvedValue(reservation);
 const row={id,actor_user_id:actor.userId,wallet_id:actor.walletId,source_wallet:actor.address,contract_id:CLINICAL_CONTRACT,network:'testnet',action,
  expected,prepared_envelope:envelope,state:'awaiting_signature',unsigned_xdr:tx.toXDR(),signing_hash:tx.hash().toString('hex'),expires_at:maxTime,
  created_at:new Date(start*1000).toISOString(),signed_xdr:null,transaction_hash:null,error_code:null};
 return{row,reservation,content,note};
}
beforeEach(()=>{vi.resetAllMocks();vi.spyOn(Date,'now').mockReturnValue((start+30)*1000);vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING',JSON.stringify(keyring));vi.stubEnv('TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID','fixture');});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('canonical pending signing review',()=>{
 it('returns only the new persisted expiry and never renews it on GET, including the XDR cap',async()=>{
  for(const maxTime of [start+300,start+100]){
   const f=await fixture('file',maxTime,true),a=await clinicalSponsorshipQuoteView(actor,f.row);
   expect(a).toEqual({maxFeeStroops:'4001000',quotePreparedAt:start+23,quoteExpiresAt:Math.min(start+323,maxTime),quoteValidUntil:Math.min(start+323,maxTime)});
   vi.mocked(Date.now).mockReturnValue((maxTime+5)*1000);
   expect(await clinicalSponsorshipQuoteView(actor,{...f.row,created_at:new Date((start+5000)*1000).toISOString()})).toEqual(a);
   expect(f.reservation.quote.validUntil).toBe(a!.quoteExpiresAt);
   vi.mocked(Date.now).mockReturnValue((start+30)*1000);
  }
 });
 it('rejects an altered persisted expiry, a noncanonical lifetime and future preparation clocks',async()=>{
  const f=await fixture('file',start+300,true);
  for(const patch of [{validUntil:start+299},{validUntil:start+301},{validUntil:start+300.5},{validUntil:'bad'},{preparedAt:start+100,validUntil:start+300}]){
   const changed=clone(f.reservation);Object.assign(changed.quote,patch);
   if(!('validUntil'in patch)||patch.validUntil!==start+299){const{quoteId,...q}=changed.quote;changed.quote.quoteId=quoteDigest(q);}
   m.get.mockResolvedValue(changed);expect(await clinicalPreparedOperation(actor,f.row)).not.toHaveProperty('sponsorship');
  }
 });

 it('uses reservation preparedAt, not SQL transaction createdAt, and never restarts90seconds on read',async()=>{
  const f=await fixture(),a=await clinicalSponsorshipQuoteView(actor,f.row);
  expect(a).toEqual({maxFeeStroops:'4001000',quotePreparedAt:start+23,quoteExpiresAt:start+113});
  vi.mocked(Date.now).mockReturnValue((start+114)*1000);
  const b=await clinicalSponsorshipQuoteView(actor,{...f.row,created_at:new Date((start+1000)*1000).toISOString()});
  expect(b).toEqual(a);expect(b!.quoteExpiresAt).toBeLessThan(Date.now()/1000);
  expect(f.reservation.quote.preparedAt).toBe(start+23);expect(m.get).toHaveBeenCalledTimes(2);
 });
 it('limits the displayed quote by the original envelope bound even when90seconds would run later',async()=>{
  const f=await fixture('file',start+70),result=await clinicalSponsorshipQuoteView(actor,f.row);
  expect(result!.quoteExpiresAt).toBe(start+70);expect(result!.quotePreparedAt).toBe(start+23);
 });
 it('rejects changed quote timestamps and a future preparation clock rather than synthesizing a new lifetime',async()=>{
  const f=await fixture();
  for(const preparedAt of [start+22,start+100]){const changed=clone(f.reservation);changed.quote.preparedAt=preparedAt;
   if(preparedAt>start+30){const{quoteId,...q}=changed.quote;changed.quote.quoteId=quoteDigest(q);}
   m.get.mockResolvedValue(changed);expect(await clinicalPreparedOperation(actor,f.row)).not.toHaveProperty('sponsorship');}
 });
 it('returns exact file metadata/byte digest and complete recipient/source without ciphertext or rawbytes',async()=>{
  const f=await fixture(),result=await clinicalPreparedOperation(actor,f.row);
  expect(result.review).toMatchObject({author:actor.address,patient,network:'testnet',entryId:f.row.expected.entryId,version:1,
   content:{kind:'file',fileName:'approved-synthetic.pdf',mediaType:'application/pdf',byteLength:f.content.length,sha256:createHash('sha256').update(f.content).digest('hex')}});
  expect(JSON.stringify(result)).not.toContain(f.row.unsigned_xdr);expect(JSON.stringify(result)).not.toContain(f.content.toString('base64'));
  expect(result).not.toHaveProperty('prepared_envelope');expect(result).not.toHaveProperty('expected');expect(result.sponsorship!.quotePreparedAt).toBe(start+23);
 });
 it('preserves the exact note and RX locator in the own-input review',async()=>{
  const f=await fixture('note'),result=await clinicalPreparedOperation(actor,f.row);expect(result.review!.content).toEqual({kind:'note',note:f.note});
 });
 it('reviews permission removal and creation without leaking unrelated documents',async()=>{
  for(const kind of ['permissions','history'] as const){const f=await fixture(kind),r=await clinicalPreparedOperation(actor,f.row);
   expect(r.review!.content).toEqual(kind==='history'?{kind:'history'}:{kind:'permissions',doctor:patient,canRead:false,canAppend:false,expectedRevision:6});
   expect(r.review!.patient).toBe(actor.address);}
 });
 it('keeps legacy/terminal/cancelled intents readable without inventing quotes or looking up terminal rows',async()=>{
  const f=await fixture();m.get.mockResolvedValue(null);
  expect(await clinicalPreparedOperation(actor,f.row)).not.toHaveProperty('sponsorship');
  expect(clinicalPublicOperation(f.row)).not.toHaveProperty('sponsorship');m.get.mockClear();
  for(const state of ['confirmed','submitted','cancelled','failed'])expect(await clinicalPreparedOperation(actor,{...f.row,state})).toMatchObject({state});
  expect(m.get).not.toHaveBeenCalled();
 });
 it('rejects wrong actor before lookup and fails closed on mismatched reservation or saved intent',async()=>{
  const f=await fixture();await expect(clinicalSponsorshipQuoteView({...actor,walletId:'wrong'},f.row)).rejects.toThrow();expect(m.get).not.toHaveBeenCalled();
  for(const patch of [{actor_user_id:'other'},{source_wallet:patient},{contract_id:'wrong'},{network:'mainnet'},{signing_hash:'ff'.repeat(32)},{expires_at:start+301}]){
   expect(await clinicalPreparedOperation(actor,{...f.row,...patch})).not.toHaveProperty('review');}
  for(const patch of [{binding:{...f.reservation.binding,patientAddress:actor.address}},{binding:{...f.reservation.binding,actorId:'other'}},
   {quote:{...f.reservation.quote,offeredFeeStroops:'4001001'}},{quote:{...f.reservation.quote,unsignedHash:'ff'.repeat(32)}},
   {state:'signed'}]){
   m.get.mockResolvedValue({...clone(f.reservation),...patch});expect(await clinicalPreparedOperation(actor,f.row)).not.toHaveProperty('review');}
 });
 it('removes review and quote together on corrupted encrypted content or matching-state SQL failure',async()=>{
  const f=await fixture();expect(await clinicalPreparedOperation(actor,{...f.row,prepared_envelope:{invalid:true}})).not.toHaveProperty('sponsorship');
  m.get.mockRejectedValue(Error('DO NOT EXPOSE provider credential'));const r=await clinicalPreparedOperation(actor,f.row);
  expect(r).not.toHaveProperty('review');expect(JSON.stringify(r)).not.toContain('credential');
 });
 it('does not add reservation lookups for the50 historical rows in a timeline',async()=>{
  const f=await fixture();m.get.mockClear();m.query.mockResolvedValue(Array.from({length:50},()=>({...f.row,state:'confirmed'})));
  expect(await clinicalOperations(actor,f.row.expected.historyId)).toHaveLength(50);expect(m.get).not.toHaveBeenCalled();
 });
});
