import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrKey } from '@stellar/stellar-sdk';
import { sealClinicalVersion } from './clinical-crypto.mjs';
import { readClinicalVersion } from './clinical-read.mjs';

const wallet = seed => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, seed));
const deployment = { network: 'testnet', contractId: StrKey.encodeContract(Buffer.alloc(32, 1)) };
const request = { credential: 'synthetic-test-credential', historyId: '1'.repeat(64), entryId: '2'.repeat(64), version: 1 };

function fixture(role = 'doctor') {
  const context = {
    schemaVersion: 1, ...deployment, historyId: request.historyId, entryId: request.entryId,
    author: wallet(2), patient: wallet(3), version: 1, previousCommitment: null,
  };
  const actor = { userId: 'synthetic-user-1', sessionId: 'synthetic-session-1' };
  const binding = { userId: actor.userId, bindingId: 'synthetic-binding-1', wallet: role === 'patient' ? context.patient : context.author,
    role, revokedAt: null, verifiedAt: new Date(Date.now() - 60_000).toISOString() };
  const permission = { historyId: request.historyId, patient: context.patient, reader: binding.wallet, canRead: true, grantRevision: 1, doctorAuthorized: true };
  const keyring = { 'synthetic-kek-1': 'a'.repeat(64) };
  const content = Buffer.from(JSON.stringify({ note: 'SYNTHETIC PATIENT ONE ONLY' }));
  const metadata = { mediaType: 'application/json', fileName: 'private-name-one.json' };
  const sealed = sealClinicalVersion({ context, content, metadata, keyring, activeKeyId: 'synthetic-kek-1' });
  const evidence = { context, commitment: sealed.commitment, state: 'confirmed' };
  const counts = { authenticate: 0, binding: 0, access: 0, version: 0, storage: 0, keyring: 0 };
  const adapters = {
    deployment,
    authenticate: async credential => { counts.authenticate++; return credential === request.credential ? actor : null; },
    findBinding: async checkedActor => { counts.binding++; assert.equal(checkedActor.userId, actor.userId); return binding; },
    readAccess: async selector => { counts.access++; assert.deepEqual(selector, { deployment, historyId: request.historyId, reader: binding.wallet }); return permission; },
    readVersion: async selector => { counts.version++; assert.deepEqual(selector, { deployment, historyId: request.historyId, entryId: request.entryId, version: 1 }); return evidence; },
    loadEnvelope: async selector => {
      counts.storage++;
      assert.deepEqual(selector, { context, commitment: evidence.commitment, reader: binding.wallet });
      assert.ok(counts.authenticate > 0 && counts.binding > 0 && counts.access > 0 && counts.version > 0);
      return sealed.envelope;
    },
    getKeyring: async () => { counts.keyring++; return keyring; },
  };
  return { adapters, actor, binding, permission, context, evidence, sealed, keyring, content, metadata, counts };
}

const reject = async (adapters, overrides = {}) => assert.rejects(
  () => readClinicalVersion({ ...request, ...overrides }, adapters),
  error => {
    assert.equal(error.message, 'clinical_version_unavailable');
    assert.equal(error.cause, undefined);
    assert.equal(Object.hasOwn(error, 'content'), false);
    return true;
  },
);

test('patient reads own encrypted version with current binding and on-chain integrity evidence', async () => {
  const f = fixture('patient');
  f.permission.doctorAuthorized = false;
  const result = await readClinicalVersion(request, f.adapters);
  assert.deepEqual(result, { historyId: request.historyId, entryId: request.entryId, version: 1, content: f.content, metadata: f.metadata });
  assert.deepEqual(f.counts, { authenticate: 2, binding: 2, access: 2, version: 2, storage: 1, keyring: 1 });
  for (const hidden of ['keyring', 'commitment', 'blinding', 'envelope']) assert.equal(Object.hasOwn(result, hidden), false);
});

test('authorized doctor with read grant can read, independent of append capability', async () => {
  const f = fixture();
  f.permission.canAppend = false;
  assert.deepEqual((await readClinicalVersion(request, f.adapters)).content, f.content);
  assert.equal(f.counts.access, 2);
});

test('append-only, revoked, expired and unregistered doctors cannot load ciphertext', async () => {
  for (const change of [
    f => { f.permission.canRead = false; f.permission.canAppend = true; },
    f => { f.permission.doctorAuthorized = false; },
    f => { f.permission.doctorAuthorized = undefined; },
    f => { f.permission.reader = wallet(4); },
    f => { f.permission.historyId = '4'.repeat(64); },
    f => { f.permission.grantRevision = undefined; },
    f => { f.permission.grantRevision = -1; },
  ]) {
    const f = fixture(); change(f); await reject(f.adapters); assert.equal(f.counts.storage, 0); assert.equal(f.counts.keyring, 0);
  }
});

test('invalid, expired or changed ownership bindings deny access before storage', async () => {
  for (const change of [
    f => { f.adapters.authenticate = async () => null; },
    f => { f.actor.sessionId = ''; },
    f => { f.binding.userId = 'someone-else'; },
    f => { f.binding.bindingId = ''; },
    f => { f.binding.revokedAt = new Date().toISOString(); },
    f => { delete f.binding.revokedAt; },
    f => { f.binding.role = 'admin'; },
    f => { f.binding.wallet = 'invalid-wallet'; },
    f => { f.binding.verifiedAt = 'invalid-date'; },
    f => { f.binding.verifiedAt = new Date(Date.now() + 60_000).toISOString(); },
  ]) {
    const f = fixture(); change(f); await reject(f.adapters); assert.equal(f.counts.storage, 0);
  }
});

test('second patient cannot use another patient history even if an adapter claims read access', async () => {
  const f = fixture('patient');
  f.permission.patient = wallet(9);
  await reject(f.adapters);
  assert.equal(f.counts.storage, 0);
});

test('unconfirmed, substituted and wrong chain version evidence never reaches storage', async () => {
  for (const change of [
    f => { f.evidence.state = 'pending'; },
    f => { f.evidence.commitment = null; },
    f => { f.context.patient = wallet(9); },
    f => { f.context.historyId = '4'.repeat(64); },
    f => { f.context.entryId = '5'.repeat(64); },
    f => { f.context.contractId = StrKey.encodeContract(Buffer.alloc(32, 8)); },
    f => { f.context.network = 'mainnet'; },
    f => { f.context.version = 2; f.context.previousCommitment = '6'.repeat(64); },
  ]) {
    const f = fixture(); change(f); await reject(f.adapters); assert.equal(f.counts.storage, 0);
  }
});

test('provider ciphertext from second patient/document is rejected even when provider metadata claims a match', async () => {
  for (const changed of [{ patient: wallet(9), historyId: '9'.repeat(64) }, { entryId: '9'.repeat(64) }, { author: wallet(9) }]) {
    const f = fixture();
    const another = sealClinicalVersion({ context: { ...f.context, ...changed }, content: Buffer.from('{"note":"PATIENT TWO"}'),
      metadata: { ...f.metadata, fileName: 'second-patient.json' }, keyring: f.keyring, activeKeyId: 'synthetic-kek-1' });
    f.adapters.loadEnvelope = async () => another.envelope;
    await reject(f.adapters);
  }
});

test('revocation during storage IO blocks subsequent private delivery', async () => {
  const f = fixture();
  const original = f.adapters.loadEnvelope;
  f.adapters.loadEnvelope = async selector => { const result = await original(selector); f.permission.canRead = false; f.permission.grantRevision++; return result; };
  await reject(f.adapters);
  assert.equal(f.counts.storage, 1);
  assert.equal(f.counts.access, 2);
});

test('revoke then regrant during IO cannot reuse a pre-revocation permission snapshot', async () => {
  const f = fixture();
  const original = f.adapters.getKeyring;
  f.adapters.getKeyring = async () => { f.permission.grantRevision += 2; return original(); };
  await reject(f.adapters);
  assert.equal(f.permission.canRead, true);
});

test('medical registry authorization lost during IO blocks delivery', async () => {
  const f = fixture();
  f.adapters.getKeyring = async () => { f.permission.doctorAuthorized = false; return f.keyring; };
  await reject(f.adapters);
});

test('session expiry, account change and binding changes during IO discard decrypted content', async () => {
  for (const change of [
    f => { f.adapters.authenticate = async () => null; },
    f => { f.actor.userId = 'other-user'; f.binding.userId = 'other-user'; },
    f => { f.actor.sessionId = 'new-session'; },
    f => { f.binding.bindingId = 'new-binding'; },
    f => { f.binding.wallet = wallet(9); },
    f => { f.binding.revokedAt = new Date().toISOString(); },
    f => { f.binding.role = 'patient'; },
  ]) {
    const f = fixture(); f.adapters.getKeyring = async () => { change(f); return f.keyring; }; await reject(f.adapters);
  }
});

test('changed immutable proof during IO rejects stale verification', async () => {
  for (const change of [
    f => { f.evidence.commitment = '9'.repeat(64); },
    f => { f.context.author = wallet(9); },
    f => { f.evidence.state = 'pending'; },
  ]) {
    const f = fixture();
    const original = f.adapters.readVersion;
    f.adapters.readVersion = async selector => { if (f.counts.version === 1) change(f); return original(selector); };
    await reject(f.adapters);
  }
});

test('provider errors and key failures expose no details and never reuse a previously opened document', async () => {
  for (const failingAdapter of ['authenticate', 'findBinding', 'readAccess', 'readVersion', 'loadEnvelope', 'getKeyring']) {
    const f = fixture();
    await readClinicalVersion(request, f.adapters);
    f.adapters[failingAdapter] = async () => { throw new Error('postgresql://user:secret@host/private-name-one.json'); };
    await reject(f.adapters);
  }
  const f = fixture();
  f.adapters.getKeyring = async () => ({});
  await reject(f.adapters);
});

test('provider recovery permits a fresh verified request only', async () => {
  const f = fixture();
  const original = f.adapters.readAccess;
  f.adapters.readAccess = async () => { throw new Error('RPC unavailable'); };
  await reject(f.adapters);
  assert.equal(f.counts.storage, 0);
  f.adapters.readAccess = original;
  assert.deepEqual((await readClinicalVersion(request, f.adapters)).content, f.content);
});

test('closing during load or opening another document aborts the late response', async () => {
  const f = fixture();
  const controller = new AbortController();
  f.adapters.loadEnvelope = async () => { controller.abort(); return f.sealed.envelope; };
  await reject(f.adapters, { signal: controller.signal });
  const next = fixture();
  assert.deepEqual((await readClinicalVersion(request, next.adapters)).content, next.content);
  const alreadyAborted = fixture();
  await reject(alreadyAborted.adapters, { signal: controller.signal });
  assert.equal(alreadyAborted.counts.authenticate, 0);
});

test('malformed requests and unsupported deployments fail before authentication', async () => {
  for (const changed of [{ historyId: 'wrong' }, { entryId: 'wrong' }, { version: 0 }, { version: 1.2 }, { version: 0x1_0000_0000 }]) {
    const f = fixture(); await reject(f.adapters, changed); assert.equal(f.counts.authenticate, 0);
  }
  const f = fixture(); f.adapters.deployment = { ...deployment, network: 'mainnet' };
  await reject(f.adapters); assert.equal(f.counts.authenticate, 0);
});
