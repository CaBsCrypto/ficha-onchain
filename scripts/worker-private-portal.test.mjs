import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@stellar/stellar-sdk';
import { createFairCycle } from './worker-private-portal.mjs';
import { PRIVATE_REGISTRY_ID } from './lib/private-registry.mjs';
import { PRIVATE_PRESCRIPTION_ID, PRIVY_APP_ID, workerConfiguration } from './lib/private-worker-runtime.mjs';

function environment(patch={}) {
  const authority=Keypair.random().publicKey();
  return {TRUSTLEAF_ENV:'local',TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',
    DATABASE_URL:'postgresql://synthetic:synthetic@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test',
    PRIVY_APP_ID,DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:PRIVATE_REGISTRY_ID,PRESCRIPTION_PRIVATE_CONTRACT_ID:PRIVATE_PRESCRIPTION_ID,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:authority,BOOKING_AUTHORITY_PUBLIC_KEY:authority,STELLAR_CONFIG_DIR:'synthetic',
    DOCTOR_REGISTRY_ADMIN_ALIAS:'synthetic',PRIVY_APP_SECRET:'synthetic',RELAYER_SECRET:'synthetic',TRUSTLEAF_DATA_KEY:'synthetic',...patch};
}

test('runtime fails closed for absent switch and wrong environment/database/contract/authority',()=>{
  assert.equal(workerConfiguration(environment()).writesEnabled,false);
  assert.equal(workerConfiguration(environment({TRUSTLEAF_PRIVATE_WRITES_ENABLED:'true'})).writesEnabled,true);
  for(const patch of [{TRUSTLEAF_ENV:undefined},{TRUSTLEAF_ENV:'production'},{TRUSTLEAF_DB_HOST:'elsewhere.neon.tech'},
    {TRUSTLEAF_ENV:'preview'},{DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:PRIVATE_PRESCRIPTION_ID},
    {PRESCRIPTION_PRIVATE_CONTRACT_ID:PRIVATE_REGISTRY_ID},{BOOKING_AUTHORITY_PUBLIC_KEY:Keypair.random().publicKey()}]) {
    assert.throws(()=>workerConfiguration(environment(patch)));
  }
});

test('preview/test accepts only exact isolated host and never known production',()=>{
  for(const env of ['preview','test']) {
    const host='ep-synthetic-isolated-pooler.c-3.us-east-1.aws.neon.tech';
    assert.equal(workerConfiguration(environment({TRUSTLEAF_ENV:env,TRUSTLEAF_DB_HOST:host,DATABASE_URL:`postgresql://synthetic:synthetic@${host}/test`})).host,host);
    const production='ep-rapid-shadow-ahq94785-pooler.c-3.us-east-1.aws.neon.tech';
    assert.throws(()=>workerConfiguration(environment({TRUSTLEAF_ENV:env,TRUSTLEAF_DB_HOST:production,DATABASE_URL:`postgresql://synthetic:synthetic@${production}/test`})));
  }
});

test('fair scheduling rotates first queue, retaining reconciliation for both while source busy',async()=>{
  let busy=false;const calls=[];
  const queues=['admin','bookings'].map(name=>({name,run:async options=>{
    calls.push([name,options.prepareEnabled,options.writesEnabled]);
    if(options.prepareEnabled){busy=true;return {status:'submitted'};}
    if(name==='admin')busy=false;
    return {status:'confirmed'};
  }}));
  const cycle=createFairCycle({queues,hasPendingAuthorityAttempt:async()=>busy,writesEnabled:()=>true});
  await cycle();assert.deepEqual(calls,[['admin',true,true],['bookings',false,true]]);
  calls.length=0;await cycle();assert.deepEqual(calls,[['bookings',false,true],['admin',false,true]]);
  calls.length=0;await cycle();assert.equal(calls.length,2);
});

test('disabled writes requests reconciliation only and never prepares either queue',async()=>{
  const calls=[];
  const cycle=createFairCycle({queues:['admin','bookings'].map(name=>({name,run:async options=>{calls.push(options);return {status:'idle'};}})),
    hasPendingAuthorityAttempt:async()=>{throw Error('not_needed_when_paused');},writesEnabled:()=>false});
  await cycle();assert.equal(calls.length,2);
  assert.equal(calls.every(c=>!c.writesEnabled&&!c.prepareEnabled),true);
});
