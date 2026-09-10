import test from 'node:test';
import assert from 'node:assert/strict';
import { runOnce, assertBookingMatches, createChain, createStore } from './worker-prescription-bookings.mjs';
import { Account, Address, Keypair, Networks, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import { PRIVATE_PRESCRIPTION_ID } from './lib/private-worker-runtime.mjs';
import { PRIVATE_REGISTRY_ID } from './lib/private-registry.mjs';

const doctor=Keypair.random().publicKey(),patient=Keypair.random().publicKey();

function fixture(patch={}) {
  let job={appointment_id:1,network:'testnet',contract_id:PRIVATE_PRESCRIPTION_ID,doctor_wallet:doctor,patient_wallet:patient,valid_until:500,
    issuance_id:'a'.repeat(64),...patch};
  const calls=[];
  const store={
    claim:async()=>({...job}),eligible:async()=>true,
    prepared:async(j,kind,p)=>{calls.push('persist');job={...j,tx_kind:kind,transaction_hash:p.hash,prepared_xdr:p.xdr};return {...job};},
    complete:async(j,state)=>{calls.push('complete:'+state);},fail:async()=>{calls.push('fail');},
    note:async()=>{calls.push('note');},release:async()=>{calls.push('release');},
  };
  const chain={receipt:async()=>({status:'NOT_FOUND'}),expired:async()=>false,verifyEnvelope:async()=>{},validateIdentity:async()=>{},
    booking:async()=>({doctor,patient,valid_until:500,status:['Active']}),
    prepare:async()=>{calls.push('prepare');return {xdr:'signed-envelope',hash:'hash'};},
    submit:async xdr=>{calls.push('submit:'+xdr);},
  };
  return {store,chain,calls,writesEnabled:true,get job(){return job;}};
}

test('persist signed hash before submit; a crash reconciles and reuses identical envelope',async()=>{
  const f=fixture();f.chain.submit=async()=>{f.calls.push('submit-crash');throw Error('network');};
  assert.equal((await runOnce(f)).status,'needs_reconciliation');
  assert.deepEqual(f.calls,['prepare','persist','submit-crash','note','release']);
  f.calls.length=0;f.chain.submit=async x=>f.calls.push('retry:'+x);
  const result=await runOnce(f);assert.equal(result.reusedEnvelope,true);
  assert.deepEqual(f.calls,['retry:signed-envelope','release']);
});
test('confirmed receipt must match booking participants and expiry before completion',async()=>{
  for (const change of [{doctor:'other'},{patient:'other'},{valid_until:501}]) {
    const f=fixture({transaction_hash:'hash',prepared_xdr:'xdr',tx_kind:'attest'});
    f.chain.receipt=async()=>({status:'SUCCESS'});
    f.chain.booking=async()=>({doctor,patient,valid_until:500,status:['Active'],...change});
    assert.equal((await runOnce(f)).status,'needs_reconciliation');
    assert.equal(f.calls.some(x=>x.startsWith('complete:')),false);
  }
  assert.throws(()=>assertBookingMatches({doctor_wallet:'doctor'},null));
});
test('matching receipt confirms; revoked and consumed states are distinguished',async()=>{
  for(const [state,expected] of [['Active','confirmed'],['Revoked','revoked'],['Consumed','consumed']]) {
    const f=fixture({transaction_hash:'hash',prepared_xdr:'xdr',tx_kind:'attest'});
    f.chain.receipt=async()=>({status:'SUCCESS'});f.chain.booking=async()=>({doctor,patient,valid_until:500,status:[state]});
    await runOnce(f);assert.deepEqual(f.calls,['complete:'+expected,'release']);
  }
});
test('pending cancelled attestation reconciles first and does not mint another transaction',async()=>{
  const f=fixture({transaction_hash:'hash',prepared_xdr:'xdr',tx_kind:'attest',cancellation_requested_at:'now'});
  assert.equal((await runOnce(f)).status,'pending_cancellation');assert.deepEqual(f.calls,['release']);
});
test('cancel confirmed active booking prepares revoke; consumed booking is not undone',async()=>{
  const f=fixture({attestation_hash:'prior',cancellation_requested_at:'now'});
  const result=await runOnce(f);assert.equal(result.kind,'revoke');assert.equal(f.job.tx_kind,'revoke');
  const g=fixture({attestation_hash:'prior',cancellation_requested_at:'now'});
  g.chain.booking=async()=>({doctor,patient,valid_until:500,status:['Consumed']});
  assert.equal((await runOnce(g)).status,'already_consumed');assert.deepEqual(g.calls,['complete:consumed','release']);
});
test('eligibility, expiry, and lease changes never cause a fresh untracked submission',async()=>{
  const f=fixture();f.store.eligible=async()=>false;await runOnce(f);assert.equal(f.calls.includes('prepare'),false);
  const g=fixture();g.store.prepared=async()=>{throw Error('lease_lost');};await runOnce(g);assert.equal(g.calls.some(x=>x.startsWith('submit:')),false);
  const h=fixture({transaction_hash:'hash',prepared_xdr:'xdr',tx_kind:'attest'});h.chain.expired=async()=>true;
  assert.equal((await runOnce(h)).status,'expired_needs_reconciliation');assert.deepEqual(h.calls,['release']);
});
test('non-testnet and failed receipt cannot confirm or resubmit',async()=>{
  const f=fixture({network:'mainnet'});await runOnce(f);assert.deepEqual(f.calls,['fail','release']);
  const g=fixture({transaction_hash:'hash',prepared_xdr:'xdr',tx_kind:'attest'});g.chain.receipt=async()=>({status:'FAILED'});
  assert.equal((await runOnce(g)).status,'failed');assert.deepEqual(g.calls,['fail','release']);
});
test('RPC adapter rejects wrong ABI or booking authority before invoking secure signer',async()=>{
  const authority=Keypair.random();const other=Keypair.random();const relayer=Keypair.random();
  // Contract addresses encode 32 bytes, with no transaction or external RPC.
  const {StrKey}=await import('@stellar/stellar-sdk');
  const job={...fixture().job};
  for(const badVersion of [true,false]) {
    let reads=0,signs=0;
    const server={getAccount:async()=>new Account(authority.publicKey(),'1'),
      simulateTransaction:async()=>({id:'1',latestLedger:1,events:[],transactionData:{},minResourceFee:'100',
        result:{auth:[],retval:reads++===0?nativeToScVal(badVersion?1:2,{type:'u32'}):nativeToScVal(other.publicKey(),{type:'address'})}})};
    const chain=createChain({authority:authority.publicKey(),relayer,server,signXdr:async()=>{signs++;}});
    await assert.rejects(chain.prepare(job,'attest'));assert.equal(signs,0);
  }
});
test('SQL store cannot report completion after losing its lease',async()=>{
  const store=createStore({query:async()=>({rows:[],rowCount:0})},PRIVATE_PRESCRIPTION_ID);
  await assert.rejects(store.complete({appointment_id:1},'confirmed'),/lease_lost/);
  await assert.rejects(store.fail({appointment_id:1},'transaction_failed'),/lease_lost/);
});

test('booking kill switch reconciles saved receipt but never prepares or resubmits',async()=>{
  const f=fixture();f.writesEnabled=false;
  assert.equal((await runOnce(f)).status,'writes_paused');assert.deepEqual(f.calls,['release']);
  const g=fixture({transaction_hash:'hash',prepared_xdr:'signed',tx_kind:'attest'});g.writesEnabled=false;
  assert.equal((await runOnce(g)).status,'writes_paused');assert.deepEqual(g.calls,['release']);
  g.chain.receipt=async()=>({status:'SUCCESS'});
  assert.equal((await runOnce(g)).status,'confirmed');assert.equal(g.calls.includes('complete:confirmed'),true);
});

test('failed cancellation after mint does not claim a revocation or cancelled appointment',async()=>{
  const f=fixture({transaction_hash:'hash',prepared_xdr:'signed',tx_kind:'revoke',cancellation_requested_at:'now'});
  f.chain.receipt=async()=>({status:'FAILED'});f.chain.booking=async()=>({doctor,patient,valid_until:500,status:['Consumed']});
  f.store.complete=async(job,state,options)=>{assert.equal(state,'consumed');assert.equal(options.failedAttempt,true);f.calls.push('consumed');};
  assert.equal((await runOnce(f)).status,'already_consumed');assert.deepEqual(f.calls,['consumed','release']);
});

test('canonical booking eligibility binds attendance, doctor start and persistent Privy wallet IDs',async()=>{
  const calls=[];const store=createStore({query:async(sql,values)=>{calls.push([sql,values]);return {rows:[{id:1}],rowCount:1};}},PRIVATE_PRESCRIPTION_ID);
  assert.equal(await store.eligible(fixture().job),true);
  const sql=calls[0][0];assert.match(sql,/privy_stellar_wallet_bindings/);assert.match(sql,/a.attendance_user_id=r.patient_requested_by/);
  assert.match(sql,/a.started_by=r.doctor_user_id/);assert.match(sql,/p.wallet_id=r.patient_wallet_id/);assert.doesNotMatch(sql,/stellar_verified_bindings/);
});

test('booking attempts append signed envelope before submit and cancelled update follows reconciled state',async()=>{
  const calls=[];const store=createStore({query:async(sql,values)=>{calls.push([sql,values]);return {rows:[fixture().job],rowCount:1};}},PRIVATE_PRESCRIPTION_ID);
  await store.prepared(fixture().job,'attest',{xdr:'signed',hash:'hash'});
  const persisted=calls.find(([sql])=>sql.includes('attempts=attempts'));
  assert.deepEqual(JSON.parse(persisted[1][5])[0].xdr,'signed');assert.equal(calls.at(-1)[0],'COMMIT');
  calls.length=0;await store.complete(fixture().job,'consumed');assert.equal(calls.some(([sql])=>sql.includes('UPDATE appointments')),false);
  calls.length=0;await store.complete(fixture().job,'revoked');assert.equal(calls.some(([sql])=>sql.includes("UPDATE appointments SET status='cancelled'")),true);
});

test('Privy participant ownership rechecked for both wallets, not supplied address alone',async()=>{
  const job={...fixture().job,doctor_user_id:'did:doctor',doctor_email:'doctor@test.invalid',doctor_wallet_id:'doctor-id',
    patient_requested_by:'did:patient',patient_email:'patient@test.invalid',patient_wallet_id:'patient-id'};
  let changed=false;
  const provider={getUser:async id=>({id,email:{address:id==='did:doctor'?job.doctor_email:job.patient_email},linkedAccounts:[{
    type:'wallet',chainType:'stellar',id:id==='did:doctor'?'doctor-id':'patient-id',address:id==='did:doctor'?doctor:(changed?doctor:patient)}]}),
    walletApi:{getWallet:async({id})=>({id,chainType:'stellar',address:id==='doctor-id'?doctor:patient})}};
  const chain=createChain({authority:Keypair.random().publicKey(),relayer:Keypair.random(),provider});
  await chain.validateIdentity(job);changed=true;await assert.rejects(chain.validateIdentity(job),/identity_changed/);
});

test('booking chain verifies linked registry and exact saved arguments before accepting envelope',async()=>{
  const authority=Keypair.random(),relayer=Keypair.random();let badRegistry=false,signs=0;
  const job={...fixture().job,valid_until:Math.floor(Date.now()/1000)+600};
  const server={getAccount:async()=>new Account(authority.publicKey(),'1'),prepareTransaction:async tx=>tx,
    simulateTransaction:async tx=>{
      const invoke=tx.operations[0].func.invokeContract();
      const method=invoke.functionName().toString(),registry=Address.fromScAddress(invoke.contractAddress()).toString()===PRIVATE_REGISTRY_ID;
      const values={interface_version:registry?1:2,get_booking_authority:authority.publicKey(),get_admin:authority.publicKey(),
        get_registry:badRegistry?PRIVATE_PRESCRIPTION_ID:PRIVATE_REGISTRY_ID,is_authorized:true,
        get_authorization:{version:1,schema_version:1,commitment:Buffer.alloc(32,1),valid_until:job.valid_until,revoked:false}};
      return {id:'1',latestLedger:1,events:[],transactionData:{},minResourceFee:'100',result:{auth:[],retval:nativeToScVal(values[method])}};
    }};
  const chain=createChain({authority:authority.publicKey(),relayer,server,signXdr:async xdr=>{
    signs++;const tx=TransactionBuilder.fromXDR(xdr,Networks.TESTNET);tx.sign(authority);return tx.toXDR();
  }});
  const prepared=await chain.prepare(job,'attest');assert.equal(signs,1);
  const saved={...job,tx_kind:'attest',prepared_xdr:prepared.xdr,transaction_hash:prepared.hash};
  await chain.verifyEnvelope(saved);
  await assert.rejects(chain.verifyEnvelope({...saved,patient_wallet:authority.publicKey()}),/saved_envelope_invalid/);
  await assert.rejects(chain.verifyEnvelope({...saved,transaction_hash:'0'.repeat(64)}),/saved_envelope_invalid/);
  badRegistry=true;await assert.rejects(chain.prepare(job,'attest'),/wrong_contract_authority_or_version/);assert.equal(signs,1);
});
