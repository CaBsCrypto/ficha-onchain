import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Account,Address,BASE_FEE,Keypair,Networks,Operation,SorobanDataBuilder,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {rehearsalMaintenanceDescriptor} from './lib/clinical-rehearsal-policy.mjs';
import {maintenanceFootprint,inspectMaintenanceTransaction,prepareMaintenanceQuote,maintenanceJournal,verifyMaintenanceReceipt,runMaintenanceRehearsal} from './run-clinical-rehearsal-maintenance.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function directory(t){const root=resolve(tmpdir()),dir=mkdtempSync(join(root,'trustleaf-maintenance13-test-'));t.after(()=>{const below=relative(root,resolve(dir));assert(below&&!isAbsolute(below)&&!below.startsWith('..'));rmSync(dir,{recursive:true,force:true});});return dir;}
function fixture(t,options={}){
 const dir=directory(t),source=Keypair.random(),at=1800000000,actions=[],counts={sign:0,signerFactory:0,send:0,simulate:0,connect:0,scope:0,reserve:0,save:0,complete:0};
 const m={...rehearsalMaintenanceDescriptor(),source:source.publicKey(),attemptFile:join(dir,'maintenance-14-attempt.private.json'),approvedAt:at-10,until:at+14400};
 const plan={schemaVersion:2,runId:id(51),createdAt:at-10,until:at+14400,policyHash:'a'.repeat(64),approvalHash:'b'.repeat(64),relayer:source.publicKey(),patient:{address:Keypair.random().publicKey()},
  maintenanceContinuation:m,authorization:{requestId:id(52)},aggregateBudget:{confirmedSteps:[{requestId:id(53)},{requestId:id(54)}]},
  steps:['renew','append_note','grant_both','append_pdf','correct_note','revoke'].map((key,i)=>({key,requestId:id(52+i)}))};
 if(options.schema19){
  const keys=Array.from({length:27},(_,i)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address('CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U').toScAddress(),key:xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Unit19'),xdr.ScVal.scvU32(i)]),durability:xdr.ContractDataDurability.persistent()})));
  const encoded=keys.map(k=>k.toXDR('base64')),hash=v=>createHash('sha256').update(v).digest('hex');
  plan.restoredCompletion={priorAuthorization:{requestId:id(151)},restoration:{...m,requestId:id(152),keys:encoded,keysSha256:hash([...encoded].sort().join('\n')),footprintSha256:hash(new SorobanDataBuilder().setReadWrite([...keys].sort((a,b)=>Buffer.compare(a.toXDR(),b.toXDR()))).build().resources().footprint().toXDR()),attemptFile:join(dir,'maintenance27-attempt.private.json')}};
 }
 const planFile=join(dir,'plan.private.json');writeFileSync(planFile,JSON.stringify({schemaVersion:options.schema19?19:13,preparedAt:at-20}));
 const env={TRUSTLEAF_ENV:'local',TRUSTLEAF_PRIVATE_WRITES_ENABLED:'false',NEXT_PUBLIC_STELLAR_NETWORK:'testnet',STELLAR_CONFIG_DIR:dir,
  TRUSTLEAF_CLINICAL_REHEARSAL_FILE:planFile,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:plan.policyHash,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:plan.approvalHash,
  DATABASE_URL:'postgresql://synthetic:unit@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/unit',TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech'};
 let clock=at,record=null,reservedIntent=null,value=null,accountReads=0;
 const journal={load:()=>value&&structuredClone(value),create:x=>{assert.equal(value,null);actions.push('journal.prepared');value=structuredClone(x);return structuredClone(value);},
  update:(next,prior)=>{assert.deepEqual(value,prior);actions.push('journal.'+next.phase+(next.submissionAttempted?'.send-mark':''));value=structuredClone(next);return structuredClone(value);}};
 const store={load:async()=>record&&structuredClone(record),reserve:async(_name,row)=>{counts.reserve++;assert.equal(record,null);reservedIntent=row.intent;actions.push('sql.reserve');},
  save:async(_name,row)=>{assert.equal(row.intent,reservedIntent);counts.save++;record=structuredClone(row);actions.push('sql.save');},
  complete:async(_name,receipt)=>{assert.equal(receipt.transactionHash,record.hash);counts.complete++;actions.push('sql.complete');}};
 function receipt(status=options.receipt??'SUCCESS',fee='900'){
  if(status==='NOT_FOUND'||status==='UNKNOWN')return{status};
  const tx=TransactionBuilder.fromXDR(record.xdr,Networks.TESTNET),result=status==='SUCCESS'
    ?xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(xdr.OperationResultTr.restoreFootprint(xdr.RestoreFootprintResult.restoreFootprintSuccess()))])
    :xdr.TransactionResultResult.txFailed([xdr.OperationResult.opInner(xdr.OperationResultTr.restoreFootprint(xdr.RestoreFootprintResult.restoreFootprintResourceLimitExceeded()))]);
  return{status,ledger:999,envelopeXdr:tx.toEnvelope(),resultXdr:new xdr.TransactionResult({feeCharged:xdr.Int64.fromString(fee),result,ext:new xdr.TransactionResultExt(0)})};
 }
 const server={getNetwork:async()=>({passphrase:options.wrongNetwork?'public wrong network':Networks.TESTNET}),getAccount:async()=>{
   accountReads++;return new Account(source.publicKey(),options.changedSequence&&accountReads>1?'101':'100');},
  simulateTransaction:async()=>{counts.simulate++;let keys=maintenanceFootprint(plan);if(options.reverseKeys)keys.reverse();if(options.extraKey)keys.push(keys[0]);
   const data=new SorobanDataBuilder().setReadWrite(keys).setResources(100,100,100).setResourceFee(options.resourceFee??'1000');
   return{latestLedger:1000,minResourceFee:options.resourceFee??'1000',transactionData:data};},
  sendTransaction:async tx=>{counts.send++;actions.push('send');assert(record&&record.xdr===tx.toXDR());assert.equal((options.realJournal?JSON.parse(readFileSync(plan.restoredCompletion.restoration.attemptFile,'utf8')):value).submissionAttempted,true);
    if(options.lostSendReply)throw Error('synthetic transport loss');return{status:'PENDING'};},
  getTransaction:async hash=>{assert.equal(hash,record.hash);if(options.lostReceiptReply)throw Error('synthetic transport loss');return receipt();}};
 const client={query:async(sql)=>{
  if(sql.includes('pg_try_advisory_lock'))return{rows:[{locked:true}]};if(sql.includes('pg_advisory_unlock'))return{rows:[{unlocked:true}]};
  if(sql.startsWith('SELECT EXISTS'))return{rows:[{busy:!!options.competing||(sql.includes("payload->'binding'")?!!options.futureExisting||!!options.unreleasedReserve:!!options.globalBusy)}]};
  if(sql.startsWith('SELECT run_id'))return{rows:[]};return{rows:[]};}};
 const adapters={now:()=>clock,loadPolicy:loadOptions=>{if(loadOptions.now!==undefined)assert.equal(loadOptions.requireApproval,loadOptions.previewApproval?false:true);return plan;},
  assertScope:(p,{now})=>{counts.scope++;assert.equal(p,plan);if(options.rejectScope||options.cancelAtScope===counts.scope)throw Error('clinical_rehearsal_expired');
    assert(now>=plan.createdAt&&now<plan.until);return p.restoredCompletion?.restoration??p.maintenanceContinuation;},
  inspectPriorRenewal:(p)=>{assert(options.schema19);assert.equal(p.restoredCompletion.priorAuthorization.requestId,id(151));counts.priorInspection=(counts.priorInspection??0)+1;if(options.invalidPriorRenewal)throw Error('clinical_rehearsal_budget_unavailable');},
  server,journal,connect:async()=>{counts.connect++;return{client,close:async()=>{actions.push('connection.close');}};},
  acquireSignerLock:async()=>async()=>{actions.push('signer.unlock');},
  acquireSourceLocks:async()=>({assertHeld:async()=>{},release:async()=>{actions.push('source.unlock');}}),
  createAttemptStore:()=>store,assertHistoricalCharges:async()=>({paidStroops:'93618202'}),checkBalance:async()=>{},
  signerFactory:()=>{counts.signerFactory++;return async unsigned=>{counts.sign++;actions.push('sign');if(options.signerThrows)throw Error('synthetic signer return lost');
    const tx=TransactionBuilder.fromXDR(unsigned,Networks.TESTNET);tx.sign(options.wrongSignature?Keypair.random():source);return tx.toXDR();};}};
 return{env,plan,source,server,adapters,counts,actions,journal,store,receipt,
  run:mode=>runMaintenanceRehearsal({env,mode,adapters}),setClock:n=>{clock=n;},value:()=>value,record:()=>record};
}
test('prepare is unsigned diagnostics only and does not occupy the canonical journal, SQL, signer or approval',async t=>{
 const f=fixture(t),result=await f.run('--prepare');assert.equal(result.status,'UNSIGNED_DIAGNOSTIC_ONLY');assert.equal(result.keyCount,14);
 assert.equal(result.offeredFeeStroops,'1100');assert.equal(result.journalCreated,false);assert.equal(f.value(),null);
 assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.counts.scope,0);
});
test('a successful single restoration persists exactly the signed envelope before one submission and verifies canonical fee',async t=>{
 const f=fixture(t),result=await f.run('--once');assert.equal(result.status,'SUCCESS');assert.equal(result.feeChargedStroops,'900');
 assert.equal(result.conservativelyHeldStroops,'20000000');assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);assert.equal(f.counts.save,1);assert.equal(f.counts.complete,1);
 assert(f.actions.indexOf('journal.signed')<f.actions.indexOf('sql.save'));assert(f.actions.indexOf('sql.save')<f.actions.indexOf('send'));
 assert.equal(f.value().phase,'confirmed');assert.equal(f.value().receipt.feeChargedXlm,'0.0000900');assert.equal(f.record().xdr,f.value().signedXdr);
});
test('saved confirmed execution only reconciles, never signs or submits a second transaction',async t=>{
 const f=fixture(t);await f.run('--once');const hash=f.value().transactionHash;await f.run('--once');
 assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);assert.equal(f.value().transactionHash,hash);assert.equal(f.counts.save,1);
});
test('FAILED charges are canonical and preserve the full conservative two-XLM hold',async t=>{
 const f=fixture(t,{receipt:'FAILED'}),result=await f.run('--once');assert.equal(result.status,'FAILED');assert.equal(result.feeChargedStroops,'900');
 assert.equal(result.conservativelyHeldStroops,'20000000');assert.equal(f.value().phase,'failed');await f.run('--once');assert.equal(f.counts.send,1);
});
for(const patch of [{receipt:'NOT_FOUND'},{lostSendReply:true,receipt:'NOT_FOUND'},{lostReceiptReply:true}])
 test('uncertain result retains exact envelope/hash with no new signing, quote or submission '+JSON.stringify(patch),async t=>{
  const f=fixture(t,patch),first=await f.run('--once');assert.equal(first.status,'PENDING_UNKNOWN');const saved=structuredClone(f.value());
  const second=await f.run('--once');assert.equal(second.status,'PENDING_UNKNOWN');assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);assert.equal(f.counts.simulate,1);
  assert.equal(f.value().transactionHash,saved.transactionHash);assert.equal(f.value().signedXdr,saved.signedXdr);assert.equal(second.conservativelyHeldStroops,'20000000');
 });
test('lost signer result is preserved as uncertain and cannot trigger another signature or send',async t=>{
 const f=fixture(t,{signerThrows:true});await assert.rejects(f.run('--once'),/synthetic signer return lost/);assert.equal(f.value().phase,'signing');
 const second=await f.run('--once');assert.equal(second.status,'SIGNATURE_UNCERTAIN');assert.equal(f.counts.sign,1);assert.equal(f.counts.send,0);assert.equal(f.counts.reserve,0);
});
test('wrong network, excess fee, expanded footprint, changed source sequence and competing work block before signing',async t=>{
 for(const patch of [{wrongNetwork:true},{resourceFee:'20000000'},{extraKey:true},{changedSequence:true},{competing:true}]){
  const f=fixture(t,patch);await assert.rejects(f.run('--once'));assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.counts.save,0);
 }
});
test('RPC may reorder the same fourteen keys without widening the reviewed scope',async t=>{
 const f=fixture(t,{reverseKeys:true}),result=await f.run('--once');assert.equal(result.status,'SUCCESS');assert.equal(result.keyCount,14);
});
test('cancelled or expired approval before signing leaves no signature or SQL attempt',async t=>{
 const f=fixture(t,{cancelAtScope:4});await assert.rejects(f.run('--once'),/clinical_rehearsal_expired/);
 assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.counts.reserve,0);assert.equal(f.value().phase,'prepared');
});
test('normal production authority gate rejects a fabricated policy before connecting',async t=>{
 const f=fixture(t);delete f.adapters.assertScope;await assert.rejects(f.run('--once'),/clinical_rehearsal_scope_rejected/);
 assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.send,0);
});
test('a different amendment or approval cannot reuse the fixed journal to reset maintenance spending',async t=>{
 const f=fixture(t,{receipt:'NOT_FOUND'});await f.run('--once');f.plan.policyHash='c'.repeat(64);await assert.rejects(f.run('--once'));
 assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);assert.equal(f.counts.simulate,1);
 f.plan.policyHash='a'.repeat(64);f.plan.approvalHash='d'.repeat(64);await assert.rejects(f.run('--once'));assert.equal(f.counts.sign,1);
});
test('reconciliation after the execution window uses original authority only for receipt bookkeeping',async t=>{
 const f=fixture(t);await f.run('--once');f.setClock(f.plan.until+300);f.adapters.reconciliationInstant=()=>f.plan.createdAt;
 const result=await f.run('--reconcile');assert.equal(result.status,'SUCCESS');assert.equal(result.readOnly,true);
 assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);assert.equal(f.counts.signerFactory,1);
});
test('another diagnostic call cannot renew or replace an existing prepared or signed attempt',async t=>{
 const f=fixture(t,{receipt:'NOT_FOUND'});await f.run('--once');await assert.rejects(f.run('--prepare'),/order_conflict/);
 assert.equal(f.counts.simulate,1);assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
});
test('wrong signatures or forged canonical envelopes/fees/results fail closed',async t=>{
 const bad=fixture(t,{wrongSignature:true});await assert.rejects(bad.run('--once'));assert.equal(bad.counts.send,0);
 const f=fixture(t);await f.run('--once');const good=f.receipt(),journal=f.value();
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,{...good,ledger:0}));
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,f.receipt('SUCCESS','1101')));
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,{...f.receipt('FAILED'),status:'SUCCESS'}));
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,{...good,status:'FAILED'}));
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,{...good,envelopeXdr:{toXDR:()=>good.envelopeXdr.toXDR()}}));
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,{...good,resultXdr:{feeCharged:()=>good.resultXdr.feeCharged(),result:()=>good.resultXdr.result()}}));
 const innerResult=new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('900'),result:xdr.InnerTransactionResultResult.txFailed([
  xdr.OperationResult.opInner(xdr.OperationResultTr.restoreFootprint(xdr.RestoreFootprintResult.restoreFootprintResourceLimitExceeded()))]),ext:new xdr.InnerTransactionResultExt(0)});
 const pair=new xdr.InnerTransactionResultPair({transactionHash:Buffer.alloc(32),result:innerResult});
 const impossible=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('900'),result:xdr.TransactionResultResult.txFeeBumpInnerFailed(pair),ext:new xdr.TransactionResultExt(0)});
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,{...good,status:'FAILED',resultXdr:impossible}));
 const wrongOperation=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('900'),result:xdr.TransactionResultResult.txFailed([
  xdr.OperationResult.opInner(xdr.OperationResultTr.bumpSequence(xdr.BumpSequenceResult.bumpSequenceBadSeq()))]),ext:new xdr.TransactionResultExt(0)});
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,{...good,status:'FAILED',resultXdr:wrongOperation}));
 const another=await prepareMaintenanceQuote({policy:f.plan,server:f.server,now:()=>1800000001});
 assert.throws(()=>verifyMaintenanceReceipt(f.plan,journal,{...good,envelopeXdr:another.transaction.toEnvelope()}));
});
test('the transaction inspector rejects memo, alternate operation, extra source and modified exact-key binding',async t=>{
 const f=fixture(t),prepared=await prepareMaintenanceQuote({policy:f.plan,server:f.server,now:()=>1800000000});
 for(const change of [body=>body.memo(xdr.Memo.memoText('not-reviewed')),body=>body.operations([Operation.bumpSequence({bumpTo:'999'})]),
  body=>body.operations([Operation.restoreFootprint({source:Keypair.random().publicKey()})])]){
  const env=prepared.transaction.toEnvelope();change(env.v1().tx());assert.throws(()=>inspectMaintenanceTransaction(f.plan,TransactionBuilder.fromXDR(env.toXDR('base64'),Networks.TESTNET)));
 }
 f.plan.maintenanceContinuation.keysSha256='f'.repeat(64);assert.throws(()=>maintenanceFootprint(f.plan));
});
test('private journal creation is exclusive and subsequent phase updates require exact prior state',t=>{
 const dir=directory(t),file=join(dir,'maintenance-14-attempt.private.json'),store=maintenanceJournal(file),first={phase:'prepared',id:'synthetic'};
 assert.equal(store.load(),null);store.create(first);assert.deepEqual(store.load(),first);assert.throws(()=>store.create(first));
 const next={...first,phase:'signing'};store.update(next,first);assert.deepEqual(store.load(),next);assert.throws(()=>store.update(first,first));
 writeFileSync(file+'.tmp','interrupted prior atomic write');assert.throws(()=>store.update({...next,phase:'signed'},next));assert.deepEqual(store.load(),next);
 assert.throws(()=>maintenanceJournal(join(dir,'different-name.json')));
});
test('a non-file journal is never overwritten',t=>{
 const dir=directory(t),file=join(dir,'maintenance-14-attempt.private.json');mkdirSync(file);assert.throws(()=>maintenanceJournal(file).load());
});

test('any existing new renewal/PDF/correction/withdrawal row or live pair reservation blocks the first restoration regardless of state',async t=>{
 for(const patch of [{futureExisting:'confirmed'},{futureExisting:'failed'},{futureExisting:'cancelled'},{unreleasedReserve:true},{globalBusy:true}]){
  const f=fixture(t,patch);await assert.rejects(f.run('--once'),/order_conflict|authority_busy/);
  assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.value(),null);
 }
});
test('existing signed maintenance remains reconcilable after a later withdrawal seals new spending',async t=>{
 const options={receipt:'NOT_FOUND'},f=fixture(t,options);await f.run('--once');options.futureExisting='confirmed';
 const result=await f.run('--once');assert.equal(result.status,'PENDING_UNKNOWN');assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
});


test('schema19 prepare quotes exactly 27 keys without approval clock, journal, signer or send',async t=>{
 const f=fixture(t,{schema19:true}),result=await f.run('--prepare');assert.equal(result.keyCount,27);assert.equal(result.offeredFeeStroops,'1100');assert.equal(f.value(),null);assert.equal(f.counts.connect,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});
test('schema19 restore persists one exact signed envelope and verifies prior renewal before the only submission',async t=>{
 const f=fixture(t,{schema19:true}),result=await f.run('--once');assert.equal(result.status,'SUCCESS');assert.equal(result.keyCount,27);assert.equal(result.conservativelyHeldStroops,'20000000');assert.equal(f.counts.priorInspection,1);assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);assert.equal(f.counts.save,1);
 await f.run('--once');assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
});
test('schema19 unknown restoration keeps the same signed envelope and full two-XLM allocation without another send',async t=>{
 const f=fixture(t,{schema19:true,receipt:'NOT_FOUND'}),first=await f.run('--once'),signed=f.value().signedXdr,second=await f.run('--once');assert.equal(first.status,'PENDING_UNKNOWN');assert.equal(second.status,'PENDING_UNKNOWN');assert.equal(first.transactionHash,second.transactionHash);assert.equal(f.value().signedXdr,signed);assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);assert.equal(second.conservativelyHeldStroops,'20000000');
});
for(const options of [{extraKey:true},{resourceFee:'20000000'},{wrongNetwork:true},{invalidPriorRenewal:true},{futureExisting:true},{unreleasedReserve:true},{rejectScope:true}])test('schema19 blocked restoration never signs or submits: '+JSON.stringify(options),async t=>{
 const f=fixture(t,{schema19:true,...options});await assert.rejects(f.run('--once'));assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});


test('schema19 default on-disk journal permits only its explicit 27-key filename while legacy default stays fourteen',async t=>{
 const dir=directory(t),file=join(dir,'maintenance27-attempt.private.json');assert.throws(()=>maintenanceJournal(file));
 const journal=maintenanceJournal(file,{keyCount:27});assert.equal(journal.load(),null);const first={phase:'prepared',id:'SYNTHETIC19'};journal.create(first);assert.deepEqual(journal.load(),first);
 const next={...first,phase:'signed'};journal.update(next,first);assert.deepEqual(journal.load(),next);assert.throws(()=>journal.update(first,first));assert.throws(()=>maintenanceJournal(file,{keyCount:28}));assert.throws(()=>maintenanceJournal(join(dir,'different.json'),{keyCount:27}));
});
test('schema19 real filesystem adapter unsigned prepare creates no journal, SQL, signer or send',async t=>{
 const f=fixture(t,{schema19:true});delete f.adapters.journal;const result=await f.run('--prepare');assert.equal(result.keyCount,27);assert.equal(f.counts.connect,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(existsSync(f.plan.restoredCompletion.restoration.attemptFile),false);
});
test('schema19 real filesystem adapter saves the synthetic signed envelope before its single mocked submission',async t=>{
 const f=fixture(t,{schema19:true,realJournal:true});delete f.adapters.journal;const result=await f.run('--once'),saved=JSON.parse(readFileSync(f.plan.restoredCompletion.restoration.attemptFile,'utf8'));assert.equal(result.status,'SUCCESS');assert.equal(saved.phase,'confirmed');assert.equal(saved.signedXdr,f.record().xdr);assert.equal(saved.transactionHash,f.record().hash);assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
});
test('schema19 real filesystem adapter keeps an unknown result immutable and never signs or sends another envelope',async t=>{
 const f=fixture(t,{schema19:true,realJournal:true,receipt:'NOT_FOUND'});delete f.adapters.journal;const first=await f.run('--once'),saved=readFileSync(f.plan.restoredCompletion.restoration.attemptFile,'utf8'),second=await f.run('--once');assert.equal(first.status,'PENDING_UNKNOWN');assert.equal(second.transactionHash,first.transactionHash);assert.equal(readFileSync(f.plan.restoredCompletion.restoration.attemptFile,'utf8'),saved);assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
});
