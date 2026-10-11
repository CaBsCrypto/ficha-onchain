import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { clinicalLocalSignatures } from './clinical-local-signatures.mjs';
const patient=Keypair.fromRawEd25519Seed(Buffer.alloc(32,81)),other=Keypair.fromRawEd25519Seed(Buffer.alloc(32,82));
function fixture(t) {
  let clock=1_800_000_000_000;
  const broker=clinicalLocalSignatures({patient:patient.publicKey(),runId:randomUUID(),now:()=>clock});t.after(()=>broker.close());
  const expiresAt=clock/1000+120,op={id:randomUUID(),state:'awaiting_signature',action:'create_history',expiresAt,signing:{address:patient.publicKey(),hash:'1'.repeat(64),network:'testnet',expiresAt}};
  return{broker,op,expire:()=>{clock=expiresAt*1000+1;}};
}
function answer(broker,key=patient) {
  const p=broker.poll(broker.capability);
  return{capability:broker.capability,nonce:p.nonce,operationId:p.operationId,signature:'0x'+key.sign(Buffer.from(p.hash,'hex')).toString('hex')};
}
test('only a registered Testnet intent is signed, once; no arbitrary browser hash or second instance',async t=>{
  const{broker,op}=fixture(t);assert.equal(broker.poll(broker.capability),null);
  const pending=broker.request(op,1);await assert.rejects(broker.request({...op,id:randomUUID()},1));
  const body=answer(broker);broker.receive(body);assert.deepEqual(await pending,{signature:body.signature});
  assert.equal(broker.poll(broker.capability),null);assert.throws(()=>broker.receive(body));await assert.rejects(broker.request(op,1));
});
test('wallet, network, action, expiry and malformed hash cannot register a signing request',async t=>{
  const{broker,op}=fixture(t);
  for(const change of [{address:other.publicKey()},{network:'mainnet'},{expiresAt:op.expiresAt+1},{hash:'bad'}]) await assert.rejects(broker.request({...op,signing:{...op.signing,...change}},1));
  await assert.rejects(broker.request({...op,action:'set_permissions'},1));
});
test('wrong capabilities, nonces, IDs and signatures cannot fulfill another intent',async t=>{
  const{broker,op}=fixture(t),pending=broker.request(op,1),body=answer(broker);
  for(const change of [{capability:'0'.repeat(64)},{nonce:'0'.repeat(64)},{operationId:randomUUID()},{hash:'2'.repeat(64)},{signature:answer(broker,other).signature}]) assert.throws(()=>broker.receive({...body,...change}));
  broker.receive(body);assert.equal((await pending).signature,body.signature);
});
test('expiry while signing rejects the pending request and late signature',async t=>{
  const{broker,op,expire}=fixture(t),pending=broker.request(op,1),body=answer(broker);expire();assert.throws(()=>broker.receive(body));
  await assert.rejects(pending,{message:'clinical_local_signing_expired'});assert.equal(broker.poll(broker.capability),null);
});
test('cancellation consumes the intent without returning a signature',async t=>{
  const{broker,op}=fixture(t),pending=broker.request(op,1),body=answer(broker);
  delete body.signature;broker.receive({...body,cancelled:true});await assert.rejects(pending,{message:'clinical_local_signing_cancelled'});await assert.rejects(broker.request(op,1));
});
test('closing or restarting the process cannot fulfill a pending capability',async t=>{
  const{broker,op}=fixture(t),pending=broker.request(op,1),body=answer(broker);broker.close();
  await assert.rejects(pending,{message:'clinical_local_signing_closed'});assert.throws(()=>broker.receive(body));
  const next=fixture(t);assert.throws(()=>next.broker.poll(body.capability));
});
