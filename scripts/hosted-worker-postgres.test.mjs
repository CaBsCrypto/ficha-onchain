import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@stellar/stellar-sdk';
import { sessionGuard, waitForAuthorityLock } from './lib/private-worker-session.mjs';

test('real PostgreSQL: exclusion, lost session and takeover', {skip:process.env.TRUSTLEAF_TEST_POSTGRES!=='local-ci'}, async()=>{
  const {default:pg}=await import('../infra/worker/node_modules/pg/lib/index.js');
  // Fixed loopback-only ephemeral CI database: never consume DATABASE_URL here.
  const config={host:'127.0.0.1',port:5432,user:'worker_test',password:'worker_test',database:'worker_test'};
  const a=new pg.Client(config),b=new pg.Client(config);await a.connect();await b.connect();
  const authority=Keypair.random().publicKey(),signal=new AbortController().signal;
  let guard;
  try {
    assert.equal(await waitForAuthorityLock(a,authority,{watch:false,signal,log:()=>{}}),true);
    assert.equal(await waitForAuthorityLock(b,authority,{watch:false,signal,log:()=>{}}),false);
    guard=sessionGuard(a,authority,signal);await guard.assert();
    await a.query('SELECT pg_advisory_unlock_all()');
    await assert.rejects(guard.assert(),/unavailable/);
    assert.equal(await waitForAuthorityLock(b,authority,{watch:false,signal,log:()=>{}}),true);
    const g=sessionGuard(b,authority,signal);
    await g.assert();await b.end();await assert.rejects(g.assert(),/unavailable/);g.dispose();
  } finally {guard?.dispose();await a.end();await b.end().catch(()=>{});}
});
