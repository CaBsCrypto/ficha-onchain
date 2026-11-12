import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Account,Contract,Keypair,Networks,SorobanDataBuilder,TransactionBuilder,xdr} from '@stellar/stellar-sdk';
import {createRehearsalReceiptResolver,resolveRehearsalReceipt,parseRetainedRehearsalReceipts} from './clinical-receipt-retention.mjs';
const HASHES=['57d54e8f0525a0fb2b26496fe56dbcc4768a4e4c8b7293fd6eeb334c87aa6229','c60bee45aa0d366db9de913f5e5de4cba828e86d49356af45bc1248ad3b85041'];
function fixture(){
 const policy=Object.freeze({resumeContinuation:true}),scope={receiptEvidenceFile:'UNIT-ONLY',receiptEvidenceSha256:'a'.repeat(64)},allowed=new WeakSet([policy]);let reads=0,calls=0;
 const recovered=Object.freeze({status:'SUCCESS',hash:HASHES[0],unitFixture:true});
 const resolver=createRehearsalReceiptResolver({assertApproved:(p,{now})=>{assert(allowed.has(p),'unapproved');if(now<100||now>=200)throw Error('clinical_rehearsal_expired');return scope;},read:s=>{assert.equal(s,scope);reads++;return new Map([[HASHES[0],recovered]]);}});
 return {policy,recovered,resolver,reads:()=>reads,calls:()=>calls,receipt:async()=>{calls++;return{status:'NOT_FOUND'};}};
}
test('production resolver rejects unapproved legacy, copied and preview-like objects before any RPC or file access',async()=>{
 let calls=0;for(const policy of [{},{resumeContinuation:{}},{resumeContinuation:{receiptEvidenceFile:'fake',receiptEvidenceSha256:'a'.repeat(64)}}])await assert.rejects(resolveRehearsalReceipt(policy,HASHES[0],{now:100,receipt:async()=>{calls++;return{status:'NOT_FOUND'};}}),/clinical_rehearsal_/);assert.equal(calls,0);
});
test('only the approved instance and an exact retained NOT_FOUND hash use the pinned reader',async()=>{
 const f=fixture();assert.equal(await f.resolver(f.policy,HASHES[0],{now:100,receipt:f.receipt}),f.recovered);assert.equal(f.calls(),1);assert.equal(f.reads(),1);
 await assert.rejects(f.resolver({...f.policy},HASHES[0],{now:100,receipt:f.receipt}),/unapproved/);assert.equal(f.calls(),1);
});
for(const status of ['SUCCESS','FAILED','UNKNOWN','PENDING'])test('live '+status+' evidence is preserved and never replaced by the retained SUCCESS',async()=>{
 const f=fixture(),live={status};assert.equal(await f.resolver(f.policy,HASHES[0],{now:100,receipt:async()=>live}),live);assert.equal(f.reads(),0);
});
test('an unrelated future operation retains its NOT_FOUND status and cannot borrow historical evidence',async()=>{
 const f=fixture(),live={status:'NOT_FOUND'};assert.equal(await f.resolver(f.policy,'f'.repeat(64),{now:100,receipt:async()=>live}),live);assert.equal(f.reads(),0);
});
test('a transport failure never becomes a retained successful receipt or a zero fee',async()=>{
 const f=fixture();await assert.rejects(f.resolver(f.policy,HASHES[0],{now:100,receipt:async()=>{throw Error('private endpoint detail');}}),{message:'clinical_rehearsal_receipt_unavailable'});assert.equal(f.reads(),0);
});
test('receipt IO crossing approval expiry denies the retained evidence before reading it',async t=>{
 const f=fixture();let clock=100000;t.mock.method(Date,'now',()=>clock);
 await assert.rejects(f.resolver(f.policy,HASHES[0],{now:100,receipt:async()=>{clock=200000;return{status:'NOT_FOUND'};}}),{message:'clinical_rehearsal_expired'});assert.equal(f.reads(),0);
});
test('clock regression during RPC denies the retained evidence',async t=>{
 const f=fixture();let clock=100000;t.mock.method(Date,'now',()=>clock);
 await assert.rejects(f.resolver(f.policy,HASHES[0],{now:100,receipt:async()=>{clock--;return{status:'NOT_FOUND'};}}),{message:'clinical_rehearsal_receipt_unavailable'});assert.equal(f.reads(),0);
});
test('a missing or changed retained file fails closed without returning sensitive diagnostics',async()=>{
 const resolver=createRehearsalReceiptResolver({assertApproved:()=>({}),read:()=>{throw Error('secret file diagnostic');}});
 await assert.rejects(resolver({},HASHES[0],{now:100,receipt:async()=>({status:'NOT_FOUND'})}),{message:'clinical_rehearsal_receipt_unavailable'});
});
// Hermetic positive parser fixture. Only literal deployment hash data and module
// paths change in a temporary module; all parsing and crypto checks are exact.
async function parserFixture(work){
 const dir=mkdtempSync(join(tmpdir(),'trustleaf-retained-receipt-unit-'));
 try{
  const key=n=>Keypair.fromRawEd25519Seed(Buffer.alloc(32,n)),actor=key(91),payer=key(92),sha=x=>createHash('sha256').update(x).digest(),fees=['64151056','29467146'];
  const records=fees.map((fee,index)=>{
   const inner=new TransactionBuilder(new Account(actor.publicKey(),String(index+20)),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(new Contract('CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U').call('unit_only')).setTimebounds(0,1800000000).setSorobanData(new SorobanDataBuilder().setResourceFee('70000000').build()).build();inner.sign(actor);
   const outer=TransactionBuilder.buildFeeBumpTransaction(payer,'2000000',inner,Networks.TESTNET);outer.sign(payer);
   const returnValue=xdr.ScVal.scvVoid(),events=[],success=sha(new xdr.InvokeHostFunctionSuccessPreImage({returnValue,events}).toXDR());
   const operation=xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(success)));
   const ir=new xdr.InnerTransactionResult({feeCharged:xdr.Int64.fromString('100'),result:xdr.InnerTransactionResultResult.txSuccess([operation]),ext:new xdr.InnerTransactionResultExt(0)});
   const result=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString(fee),result:xdr.TransactionResultResult.txFeeBumpInnerSuccess(new xdr.InnerTransactionResultPair({transactionHash:inner.hash(),result:ir})),ext:new xdr.TransactionResultExt(0)});
   const meta=new xdr.TransactionMeta(4,new xdr.TransactionMetaV4({ext:new xdr.ExtensionPoint(0),txChangesBefore:[],txChangesAfter:[],operations:[new xdr.OperationMetaV2({ext:new xdr.ExtensionPoint(0),changes:[],events})],sorobanMeta:new xdr.SorobanTransactionMetaV2({ext:new xdr.SorobanTransactionMetaExt(0),returnValue}),events:[],diagnosticEvents:[]}));
   return {key:index?'grant_both':'append_note',hash:outer.hash().toString('hex'),ledger:index?5381977:5381518,status:'SUCCESS',feeBump:true,feeChargedStroops:fee,envelopeXdr:outer.toXDR(),resultXdr:result.toXDR('base64'),resultMetaXdr:meta.toXDR('base64'),returnValue:returnValue.toXDR('base64'),provenance:{source:'stellar-public-data-lake',networkPassphrase:Networks.TESTNET,transactionEnvelopeExtractedFromLedgerTransactionSet:true,transactionMetaExtractedFromMatchingTransactionResultHash:true}};
  });
  const packet={schemaVersion:1,kind:'trustleaf-retained-c2-c3-sdk-receipts',network:'testnet',retrievedAtUtc:'2026-11-01T19:00:00Z',records};
  let source=readFileSync(new URL('./clinical-receipt-retention.mjs',import.meta.url),'utf8');for(const [index,pin]of HASHES.entries()){assert(source.includes(pin));source=source.replaceAll(pin,records[index].hash);}
  const require=createRequire(import.meta.url);source=source.replace("from '@stellar/stellar-sdk'",`from '${pathToFileURL(require.resolve('@stellar/stellar-sdk')).href}'`).replace("from './clinical-rehearsal-policy.mjs'",`from '${new URL('./clinical-rehearsal-policy.mjs',import.meta.url).href}'`);
  const file=join(dir,'isolated-retention.mjs');writeFileSync(file,source);const module=await import(pathToFileURL(file).href);
  return await work({module,packet,dir,hash:records[0].hash});
 }finally{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert(dir.startsWith(join(tmpdir(),'trustleaf-retained-receipt-unit-')));rmSync(dir,{recursive:true,force:true});}
}
test('complete retained v4 SDK metadata is decoded without inventing or weakening the canonical result',()=>parserFixture(async({module,packet})=>{
 const map=module.parseRetainedRehearsalReceipts(Buffer.from(JSON.stringify(packet)));assert.equal(map.size,2);
 for(const record of packet.records){const receipt=map.get(record.hash);assert(receipt.envelopeXdr instanceof xdr.TransactionEnvelope);assert(receipt.resultMetaXdr instanceof xdr.TransactionMeta);assert.equal(receipt.resultMetaXdr.switch(),4);assert.equal(receipt.resultXdr.feeCharged().toString(),record.feeChargedStroops);assert(Object.isFrozen(receipt));}
}));
for(const field of ['hash','ledger','feeChargedStroops','envelopeXdr','resultXdr','resultMetaXdr','returnValue'])test('retained parser rejects a changed '+field,()=>parserFixture(async({module,packet})=>{
 packet.records[0][field]=field==='ledger'?1:'changed';assert.throws(()=>module.parseRetainedRehearsalReceipts(Buffer.from(JSON.stringify(packet))),{message:'clinical_rehearsal_receipt_unavailable'});
}));
test('retained parser rejects missing or duplicate records, wrong network, malformed bytes and oversized input',()=>parserFixture(async({module,packet})=>{
 for(const value of [{...packet,records:[packet.records[0]]},{...packet,records:[packet.records[0],packet.records[0]]},{...packet,network:'public'}])assert.throws(()=>module.parseRetainedRehearsalReceipts(Buffer.from(JSON.stringify(value))));
 for(const bytes of [Buffer.from('not-json'),Buffer.alloc(262145),Buffer.from('{}')])assert.throws(()=>module.parseRetainedRehearsalReceipts(bytes));
}));
test('default filesystem reader verifies the pinned bytes on each fallback and rejects tamper',()=>parserFixture(async({module,packet,dir,hash})=>{
 const file=join(dir,'unit-receipt.json'),bytes=Buffer.from(JSON.stringify(packet));writeFileSync(file,bytes);
 const scope={receiptEvidenceFile:file,receiptEvidenceSha256:createHash('sha256').update(bytes).digest('hex')};
 const resolver=module.createRehearsalReceiptResolver({assertApproved:()=>scope});
 assert.equal((await resolver({},hash,{now:100,receipt:async()=>({status:'NOT_FOUND'})})).hash,hash);
 writeFileSync(file,Buffer.from(JSON.stringify({...packet,network:'public'})));
 await assert.rejects(resolver({},hash,{now:100,receipt:async()=>({status:'NOT_FOUND'})}),{message:'clinical_rehearsal_receipt_unavailable'});
}));
