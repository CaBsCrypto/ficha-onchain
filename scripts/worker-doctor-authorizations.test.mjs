import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Account, Keypair, Networks, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import { runOnce, validateRequest, assertExpectedState, createChain, createStore, acquireSignerLock } from './worker-doctor-authorizations.mjs';
import { PRIVATE_REGISTRY_ID, readAuthorization } from './lib/private-registry.mjs';
import { commitmentFor, encryptDossier } from './lib/private-doctor-dossier.mjs';

const doctor = Keypair.random().publicKey(), authority = Keypair.random(), relayer = Keypair.random();
const future = () => Math.floor(Date.now() / 1000) + 600;
function fixture(patch = {}) {
  let job = { id: 'request', doctor_id: 1, doctor_email: 'doctor@example.test', doctor_user_id: 'did:privy:doctor', wallet_id: 'wallet',
    network: 'testnet', contract_id: PRIVATE_REGISTRY_ID, wallet: doctor, action: 'authorize', method: 'authorize_doctor',
    expected_version: 0, target_version: 1, commitment: 'a'.repeat(64), valid_until: future(), ...patch };
  const calls = [];
  const store = {
    claim: async () => ({ ...job }), eligible: async () => true,
    prepared: async (j, p) => { calls.push('persist'); job = { ...j, prepared_xdr: p.xdr, transaction_hash: p.hash }; return { ...job }; },
    complete: async (_, state) => calls.push('complete:' + state), fail: async (_, code) => calls.push('fail:' + code),
    note: async (_, code) => calls.push('note:' + code), release: async () => calls.push('release'),
  };
  const chain = {
    receipt: async () => ({ status: 'NOT_FOUND' }), expired: async () => false, verifyEnvelope: async () => {},
    authorization: async () => ({ authorization: null, authorized: false }), validateIdentity: async () => {},
    prepare: async () => { calls.push('prepare'); return { xdr: 'signed-envelope', hash: 'hash' }; },
    submit: async xdr => calls.push('submit:' + xdr),
  };
  return { store, chain, calls, writesEnabled: true, get job() { return job; } };
}
function confirmed(job, patch = {}) {
  return { authorized: job.action !== 'revoke', authorization: { commitment: job.commitment, version: job.target_version,
    schema_version: 1, valid_until: Number(job.valid_until), revoked: job.action === 'revoke', ...patch } };
}

test('signed envelope persists before broadcast; RPC loss/restart resubmits the same attempt', async () => {
  const f = fixture();
  f.chain.submit = async () => { f.calls.push('lost-response'); throw Error('rpc_down'); };
  assert.equal((await runOnce(f)).status, 'needs_reconciliation');
  assert.deepEqual(f.calls, ['prepare', 'persist', 'lost-response', 'note:worker_attempt_incomplete', 'release']);
  f.calls.length = 0; f.chain.submit = async xdr => f.calls.push('retry:' + xdr);
  assert.equal((await runOnce(f)).reusedEnvelope, true);
  assert.deepEqual(f.calls, ['retry:signed-envelope', 'release']);
});

test('confirmed receipt must match exact record and only then updates doctor status', async () => {
  for (const patch of [{ version: 2 }, { commitment: 'b'.repeat(64) }, { valid_until: 1 }, { revoked: true }]) {
    const f = fixture({ transaction_hash: 'hash', prepared_xdr: 'signed' });
    f.chain.receipt = async () => ({ status: 'SUCCESS' }); f.chain.authorization = async () => confirmed(f.job, patch);
    assert.equal((await runOnce(f)).status, 'needs_reconciliation');
    assert.equal(f.calls.some(c => c.startsWith('complete')), false);
  }
  const f = fixture({ transaction_hash: 'hash', prepared_xdr: 'signed' });
  f.chain.receipt = async () => ({ status: 'SUCCESS' }); f.chain.authorization = async () => confirmed(f.job);
  assert.equal((await runOnce(f)).status, 'confirmed'); assert.deepEqual(f.calls, ['complete:active', 'release']);
});

test('confirmed revoked is blocked; expired or paused authorization never reports active', async () => {
  for (const revoke of [false, true]) {
    const f = fixture({ transaction_hash: 'hash', prepared_xdr: 'signed', ...(revoke ? { action: 'revoke', method: 'revoke_doctor', expected_version: 1 } : {}) });
    f.chain.receipt = async () => ({ status: 'SUCCESS' });
    f.chain.authorization = async () => ({ ...confirmed(f.job), authorized: false });
    await runOnce(f);
    assert.equal(f.calls[0], revoke ? 'complete:blocked' : 'complete:pending');
  }
});

test('expired/unknown persisted transaction is retained without re-signing', async () => {
  const f = fixture({ transaction_hash: 'hash', prepared_xdr: 'signed' });
  f.chain.expired = async () => true;
  assert.equal((await runOnce(f)).status, 'expired_needs_reconciliation');
  assert.deepEqual(f.calls, ['note:expired_needs_reconciliation', 'release']);
  assert.equal(f.job.transaction_hash, 'hash');
});

test('failed receipt is terminal; invalid saved envelope cannot transmit', async () => {
  const f = fixture({ transaction_hash: 'hash', prepared_xdr: 'signed' });
  f.chain.receipt = async () => ({ status: 'FAILED' }); await runOnce(f);
  assert.deepEqual(f.calls, ['fail:transaction_failed', 'release']);
  const g = fixture({ transaction_hash: 'hash', prepared_xdr: 'signed' });
  g.chain.verifyEnvelope = async () => { throw Error('bad_hash'); }; await runOnce(g);
  assert.deepEqual(g.calls, ['note:worker_attempt_incomplete', 'release']);
});

test('changed identity, stale registry and lease lost stop new writes before broadcast', async () => {
  const f = fixture(); f.store.eligible = async () => false; await runOnce(f);
  assert.deepEqual(f.calls, ['fail:doctor_binding_changed', 'release']);
  const g = fixture(); g.chain.authorization = async () => confirmed(g.job); await runOnce(g);
  assert.deepEqual(g.calls, ['fail:registry_state_changed', 'release']);
  const h = fixture(); h.store.prepared = async () => { throw Error('lease_lost'); }; await runOnce(h);
  assert.deepEqual(h.calls, ['prepare', 'note:worker_attempt_incomplete', 'release']);
  const i = fixture(); let checks = 0; i.store.eligible = async () => ++checks === 1; await runOnce(i);
  assert.deepEqual(i.calls, ['prepare', 'fail:doctor_binding_changed', 'release']);
});

test('duplicate worker claim is idle and an uncertain attempt never rebuilds after identity change', async () => {
  const f = fixture(); f.store.claim = async () => null;
  assert.equal((await runOnce(f)).status, 'idle'); assert.deepEqual(f.calls, []);
  const g = fixture({ transaction_hash: 'hash', prepared_xdr: 'signed' }); g.store.eligible = async () => false; await runOnce(g);
  assert.deepEqual(g.calls, ['note:doctor_binding_changed', 'release']);
});

test('write kill switch still confirms saved receipts but cannot sign or resubmit',async()=>{
  const initial=fixture();initial.writesEnabled=false;
  assert.equal((await runOnce(initial)).status,'writes_paused');assert.deepEqual(initial.calls,['release']);
  const pending=fixture({transaction_hash:'hash',prepared_xdr:'signed'});pending.writesEnabled=false;
  assert.equal((await runOnce(pending)).status,'writes_paused');assert.deepEqual(pending.calls,['release']);
  pending.chain.receipt=async()=>({status:'SUCCESS'});pending.chain.authorization=async()=>confirmed(pending.job);
  assert.equal((await runOnce(pending)).status,'confirmed');assert.equal(pending.calls.includes('complete:active'),true);
});

test('method allowlist and version/expiry guards reject stale or unrelated requests', () => {
  for (const patch of [{ network: 'mainnet' }, { contract_id: doctor }, { method: 'transfer' }, { target_version: 2 }, { commitment: '0'.repeat(64) }]) {
    assert.throws(() => validateRequest(fixture(patch).job), /request_invalid/);
  }
  const renewal = fixture({ action: 'renew', method: 'renew_authorization', expected_version: 1, target_version: 2 });
  const a = { commitment: 'c'.repeat(64), version: 1, valid_until: future(), revoked: false };
  assert.doesNotThrow(() => assertExpectedState(renewal.job, { authorization: a, authorized: true }));
  assert.throws(() => assertExpectedState(renewal.job, { authorization: { ...a, revoked: true }, authorized: false }));
  assert.throws(() => assertExpectedState(renewal.job, { authorization: { ...a, valid_until: 1 }, authorized: false }));
  renewal.job.method = 'reauthorize_doctor';
  const reauth = { ...renewal.job, method: 'reauthorize_doctor' };
  assert.doesNotThrow(() => assertExpectedState(reauth, { authorization: { ...a, revoked: true }, authorized: false }));
  assert.throws(() => assertExpectedState(reauth, { authorization: a, authorized: true }));
});

function rpcFixture(overrides = {}) {
  const reads = [], now = future();
  const results = { interface_version: 1, get_admin: authority.publicKey(), get_authorization: { commitment: Buffer.alloc(32, 1), schema_version: 1, version: 1, valid_until: BigInt(now), revoked: false }, is_authorized: true, ...overrides };
  const server = { getAccount: async () => new Account(authority.publicKey(), '2'), simulateTransaction: async tx => {
    const method = tx.operations[0].func.invokeContract().functionName().toString(); reads.push(method);
    const value = results[method];
    if (value instanceof Error) return { error: value.message, id: 'sim', latestLedger: 1, events: [] };
    return { id: 'sim', latestLedger: 1, events: [], transactionData: {}, minResourceFee: '100', result: { auth: [], retval: nativeToScVal(value) } };
  } };
  return { server, reads };
}

test('registry reader checks fixed ID, interface and authority, includes pause in authorized result', async () => {
  const input = { wallet: doctor, source: authority.publicKey(), registryId: PRIVATE_REGISTRY_ID, expectedAdmin: authority.publicKey() };
  const f = rpcFixture({ is_authorized: false });
  const result = await readAuthorization({ ...input, server: f.server });
  assert.equal(result.authorized, false); assert.equal(result.authorization.version, 1);
  assert.equal(result.authorization.commitment, '01'.repeat(32));
  for (const override of [{ interface_version: 2 }, { get_admin: doctor }]) {
    await assert.rejects(readAuthorization({ ...input, server: rpcFixture(override).server }));
  }
  await assert.rejects(readAuthorization({ ...input, registryId: doctor, server: f.server }));
});

test('only precise Missing for get_authorization becomes absent; generic failures stay failures', async () => {
  const input = { wallet: doctor, source: authority.publicKey(), registryId: PRIVATE_REGISTRY_ID, expectedAdmin: authority.publicKey() };
  const f = rpcFixture({ get_authorization: Error('HostError: Error(Contract, #1)\nEvent log'), is_authorized: false });
  assert.equal((await readAuthorization({ ...input, server: f.server })).authorization, null);
  for (const error of ['HostError: Error(Contract, #2)', 'RPC unavailable #1', 'HostError: Error(Storage, MissingValue)', 'error nested Error(Contract, #1)']) {
    await assert.rejects(readAuthorization({ ...input, server: rpcFixture({ get_authorization: Error(error) }).server }), /registry_read_failed/);
  }
  await assert.rejects(readAuthorization({ ...input, server: rpcFixture({ get_admin: Error('HostError: Error(Contract, #1)') }).server }));
});

function providerFixture() {
  const user = { id: 'did:privy:doctor', email: { address: 'doctor@example.test' }, linkedAccounts: [{ type: 'wallet', chainType: 'stellar', id: 'wallet', address: doctor }] };
  const wallet = { id: 'wallet', address: doctor, chainType: 'stellar' };
  return { user, wallet, provider: { getUser: async () => user, walletApi: { getWallet: async () => wallet } } };
}

test('Privy current identity rejects wrong email, wallet, chain and archived wallet', async () => {
  for (const mutate of [f => f.user.email.address = 'other@example.test', f => f.user.id = 'other',
    f => f.user.linkedAccounts = [], f => f.wallet.address = authority.publicKey(), f => f.wallet.chainType = 'ethereum',
    f => f.wallet.archivedAt = '2026-09-09']) {
    const f = providerFixture(); mutate(f);
    const chain = createChain({ authority: authority.publicKey(), relayer, signXdr: async () => {}, provider: f.provider });
    await assert.rejects(chain.validateIdentity(fixture().job), /doctor_binding_changed/);
  }
  const f = providerFixture(); f.wallet.ownerId = 'key-quorum-id';
  await createChain({ authority: authority.publicKey(), relayer, provider: f.provider }).validateIdentity(fixture().job);
});

test('adapter signs only verified dossier and saved fee-bump must match exact job', async () => {
  const f = rpcFixture({ get_authorization: Error('HostError: Error(Contract, #1)'), is_authorized: false });
  const key = 'a'.repeat(64), id = 'dossier-id';
  const d = { schemaVersion: 1, network: 'testnet', contractId: PRIVATE_REGISTRY_ID, wallet: doctor, version: 1,
    validUntil: future(), fullName: 'Synthetic Doctor', license: 'TEST', specialty: 'Synthetic', verificationSource: 'Test',
    reviewedBy: 'did:privy:admin', reviewedAt: '2026-09-09', blinding: 'b'.repeat(64) };
  const job = fixture({ valid_until: d.validUntil, commitment: commitmentFor(d), dossier_id: id, requested_by: d.reviewedBy,
    encrypted_dossier: encryptDossier(d, key, id) }).job;
  let signs = 0;
  f.server.prepareTransaction = async tx => tx;
  const chain = createChain({ authority: authority.publicKey(), relayer, provider: providerFixture().provider, dataKey: key, server: f.server,
    signXdr: async xdr => { signs++; const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET); tx.sign(authority); return tx.toXDR(); } });
  const prepared = await chain.prepare(job);
  assert.equal(signs, 1);
  const saved = { ...job, prepared_xdr: prepared.xdr, transaction_hash: prepared.hash };
  await chain.verifyEnvelope(saved);
  await assert.rejects(chain.verifyEnvelope({ ...saved, commitment: 'c'.repeat(64) }), /saved_envelope_invalid/);
  await assert.rejects(chain.verifyEnvelope({ ...saved, transaction_hash: '0'.repeat(64) }), /saved_envelope_invalid/);
  await assert.rejects(chain.prepare({ ...job, dossier_id: 'other' }), /dossier_invalid/);
  await assert.rejects(chain.prepare({ ...job, requested_by: 'other' }), /dossier_invalid/);
  assert.equal(signs, 1);
});

test('SQL store rolls back confirmation after lease loss and retains envelope fields', async () => {
  const calls = [];
  const store = createStore({ query: async (sql, values) => { calls.push([sql, values]); return { rows: [], rowCount: 0 }; } });
  await assert.rejects(store.complete({ id: 'request' }, 'active'), /lease_lost/);
  assert.equal(calls[0][0], 'BEGIN'); assert.equal(calls.at(-1)[0], 'ROLLBACK');
  assert.equal(calls.some(([sql]) => /UPDATE doctors/.test(sql)), false);
  assert.equal(calls.some(([sql]) => /prepared_xdr=NULL|transaction_hash=NULL/.test(sql)), false);
});

test('SQL eligibility uses verified binding and doctor email, not caller-editable user profile', async () => {
  const calls = [];
  const store = createStore({ query: async (sql, values) => {
    calls.push([sql, values]);
    return { rows: sql.includes('FROM doctor_onboarding_requests') ? [] : sql.startsWith('SELECT status') ? [{ status: 'active' }] : [{ id: 'request' }], rowCount: 1 };
  } });
  assert.equal(await store.eligible({ id: 'request' }), true);
  assert.match(calls[0][0], /privy_stellar_wallet_bindings/); assert.match(calls[0][0], /r.doctor_email/);
  assert.doesNotMatch(calls[0][0], /registered_users/);
});

test('reviewed eligibility requires the exact submission, owner and pending approval request', async () => {
  const job = { id: 'request', doctor_id: 1, onboarding_submission_id: 'revision', doctor_user_id: 'owner', wallet_id: 'wallet-id', wallet: doctor, doctor_email: 'test@example.test', action: 'authorize' };
  const valid = { state: 'authorization_pending', authorization_request_id: job.id, current_submission_id: 'revision',
    privy_user_id: 'owner', wallet_id: 'wallet-id', wallet: doctor, submission_user: 'owner', submission_wallet_id: 'wallet-id', submission_wallet: doctor, submission_email: job.doctor_email };
  for (const [override, expected] of [[{}, true], [{ current_submission_id: 'stale' }, false], [{ state: 'changes_requested' }, false], [{ authorization_request_id: 'other' }, false], [{ submission_user: 'other' }, false]]) {
    const store = createStore({ query: async sql => ({ rows: sql.includes('FROM doctor_onboarding_requests') ? [{ ...valid, ...override }] : [{ id: job.id }] }) });
    assert.equal(await store.eligible(job), expected);
  }
});

test('legacy pending profiles cannot be signed without a reviewed onboarding revision', async () => {
  const store = createStore({ query: async sql => ({ rows: sql.includes('FROM doctor_onboarding_requests') ? [] : sql.startsWith('SELECT status') ? [{ status: 'pending' }] : [{ id: 'request' }] }) });
  assert.equal(await store.eligible({ id: 'request', doctor_id: 1 }), false);
});

test('revocation with no dossier_id updates exact historical dossier and retains its original receipt', async () => {
  const calls = [];
  const store = createStore({ query: async (sql, values) => { calls.push([sql, values]); return { rows: [], rowCount: 1 }; } });
  const job = fixture({ action: 'revoke', method: 'revoke_doctor', expected_version: 1, dossier_id: null, transaction_hash: 'revoke-hash' }).job;
  await store.complete(job, 'blocked');
  const update = calls.find(([sql]) => sql.includes('UPDATE doctor_private_dossiers'));
  assert.match(update[0], /status='revoked'/);
  assert.doesNotMatch(update[0], /transaction_hash/);
  assert.deepEqual(update[1], ['testnet', PRIVATE_REGISTRY_ID, doctor, 1, job.commitment]);
  assert.equal(calls.at(-1)[0], 'COMMIT');
});

test('filesystem signer lock blocks another database/process until released', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustleaf-worker-test-'));
  try {
    const release = await acquireSignerLock(dir, authority.publicKey());
    assert.equal(await acquireSignerLock(dir, authority.publicKey()), null);
    await release();
    const again = await acquireSignerLock(dir, authority.publicKey()); assert.equal(typeof again, 'function'); await again();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('abrupt restart recovers only proven dead same-host owner; concurrent recovery has one winner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustleaf-worker-recovery-test-'));
  try {
    const initial = await acquireSignerLock(dir, authority.publicKey()); await initial();
    const path = join(dir, '.trustleaf-worker-locks', authority.publicKey() + '.lock');
    const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8', windowsHide: true });
    assert.equal(child.status, 0);
    const dead = { pid: Number(child.stdout), host: hostname(), token: 'dead-process-token' };
    await writeFile(path, JSON.stringify(dead));
    const [first, second] = await Promise.all([acquireSignerLock(dir, authority.publicKey()), acquireSignerLock(dir, authority.publicKey())]);
    assert.equal([first, second].filter(Boolean).length, 1);
    const current = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(current.pid, process.pid); assert.notEqual(current.token, dead.token);
    await (first ?? second)();
    for (const previous of [{ ...dead, host: 'different-host' }, { pid: dead.pid }, { ...dead, pid: process.pid }]) {
      await writeFile(path, JSON.stringify(previous));
      assert.equal(await acquireSignerLock(dir, authority.publicKey()), null);
      assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), previous);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
