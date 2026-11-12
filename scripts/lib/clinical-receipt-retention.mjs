/** Schema14-only retention of two complete, immutable SDK receipts recovered
 * from the public Stellar data lake. This is never a Horizon/metadata substitute:
 * callers still MUST run saved()/canonicalCost() against the exact SQL envelope. */
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { FeeBumpTransaction, Networks, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { assertRehearsalResumeBudget } from './clinical-rehearsal-policy.mjs';
const FACTS=Object.freeze([
 Object.freeze({key:'append_note',hash:'57d54e8f0525a0fb2b26496fe56dbcc4768a4e4c8b7293fd6eeb334c87aa6229',ledger:5381518,fee:'64151056'}),
 Object.freeze({key:'grant_both',hash:'c60bee45aa0d366db9de913f5e5de4cba828e86d49356af45bc1248ad3b85041',ledger:5381977,fee:'29467146'}),
]);
const fail=()=>new Error('clinical_rehearsal_receipt_unavailable');
const check=value=>{if(!value)throw fail();};
const sha=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>Buffer.from(a).equals(Buffer.from(b));
function encoded(value,type){check(typeof value==='string'&&value.length>0&&value.length<=180000);const parsed=type.fromXDR(value,'base64');check(parsed.toXDR('base64')===value);return parsed;}
/** Pure parsing is NOT authority. SDK result/meta remain subject to canonicalCost. */
export function parseRetainedRehearsalReceipts(bytes){
 try{
  check(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=262144);
  const packet=JSON.parse(Buffer.from(bytes).toString('utf8'));
  check(packet&&packet.schemaVersion===1&&packet.kind==='trustleaf-retained-c2-c3-sdk-receipts'&&packet.network==='testnet'&&
   typeof packet.retrievedAtUtc==='string'&&Number.isFinite(Date.parse(packet.retrievedAtUtc))&&Array.isArray(packet.records)&&packet.records.length===2);
  return new Map(packet.records.map((record,index)=>{
   const expected=FACTS[index];check(record&&record.key===expected.key&&record.hash===expected.hash&&record.ledger===expected.ledger&&
    record.status==='SUCCESS'&&record.feeBump===true&&record.feeChargedStroops===expected.fee);
   const envelopeXdr=encoded(record.envelopeXdr,xdr.TransactionEnvelope),resultXdr=encoded(record.resultXdr,xdr.TransactionResult),
    resultMetaXdr=encoded(record.resultMetaXdr,xdr.TransactionMeta),returnValue=encoded(record.returnValue,xdr.ScVal);
   const outer=TransactionBuilder.fromXDR(envelopeXdr,Networks.TESTNET);
   check(outer instanceof FeeBumpTransaction&&outer.hash().toString('hex')===expected.hash&&resultXdr.feeCharged().toString()===expected.fee&&
    resultXdr.result().switch().name==='txFeeBumpInnerSuccess'&&
    same(resultXdr.result().innerResultPair().transactionHash(),outer.innerTransaction.hash())&&[3,4].includes(resultMetaXdr.switch())&&
    resultMetaXdr.value().sorobanMeta()&&same(resultMetaXdr.value().sorobanMeta().returnValue().toXDR(),returnValue.toXDR()));
   check(record.provenance?.source==='stellar-public-data-lake'&&record.provenance.networkPassphrase===Networks.TESTNET&&
    record.provenance.transactionEnvelopeExtractedFromLedgerTransactionSet===true&&record.provenance.transactionMetaExtractedFromMatchingTransactionResultHash===true);
   return [expected.hash,Object.freeze({status:'SUCCESS',hash:expected.hash,feeBump:true,ledger:expected.ledger,envelopeXdr,resultXdr,resultMetaXdr,returnValue})];
  }));
 }catch{throw fail();}
}
function readEvidence(scope){
 const file=scope.receiptEvidenceFile,digest=scope.receiptEvidenceSha256;
 check(typeof file==='string'&&isAbsolute(file)&&typeof digest==='string'&&/^[a-f0-9]{64}$/.test(digest));
 const stat=lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size>0&&stat.size<=262144&&realpathSync(file)===file);
 let descriptor;try{descriptor=openSync(file,'r');const current=fstatSync(descriptor);check(current.isFile()&&current.size===stat.size);
  const bytes=readFileSync(descriptor);check(bytes.length===current.size&&sha(bytes)===digest);return parseRetainedRehearsalReceipts(bytes);
 }finally{if(descriptor!==undefined)closeSync(descriptor);}
}
function checkedTime(now,started){const finished=Date.now();check(Number.isSafeInteger(now)&&Number.isSafeInteger(finished)&&finished>=started);return now+Math.floor(finished/1000)-Math.floor(started/1000);}
/** The CLI/app use the default factory. Adapters exist only for hermetic tests;
 * no environment flag, generic archive endpoint or alternative source exists. */
export function createRehearsalReceiptResolver({assertApproved=assertRehearsalResumeBudget,read=readEvidence}={}){
 return async function resolveReceipt(policy,hash,{receipt,now=Math.floor(Date.now()/1000)}={}){
  const started=Date.now(),scope=assertApproved(policy,{now});
  check(typeof receipt==='function'&&typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash));
  let current;try{current=await receipt(hash);}catch{throw fail();}
  assertApproved(policy,{now:checkedTime(now,started)});
  // UNKNOWN, transport errors and receipts for any other operation never fall
  // back. A failed live receipt must reach the unchanged canonical verifier.
  if(current?.status!=='NOT_FOUND'||!FACTS.some(item=>item.hash===hash))return current;
  let recovered;try{recovered=read(scope).get(hash);check(recovered?.hash===hash&&recovered.status==='SUCCESS');}catch{throw fail();}
  assertApproved(policy,{now:checkedTime(now,started)});return recovered;
 };
}
const defaultResolver=createRehearsalReceiptResolver();
export const resolveRehearsalReceipt=(policy,hash,options)=>defaultResolver(policy,hash,options);
