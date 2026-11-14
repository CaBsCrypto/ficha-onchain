import test from 'node:test';
import assert from 'node:assert/strict';
import { Account, Contract, Keypair, Networks, SorobanDataBuilder, TransactionBuilder } from '@stellar/stellar-sdk';
import { createRehearsalRenewalSponsorship } from './clinical-renewal-sponsorship.mjs';
import { createSponsorshipService } from './sponsorship-service.mjs';
import { quoteSponsorship } from './sponsorship-quote.mjs';
import { bucketKeys, bucketDay, bucketLimit, sha256, verifySponsorshipPrincipal } from './sponsorship-domain.mjs';
import { loadSponsorshipConfig, assertSponsorshipPath } from './sponsorship-config.mjs';
import { createChain } from '../worker-doctor-authorizations.mjs';
// Entirely synthetic keys, memory transactions, clocks and receipts; no env, DB or RPC.
const key=n=>Keypair.fromRawEd25519Seed(Buffer.alloc(32,n)),admin=key(71),doctor=key(72),payer=key(73),patient=key(74),NOW=1800000000;
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const registry='CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2',clinical='CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const policy={enabled:true,sponsorDailyLimitStroops:'306381798',patientDailyLimitStroops:'306381798',maxFeeStroops:'150000000',emergencyReserveStroops:'60000000',encounterLimitStroops:'150000000'};
class MemoryTransactions {
 rows=new Map();buckets=new Map();queue=Promise.resolve();locked=false;
 async get(id){return structuredClone(this.rows.get(id)??null);}
 async mutate(id,initial,configuration,change){const prior=this.queue;let unlock;this.queue=new Promise(r=>unlock=r);await prior;this.locked=true;
  try{const current=structuredClone(this.rows.get(id)??null),base=current??initial,buckets=bucketKeys(base.binding).map(key=>structuredClone(this.buckets.get(key+'|'+bucketDay(key,base.day))??{key,day:bucketDay(key,base.day),limitStroops:bucketLimit(key,configuration),reservedStroops:'0',spentStroops:'0'}));
   const result=change(current,buckets);for(const b of buckets)this.buckets.set(b.key+'|'+b.day,structuredClone(b));this.rows.set(id,structuredClone(result));return result;
  }finally{this.locked=false;unlock();}}
}
async function fixture(n,kind,offered){
 const source=kind==='renew'?admin:kind==='revoke'?patient:doctor,contractId=kind==='renew'?registry:clinical,action=kind==='renew'?'reauthorize_doctor':kind==='revoke'?'set_permissions':'append_version';
 const operation=new Contract(contractId).call(action),inner=new TransactionBuilder(new Account(source.publicKey(),String(100+n)),{fee:'100',networkPassphrase:Networks.TESTNET})
  .addOperation(operation).setTimebounds(0,NOW+180).setSorobanData(new SorobanDataBuilder().setResourceFee((BigInt(offered)-4000000n).toString()).build()).build();
 const principal=await verifySponsorshipPrincipal(async()=>({requestId:id(n),network:'testnet',sourceAddress:source.publicKey(),sponsorAddress:payer.publicKey(),patientAddress:patient.publicKey(),actorId:'did:privy:synthetic_'+kind,walletId:kind==='renew'?'registry-admin:'+admin.publicKey():'dummy-'+kind,
  contractId,action,operationFingerprint:sha256(operation.body().invokeHostFunctionOp().hostFunction().toXDR('base64')),...(kind==='revoke'?{intent:'revoke'}:{encounterId:id(100+n),intent:'standard'})}));
 const quote=quoteSponsorship(principal,{unsignedXdr:inner.toXDR(),sponsorBaseFeeStroops:'2000000',preparedAt:NOW,now:NOW});inner.sign(source);return{principal,quote,signed:inner.toXDR()};
}
test('forged completion metadata cannot reserve, call SQL, open the run or sign',async()=>{
 let calls=0;const plan={completionContinuation:{approvedAt:NOW},authorization:{requestId:id(1)},steps:[{key:'renew',actor:'admin',requestId:id(1),maxFeeStroops:'10000000'}]};
 const bridge=createRehearsalRenewalSponsorship({plan,env:{},client:{query:async()=>{calls++;throw Error('must_not_query');}},server:{},assertOpen:async()=>{calls++;},now:()=>NOW});
 await assert.rejects(bridge.assertConfigured({}),/clinical_rehearsal_/);assert.equal(calls,0);
});
test('shared Node sponsorship path requires enabled policy and an explicit administrative path',()=>{
 const env={TRUSTLEAF_SPONSORSHIP_ENABLED:'true',TRUSTLEAF_SPONSORSHIP_SPONSOR_DAILY_LIMIT_STROOPS:policy.sponsorDailyLimitStroops,TRUSTLEAF_SPONSORSHIP_PATIENT_DAILY_LIMIT_STROOPS:policy.patientDailyLimitStroops,TRUSTLEAF_SPONSORSHIP_MAX_FEE_STROOPS:policy.maxFeeStroops,TRUSTLEAF_SPONSORSHIP_EMERGENCY_RESERVE_STROOPS:policy.emergencyReserveStroops,TRUSTLEAF_SPONSORSHIP_ENTRY_LIMIT_STROOPS:policy.encounterLimitStroops,TRUSTLEAF_SPONSORSHIP_PATHS:'/api/private-clinical-operations'};
 assert.throws(()=>assertSponsorshipPath('/api/admin/doctor-authorizations',{method:'POST',purpose:'spend'},loadSponsorshipConfig(env)),/sponsorship_path_disabled/);
 env.TRUSTLEAF_SPONSORSHIP_PATHS+=',/api/admin/doctor-authorizations';assert.doesNotThrow(()=>assertSponsorshipPath('/api/admin/doctor-authorizations',{method:'POST',purpose:'spend'},loadSponsorshipConfig(env)));
 env.TRUSTLEAF_SPONSORSHIP_ENABLED='false';assert.throws(()=>assertSponsorshipPath('/api/admin/doctor-authorizations',{method:'POST',purpose:'spend'},loadSponsorshipConfig(env)),/sponsorship_disabled/);
});
test('ordinary authorization worker remains denied before any RPC or signing',async()=>{
 let calls=0;const chain=createChain({authority:admin.publicKey(),relayer:payer,signXdr:async()=>{calls++;},server:{getAccount:async()=>{calls++;}}});
 await assert.rejects(chain.prepare({}),/sponsorship_path_disabled/);assert.equal(calls,0);
});
test('concurrent Node renewal and clinical reservations preserve the patient withdrawal reserve',async()=>{
 const store=new MemoryTransactions(),service=createSponsorshipService({store,policy,now:()=>NOW});
 const renew=await fixture(1,'renew','10000000'),pdf=await fixture(2,'pdf','150000000'),correction=await fixture(3,'correction','150000000'),withdraw=await fixture(4,'revoke','60000000');
 const results=await Promise.allSettled([renew,pdf,correction].map(f=>service.reserve(f.principal,f.quote)));assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
 await service.reserve(withdraw.principal,withdraw.quote);const total=[...store.rows.values()].reduce((sum,r)=>sum+BigInt(r.quote.offeredFeeStroops),0n);assert.equal(total,220000000n);assert(total<=306381798n);
});
for(const outcome of['SUCCESS','FAILED'])test('Node renewal '+outcome+' settles its canonical fee once, outside budget locks',async()=>{
 const clock={now:NOW},store=new MemoryTransactions(),service=createSponsorshipService({store,policy,now:()=>clock.now}),f=await fixture(1,'renew','10000000');
 await service.reserve(f.principal,f.quote);const {transactionHash}=await service.bindSubmission(f.principal,f.signed);clock.now=NOW+500;
 const read=async hash=>{assert.equal(store.locked,false);assert.equal(hash,transactionHash);return{status:outcome,transactionHash,feeChargedStroops:'3000000',ledger:100};};
 await service.reconcile(f.principal.requestId,read);await service.reconcile(f.principal.requestId,read);
 const r=await store.get(f.principal.requestId);assert.equal(r.state,'settled');for(const b of store.buckets.values()){assert.equal(b.reservedStroops,'0');assert.equal(b.spentStroops,'3000000');}
});
test('an uncertain renewal never frees its reserve or creates another signing payload after expiry',async()=>{
 const clock={now:NOW},store=new MemoryTransactions(),service=createSponsorshipService({store,policy,now:()=>clock.now}),f=await fixture(1,'renew','10000000');
 await service.reserve(f.principal,f.quote);const {transactionHash}=await service.bindSubmission(f.principal,f.signed);clock.now=NOW+500;
 const result=await service.reconcile(f.principal.requestId,async()=>({status:'UNKNOWN',transactionHash}));assert.equal(result.state,'submitted');assert.equal(result.transactionHash,transactionHash);
 await assert.rejects(service.cancelUnsigned(f.principal),/sponsorship_signed_reservation/);for(const b of store.buckets.values())assert.equal(b.reservedStroops,'10000000');
});
