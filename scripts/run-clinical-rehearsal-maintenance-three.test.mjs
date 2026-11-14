import test from 'node:test';
import {createHash} from 'node:crypto';
import {clinicalAttemptStore} from './lib/clinical-attempt-store.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {Account,BASE_FEE,Keypair,Networks,Operation,SorobanDataBuilder,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {rehearsalMaintenanceThreeDescriptor} from './lib/clinical-rehearsal-policy.mjs';
import {maintenanceThreeFootprint,inspectMaintenanceThreeTransaction,prepareMaintenanceThreeQuote,maintenanceThreeJournal,verifyMaintenanceThreeReceipt,runMaintenanceThree} from './run-clinical-rehearsal-maintenance-three.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function directory(t){const root=resolve(tmpdir()),dir=mkdtempSync(join(root,'trustleaf-maintenance13-test-'));t.after(()=>{const below=relative(root,resolve(dir));assert(below&&!isAbsolute(below)&&!below.startsWith('..'));rmSync(dir,{recursive:true,force:true});});return dir;}
function fixture(t,options={}){
 const dir=directory(t),source=Keypair.random(),at=1793560000,actions=[],counts={sign:0,signerFactory:0,send:0,simulate:0,connect:0,scope:0,reserve:0,save:0,complete:0};
 const descriptor=rehearsalMaintenanceThreeDescriptor(),m={...descriptor,source:source.publicKey(),maintenanceMaximumStroops:'20000000',attemptFile:join(dir,'clinical-c2-maintenance-attempt.private.json'),approvedAt:at-10,until:at+14400};
 const parent={schemaVersion:2,runId:id(51),createdAt:at-10,until:at+14400,policyHash:'a'.repeat(64),approvalHash:'b'.repeat(64),relayer:source.publicKey(),patient:{address:Keypair.random().publicKey()},
  maintenanceContinuation:m,authorization:{requestId:id(52)},aggregateBudget:{confirmedSteps:[{requestId:id(53)},{requestId:id(54)}]},
  steps:['renew','append_note','grant_both','append_pdf','correct_note','revoke'].map((key,i)=>({key,requestId:id(52+i)}))};
 const plan={...m,schemaVersion:1,createdAt:at-10,approvedAt:at-10,planHash:'a'.repeat(64),approvalHash:'b'.repeat(64),parentPolicy:parent};
 const planFile=join(dir,'plan.private.json');writeFileSync(planFile,JSON.stringify({schemaVersion:13,preparedAt:at-20}));
 const env={TRUSTLEAF_ENV:'local',TRUSTLEAF_PRIVATE_WRITES_ENABLED:'false',NEXT_PUBLIC_STELLAR_NETWORK:'testnet',STELLAR_CONFIG_DIR:dir,
  TRUSTLEAF_CLINICAL_REHEARSAL_FILE:planFile,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:plan.policyHash,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:plan.approvalHash,
  DATABASE_URL:'postgresql://synthetic:unit@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/unit',TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech'};
 let clock=at,record=null,reservedIntent=null,value=null,accountReads=0;
 const disk=options.diskJournal?maintenanceThreeJournal(join(dir,'clinical-c2-maintenance-attempt.private.json')):null;
 const journal={load:()=>disk?disk.load():value&&structuredClone(value),create:x=>{assert.equal(value,null);if(disk)disk.create(x);actions.push('journal.prepared');value=structuredClone(x);return structuredClone(value);},
  update:(next,prior)=>{assert.deepEqual(value,prior);if(disk)disk.update(next,prior);actions.push('journal.'+next.phase+(next.submissionAttempted?'.send-mark':''));value=structuredClone(next);return structuredClone(value);}};
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
  simulateTransaction:async()=>{counts.simulate++;let keys=maintenanceThreeFootprint(plan);if(options.reverseKeys)keys.reverse();if(options.extraKey)keys.push(keys[0]);
   const data=new SorobanDataBuilder().setReadWrite(keys).setResources(100,100,100).setResourceFee(options.resourceFee??'1000');
   return{latestLedger:1000,minResourceFee:options.resourceFee??'1000',transactionData:data};},
  sendTransaction:async tx=>{counts.send++;actions.push('send');assert(record&&record.xdr===tx.toXDR());assert.equal(value.submissionAttempted,true);
    if(options.lostSendReply)throw Error('synthetic transport loss');return{status:'PENDING'};},
  getTransaction:async hash=>{assert.equal(hash,record.hash);if(options.lostReceiptReply)throw Error('synthetic transport loss');return receipt();}};
 const client={query:async(sql)=>{
  if(sql.includes('pg_try_advisory_lock'))return{rows:[{locked:true}]};if(sql.includes('pg_advisory_unlock'))return{rows:[{unlocked:true}]};
  if(sql.startsWith('SELECT EXISTS'))return{rows:[{busy:sql.includes('UNION ALL')?!!options.competing||!!options.globalBusy:!!options.futureExisting}]};
  if(sql.startsWith('SELECT run_id'))return{rows:options.priorSqlAttempt?[{run_id:plan.attemptRunId}]:[]};return{rows:[]};}};
 const adapters={now:()=>clock,loadScope:loadOptions=>{assert(['--prepare','--once','--reconcile'].includes(loadOptions.mode));return plan;},
  assertScope:(p,{now})=>{counts.scope++;assert.equal(p,plan);if(options.rejectScope||options.cancelAtScope===counts.scope)throw Error('clinical_rehearsal_expired');
    assert(now>=plan.createdAt&&now<plan.until);return p;},
  server,journal,connect:async()=>{counts.connect++;return{client,close:async()=>{actions.push('connection.close');}};},
  acquireSignerLock:async()=>async()=>{actions.push('signer.unlock');},
  acquireSourceLocks:async()=>({assertHeld:async()=>{},release:async()=>{actions.push('source.unlock');}}),
  createAttemptStore:()=>store,assertParentEvidence:async()=>{if(options.badParent)throw Error('clinical_maintenance_three_scope_rejected');return {maintenancePaidStroops:'13327629',readproofPaidStroops:'434915',renewalPaidStroops:'4726',historicalPaidStroops:'93618202'};},checkBalance:async()=>{},
  signerFactory:()=>{counts.signerFactory++;return async unsigned=>{counts.sign++;actions.push('sign');if(options.signerThrows)throw Error('synthetic signer return lost');
    const tx=TransactionBuilder.fromXDR(unsigned,Networks.TESTNET);tx.sign(options.wrongSignature?Keypair.random():source);return tx.toXDR();};}};
 return{env,plan,source,server,client,adapters,counts,actions,journal,store,receipt,
  run:mode=>runMaintenanceThree({env,mode,adapters}),setClock:n=>{clock=n;},value:()=>value,record:()=>record};
}
test('approved preparation is unsigned diagnostics and does not occupy the canonical journal, SQL or signer',async t=>{
 const f=fixture(t),result=await f.run('--prepare');assert.equal(result.status,'UNSIGNED_DIAGNOSTIC_ONLY');assert.equal(result.keyCount,3);
 assert.equal(result.offeredFeeStroops,'1100');assert.equal(result.journalCreated,false);assert.equal(f.value(),null);
 assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.counts.scope,1);
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
test('RPC may reorder the same three keys without widening the reviewed scope',async t=>{
 const f=fixture(t,{reverseKeys:true}),result=await f.run('--once');assert.equal(result.status,'SUCCESS');assert.equal(result.keyCount,3);
});
test('cancelled or expired approval before signing leaves no signature or SQL attempt',async t=>{
 const f=fixture(t,{cancelAtScope:4});await assert.rejects(f.run('--once'),/clinical_rehearsal_expired/);
 assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.counts.reserve,0);assert.equal(f.value().phase,'prepared');
});
test('normal production authority gate rejects a fabricated policy before connecting',async t=>{
 const f=fixture(t);delete f.adapters.assertScope;await assert.rejects(f.run('--once'),/clinical_rehearsal_approval_required/);
 assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.send,0);
});
test('a different amendment or approval cannot reuse the fixed journal to reset maintenance spending',async t=>{
 const f=fixture(t,{receipt:'NOT_FOUND'});await f.run('--once');f.plan.planHash='c'.repeat(64);await assert.rejects(f.run('--once'));
 assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);assert.equal(f.counts.simulate,1);
 f.plan.planHash='a'.repeat(64);f.plan.approvalHash='d'.repeat(64);await assert.rejects(f.run('--once'));assert.equal(f.counts.sign,1);
});
test('reconciliation after the execution window uses original authority only for receipt bookkeeping',async t=>{
 const f=fixture(t);await f.run('--once');f.setClock(f.plan.until+300);
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
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,{...good,ledger:0}));
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,f.receipt('SUCCESS','1101')));
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,{...f.receipt('FAILED'),status:'SUCCESS'}));
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,{...good,status:'FAILED'}));
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,{...good,envelopeXdr:{toXDR:()=>good.envelopeXdr.toXDR()}}));
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,{...good,resultXdr:{feeCharged:()=>good.resultXdr.feeCharged(),result:()=>good.resultXdr.result()}}));
 const innerResult=new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('900'),result:xdr.InnerTransactionResultResult.txFailed([
  xdr.OperationResult.opInner(xdr.OperationResultTr.restoreFootprint(xdr.RestoreFootprintResult.restoreFootprintResourceLimitExceeded()))]),ext:new xdr.InnerTransactionResultExt(0)});
 const pair=new xdr.InnerTransactionResultPair({transactionHash:Buffer.alloc(32),result:innerResult});
 const impossible=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('900'),result:xdr.TransactionResultResult.txFeeBumpInnerFailed(pair),ext:new xdr.TransactionResultExt(0)});
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,{...good,status:'FAILED',resultXdr:impossible}));
 const wrongOperation=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString('900'),result:xdr.TransactionResultResult.txFailed([
  xdr.OperationResult.opInner(xdr.OperationResultTr.bumpSequence(xdr.BumpSequenceResult.bumpSequenceBadSeq()))]),ext:new xdr.TransactionResultExt(0)});
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,{...good,status:'FAILED',resultXdr:wrongOperation}));
 const another=await prepareMaintenanceThreeQuote({policy:f.plan,server:f.server,now:()=>1793560001});
 assert.throws(()=>verifyMaintenanceThreeReceipt(f.plan,journal,{...good,envelopeXdr:another.transaction.toEnvelope()}));
});
test('the transaction inspector rejects memo, alternate operation, extra source and modified exact-key binding',async t=>{
 const f=fixture(t),prepared=await prepareMaintenanceThreeQuote({policy:f.plan,server:f.server,now:()=>1793560000});
 for(const change of [body=>body.memo(xdr.Memo.memoText('not-reviewed')),body=>body.operations([Operation.bumpSequence({bumpTo:'999'})]),
  body=>body.operations([Operation.restoreFootprint({source:Keypair.random().publicKey()})])]){
  const env=prepared.transaction.toEnvelope();change(env.v1().tx());assert.throws(()=>inspectMaintenanceThreeTransaction(f.plan,TransactionBuilder.fromXDR(env.toXDR('base64'),Networks.TESTNET)));
 }
 f.plan.keysSha256='f'.repeat(64);assert.throws(()=>maintenanceThreeFootprint(f.plan));
});
test('private journal creation is exclusive and subsequent phase updates require exact prior state',t=>{
 const dir=directory(t),file=join(dir,'clinical-c2-maintenance-attempt.private.json'),store=maintenanceThreeJournal(file),first={phase:'prepared',id:'synthetic'};
 assert.equal(store.load(),null);store.create(first);assert.deepEqual(store.load(),first);assert.throws(()=>store.create(first));
 const next={...first,phase:'signing'};store.update(next,first);assert.deepEqual(store.load(),next);assert.throws(()=>store.update(first,first));
 writeFileSync(file+'.tmp','interrupted prior atomic write');assert.throws(()=>store.update({...next,phase:'signed'},next));assert.deepEqual(store.load(),next);
 assert.throws(()=>maintenanceThreeJournal(join(dir,'different-name.json')));
});
test('a non-file journal is never overwritten',t=>{
 const dir=directory(t),file=join(dir,'clinical-c2-maintenance-attempt.private.json');mkdirSync(file);assert.throws(()=>maintenanceThreeJournal(file).load());
});

test('any existing PDF/correction/withdrawal row or invalid parent financial evidence blocks the first three-key restoration regardless of state',async t=>{
 for(const patch of [{futureExisting:'confirmed'},{futureExisting:'failed'},{futureExisting:'cancelled'},{badParent:true},{globalBusy:true}]){
  const f=fixture(t,patch);await assert.rejects(f.run('--once'),/order_conflict|authority_busy|clinical_maintenance_three_scope_rejected/);
  assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.value(),null);
 }
});
test('existing signed maintenance remains reconcilable after a later withdrawal seals new spending',async t=>{
 const options={receipt:'NOT_FOUND'},f=fixture(t,options);await f.run('--once');options.futureExisting='confirmed';
 const result=await f.run('--once');assert.equal(result.status,'PENDING_UNKNOWN');assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
});

test('missing journal cannot reset a preexisting stable SQL attempt',async t=>{
 for(const state of ['prepared','submitted','confirmed','failed']){
  const f=fixture(t,{priorSqlAttempt:state});await assert.rejects(f.run('--once'));assert.equal(f.value(),null);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.counts.simulate,0);
 }
});
test('on-disk WAL saves the same signed envelope before SQL and a single uncertain submission',async t=>{
 const f=fixture(t,{diskJournal:true,lostSendReply:true,receipt:'NOT_FOUND'});assert.equal((await f.run('--once')).status,'PENDING_UNKNOWN');
 const saved=f.journal.load();assert.equal(saved.phase,'signed');assert(saved.signedXdr);assert.equal(saved.submissionAttempted,true);assert.equal(saved.signedXdr,f.record().xdr);
 assert.equal((await f.run('--reconcile')).status,'PENDING_UNKNOWN');assert.equal(f.journal.load().transactionHash,saved.transactionHash);assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
});
test('no parent evidence failure or unknown cost becomes a fresh signature',async t=>{
 const cases=[{maintenancePaidStroops:'13327629',readproofPaidStroops:'0',renewalPaidStroops:'4726',historicalPaidStroops:'93618202'},
  {maintenancePaidStroops:'0',readproofPaidStroops:'434915',renewalPaidStroops:'4726',historicalPaidStroops:'93618202'},
  {maintenancePaidStroops:'13327629',readproofPaidStroops:'434915',renewalPaidStroops:'0',historicalPaidStroops:'93618202'},
  {maintenancePaidStroops:'13327629',readproofPaidStroops:'434915',renewalPaidStroops:'4726',historicalPaidStroops:'0'}];
 for(const proof of cases){const f=fixture(t);f.adapters.assertParentEvidence=async()=>proof;await assert.rejects(f.run('--once'));assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);}
});

test('the addon technical envelope lasts at most five minutes and is clipped to the unchanged parent deadline',async t=>{
 const f=fixture(t,{receipt:'NOT_FOUND'}),at=1793560000;
 const first=await prepareMaintenanceThreeQuote({policy:f.plan,server:f.server,now:()=>at});assert.equal(first.metadata.maxTime,at+300);
 const near=f.plan.until-20;const clipped=await prepareMaintenanceThreeQuote({policy:f.plan,server:f.server,now:()=>near});assert.equal(clipped.metadata.maxTime,f.plan.until);
 f.adapters.signerFactory=()=>async encoded=>{f.setClock(at+300);const tx=TransactionBuilder.fromXDR(encoded,Networks.TESTNET);tx.sign(f.source);return tx.toXDR();};
 await assert.rejects(f.run('--once'),/signature_request_expired/);assert.equal(f.counts.send,0);assert.equal(f.value().phase,'signed');
 assert.equal((await f.run('--reconcile')).status,'PENDING_UNKNOWN');assert.equal(f.counts.send,0);
 const after=fixture(t,{receipt:'NOT_FOUND'});after.adapters.signerFactory=()=>async encoded=>{after.setClock(at+301);const tx=TransactionBuilder.fromXDR(encoded,Networks.TESTNET);tx.sign(after.source);return tx.toXDR();};
 await assert.rejects(after.run('--once'),/signature_request_expired/);assert.equal(after.counts.send,0);
});
test('the production SQL attempt store durably binds one signed hash and never resends UNKNOWN',async t=>{
 const f=fixture(t,{diskJournal:true}),baseQuery=f.client.query;let row=null,transactions=0,sends=0;
 f.client.query=async(sql,args)=>{
  if(sql==='BEGIN'){transactions++;return{rows:[]};}if(sql==='COMMIT'||sql==='ROLLBACK')return{rows:[]};
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return{rows:[]};
  if(sql.startsWith('SELECT id FROM private_operations'))return{rows:[]};
  if(sql.startsWith('INSERT INTO clinical_transaction_attempts')){assert.equal(args[0],f.plan.attemptRunId);assert.equal(args[1],'restorec2proofs');assert.equal(row,null);row={intent:args[3],state:'prepared',signed_xdr:null,transaction_hash:null};return{rows:[]};}
  if(sql.startsWith('SELECT intent,signed_xdr,transaction_hash,state FROM clinical_transaction_attempts'))return{rows:row?[structuredClone(row)]:[]};
  if(sql.startsWith('UPDATE clinical_transaction_attempts SET signed_xdr')){assert.equal(row.state,'prepared');assert.equal(row.intent,args[3]);row.signed_xdr=args[4];row.transaction_hash=args[5];row.state='submitted';return{rows:[{operation_name:'restorec2proofs'}]};}
  if(sql.startsWith('UPDATE clinical_transaction_attempts SET state=')){assert.equal(args[3],row.transaction_hash);row.state=args[4];return{rows:[{operation_name:'restorec2proofs'}]};}
  if(sql.startsWith('SELECT run_id'))return{rows:row?[{run_id:f.plan.attemptRunId}]:[]};
  return baseQuery(sql,args);
 };
 f.adapters.createAttemptStore=clinicalAttemptStore;
 f.server.sendTransaction=async tx=>{sends++;assert.equal(row.state,'submitted');assert.equal(row.signed_xdr,tx.toXDR());assert.equal(f.journal.load().signedXdr,row.signed_xdr);throw Error('lost reply');};
 f.server.getTransaction=async hash=>{assert.equal(hash,row.transaction_hash);return{status:'NOT_FOUND'};};
 assert.equal((await f.run('--once')).status,'PENDING_UNKNOWN');const signed=row.signed_xdr,hash=row.transaction_hash;
 assert.equal((await f.run('--once')).status,'PENDING_UNKNOWN');assert.equal((await f.run('--reconcile')).status,'PENDING_UNKNOWN');
 assert.equal(transactions,2);assert.equal(sends,1);assert.equal(f.counts.sign,1);assert.equal(f.counts.simulate,1);assert.equal(row.signed_xdr,signed);assert.equal(row.transaction_hash,hash);
});

test('a cancellation received during receipt IO blocks before quote, journal, signature or submission',async t=>{
 const f=fixture(t);f.adapters.assertParentEvidence=async()=>{process.emit('SIGINT');return{maintenancePaidStroops:'13327629',readproofPaidStroops:'434915',renewalPaidStroops:'4726',historicalPaidStroops:'93618202'};};
 await assert.rejects(f.run('--once'));assert.equal(f.value(),null);assert.equal(f.counts.simulate,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});

test('the schema14 approval gate blocks unsigned preparation before any supplemental RPC',async t=>{
 const f=fixture(t);delete f.adapters.loadScope;delete f.adapters.assertScope;let network=0;
 f.server.getNetwork=async()=>{network++;throw Error('RPC forbidden before approval');};
 await assert.rejects(f.run('--prepare'));assert.equal(network,0);assert.equal(f.counts.simulate,0);assert.equal(f.counts.connect,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});
test('offline inspection is a separate path without loading financial authority or constructing RPC work',async t=>{
 const f=fixture(t),dto={status:'OFFLINE_PROPOSAL_ONLY',keyCount:3,spendingAllowed:false,rpcCalls:0,journalsCreated:0};
 f.adapters.inspectProposal=()=>dto;f.adapters.loadScope=()=>{throw Error('financial loader forbidden offline');};
 assert.deepEqual(await f.run('--inspect-offline'),dto);assert.equal(f.counts.connect,0);assert.equal(f.counts.simulate,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});

test('the exact residual maintenance cap includes inclusion fee and never expands the two XLM hold',async t=>{
 const exact=fixture(t,{resourceFee:'6237356'}),quote=await exact.run('--prepare');assert.equal(quote.offeredFeeStroops,'6237456');assert.equal(quote.maximumFeeStroops,'6237456');assert.equal(exact.counts.sign,0);
 const excess=fixture(t,{resourceFee:'6237357'});await assert.rejects(excess.run('--once'));assert.equal(excess.counts.sign,0);assert.equal(excess.counts.send,0);assert.equal(excess.value(),null);
 const exhausted=fixture(t);exhausted.plan.maintenanceMaximumStroops='19999999';await assert.rejects(exhausted.run('--once'));assert.equal(exhausted.counts.sign,0);assert.equal(exhausted.counts.simulate,0);
});
test('a changed source cannot widen this fixed three-key authority',async t=>{
 const f=fixture(t);f.plan.source=Keypair.random().publicKey();await assert.rejects(f.run('--once'));assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.equal(f.counts.simulate,0);
});
