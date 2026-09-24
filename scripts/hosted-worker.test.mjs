// Isolated tests: random throwaway keys, no network or production configuration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Account, Contract, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { secretFileSigner, workerConfiguration, PRIVATE_PRESCRIPTION_ID, PRIVY_APP_ID } from './lib/private-worker-runtime.mjs';
import { PRIVATE_REGISTRY_ID } from './lib/private-registry.mjs';
import { sessionGuard, guardedChain, waitForAuthorityLock, pause } from './lib/private-worker-session.mjs';

const authority = Keypair.random();
const host = 'ep-synthetic.c-3.us-east-1.aws.neon.tech';
const env = () => ({ TRUSTLEAF_ENV:'test', DATABASE_URL:`postgresql://fake:fake@${host}/test`, TRUSTLEAF_DB_HOST:host,
  TRUSTLEAF_AUTHORITY_DATABASE_HOST:host, TRUSTLEAF_SIGNER_MODE:'secret-file', STELLAR_NETWORK:'testnet',
  TRUSTLEAF_AUTHORITY_SECRET_FILE:'/synthetic/key', STELLAR_CONFIG_DIR:'/tmp/worker', PRIVY_APP_ID,
  DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:PRIVATE_REGISTRY_ID, PRESCRIPTION_PRIVATE_CONTRACT_ID:PRIVATE_PRESCRIPTION_ID,
  DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:authority.publicKey(), BOOKING_AUTHORITY_PUBLIC_KEY:authority.publicKey(),
  PRIVY_APP_SECRET:'synthetic', RELAYER_SECRET:'synthetic', TRUSTLEAF_DATA_KEY:'synthetic' });

test('hosted mode rejects pooled DB, mismatched authority host, network and missing key configuration', () => {
  assert.equal(workerConfiguration(env()).writesEnabled, false);
  for (const patch of [{STELLAR_NETWORK:'public'}, {TRUSTLEAF_AUTHORITY_DATABASE_HOST:'other.neon.tech'},
    {TRUSTLEAF_AUTHORITY_SECRET_FILE:''}, {TRUSTLEAF_SIGNER_MODE:'unknown'},
    {DATABASE_URL:`postgresql://fake:fake@ep-synthetic-pooler.c-3.us-east-1.aws.neon.tech/test`,TRUSTLEAF_DB_HOST:'ep-synthetic-pooler.c-3.us-east-1.aws.neon.tech'}]) {
    assert.throws(() => workerConfiguration({...env(),...patch}));
  }
});

test('mounted signer validates its key and signs only the authority Testnet transaction', async () => {
  const dir=await mkdtemp(join(tmpdir(),'tl-hosted-'));
  try {
    const path=join(dir,'key');
    await assert.rejects(secretFileSigner({path,authority:authority.publicKey(),network:'testnet'}),/authority_secret_unavailable/);
    await writeFile(path,authority.secret(),{mode:0o600});
    await assert.rejects(secretFileSigner({path,authority:Keypair.random().publicKey(),network:'testnet'}),/mismatch/);
    await assert.rejects(secretFileSigner({path,authority:authority.publicKey(),network:'public'}),/configuration/);
    const sign=await secretFileSigner({path,authority:authority.publicKey(),network:'testnet'});
    const tx=new TransactionBuilder(new Account(authority.publicKey(),'1'),{fee:'100',networkPassphrase:Networks.TESTNET})
      .addOperation(new Contract(PRIVATE_REGISTRY_ID).call('interface_version')).setTimeout(60).build();
    const signed=TransactionBuilder.fromXDR(await sign(tx.toXDR()),Networks.TESTNET);
    assert.equal(signed.hash().toString('hex'),tx.hash().toString('hex'));
    assert.equal(authority.verify(tx.hash(),signed.signatures[0].signature()),true);
    const otherNetwork=TransactionBuilder.fromXDR(signed.toXDR(),Networks.PUBLIC);
    assert.equal(authority.verify(otherNetwork.hash(),signed.signatures[0].signature()),false);
    await assert.rejects(sign(signed.toXDR()),/envelope_invalid/);
    await assert.rejects(sign('invalid'),/envelope_invalid/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

function client() { const c=new EventEmitter(); c.owned=true; c.query=async()=>({rows:[{owned:c.owned}]}); return c; }
test('lost lock and connection errors permanently prevent later prepare and submit',async()=>{
  for (const failure of ['lock','error','end','query']) {
    const c=client(), controller=new AbortController(); const guard=sessionGuard(c,authority.publicKey(),controller.signal);
    let signed=0,sent=0;
    const chain=guardedChain({prepare:async()=>++signed,submit:async()=>++sent},guard);
    await chain.prepare();
    if(failure==='lock')c.owned=false;
    else if(failure==='query')c.query=async()=>{throw Error('sensitive database error');};
    else c.emit(failure,new Error('sensitive connection error'));
    await assert.rejects(chain.submit(),/worker_session_unavailable/);
    await assert.rejects(chain.prepare(),/worker_session_unavailable/);
    c.owned=true;
    await assert.rejects(chain.submit(),/worker_session_unavailable/);
    assert.equal(signed,1);assert.equal(sent,0);guard.dispose();
  }
});
test('loss during preparation prevents returning an envelope for persistence or transmission',async()=>{
  const c=client(), guard=sessionGuard(c,authority.publicKey(),new AbortController().signal);
  const chain=guardedChain({prepare:async()=>{c.owned=false;return 'envelope';},submit:async()=>assert.fail('no send')},guard);
  await assert.rejects(chain.prepare(),/worker_session_unavailable/); guard.dispose();
});
test('two sessions cannot own the authority together; waiting retries after release',async()=>{
  let owner=null;const signal=new AbortController().signal;
  const make=id=>({query:async()=>({rows:[{locked:owner===null?(owner=id,true):false}]})});
  const a=make('a'),b=make('b');const logs=[];
  assert.equal(await waitForAuthorityLock(a,'key',{watch:false,signal,log:x=>logs.push(x)}),true);
  assert.equal(await waitForAuthorityLock(b,'key',{watch:false,signal,log:x=>logs.push(x)}),false);
  assert.equal(await waitForAuthorityLock(b,'key',{watch:true,signal,log:x=>logs.push(x),wait:async()=>{owner=null;}}),true);
  assert.equal(owner,'b');assert.ok(logs.every(x=>x.status==='waiting_for_lock'));
});
test('shutdown while waiting cancels promptly and forbids new transmissions',async()=>{
  const controller=new AbortController(), logs=[];
  const waiting=waitForAuthorityLock({query:async()=>({rows:[{locked:false}]})},'key',{
    watch:true,signal:controller.signal,log:x=>{logs.push(x);controller.abort();}});
  assert.equal(await waiting,false);assert.equal(logs.length,1);
  await pause(controller.signal,60000);
  const c=client(),guard=sessionGuard(c,authority.publicKey(),controller.signal);
  await assert.rejects(guardedChain({submit:async()=>assert.fail('send')},guard).submit(),/unavailable/);guard.dispose();
});

test('actual SIGTERM exits a waiting worker without removing the other owner lock',
  { skip: process.platform === 'win32', timeout: 10000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tl-worker-signal-'));
  let child;
  try {
    const keyPath = join(dir, 'key');
    await writeFile(keyPath, authority.secret(), { mode: 0o600 });
    const lockDir = join(dir, '.trustleaf-worker-locks');
    await mkdir(lockDir);
    const lockPath = join(lockDir, authority.publicKey() + '.lock');
    const owner = JSON.stringify({ pid: process.pid, host: hostname(), token: 'test-owner' });
    await writeFile(lockPath, owner);
    child = spawn(process.execPath, [fileURLToPath(new URL('./worker-private-portal.mjs', import.meta.url)), '--watch'], {
      env: { ...process.env, ...env(), STELLAR_CONFIG_DIR: dir, TRUSTLEAF_AUTHORITY_SECRET_FILE: keyPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        output += data;
        if (output.includes('waiting_for_local_lock')) resolve();
      });
      child.once('error', reject);
      child.once('exit', () => reject(Error('worker exited before waiting')));
    });
    child.kill('SIGTERM');
    assert.deepEqual(await exited, { code: 0, signal: null });
    assert.match(output, /stopped/);
    assert.equal(await readFile(lockPath, 'utf8'), owner);
    assert.equal(output.includes(authority.secret()), false);
  } finally {
    if (child && child.exitCode === null) child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});
