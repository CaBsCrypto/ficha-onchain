import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Account, Keypair, Networks, TransactionBuilder, SorobanDataBuilder, xdr, nativeToScVal } from '@stellar/stellar-sdk';
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
    return { id: 'sim', latestLedger: 1, events: [], transactionData: new SorobanDataBuilder(), minResourceFee: '100', result: { auth: [], retval: nativeToScVal(value) } };
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
    const chain = createChain({ assertSponsorship: () => {},  authority: authority.publicKey(), relayer, signXdr: async () => {}, provider: f.provider });
    await assert.rejects(chain.validateIdentity(fixture().job), /doctor_binding_changed/);
  }
  const f = providerFixture(); f.wallet.ownerId = 'key-quorum-id';
  await createChain({ assertSponsorship: () => {},  authority: authority.publicKey(), relayer, provider: f.provider }).validateIdentity(fixture().job);
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
  const chain = createChain({ assertSponsorship: () => {},  authority: authority.publicKey(), relayer, provider: providerFixture().provider, dataKey: key, server: f.server,
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

const scopedId = '11111111-2222-3333-4444-555555555555';
test('scoped worker claims only the selected UUID and cannot touch a mismatched queue item', async () => {
  const f = fixture({ id: scopedId });
  let claim;
  const original = f.store.claim;
  f.store.claim = async options => { claim = options; return original(); };
  assert.equal((await runOnce({ ...f, requestId: scopedId })).status, 'submitted');
  assert.deepEqual(claim, { signedOnly: false, requestId: scopedId });
  const g = fixture();
  await assert.rejects(runOnce({ ...g, requestId: scopedId }), /authorization_scope_rejected/);
  assert.deepEqual(g.calls, []);
  await assert.rejects(runOnce({ ...g, requestId: 'not-uuid' }), /authorization_scope_rejected/);
});

test('scoped SQL claim and every lifecycle method fail closed for another request', async () => {
  const calls = [];
  const store = createStore({ query: async (sql, values) => { calls.push([sql, values]); return { rows: [] }; } }, { requestId: scopedId });
  await store.claim();
  assert.match(calls[0][0], /id=\$4::uuid/);
  assert.equal(calls[0][1][3], scopedId);
  calls.length = 0;
  for (const run of [() => store.claim({ requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
    () => store.eligible({ id: 'other' }), () => store.prepared({ id: 'other' }, {}), () => store.complete({ id: 'other' }, 'active'),
    () => store.fail({ id: 'other' }, 'x'), () => store.note({ id: 'other' }, 'x'), () => store.release({ id: 'other' })]) {
    await assert.rejects(run(), /authorization_scope_rejected/);
  }
  assert.deepEqual(calls, []);
  assert.throws(() => createStore({}, { requestId: 'not-uuid' }), /authorization_scope_rejected/);
});

function preparedFixture(extra = {}) {
  const f = rpcFixture({ get_authorization: Error('HostError: Error(Contract, #1)'), is_authorized: false });
  const key = 'af'.repeat(32), id = 'synthetic-dossier';
  const d = { schemaVersion: 1, network: 'testnet', contractId: PRIVATE_REGISTRY_ID, wallet: doctor, version: 1,
    validUntil: future(), fullName: 'Synthetic Doctor', license: 'TEST', specialty: 'Synthetic', verificationSource: 'Test',
    reviewedBy: 'did:privy:admin', reviewedAt: '2026-10-23', blinding: 'cd'.repeat(32) };
  const job = fixture({ id: scopedId, valid_until: d.validUntil, commitment: commitmentFor(d), dossier_id: id, requested_by: d.reviewedBy,
    encrypted_dossier: encryptDossier(d, key, id) }).job;
  let signs = 0, sends = 0;
  f.server.prepareTransaction = async tx => extra.requestId === undefined ? tx : TransactionBuilder.cloneFrom(tx)
    .setSorobanData(new SorobanDataBuilder().build()).build();
  f.server.sendTransaction = async () => { sends++; return { status: 'PENDING' }; };
  const options = { assertSponsorship: () => {}, authority: authority.publicKey(), relayer, dataKey: key, provider: providerFixture().provider, server: f.server,
    signXdr: async envelope => { signs++; const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET); tx.sign(authority); return tx.toXDR(); }, ...extra };
  return { ...f, options, job, chain: createChain(options), get signs() { return signs; }, get sends() { return sends; } };
}

test('offered fee cap and policy time window are checked before signing', async () => {
  const f = preparedFixture({ maxFeeStroops: '10000000', until: future() });
  f.server.prepareTransaction = async tx => new TransactionBuilder(new Account(authority.publicKey(), '2'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(tx.toEnvelope().v1().tx().operations()[0]).setSorobanData(new SorobanDataBuilder().setResourceFee('20000000').build()).setTimeout(180).build();
  await assert.rejects(f.chain.prepare(f.job), /authorization_fee_budget_exceeded/);
  assert.equal(f.signs, 0); assert.equal(f.sends, 0);
  const g = preparedFixture({ until: Math.floor(Date.now()/1000) + 60 });
  await assert.rejects(g.chain.prepare(g.job), /authorization_window_expired/);
  assert.equal(g.signs, 0); assert.equal(g.sends, 0);
});

test('scoped signing callback can reject a changed policy immediately before the signer', async () => {
  const phases = [];
  const f = preparedFixture({ requestId: scopedId, maxFeeStroops: '10000000', until: future(),
    assertJob: async (job, phase) => { phases.push(phase); assert.equal(job.id, scopedId); if (phase === 'sign') throw Error('authorization_scope_rejected'); } });
  await assert.rejects(f.chain.prepare(f.job), /authorization_scope_rejected/);
  assert.equal(f.signs, 0); assert.equal(f.sends, 0); assert.ok(phases.includes('sign'));
  phases.length = 0;
  await assert.rejects(f.chain.prepare({ ...f.job, id: 'other' }), /authorization_scope_rejected/);
  assert.deepEqual(phases, []);
});

test('saved or retry envelope above a scoped cap cannot be accepted or submitted', async () => {
  const f = preparedFixture({ requestId: scopedId });
  const prepared = await f.chain.prepare(f.job);
  const bounded = createChain({ assertSponsorship: () => {},  ...f.options, requestId: scopedId, maxFeeStroops: '3999999', until: future() });
  const job = { ...f.job, prepared_xdr: prepared.xdr, transaction_hash: prepared.hash };
  await assert.rejects(bounded.verifyEnvelope(job), /authorization_fee_budget_exceeded/);
  await assert.rejects(bounded.submit(prepared.xdr, job), /authorization_fee_budget_exceeded/);
  assert.equal(f.sends, 0);
});

test('scoped valid envelope retains the same hash and rechecks policy on every submit', async () => {
  const phases = [];
  let allowed = true;
  const f = preparedFixture({ requestId: scopedId, maxFeeStroops: '10000000', until: future(), assertJob: async (_job, phase) => {
    phases.push(phase); if (!allowed) throw Error('authorization_scope_rejected');
  } });
  const prepared = await f.chain.prepare(f.job);
  const job = { ...f.job, prepared_xdr: prepared.xdr, transaction_hash: prepared.hash };
  await f.chain.verifyEnvelope(job); await f.chain.submit(prepared.xdr, job);
  assert.equal(f.sends, 1); assert.equal(f.signs, 1); assert.ok(phases.includes('verify')); assert.ok(phases.includes('submit'));
  allowed = false;
  await assert.rejects(f.chain.submit(prepared.xdr, job), /authorization_scope_rejected/);
  assert.equal(f.sends, 1); assert.equal(f.signs, 1);
});

test('authorization worker rejects archived reads and archived prepared resources without signing', async () => {
  const f = preparedFixture();
  const original = f.server.simulateTransaction;
  f.server.simulateTransaction = async tx => {
    const sim = await original(tx);
    if (!sim.error) {
      const data = sim.transactionData.build();
      data.ext(new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: [0] })));
      return { ...sim, transactionData: { build: () => data } };
    }
    return sim;
  };
  await assert.rejects(f.chain.prepare(f.job), /registry_read_failed/); assert.equal(f.signs, 0);
  const g = preparedFixture();
  g.server.prepareTransaction = async tx => {
    const data = new SorobanDataBuilder().build();
    data.ext(new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: [0] })));
    return new TransactionBuilder(new Account(authority.publicKey(), '2'), { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(tx.toEnvelope().v1().tx().operations()[0]).setSorobanData(data).setTimeout(180).build();
  };
  await assert.rejects(g.chain.prepare(g.job), /registry_read_failed/); assert.equal(g.signs, 0); assert.equal(g.sends, 0);
});


test('scoped renewal rejects an unprepared ext0 envelope before the signer while generic compatibility remains', async () => {
  const scoped = preparedFixture({ requestId: scopedId, maxFeeStroops: '10000000', until: future() });
  scoped.server.prepareTransaction = async tx => tx;
  await assert.rejects(scoped.chain.prepare(scoped.job), /request_invalid/);
  assert.equal(scoped.signs, 0); assert.equal(scoped.sends, 0);
  const generic = preparedFixture();
  await generic.chain.prepare(generic.job);
  assert.equal(generic.signs, 1); assert.equal(generic.sends, 0);
});


test('diagnostic phases pinpoint each await without leaking raw provider details or changing SQL codes', async () => {
  const secret = 'provider_token=PRIVATE_FIXTURE_SECRET connection=postgres://sensitive';
  for (const [phase, target, method, saved] of [
    ['eligibility', 'store', 'eligible', false], ['identity', 'chain', 'validateIdentity', false],
    ['authorization', 'chain', 'authorization', false], ['prepare', 'chain', 'prepare', false],
    ['persist', 'store', 'prepared', false], ['submit', 'chain', 'submit', false],
    ['reconcile', 'chain', 'receipt', true],
  ]) {
    const f = fixture(saved ? { transaction_hash: 'hash', prepared_xdr: 'signed' } : {});
    f[target][method] = async () => { throw Error(secret); };
    const result = await runOnce(f);
    assert.deepEqual(result, { status: 'needs_reconciliation', phase, reason: 'worker_attempt_incomplete' });
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.ok(f.calls.includes('note:worker_attempt_incomplete'));
    assert.equal(f.calls.some(value => value.startsWith('fail:')), false);
    assert.equal(f.calls.at(-1), 'release');
  }
});

test('only exact known diagnostic reasons are returned; recoverable signing and RPC errors stay pending', async () => {
  for (const [method, phase, reason] of [['prepare', 'prepare', 'secure_signing_failed'], ['authorization', 'authorization', 'registry_read_failed']]) {
    const f = fixture(); f.chain[method] = async () => { throw Error(reason); };
    assert.deepEqual(await runOnce(f), { status: 'needs_reconciliation', phase, reason });
    assert.deepEqual(f.calls, ['note:worker_attempt_incomplete', 'release']);
  }
  const f = fixture(); f.chain.prepare = async () => { throw Error('secure_signing_failed provider_token=PRIVATE_FIXTURE_SECRET'); };
  assert.deepEqual(await runOnce(f), { status: 'needs_reconciliation', phase: 'prepare', reason: 'worker_attempt_incomplete' });
});

test('diagnostics retain the original terminal failure code and never add a second preparation', async () => {
  const f = fixture(); f.chain.prepare = async () => { f.calls.push('prepare'); throw Error('dossier_invalid'); };
  assert.deepEqual(await runOnce(f), { status: 'failed', error: 'dossier_invalid', phase: 'prepare', reason: 'dossier_invalid' });
  assert.deepEqual(f.calls, ['prepare', 'fail:dossier_invalid', 'release']);
});

test('scoped renewal reserves and validates the ledger before invoking either signer',async()=>{
 const calls=[];const sponsorship={assertConfigured:async()=>calls.push('configured'),reserve:async()=>calls.push('reserve'),beforeSign:async()=>calls.push('ready-sign'),beforeSubmit:async()=>calls.push('ready-submit'),verifyBound:async()=>calls.push('verify-bound')};
 const f=preparedFixture({requestId:scopedId,sponsorship});
 const prepared=await f.chain.prepare(f.job);assert.equal(f.signs,1);assert.deepEqual(calls,['configured','reserve','ready-sign']);
 assert(Number.isSafeInteger(prepared.signedAt));const job={...f.job,prepared_xdr:prepared.xdr,transaction_hash:prepared.hash};
 await f.chain.verifyEnvelope(job);await f.chain.submit(prepared.xdr,job);assert.equal(f.sends,1);assert.deepEqual(calls.slice(3),['verify-bound','ready-submit']);
});
test('ledger reservation rejection prevents renewal signing and broadcast',async()=>{
 const f=preparedFixture({requestId:scopedId,sponsorship:{assertConfigured:async()=>{},reserve:async()=>{throw Error('clinical_rehearsal_budget_exceeded');},beforeSign:async()=>{throw Error('must_not_sign');}}});
 await assert.rejects(f.chain.prepare(f.job),/clinical_rehearsal_budget_exceeded/);assert.equal(f.signs,0);assert.equal(f.sends,0);
});
test('canonical sponsorship reconciliation completes before the authorization row becomes confirmed or failed',async()=>{
 for(const status of['SUCCESS','FAILED']){
  const f=fixture({transaction_hash:'hash',prepared_xdr:'signed'});f.chain.receipt=async()=>({status});f.chain.authorization=async()=>confirmed(f.job);
  f.chain.reconcileSponsorship=async()=>f.calls.push('settle-canonical');await runOnce(f);
  assert(f.calls.indexOf('settle-canonical')<f.calls.findIndex(v=>v.startsWith(status==='SUCCESS'?'complete:':'fail:')));
 }
 const f=fixture({transaction_hash:'hash',prepared_xdr:'signed'});f.chain.receipt=async()=>({status:'SUCCESS'});f.chain.reconcileSponsorship=async()=>{throw Error('sponsorship_receipt_mismatch');};
 assert.equal((await runOnce(f)).status,'needs_reconciliation');assert(!f.calls.some(c=>c.startsWith('complete:')));
});
test('renewal signed envelope and reservation binding persist within the same SQL transaction',async()=>{
 for(const reject of[false,true]){
  const calls=[];let inTransaction=false;const job={id:scopedId,doctor_id:10,dossier_id:'synthetic-dossier',action:'renew'},prepared={xdr:'signed-envelope',hash:'ab'.repeat(32),signedAt:1800000000};
  const client={query:async(sql)=>{calls.push(sql);
   if(sql==='BEGIN'){inTransaction=true;return{rows:[]};}if(sql==='COMMIT'||sql==='ROLLBACK'){inTransaction=false;return{rows:[]};}
   if(sql.startsWith('SELECT r.id'))return{rows:[{id:scopedId}]};if(sql.startsWith('SELECT o.*'))return{rows:[]};if(sql.startsWith('SELECT status FROM doctors'))return{rows:[{status:'active'}]};
   if(sql.startsWith('UPDATE doctor_authorization_requests'))return{rows:[{...job,prepared_xdr:prepared.xdr,transaction_hash:prepared.hash}]};return{rows:[]};}};
  const sponsorship={persistPrepared:async(j,p)=>{assert(inTransaction);assert.equal(j.id,scopedId);assert.equal(p.hash,prepared.hash);calls.push('atomic-reservation-bind');if(reject)throw Error('synthetic_ledger_failure');}};
  const store=createStore(client,{requestId:scopedId,sponsorship});
  if(reject){await assert.rejects(store.prepared(job,prepared),/synthetic_ledger_failure/);assert.equal(calls.at(-1),'ROLLBACK');assert(!calls.includes('COMMIT'));}
  else{await store.prepared(job,prepared);assert.equal(calls.at(-1),'COMMIT');assert(calls.indexOf('atomic-reservation-bind')<calls.indexOf('COMMIT'));}
  assert.equal(inTransaction,false);
 }
});
