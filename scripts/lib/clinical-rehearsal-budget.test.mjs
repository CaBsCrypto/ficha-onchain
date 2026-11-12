import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, SorobanDataBuilder, TransactionBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { assertRehearsalAggregateExposure, inspectRehearsalBudgetExposure, assertRehearsalHistoricalCharges, inspectRehearsalHistoricalCharges, inspectRehearsalConfirmedOperation, inspectRehearsalConfirmedOperationSnapshot } from './clinical-rehearsal-budget.mjs';

// Public deterministic dummy keys and SDK/XDR fixtures only. No env, SQL, RPC,
// browser, provider, actual user keys, or real preparation/signing/transmission.
const NOW=1800000000, CONTRACT='CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const key=n=>Keypair.fromRawEd25519Seed(Buffer.alloc(32,n)), patient=key(31),doctor=key(32),payer=key(33),foreign=key(34);
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const sha=b=>createHash('sha256').update(b).digest(),bytes=v=>nativeToScVal(Buffer.from(v,'hex')),address=v=>new Address(v).toScVal();
const struct=o=>xdr.ScVal.scvMap(Object.keys(o).sort().map(k=>new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol(k),val:o[k]})));
const derive=(history,operation)=>sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'),nativeToScVal(sha(Networks.TESTNET)),
 new Address(CONTRACT).toScVal(),bytes(history),address(doctor.publicKey()),bytes(operation)]).toXDR()).toString('hex');
function fixture() {
 const policy={schemaVersion:2,runId:id(100),createdAt:NOW-1000,until:NOW+600,historyId:'ab'.repeat(32),contractId:CONTRACT,
  patient:{userId:'dummy-patient',walletId:'dummy-p-wallet',address:patient.publicKey()},
  doctor:{userId:'dummy-doctor',walletId:'dummy-d-wallet',address:doctor.publicKey()},doctorId:10,relayer:payer.publicKey()};
 const names=['renew','append_note','grant_both','append_pdf','correct_note','revoke'];
 policy.steps=names.map((name,index)=>({key:name,requestId:id(index+1),actor:index===0?'admin':[2,5].includes(index)?'patient':'doctor',
  action:index===0?'renew':[2,5].includes(index)?'set_permissions':'append_version',
  maxFeeStroops:index===0?'10000000':index===1?'100000000':index===2?'50000000':index===5?'60000000':'150000000',
  ...(index?{operationId:Buffer.alloc(32,index).toString('hex')}:{}),
  ...(index?{input:{requestId:id(index+1),action:[2,5].includes(index)?'set_permissions':'append_version'}}:{})}));
 for(const index of[1,3,4])policy.steps[index].input={...policy.steps[index].input,historyId:policy.historyId,expectedVersion:index===4?1:0};
 policy.steps[4].input.entryId=derive(policy.historyId,policy.steps[1].operationId);
 for(const index of[2,5])policy.steps[index].input={...policy.steps[index].input,doctorId:10,canRead:index===2,canAppend:index===2,expectedRevision:index===2?5:6};
 const receipts=new Map(),rows=[],calls=[];
 function make(index,{offered='80000000',paid='10000000',state='confirmed',status='SUCCESS',signed=true,metaVersion=4,signer,feeSigner,maxTime=NOW+300}={}) {
  const step=policy.steps[index],actor=step.actor==='doctor'?doctor:patient,commit=Buffer.alloc(32,index+20).toString('hex');
  const expected=step.action==='append_version'
   ?{historyId:policy.historyId,patient:patient.publicKey(),author:doctor.publicKey(),entryId:step.input.entryId??derive(policy.historyId,step.operationId),
     expectedVersion:step.input.expectedVersion,previousCommitment:step.input.expectedVersion?'cc'.repeat(32):null,
     expectedGrantRevision:step.key==='append_note'?5:6,operationId:step.operationId,commitment:commit}
   :{historyId:policy.historyId,patient:patient.publicKey(),doctorId:10,doctor:doctor.publicKey(),
     canRead:step.input.canRead,canAppend:step.input.canAppend,expectedRevision:step.input.expectedRevision,operationId:step.operationId};
  const args=[step.action==='append_version'?struct({history_id:bytes(policy.historyId),entry_id:bytes(expected.entryId),author:address(doctor.publicKey()),
    commitment:bytes(commit),expected_version:nativeToScVal(expected.expectedVersion,{type:'u32'}),expected_grant_revision:nativeToScVal(BigInt(expected.expectedGrantRevision),{type:'u64'}),
    operation_id:bytes(step.operationId)}):struct({history_id:bytes(policy.historyId),doctor:address(doctor.publicKey()),can_read:nativeToScVal(expected.canRead),can_append:nativeToScVal(expected.canAppend),
    expected_revision:nativeToScVal(BigInt(expected.expectedRevision),{type:'u64'}),operation_id:bytes(step.operationId)})];
  const inner=new TransactionBuilder(new Account(actor.publicKey(),String(100+index)),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
   .addOperation(new Contract(CONTRACT).call(step.action,...args)).setTimebounds(0,maxTime)
   .setSorobanData(new SorobanDataBuilder().setResourceFee((BigInt(offered)-4000000n).toString()).build()).build();
  const unsigned=inner.toXDR(),signingHash=inner.hash().toString('hex');
  const row={id:step.requestId,state,action:step.action,method:step.action,source_wallet:actor.publicKey(),
   actor_user_id:policy[step.actor].userId,wallet_id:policy[step.actor].walletId,contract_id:CONTRACT,network:'testnet',expected,unsigned_xdr:unsigned,
   signing_hash:signingHash,signed_xdr:null,transaction_hash:null,error_code:state==='cancelled'?'signature_request_expired':state==='failed'?'synthetic_operation_failed':null};
  let outer,evidence;
  if(signed){
   inner.sign(signer??actor);outer=TransactionBuilder.buildFeeBumpTransaction(payer,'2000000',inner,Networks.TESTNET);outer.sign(feeSigner??payer);
   row.signed_xdr=outer.toXDR();row.transaction_hash=outer.hash().toString('hex');
   const value=step.action==='append_version'?{author:doctor.publicKey(),commitment:Buffer.from(commit,'hex'),
    previous_commitment:expected.previousCommitment?Buffer.from(expected.previousCommitment,'hex'):null,version:expected.expectedVersion+1,created_at:BigInt(NOW-10)}
    :{can_read:expected.canRead,can_append:expected.canAppend,revision:BigInt(expected.expectedRevision+1)};
   const returnValue=nativeToScVal(value,{type:step.action==='append_version'?{version:['symbol','u32']}:undefined}),events=[];
   const successHash=sha(new xdr.InvokeHostFunctionSuccessPreImage({returnValue,events}).toXDR());
   const operation=status==='SUCCESS'?xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(successHash))):xdr.OperationResult.opBadAuth();
   const innerResult=new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('100'),
    result:status==='SUCCESS'?xdr.InnerTransactionResultResult.txSuccess([operation]):xdr.InnerTransactionResultResult.txFailed([operation]),
    ext:new xdr.InnerTransactionResultExt(0)});
   const pair=new xdr.InnerTransactionResultPair({transactionHash:outer.innerTransaction.hash(),result:innerResult});
   evidence={status,feeBump:true,hash:row.transaction_hash,ledger:100+index,envelopeXdr:outer.toEnvelope(),returnValue,
    resultXdr:new xdr.TransactionResult({feeCharged:xdr.Int64.fromString(paid),
     result:status==='SUCCESS'?xdr.TransactionResultResult.txFeeBumpInnerSuccess(pair):xdr.TransactionResultResult.txFeeBumpInnerFailed(pair),
     ext:new xdr.TransactionResultExt(0)}),
    resultMetaXdr:metaVersion===3?new xdr.TransactionMeta(3,new xdr.TransactionMetaV3({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],operations:[],txChangesAfter:[],
     sorobanMeta:status==='SUCCESS'?new xdr.SorobanTransactionMeta({ext:new xdr.SorobanTransactionMetaExt(0),events,returnValue,diagnosticEvents:[]}):null}))
     :new xdr.TransactionMeta(4,new xdr.TransactionMetaV4({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],txChangesAfter:[],
      operations:[new xdr.OperationMetaV2({ext:new xdr.ExtensionPoint(0),changes:[],events})],
      sorobanMeta:status==='SUCCESS'?new xdr.SorobanTransactionMetaV2({ext:new xdr.SorobanTransactionMetaExt(0),returnValue}):null,events:[],diagnosticEvents:[]}))};
   receipts.set(row.transaction_hash,evidence);
  }
  return{row,evidence,outer,candidate:{unsignedXdr:unsigned,offeredFeeStroops:offered}};
 }
 const first=make(1,{offered:'74964051',paid:'64151056',metaVersion:3}),second=make(2,{offered:'37890734',paid:'29467146'});
 rows.push(first.row,second.row);
 const aggregate={aggregateMaxFeeStroops:'400000000',pdfMaxFeeStroops:'150000000',correctionMaxFeeStroops:'150000000',
  withdrawalMaxFeeStroops:'60000000',withdrawalReserveStroops:'60000000',
  confirmedSteps:[first,second].map((v,index)=>({key:policy.steps[index+1].key,requestId:v.row.id,operationId:policy.steps[index+1].operationId,
   transactionHash:v.row.transaction_hash,feeChargedStroops:index?'29467146':'64151056',ledger:v.evidence.ledger}))};
 async function receipt(hash){calls.push(hash);return receipts.get(hash);}
 const selected=make(3,{offered:'100000000',state:'awaiting_signature',signed:false});
 const options={step:policy.steps[3],rows,candidate:selected.candidate,receipt,now:NOW};
 const inspect=(patch={})=>inspectRehearsalBudgetExposure(policy,{...options,...patch},aggregate);
 return{policy,aggregate,first,second,rows,calls,receipts,make,options,inspect};
}
const unavailable={message:'clinical_rehearsal_budget_unavailable'},exceeded={message:'clinical_rehearsal_budget_exceeded'},conflict={message:'clinical_rehearsal_order_conflict'};

test('unapproved production policies are denied before the receipt adapter is called',async()=>{
 const f=fixture();await assert.rejects(assertRehearsalAggregateExposure(f.policy,f.options),/clinical_rehearsal_/);assert.equal(f.calls.length,0);
});
test('exact successful XDR v3/v4 proofs count paid fees, candidate and the six-XLM reserve once',async()=>{
 const f=fixture(),snapshot=JSON.stringify(f.rows),value=await f.inspect();
 assert.deepEqual(value,{paidStroops:'93618202',reservedOfferedStroops:'0',candidateOfferedStroops:'100000000',withdrawalReserveStroops:'60000000',totalExposureStroops:'253618202',remainingStroops:'146381798'});
 assert(Object.isFrozen(value));assert.equal(JSON.stringify(f.rows),snapshot);assert.equal(f.calls.length,2);assert(!JSON.stringify(value).includes('xdr'));
});
test('an unsigned current candidate row is excluded rather than counted as another pending reservation',async()=>{
 const f=fixture(),current=f.make(3,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(current.row);
 assert.equal((await f.inspect({candidate:current.candidate})).totalExposureStroops,'253618202');assert.equal(f.calls.length,2);
});
test('a persisted signed current candidate also reserves its maximum only once without querying itself',async()=>{
 const f=fixture(),current=f.make(3,{offered:'100000000',state:'submitted'});f.rows.push(current.row);
 assert.equal((await f.inspect({candidate:current.candidate})).totalExposureStroops,'253618202');assert.equal(f.calls.length,2);assert(!f.calls.includes(current.row.transaction_hash));
});
test('withdrawal uses its candidate fee instead of also charging the six-XLM cleanup reserve',async()=>{
 const f=fixture(),withdraw=f.make(5,{offered:'50000000',state:'awaiting_signature',signed:false});f.rows.push(withdraw.row);
 const result=await f.inspect({step:f.policy.steps[5],candidate:withdraw.candidate});
 assert.equal(result.withdrawalReserveStroops,'0');assert.equal(result.totalExposureStroops,'143618202');
});
test('exactly forty XLM succeeds while the next offered stroop fails',async()=>{
 const f=fixture(),pending=f.make(3,{offered:'146381798',state:'awaiting_signature',signed:false}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(pending.row);
 const value=await f.inspect({step:f.policy.steps[4],candidate:correction.candidate});assert.equal(value.totalExposureStroops,'400000000');assert.equal(value.remainingStroops,'0');
 f.rows[2]=f.make(3,{offered:'146381799',state:'awaiting_signature',signed:false}).row;
 await assert.rejects(f.inspect({step:f.policy.steps[4],candidate:correction.candidate}),exceeded);
});
for(const state of['submitted','failed','cancelled'])test('a signed '+state+' future attempt with unknown RPC status keeps its full offered fee reserved',async()=>{
 const f=fixture(),pending=f.make(3,{offered:'140000000',state}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(pending.row);
 f.receipts.set(pending.row.transaction_hash,{status:'NOT_FOUND'});
 const result=await f.inspect({step:f.policy.steps[4],candidate:correction.candidate});assert.equal(result.reservedOfferedStroops,'140000000');assert.equal(result.totalExposureStroops,'393618202');
});
test('a future receipt transport failure is reserved conservatively without exposing its error',async()=>{
 const f=fixture(),pending=f.make(3,{offered:'140000000',state:'submitted'}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(pending.row);
 const receipt=async hash=>{if(hash===pending.row.transaction_hash)throw Error('secret://untrusted provider');return f.options.receipt(hash)};
 const result=await f.inspect({step:f.policy.steps[4],candidate:correction.candidate,receipt});assert.equal(result.reservedOfferedStroops,'140000000');assert(!JSON.stringify(result).includes('secret'));
});
test('a canonical future FAILED receipt counts its actual charged fee rather than zero or the offered maximum',async()=>{
 const f=fixture(),failed=f.make(3,{offered:'140000000',paid:'12000000',state:'failed',status:'FAILED'}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(failed.row);
 const result=await f.inspect({step:f.policy.steps[4],candidate:correction.candidate});assert.equal(result.paidStroops,'105618202');assert.equal(result.reservedOfferedStroops,'0');
});
test('a canonical future SUCCESS replaces the previous offered reservation with its actual charge',async()=>{
 const f=fixture(),success=f.make(3,{offered:'140000000',paid:'90000000',state:'submitted'}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(success.row);
 assert.equal((await f.inspect({step:f.policy.steps[4],candidate:correction.candidate})).paidStroops,'183618202');
});
for(const state of['cancelled','failed'])test('a consistent '+state+' unsigned slot has no charge but is never revived',async()=>{
 const f=fixture(),closed=f.make(3,{offered:'140000000',state,signed:false}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(closed.row);
 assert.equal((await f.inspect({step:f.policy.steps[4],candidate:correction.candidate})).reservedOfferedStroops,'0');
 await assert.rejects(f.inspect({candidate:closed.candidate}),conflict);
});
test('an expired unsigned pending attempt still reserves its offered fee',async()=>{
 const f=fixture(),pending=f.make(3,{offered:'140000000',state:'awaiting_signature',signed:false,maxTime:NOW-1}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(pending.row);
 assert.equal((await f.inspect({step:f.policy.steps[4],candidate:correction.candidate})).reservedOfferedStroops,'140000000');
});
for(const mode of['missing','unknown','timeout','failed','ledger','charged'])test('a fixed C2/C3 proof with '+mode+' evidence fails closed',async()=>{
 const f=fixture(),hash=f.first.row.transaction_hash;
 if(mode==='missing')f.rows.shift();if(mode==='unknown')f.receipts.set(hash,{status:'NOT_FOUND'});
 if(mode==='failed')f.receipts.set(hash,{...f.first.evidence,status:'FAILED'});
 if(mode==='ledger')f.first.evidence.ledger++;
 if(mode==='charged')f.first.evidence.resultXdr.feeCharged(xdr.Int64.fromString('64151055'));
 const receipt=mode==='timeout'?async()=>{throw Error('untrusted-secret-payload')}:f.options.receipt;
 await assert.rejects(f.inspect({receipt}),unavailable);
});
for(const field of['unsigned_xdr','signing_hash','transaction_hash','source_wallet','contract_id','network','action','method','wallet_id','actor_user_id'])test('altered saved '+field+' cannot become fee evidence',async()=>{
 const f=fixture();f.first.row[field]='altered';await assert.rejects(f.inspect(),unavailable);
});
for(const field of['operationId','entryId','commitment','expectedVersion','expectedGrantRevision','author','patient','historyId'])test('altered saved expected '+field+' rejects the budget snapshot',async()=>{
 const f=fixture();f.first.row.expected[field]='altered';await assert.rejects(f.inspect(),unavailable);
});
test('hash without a signed envelope, duplicate rows and extra foreign slots all fail closed',async()=>{
 for(const change of[
  f=>{f.first.row.signed_xdr=null},f=>{f.rows.push(f.first.row)},f=>{f.rows.push({...f.first.row,id:id(999)})},
  f=>{f.first.row.transaction_hash=null},f=>{f.first.row.state='prepared'},
 ]){const f=fixture();change(f);await assert.rejects(f.inspect(),unavailable)}
});
for(const side of['doctor','payer'])test('a forged '+side+' signature cannot supply canonical paid fees',async()=>{
 const f=fixture(),forged=f.make(1,{offered:'74964051',paid:'64151056',...(side==='doctor'?{signer:foreign}:{feeSigner:foreign})});
 f.rows[0]=forged.row;f.aggregate.confirmedSteps[0].transactionHash=forged.row.transaction_hash;
 await assert.rejects(f.inspect(),unavailable);
});
for(const field of['envelope','result','meta','fee','status','return','hash'])test('malformed RPC '+field+' does not silently release a reservation',async()=>{
 const f=fixture(),e=f.first.evidence;
 if(field==='envelope')e.envelopeXdr=f.second.outer.toEnvelope();
 if(field==='result')e.resultXdr=null;if(field==='meta')e.resultMetaXdr=null;
 if(field==='fee')e.resultXdr.feeCharged(xdr.Int64.fromString('74964052'));
 if(field==='status')e.status='PENDING';if(field==='return')e.returnValue=xdr.ScVal.scvVoid();
 if(field==='hash')e.hash='ff'.repeat(32);
 await assert.rejects(f.inspect(),unavailable);
});
test('candidate fee, envelope and terminal status cannot be relabeled',async()=>{
 const f=fixture();await assert.rejects(f.inspect({candidate:{...f.options.candidate,offeredFeeStroops:'100000001'}}),unavailable);
 const current=f.make(3,{offered:'100000000',state:'confirmed'});f.rows.push(current.row);
 await assert.rejects(f.inspect({candidate:current.candidate}),conflict);
});
test('any persisted withdrawal seals new contributions, including unsigned cancellation',async()=>{
 const f=fixture();f.rows.push(f.make(5,{offered:'50000000',state:'cancelled',signed:false}).row);
 await assert.rejects(f.inspect(),conflict);
});
test('invalid candidate bounds and amounts fail without changing any snapshot',async()=>{
 for(const patch of[{offeredFeeStroops:'1e8'},{offeredFeeStroops:'0'},{unsignedXdr:'not an envelope'}]){
  const f=fixture(),snapshot=JSON.stringify(f.rows);await assert.rejects(f.inspect({candidate:{...f.options.candidate,...patch}}),unavailable);assert.equal(JSON.stringify(f.rows),snapshot);
 }
});


for(const [seconds,code]of [[301,'signature_request_expired'],[601,'clinical_rehearsal_expired']])test('receipt IO crossing '+seconds+' seconds cannot return an expired permission',async context=>{
 const f=fixture();let clock=NOW*1000;context.mock.method(Date,'now',()=>clock);const receipt=async hash=>{clock=NOW*1000+seconds*1000;return f.options.receipt(hash)};
 await assert.rejects(f.inspect({receipt}),{message:code});
});
test('a wall-clock regression during receipt lookup fails closed',async context=>{
 const f=fixture();let clock=NOW*1000;context.mock.method(Date,'now',()=>clock);const receipt=async hash=>{clock=NOW*1000-1;return f.options.receipt(hash)};
 await assert.rejects(f.inspect({receipt}),unavailable);
});

test('a FAILED receipt also requires decoded SDK XDR metadata rather than a duck-typed placeholder',async()=>{
 const f=fixture(),failed=f.make(3,{offered:'140000000',paid:'12000000',state:'failed',status:'FAILED'}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});
 f.rows.push(failed.row);failed.evidence.resultMetaXdr={switch:()=>3};await assert.rejects(f.inspect({step:f.policy.steps[4],candidate:correction.candidate}),unavailable);
});

// Schema12 renewal fees share the global aggregate and original historical charges.
import { newReservation, verifySponsorshipPrincipal } from './sponsorship-domain.mjs';
import { quoteSponsorship } from './sponsorship-quote.mjs';
import { rehearsalAuthorizationBinding } from './clinical-rehearsal-budget.mjs';
async function renewalFixture(options={}) {
 const f=fixture(),admin=key(35),a={requestId:id(1),dossierId:id(200),expectedVersion:5,targetVersion:6,validUntil:NOW+604800,method:'reauthorize_doctor'};
 Object.assign(f.policy,{admin:admin.publicKey(),registryId:'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2',authorization:a,
  reviewer:{userId:'dummy-reviewer',email:'reviewer@example.test'},completionContinuation:{approvedAt:NOW-20}});
 f.aggregate.renewalMaxFeeStroops='10000000';
 const offered=options.offered??'10000000',paid=options.paid??'3000000',signed=options.signed??true,status=options.status??'SUCCESS';
 const job={id:a.requestId,dossier_id:a.dossierId,action:'renew',method:a.method,network:'testnet',contract_id:f.policy.registryId,
  doctor_id:10,doctor_user_id:f.policy.doctor.userId,wallet_id:f.policy.doctor.walletId,wallet:doctor.publicKey(),
  requested_by:f.policy.reviewer.userId,requested_email:f.policy.reviewer.email,expected_version:5,target_version:6,valid_until:a.validUntil,
  commitment:'dd'.repeat(32),state:signed?'submitted':'pending',prepared_xdr:null,transaction_hash:null};
 const inner=new TransactionBuilder(new Account(admin.publicKey(),'200'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
  .addOperation(new Contract(f.policy.registryId).call(a.method,address(doctor.publicKey()),bytes(job.commitment),nativeToScVal(BigInt(a.validUntil),{type:'u64'})))
  .setTimebounds(0,NOW+180).setSorobanData(new SorobanDataBuilder().setResourceFee((BigInt(offered)-4000000n).toString()).build()).build();
 const unsigned=inner.toXDR(),p=await verifySponsorshipPrincipal(async()=>rehearsalAuthorizationBinding(f.policy,job)),quote=quoteSponsorship(p,{unsignedXdr:unsigned,sponsorBaseFeeStroops:'2000000',preparedAt:NOW-10,now:NOW-10});
 const reservation=newReservation(p,quote);let evidence;
 if(signed){
  inner.sign(admin);const outer=TransactionBuilder.buildFeeBumpTransaction(payer,'2000000',inner,Networks.TESTNET);outer.sign(payer);
  job.prepared_xdr=outer.toXDR();job.transaction_hash=outer.hash().toString('hex');
  Object.assign(reservation,{state:'submitted',signedAt:NOW-5,signedInnerDigest:sha(inner.toXDR()).toString('hex'),transactionHash:job.transaction_hash});
  const returnValue=xdr.ScVal.scvVoid(),events=[],successHash=sha(new xdr.InvokeHostFunctionSuccessPreImage({returnValue,events}).toXDR());
  const operation=status==='SUCCESS'?xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(successHash))):xdr.OperationResult.opBadAuth();
  const ir=new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('100'),result:status==='SUCCESS'?xdr.InnerTransactionResultResult.txSuccess([operation]):xdr.InnerTransactionResultResult.txFailed([operation]),ext:new xdr.InnerTransactionResultExt(0)});
  const pair=new xdr.InnerTransactionResultPair({transactionHash:inner.hash(),result:ir});
  evidence={status,feeBump:true,hash:job.transaction_hash,ledger:150,envelopeXdr:outer.toEnvelope(),returnValue,
   resultXdr:new xdr.TransactionResult({feeCharged:xdr.Int64.fromString(paid),result:status==='SUCCESS'?xdr.TransactionResultResult.txFeeBumpInnerSuccess(pair):xdr.TransactionResultResult.txFeeBumpInnerFailed(pair),ext:new xdr.TransactionResultExt(0)}),
   resultMetaXdr:new xdr.TransactionMeta(4,new xdr.TransactionMetaV4({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],txChangesAfter:[],operations:[new xdr.OperationMetaV2({ext:new xdr.ExtensionPoint(0),changes:[],events})],sorobanMeta:status==='SUCCESS'?new xdr.SorobanTransactionMetaV2({ext:new xdr.SorobanTransactionMetaExt(0),returnValue}):null,events:[],diagnosticEvents:[]}))};
  f.receipts.set(job.transaction_hash,evidence);
 }
 const row={request_id:job.id,network:'testnet',utc_day:reservation.day,state:reservation.state,transaction_hash:reservation.transactionHash,payload:reservation};
 const inspect=(patch={})=>f.inspect({authorizationRows:[job],authorizationReservations:[row],...patch});
 return{...f,job,reservation,row,evidence,inspect,candidate:{unsignedXdr:unsigned,offeredFeeStroops:offered}};
}
test('schema12 renewal SUCCESS adds its canonical fee to the unchanged historical C2/C3 cost',async()=>{
 const f=await renewalFixture(),result=await f.inspect();assert.equal(result.paidStroops,'96618202');assert.equal(result.totalExposureStroops,'256618202');
 assert.equal(f.reservation.state,'submitted'); // Inspector is strictly read-only.
});
test('schema12 renewal FAILED also counts its canonical fee once',async()=>{
 const f=await renewalFixture({status:'FAILED',paid:'2000000'});f.job.state='failed';
 assert.equal((await f.inspect()).paidStroops,'95618202');assert.equal((await f.inspect()).paidStroops,'95618202');
});
for(const status of['NOT_FOUND','UNKNOWN'])test('schema12 renewal '+status+' retains the entire offered fee as exposure',async()=>{
 const f=await renewalFixture();f.receipts.set(f.job.transaction_hash,{status});
 const result=await f.inspect();assert.equal(result.paidStroops,'93618202');assert.equal(result.reservedOfferedStroops,'10000000');
});
test('unsigned renewal reservation survives a crash before the signed admin row is saved',async()=>{
 const f=await renewalFixture({signed:false});const result=await f.inspect();
 assert.equal(result.reservedOfferedStroops,'10000000');assert.equal(result.totalExposureStroops,'263618202');
});
test('renewal candidate reserves its offered fee once and requires its own exact persisted request',async()=>{
 const f=await renewalFixture({signed:false});const result=await f.inspect({step:f.policy.steps[0],candidate:f.candidate});
 assert.equal(result.reservedOfferedStroops,'0');assert.equal(result.candidateOfferedStroops,'10000000');assert.equal(result.totalExposureStroops,'163618202');
 await assert.rejects(f.inspect({step:f.policy.steps[0],candidate:f.candidate,authorizationRows:[],authorizationReservations:[]}),unavailable);
});
for(const key of['method','wallet','contract_id','requested_by','target_version','valid_until','commitment'])test('renewal changed '+key+' is never accepted as fee evidence',async()=>{
 const f=await renewalFixture();f.job[key]=key==='target_version'?7:key==='valid_until'?NOW+100:'changed';await assert.rejects(f.inspect(),unavailable);
});
for(const key of['transaction_hash','payload','state','utc_day'])test('renewal reservation changed '+key+' fails closed',async()=>{
 const f=await renewalFixture({signed:false});f.row[key]=key==='payload'?{...f.reservation,quote:{...f.reservation.quote,offeredFeeStroops:'9999999'}}:'changed';
 await assert.rejects(f.inspect(),unavailable);
});
test('a signed admin row cannot hide its missing persistent reservation',async()=>{
 const f=await renewalFixture();await assert.rejects(f.inspect({authorizationReservations:[]}),unavailable);
});
test('withdrawal can finish before renewal while retaining its outstanding reserve',async()=>{
 const f=await renewalFixture({signed:false}),withdraw=f.make(5,{offered:'50000000',state:'awaiting_signature',signed:false});
 const result=await f.inspect({step:f.policy.steps[5],candidate:withdraw.candidate});
 assert.equal(result.totalExposureStroops,'153618202');assert.equal(result.withdrawalReserveStroops,'0');
 f.rows.push(withdraw.row);await assert.rejects(f.inspect({step:f.policy.steps[0],candidate:f.candidate}),conflict);
});
test('renewal and concurrent clinical offers cannot exceed the global forty-XLM ceiling',async()=>{
 const f=await renewalFixture({signed:false}),pending=f.make(3,{offered:'146381798',state:'awaiting_signature',signed:false}),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});f.rows.push(pending.row);
 await assert.rejects(f.inspect({step:f.policy.steps[4],candidate:correction.candidate}),exceeded);
});

test('a valid quote for another admin sequence cannot be substituted into a signed renewal reservation',async()=>{
 const f=await renewalFixture(),outer=TransactionBuilder.fromXDR(f.job.prepared_xdr,Networks.TESTNET),envelope=outer.innerTransaction.toEnvelope();
 envelope.v1().signatures([]);envelope.v1().tx().seqNum(xdr.SequenceNumber.fromString('300'));
 const different=new (await import('@stellar/stellar-sdk')).Transaction(envelope,Networks.TESTNET),principal=await verifySponsorshipPrincipal(async()=>rehearsalAuthorizationBinding(f.policy,f.job));
 const quote=quoteSponsorship(principal,{unsignedXdr:different.toXDR(),sponsorBaseFeeStroops:'2000000',preparedAt:NOW-10,now:NOW-10});
 f.row.payload={...f.reservation,quote};await assert.rejects(f.inspect(),unavailable);
});
test('a changed signed inner digest cannot be used to settle the exact renewal hash',async()=>{
 const f=await renewalFixture();f.row.payload={...f.reservation,signedInnerDigest:'ff'.repeat(32)};await assert.rejects(f.inspect(),unavailable);
});


// Schema13 holds the complete approved restoration maximum for the entire run.
// The maintenance runner independently pins its single persisted attempt. This
// inspector never discounts that maximum using mutable receipt/SQL state.
async function maintenanceFixture(options={}) {
 const f=await renewalFixture(options),approvedAt=f.policy.completionContinuation.approvedAt;
 f.policy.createdAt=approvedAt;
 f.policy.maintenanceContinuation={requestId:id(300),source:f.policy.relayer,maxFeeStroops:'20000000',approvedAt,until:f.policy.until};
 f.aggregate.maintenanceMaxFeeStroops='20000000';
 return f;
}

test('schema13 holds two XLM separately from historical fees, renewal fees and the six-XLM withdrawal reserve',async()=>{
 const f=await maintenanceFixture(),before=JSON.stringify({rows:f.rows,job:f.job,reservation:f.reservation}),value=await f.inspect();
 assert.equal(value.paidStroops,'96618202');assert.equal(value.reservedOfferedStroops,'0');
 assert.equal(value.maintenanceReservedStroops,'20000000');assert.equal(value.withdrawalReserveStroops,'60000000');
 assert.equal(value.totalExposureStroops,'276618202');assert.equal(value.remainingStroops,'123381798');
 assert.equal(JSON.stringify({rows:f.rows,job:f.job,reservation:f.reservation}),before);
 assert.deepEqual(await f.inspect(),value);assert(Object.isFrozen(value));
});

test('schema13 exact forty includes maintenance and the very next offered stroop is blocked',async()=>{
 const f=await maintenanceFixture(),correction=f.make(4,{offered:'100000000',state:'awaiting_signature',signed:false});
 f.rows.push(f.make(3,{offered:'123381798',state:'awaiting_signature',signed:false}).row);
 const value=await f.inspect({step:f.policy.steps[4],candidate:correction.candidate});
 assert.equal(value.totalExposureStroops,'400000000');assert.equal(value.remainingStroops,'0');
 assert.equal(value.maintenanceReservedStroops,'20000000');assert.equal(value.withdrawalReserveStroops,'60000000');
 f.rows[2]=f.make(3,{offered:'123381799',state:'awaiting_signature',signed:false}).row;
 await assert.rejects(f.inspect({step:f.policy.steps[4],candidate:correction.candidate}),exceeded);
});

for(const status of['SUCCESS','FAILED','UNKNOWN','NOT_FOUND'])test('schema13 maintenance ceiling is retained alongside renewal '+status+' evidence',async()=>{
 const f=await maintenanceFixture({status:status==='FAILED'?'FAILED':'SUCCESS'});
 if(status==='FAILED')f.job.state='failed';
 if(['UNKNOWN','NOT_FOUND'].includes(status))f.receipts.set(f.job.transaction_hash,{status});
 const hash=f.job.transaction_hash,value=await f.inspect();
 assert.equal(value.maintenanceReservedStroops,'20000000');
 assert.equal(value.reservedOfferedStroops,['UNKNOWN','NOT_FOUND'].includes(status)?'10000000':'0');
 assert.equal(f.job.transaction_hash,hash);assert.equal(f.reservation.state,'submitted');
});

test('schema13 unknown renewal and PDF retain their full offered amounts without consuming the maintenance or withdrawal maxima',async()=>{
 const f=await maintenanceFixture(),correction=f.make(4,{offered:'90000000',state:'awaiting_signature',signed:false});
 f.receipts.set(f.job.transaction_hash,{status:'UNKNOWN'});
 const pdf=f.make(3,{offered:'126381798',state:'submitted'});f.rows.push(pdf.row);f.receipts.set(pdf.row.transaction_hash,{status:'NOT_FOUND'});
 const value=await f.inspect({step:f.policy.steps[4],candidate:correction.candidate});
 assert.equal(value.paidStroops,'93618202');assert.equal(value.reservedOfferedStroops,'136381798');
 assert.equal(value.maintenanceReservedStroops,'20000000');assert.equal(value.withdrawalReserveStroops,'60000000');
 assert.equal(value.totalExposureStroops,'400000000');
});

test('schema13 can withdraw before renewal and unfinished contributions while still holding the restoration maximum',async()=>{
 const f=await maintenanceFixture({signed:false}),withdraw=f.make(5,{offered:'60000000',state:'awaiting_signature',signed:false});
 const value=await f.inspect({step:f.policy.steps[5],candidate:withdraw.candidate,authorizationRows:[],authorizationReservations:[]});
 assert.equal(value.paidStroops,'93618202');assert.equal(value.withdrawalReserveStroops,'0');
 assert.equal(value.maintenanceReservedStroops,'20000000');assert.equal(value.totalExposureStroops,'173618202');
 f.rows.push(withdraw.row);await assert.rejects(f.inspect(),conflict);
});

test('schema13 renewal candidate is counted once in addition to the two-XLM restoration hold',async()=>{
 const f=await maintenanceFixture({signed:false}),value=await f.inspect({step:f.policy.steps[0],candidate:f.candidate});
 assert.equal(value.reservedOfferedStroops,'0');assert.equal(value.candidateOfferedStroops,'10000000');
 assert.equal(value.maintenanceReservedStroops,'20000000');assert.equal(value.totalExposureStroops,'183618202');
});

for(const mutate of[
 f=>{delete f.policy.maintenanceContinuation;},f=>{delete f.aggregate.maintenanceMaxFeeStroops;},
 f=>{f.aggregate.maintenanceMaxFeeStroops='0';},f=>{f.aggregate.maintenanceMaxFeeStroops='19999999';},
 f=>{f.aggregate.maintenanceMaxFeeStroops='20000001';},f=>{f.policy.maintenanceContinuation.maxFeeStroops='19999999';},
 f=>{f.policy.maintenanceContinuation.source=foreign.publicKey();},f=>{f.policy.maintenanceContinuation.approvedAt--;},
 f=>{f.policy.maintenanceContinuation.until++;},f=>{delete f.policy.completionContinuation;},
])test('schema13 mismatched or dropped maintenance scope cannot reduce the hold',async()=>{
 const f=await maintenanceFixture();mutate(f);await assert.rejects(f.inspect(),unavailable);assert.equal(f.calls.length,0);
});

test('schema13 cannot replace unavailable canonical historical C2/C3 evidence with a maintenance reservation',async()=>{
 const f=await maintenanceFixture();f.receipts.set(f.first.row.transaction_hash,{status:'NOT_FOUND'});
 await assert.rejects(f.inspect(),unavailable);
});

test('a forged schema13 or metadata-stripped clone receives no production aggregate authority before RPC',async()=>{
 const f=await maintenanceFixture();
 for(const value of[f.policy,{...f.policy,maintenanceContinuation:undefined},
  {...f.policy,maintenanceContinuation:undefined,aggregateBudget:{...f.aggregate,maintenanceMaxFeeStroops:undefined}}]){
  await assert.rejects(assertRehearsalAggregateExposure(value,f.options),/clinical_rehearsal_/);
 }
 assert.equal(f.calls.length,0);
});


// The maintenance transaction has no pretend clinical candidate: its historical
// preflight requires both exact original receipts before any separate spending.
const inspectHistorical = (f, patch = {}) => inspectRehearsalHistoricalCharges(f.policy,
 { rows: f.rows, receipt: f.options.receipt, now: NOW, ...patch }, f.aggregate);

test('maintenance historical preflight proves exact C2/C3 SDK v3/v4 receipts without a candidate or renewal',async()=>{
 const f=await maintenanceFixture(),before=JSON.stringify(f.rows),result=await inspectHistorical(f);
 assert.deepEqual(result,{paidStroops:'93618202'});assert(Object.isFrozen(result));
 assert.deepEqual(f.calls,[f.first.row.transaction_hash,f.second.row.transaction_hash]);
 assert.equal(JSON.stringify(f.rows),before);assert(!JSON.stringify(result).includes('xdr'));
});

test('maintenance historical preflight accepts rows in either SQL order',async()=>{
 const f=await maintenanceFixture();assert.equal((await inspectHistorical(f,{rows:[...f.rows].reverse()})).paidStroops,'93618202');
});

for(const mode of ['missing','extra','duplicate','unconfirmed','unsigned','request','operation','method','actor','wallet'])
 test('maintenance historical preflight rejects '+mode+' persisted binding before receipt IO',async()=>{
 const f=await maintenanceFixture();
 if(mode==='missing')f.rows.pop();if(mode==='extra')f.rows.push({...f.first.row,id:id(999)});
 if(mode==='duplicate')f.rows[1]=f.first.row;if(mode==='unconfirmed')f.first.row.state='submitted';
 if(mode==='unsigned'){f.first.row.signed_xdr=null;f.first.row.transaction_hash=null;}
 if(mode==='request')f.first.row.id=id(888);if(mode==='operation')f.first.row.expected.operationId='fa'.repeat(32);
 if(mode==='method')delete f.first.row.method;if(mode==='actor')delete f.first.row.actor_user_id;
 if(mode==='wallet')delete f.first.row.wallet_id;
 await assert.rejects(inspectHistorical(f),unavailable);assert.equal(f.calls.length,0);
});

for(const mode of ['UNKNOWN','NOT_FOUND','transport','FAILED','ledger','fee','envelope','result','meta','return','hash'])
 test('maintenance historical preflight fails closed on '+mode+' canonical evidence',async()=>{
 const f=await maintenanceFixture(),e=f.first.evidence;
 if(['UNKNOWN','NOT_FOUND','FAILED'].includes(mode))f.receipts.set(f.first.row.transaction_hash,{status:mode});
 if(mode==='ledger')e.ledger++;if(mode==='fee')e.resultXdr.feeCharged(xdr.Int64.fromString('64151055'));
 if(mode==='envelope')e.envelopeXdr=f.second.outer.toEnvelope();if(mode==='result')e.resultXdr=null;
 if(mode==='meta')e.resultMetaXdr=null;if(mode==='return')e.returnValue=xdr.ScVal.scvVoid();
 if(mode==='hash')e.hash='ff'.repeat(32);
 const receipt=mode==='transport'?async()=>{throw Error('secret-provider-error')}:f.options.receipt;
 await assert.rejects(inspectHistorical(f,{receipt}),unavailable);
});

for(const side of ['doctor','payer'])test('maintenance historical preflight rejects forged '+side+' signatures before receipt IO',async()=>{
 const f=await maintenanceFixture(),forged=f.make(1,{offered:'74964051',paid:'64151056',...(side==='doctor'?{signer:foreign}:{feeSigner:foreign})});
 f.rows[0]=forged.row;f.aggregate.confirmedSteps[0].transactionHash=forged.row.transaction_hash;
 await assert.rejects(inspectHistorical(f),unavailable);assert.equal(f.calls.length,0);
});

test('maintenance historical preflight snapshots persisted bindings before calling an external receipt adapter',async()=>{
 const f=await maintenanceFixture(),receipt=async hash=>{
  f.second.row.expected.canRead=false;f.second.row.actor_user_id='changed-after-IO';
  return f.options.receipt(hash);
 };
 assert.equal((await inspectHistorical(f,{receipt})).paidStroops,'93618202');
});

for(const elapsed of [600,601])test('maintenance historical receipt IO crossing the execution deadline by '+(elapsed-600)+' seconds cannot permit spending',async context=>{
 const f=await maintenanceFixture();let clock=NOW*1000;context.mock.method(Date,'now',()=>clock);
 const receipt=async hash=>{clock=NOW*1000+elapsed*1000;return f.options.receipt(hash)};
 await assert.rejects(inspectHistorical(f,{receipt}),{message:'clinical_rehearsal_expired'});
});

test('maintenance historical receipt IO with a wall-clock regression fails closed',async context=>{
 const f=await maintenanceFixture();let clock=NOW*1000;context.mock.method(Date,'now',()=>clock);
 const receipt=async hash=>{clock=NOW*1000-1;return f.options.receipt(hash)};
 await assert.rejects(inspectHistorical(f,{receipt}),unavailable);
});

test('unapproved, preview-like and cloned schema13 historical checks cannot call the receipt adapter',async()=>{
 const f=await maintenanceFixture();
 for(const policy of [f.policy,{...f.policy},
  {...f.policy,maintenanceContinuation:{...f.policy.maintenanceContinuation},aggregateBudget:f.aggregate},
  {...f.policy,maintenanceContinuation:undefined,aggregateBudget:{...f.aggregate,maintenanceMaxFeeStroops:undefined}}]){
  await assert.rejects(assertRehearsalHistoricalCharges(policy,{rows:f.rows,receipt:f.options.receipt,now:NOW}),/clinical_rehearsal_/);
 }
 assert.equal(f.calls.length,0);
});


test('schema14 extends only execution while preserving the original maintenance approval and the full two-XLM hold',async()=>{
 const f=await maintenanceFixture();const oldUntil=f.policy.until;f.policy.until+=14400;
 f.policy.resumeContinuation={previousUntil:oldUntil,approvedAt:NOW,executionUntil:f.policy.until};
 const value=await f.inspect();assert.equal(f.policy.maintenanceContinuation.until,oldUntil);assert.equal(value.maintenanceReservedStroops,'20000000');assert.equal(value.paidStroops,'96618202');assert.equal(value.withdrawalReserveStroops,'60000000');
});

test('a forged schema14 historical scope cannot call its RPC transport despite copied retained receipt metadata',async()=>{
 const f=await maintenanceFixture();f.policy.resumeContinuation={previousUntil:f.policy.until,receiptEvidenceFile:'fake-private',receiptEvidenceSha256:'a'.repeat(64)};
 await assert.rejects(assertRehearsalHistoricalCharges(f.policy,{rows:f.rows,receipt:f.options.receipt,now:NOW}),/clinical_rehearsal_/);assert.equal(f.calls.length,0);
});


for(const index of [3,4,5])test('confirmed '+['','','','C4 PDF','C5 correction','C6 withdrawal'][index]+' is inspectable without preparing any next candidate',()=>{
 const f=fixture(),value=f.make(index,{offered:index===5?'50000000':'80000000',paid:'1234567',state:'confirmed'}),before=JSON.stringify(value.row);
 const result=inspectRehearsalConfirmedOperationSnapshot(f.policy,{step:f.policy.steps[index],row:value.row,evidence:value.evidence});
 assert.equal(result.status,'SUCCESS');assert.equal(result.key,f.policy.steps[index].key);assert.equal(result.transactionHash,value.row.transaction_hash);assert.equal(result.feeChargedStroops,'1234567');assert.equal(result.durableRecordedOperationReadPending,true);assert(Object.isFrozen(result));assert.equal(JSON.stringify(value.row),before);assert.equal(f.calls.length,0);
});

for(const index of [1,2])test('the single confirmed inspector refuses historical '+['','C2','C3'][index]+' as a new C4/C5/C6',()=>{
 const f=fixture(),value=index===1?f.first:f.second;assert.throws(()=>inspectRehearsalConfirmedOperationSnapshot(f.policy,{step:f.policy.steps[index],row:value.row,evidence:value.evidence}),unavailable);
});

for(const state of ['awaiting_signature','submitted','failed','cancelled'])test('the confirmed inspector refuses '+state+' even with a successful SDK receipt',()=>{
 const f=fixture(),value=f.make(3,{state});assert.throws(()=>inspectRehearsalConfirmedOperationSnapshot(f.policy,{step:f.policy.steps[3],row:value.row,evidence:value.evidence}),unavailable);
});

for(const field of ['id','method','actor_user_id','wallet_id','source_wallet','signing_hash','transaction_hash'])test('the confirmed inspector refuses a changed persisted '+field,()=>{
 const f=fixture(),value=f.make(3);value.row[field]='altered';assert.throws(()=>inspectRehearsalConfirmedOperationSnapshot(f.policy,{step:f.policy.steps[3],row:value.row,evidence:value.evidence}),unavailable);
});

test('the confirmed inspector cannot accept another declared step or a relabeled declaration',()=>{
 const f=fixture(),value=f.make(3);for(const step of [f.policy.steps[4],{...f.policy.steps[3],operationId:'ff'.repeat(32)}])assert.throws(()=>inspectRehearsalConfirmedOperationSnapshot(f.policy,{step,row:value.row,evidence:value.evidence}),unavailable);
});

for(const change of [
 value=>{value.evidence.resultMetaXdr=null;},value=>{value.evidence.returnValue=xdr.ScVal.scvVoid();},
 value=>{value.evidence.resultMetaXdr={switch:()=>4};},value=>{value.evidence.status='FAILED';},
 value=>{value.evidence.resultXdr.feeCharged(xdr.Int64.fromString('80000001'));},value=>{value.evidence.hash='ff'.repeat(32);},
])test('the confirmed inspector rejects malformed metadata, outcome, hash or a charge above its exact offer',()=>{
 const f=fixture(),value=f.make(3);change(value);assert.throws(()=>inspectRehearsalConfirmedOperationSnapshot(f.policy,{step:f.policy.steps[3],row:value.row,evidence:value.evidence}),unavailable);
});

test('the confirmed inspector rejects a different envelope and source or payer signatures',()=>{
 for(const side of ['source','payer']){const f=fixture(),value=f.make(3,side==='source'?{signer:foreign}:{feeSigner:foreign});assert.throws(()=>inspectRehearsalConfirmedOperationSnapshot(f.policy,{step:f.policy.steps[3],row:value.row,evidence:value.evidence}),unavailable);}
 const f=fixture(),value=f.make(3);value.evidence.envelopeXdr=f.first.outer.toEnvelope();assert.throws(()=>inspectRehearsalConfirmedOperationSnapshot(f.policy,{step:f.policy.steps[3],row:value.row,evidence:value.evidence}),unavailable);
});

test('the authoritative single-operation inspector rejects borrowed or preview-like authority before reading the supplied receipt',()=>{
 const f=fixture(),value=f.make(3);let evidenceRead=false;const options={step:f.policy.steps[3],row:value.row,now:NOW,get evidence(){evidenceRead=true;throw Error('must not inspect before authority');}};
 for(const policy of [f.policy,{...f.policy,resumeContinuation:{approvedAt:NOW}}])assert.throws(()=>inspectRehearsalConfirmedOperation(policy,options),/clinical_rehearsal_/);assert.equal(evidenceRead,false);
});


test('the confirmed inspector rejects typed SDK metadata whose return value was altered',()=>{
 const f=fixture(),value=f.make(3);value.evidence.resultMetaXdr.value().sorobanMeta().returnValue(xdr.ScVal.scvVoid());
 assert.throws(()=>inspectRehearsalConfirmedOperationSnapshot(f.policy,{step:f.policy.steps[3],row:value.row,evidence:value.evidence}),unavailable);
});

for(const index of [3,4,5])test('reopened execution still accounts original maintenance and canonical charges for '+['','','','PDF','correction','withdrawal'][index],async()=>{
 const f=await maintenanceFixture(),originalMaintenanceUntil=f.policy.until;
 f.policy.until=originalMaintenanceUntil+28800;
 f.policy.resumeContinuation={previousUntil:originalMaintenanceUntil,approvedAt:NOW,executionUntil:f.policy.until};
 f.policy.reopenedPdfRecovery={originalFinancialUntil:originalMaintenanceUntil+14400,executionUntil:f.policy.until};
 const candidate=f.make(index,{offered:'10000000',state:'awaiting_signature',signed:false}).candidate;
 const value=await f.inspect({step:f.policy.steps[index],candidate});
 assert.equal(value.paidStroops,'96618202');
 assert.equal(value.maintenanceReservedStroops,'20000000');
 assert.equal(value.withdrawalReserveStroops,index===5?'0':'60000000');
 assert.equal(value.totalExposureStroops,index===5?'126618202':'186618202');
 assert.equal(f.policy.maintenanceContinuation.until,originalMaintenanceUntil);
 assert.equal(f.calls.length,3);
});

test('reopened execution rejects relabeling historical maintenance as the latest financial deadline before receipt IO',async()=>{
 const f=await maintenanceFixture(),originalMaintenanceUntil=f.policy.until;
 f.policy.until=originalMaintenanceUntil+28800;
 f.policy.resumeContinuation={previousUntil:originalMaintenanceUntil+14400,approvedAt:NOW,executionUntil:f.policy.until};
 await assert.rejects(f.inspect(),unavailable);assert.equal(f.calls.length,0);
});


async function restoredCompletionBudgetFixture(options={}){
 const f=await maintenanceFixture(options),m=f.policy.maintenanceContinuation;
 f.policy.restoredCompletion={priorCreatedAt:m.approvedAt,priorCompletionApprovedAt:m.approvedAt,priorMaintenanceUntil:m.until,priorRenewalReserveStroops:'10000000',restoration:{maxFeeStroops:'20000000'}};
 Object.assign(f.aggregate,{recoveryMaintenanceMaxFeeStroops:'20000000',priorRenewalReserveStroops:'10000000'});return f;
}
test('schema19 holds old renewal, old and new maintenance and the complete new renewal ceiling',async()=>{
 const f=await restoredCompletionBudgetFixture(),value=await f.inspect();
 assert.equal(value.paidStroops,'96618202');assert.equal(value.maintenanceReservedStroops,'20000000');assert.equal(value.recoveryMaintenanceReservedStroops,'20000000');assert.equal(value.priorRenewalReservedStroops,'10000000');
 assert.equal(value.renewalCeilingRemainderStroops,'7000000');assert.equal(value.totalExposureStroops,'313618202');
});
for(const status of ['SUCCESS','FAILED','NOT_FOUND','UNKNOWN'])test('schema19 never releases new renewal headroom when its result is '+status,async()=>{
 const f=await restoredCompletionBudgetFixture({status:status==='FAILED'?'FAILED':'SUCCESS',paid:'100'});if(status==='FAILED')f.job.state='failed';if(['NOT_FOUND','UNKNOWN'].includes(status))f.receipts.set(f.job.transaction_hash,{status});
 const value=await f.inspect();assert.equal(value.totalExposureStroops,'313618202');assert.equal(value.renewalCeilingRemainderStroops,['NOT_FOUND','UNKNOWN'].includes(status)?'0':'9999900');
});
test('schema19 renewal candidate with a cheaper unsigned quote still keeps its full one-XLM allocation',async()=>{
 const f=await restoredCompletionBudgetFixture({signed:false,offered:'4000000'}),value=await f.inspect({step:f.policy.steps[0],candidate:f.candidate});
 assert.equal(value.renewalCeilingRemainderStroops,'6000000');assert.equal(value.totalExposureStroops,'213618202');
});
test('schema19 concurrent PDF/correction quotes reach forty exactly and reject the next stroop',async()=>{
 const f=await restoredCompletionBudgetFixture(),pdf=f.make(3,{offered:'150000000',state:'awaiting_signature',signed:false}),correction=f.make(4,{offered:'36381798',state:'awaiting_signature',signed:false});f.rows.push(pdf.row);
 assert.equal((await f.inspect({step:f.policy.steps[4],candidate:correction.candidate})).totalExposureStroops,'400000000');
 const over=f.make(4,{offered:'36381799',state:'awaiting_signature',signed:false});await assert.rejects(f.inspect({step:f.policy.steps[4],candidate:over.candidate}),exceeded);
});
test('schema19 an uncertain PDF retains its offered fee and cannot be hidden to prepare correction',async()=>{
 const f=await restoredCompletionBudgetFixture(),pdf=f.make(3,{offered:'150000000',state:'submitted'}),correction=f.make(4,{offered:'40000000',state:'awaiting_signature',signed:false});f.rows.push(pdf.row);f.receipts.set(pdf.row.transaction_hash,{status:'UNKNOWN'});
 await assert.rejects(f.inspect({step:f.policy.steps[4],candidate:correction.candidate}),exceeded);assert.equal(pdf.row.state,'submitted');assert(pdf.row.signed_xdr);assert(f.receipts.has(pdf.row.transaction_hash));
});
test('schema19 full withdrawal stays affordable when both clinical results are uncertain and seals new work',async()=>{
 const f=await restoredCompletionBudgetFixture();for(const[index,offered]of [[3,'150000000'],[4,'36381798']]){const x=f.make(index,{offered,state:'submitted'});f.rows.push(x.row);f.receipts.set(x.row.transaction_hash,{status:'UNKNOWN'});}
 const withdrawal=f.make(5,{offered:'60000000',state:'awaiting_signature',signed:false}),value=await f.inspect({step:f.policy.steps[5],candidate:withdrawal.candidate});assert.equal(value.totalExposureStroops,'400000000');assert.equal(value.withdrawalReserveStroops,'0');
 f.rows.push(withdrawal.row);await assert.rejects(f.inspect({step:f.policy.steps[0],candidate:f.candidate}),conflict);
});
for(const field of ['recoveryMaintenanceMaxFeeStroops','priorRenewalReserveStroops'])test('schema19 missing or altered '+field+' never removes the conservative hold',async()=>{
 for(const value of [undefined,'0','1','20000001']){const f=await restoredCompletionBudgetFixture();if(value===undefined)delete f.aggregate[field];else f.aggregate[field]=value;await assert.rejects(f.inspect(),unavailable);}
});


async function priorRenewalSnapshotFixture(){
 const f=await renewalFixture(),authorization=f.policy.authorization;f.job.state='confirmed';Object.assign(f.reservation,{state:'settled',outcome:'SUCCESS',ledger:150,chargedStroops:'3000000'});f.row.state='settled';
 const policy={...f.policy,restoredCompletion:{priorAuthorization:authorization,priorRenewalStep:f.policy.steps[0],priorRenewalTransactionHash:f.job.transaction_hash,priorRenewalReserveStroops:'10000000',priorCompletionApprovedAt:f.policy.completionContinuation.approvedAt}};
 const {inspectPriorRehearsalRenewal}=await import('./clinical-rehearsal-budget.mjs');return{...f,policy,inspect:()=>inspectPriorRehearsalRenewal(policy,{job:f.job,reservationRow:f.row})};
}
test('schema19 historical renewal snapshot verifies exact signatures, invocation and settled binding while holding its full ceiling',async()=>{
 const f=await priorRenewalSnapshotFixture(),before=JSON.stringify({job:f.job,row:f.row}),value=f.inspect();assert.equal(value.heldStroops,'10000000');assert.equal(value.canonicalFeeReaudited,false);assert.equal(JSON.stringify({job:f.job,row:f.row}),before);
});
for(const [name,mutate] of [['wrong hash',f=>{f.job.transaction_hash='aa'.repeat(32);}],['active request',f=>{f.job.state='submitted';}],['wrong version',f=>{f.job.target_version++;}],['wrong patient',f=>{f.reservation.binding.patientAddress=foreign.publicKey();}],['wrong quote',f=>{f.reservation.quote.signingHash='ab'.repeat(32);}],['wrong digest',f=>{f.reservation.signedInnerDigest='ac'.repeat(32);}],['unsettled',f=>{f.row.state='submitted';f.reservation.state='submitted';}],['overcharged',f=>{f.reservation.chargedStroops='10000001';}]])test('schema19 prior renewal '+name+' fails before it can be excluded as a settled sibling',async()=>{const f=await priorRenewalSnapshotFixture();mutate(f);assert.throws(()=>f.inspect(),unavailable);});


async function closingContinuationBudgetFixture() {
  const fixture = await restoredCompletionBudgetFixture({ paid: '4726' });
  const { policy, job, reservation, row, evidence } = fixture;
  const pdf = fixture.make(3, { offered: '60059073', paid: '48748461' });
  fixture.rows.push(pdf.row);
  job.state = 'confirmed';
  row.state = 'settled';
  Object.assign(reservation, { state: 'settled', outcome: 'SUCCESS', ledger: evidence.ledger, chargedStroops: '4726' });

  const previousUntil = policy.until;
  const now = previousUntil + 30;
  policy.until = now + 14400;
  policy.closingContinuation = {
    approvedAt: now,
    previousUntil,
    executionUntil: policy.until,
    confirmedPdf: {
      requestId: pdf.row.id, transactionHash: pdf.row.transaction_hash,
      ledger: pdf.evidence.ledger, feeChargedStroops: '48748461',
    },
    confirmedRenewal: {
      requestId: job.id, transactionHash: job.transaction_hash,
      ledger: evidence.ledger, feeChargedStroops: '4726',
    },
  };
  const inspect = (index = 4, offered = '137633337', extra = {}) => {
    const { candidate } = fixture.make(index, {
      offered, signed: false, state: 'awaiting_signature', maxTime: now + 180,
    });
    return fixture.inspect({ step: policy.steps[index], candidate, now, ...extra });
  };
  return { ...fixture, pdf, now, inspect };
}

test('schema20 counts the exact PDF and renewal receipts and preserves all historical holds and six XLM', async () => {
  const fixture = await closingContinuationBudgetFixture();
  const exact = await fixture.inspect();
  assert.equal(exact.paidStroops, '142371389');
  assert.equal(exact.maintenanceReservedStroops, '20000000');
  assert.equal(exact.recoveryMaintenanceReservedStroops, '20000000');
  assert.equal(exact.priorRenewalReservedStroops, '10000000');
  assert.equal(exact.renewalCeilingRemainderStroops, '9995274');
  assert.equal(exact.withdrawalReserveStroops, '60000000');
  assert.equal(exact.totalExposureStroops, '400000000');
  assert.equal(exact.remainingStroops, '0');
  await assert.rejects(fixture.inspect(4, '137633338'), exceeded);
});

test('schema20 refuses both remaining actions if the confirmed PDF is missing, substituted or cannot be verified', async () => {
  for (const mutate of [
    fixture => { fixture.rows.pop(); },
    fixture => { fixture.pdf.row.state = 'submitted'; },
    fixture => { fixture.policy.closingContinuation.confirmedPdf.transactionHash = 'aa'.repeat(32); },
    fixture => { fixture.pdf.evidence.ledger++; },
    fixture => { fixture.pdf.evidence.resultXdr.feeCharged(xdr.Int64.fromString('48748460')); },
    fixture => { fixture.receipts.set(fixture.pdf.row.transaction_hash, { status: 'NOT_FOUND' }); },
    fixture => { fixture.receipts.set(fixture.pdf.row.transaction_hash, { status: 'UNKNOWN' }); },
  ]) {
    const fixture = await closingContinuationBudgetFixture();
    mutate(fixture);
    await assert.rejects(fixture.inspect(4, '10000000'), /clinical_rehearsal_/);
    await assert.rejects(fixture.inspect(5, '60000000'), /clinical_rehearsal_/);
  }
});

test('schema20 refuses both remaining actions if the recorded renewal or its charge cannot be verified', async () => {
  for (const mutate of [
    fixture => { fixture.job.state = 'submitted'; },
    fixture => { fixture.policy.closingContinuation.confirmedRenewal.transactionHash = 'aa'.repeat(32); },
    fixture => { fixture.evidence.ledger++; },
    fixture => { fixture.evidence.resultXdr.feeCharged(xdr.Int64.fromString('4725')); },
    fixture => { fixture.receipts.set(fixture.job.transaction_hash, { status: 'NOT_FOUND' }); },
    fixture => { fixture.receipts.set(fixture.job.transaction_hash, { status: 'UNKNOWN' }); },
  ]) {
    const fixture = await closingContinuationBudgetFixture();
    mutate(fixture);
    await assert.rejects(fixture.inspect(4, '10000000'), /clinical_rehearsal_/);
    await assert.rejects(fixture.inspect(5, '60000000'), /clinical_rehearsal_/);
  }
});
