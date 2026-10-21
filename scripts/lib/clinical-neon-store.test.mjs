import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { sealClinicalVersion, openClinicalVersion } from './clinical-crypto.mjs';
import { clinicalNeonStore } from './clinical-neon-store.mjs';

const h = () => randomBytes(32).toString('hex');
function fixture() {
  const context = { schemaVersion: 1, network: 'testnet', contractId: StrKey.encodeContract(randomBytes(32)),
    historyId: h(), entryId: h(), author: Keypair.random().publicKey(), patient: Keypair.random().publicKey(),
    version: 1, previousCommitment: null };
  const keyring = { 'test.1': h() };
  const content = Buffer.from(JSON.stringify({ note: 'Synthetic clinical note, never SQL plaintext' }));
  const sealed = sealClinicalVersion({ context, content, metadata: { mediaType: 'application/json', fileName: 'synthetic.json' }, keyring, activeKeyId: 'test.1' });
  const record = { context, ...sealed, operationId: h() };
  const trace = [];
  let row = null, snapshot;
  const client = { async query(sql, params = []) {
    trace.push({ sql, params: structuredClone(params) });
    if (sql === 'BEGIN') { snapshot = structuredClone(row); return { rows: [] }; }
    if (sql === 'ROLLBACK') { row = snapshot; return { rows: [] }; }
    if (sql === 'COMMIT') return { rows: [] };
    if (sql.startsWith('INSERT')) {
      if (!row) row = { context: JSON.parse(params[4]), commitment: params[5], envelope: JSON.parse(params[6]), operation_id: params[7], state: 'prepared', transaction_hash: null };
      return { rows: [] };
    }
    if (sql.startsWith('SELECT')) return { rows: row ? [structuredClone(row)] : [] };
    if (sql.startsWith('UPDATE')) { row.state = 'confirmed'; row.transaction_hash = params[4]; return { rows: [] }; }
    throw Error('unexpected_query');
  } };
  const receipt = { status: 'SUCCESS', network: 'testnet', contractId: context.contractId,
    context, commitment: record.commitment, operationId: record.operationId, transactionHash: h() };
  return { record, receipt, keyring, content, trace, client, store: clinicalNeonStore(client) };
}

test('Neon persists only ciphertext; prepared content is unavailable until exact confirmation', async () => {
  const f = fixture();
  assert.equal((await f.store.stageVersion(f.record)).state, 'prepared');
  assert.ok(!JSON.stringify(f.trace).includes('Synthetic clinical note'));
  assert.ok(!JSON.stringify(f.trace).includes(f.keyring['test.1']));
  assert.ok(!JSON.stringify(f.trace).includes('synthetic.json'));
  await assert.rejects(f.store.loadEnvelope(f.record), /unavailable/);
  await f.store.confirmVersion({ ...f.record, receipt: f.receipt });
  const envelope = await f.store.loadEnvelope(f.record);
  const opened = openClinicalVersion({ envelope, expectedContext: f.record.context, expectedCommitment: f.record.commitment, keyring: f.keyring });
  assert.deepEqual(opened.content, f.content);
});

test('retry returns persisted attempt; regenerated ciphertext, changed content or operation cannot overwrite it', async () => {
  const f = fixture();
  await f.store.stageVersion(f.record);
  await f.store.stageVersion(f.record);
  const before = await f.store.preparedVersion(f.record);
  for (const changed of [
    { ...f.record, commitment: h() }, { ...f.record, operationId: h() },
    { ...f.record, context: { ...f.record.context, author: Keypair.random().publicKey() } },
    { ...f.record, envelope: { ...f.record.envelope, keyId: 'different' } },
  ]) await assert.rejects(f.store.stageVersion(changed), /conflict/);
  assert.deepEqual(await f.store.preparedVersion(f.record), before);
  assert.equal(f.trace.filter(x => x.sql === 'ROLLBACK').length, 4);
});

test('uncertain, failed, wrong transaction context or recipient cannot confirm', async () => {
  const f = fixture(); await f.store.stageVersion(f.record);
  for (const change of [
    { status: 'PENDING' }, { status: 'FAILED' }, { network: 'mainnet' }, { commitment: h() },
    { operationId: h() }, { contractId: StrKey.encodeContract(randomBytes(32)) },
    { context: { ...f.record.context, patient: Keypair.random().publicKey() } }, { transactionHash: 'invalid' },
  ]) {
    await assert.rejects(f.store.confirmVersion({ ...f.record, receipt: { ...f.receipt, ...change } }));
    await assert.rejects(f.store.loadEnvelope(f.record), /unavailable/);
  }
  assert.equal((await f.store.preparedVersion(f.record)).state, 'prepared');
});

test('confirmed version keeps original receipt; cross-context reads and later replacement rejected', async () => {
  const f = fixture(); await f.store.stageVersion(f.record);
  await f.store.confirmVersion({ ...f.record, receipt: f.receipt });
  await f.store.confirmVersion({ ...f.record, receipt: f.receipt });
  await assert.rejects(f.store.confirmVersion({ ...f.record, receipt: { ...f.receipt, transactionHash: h() } }), /invalid/);
  await assert.rejects(f.store.loadEnvelope({ ...f.record, context: { ...f.record.context, patient: Keypair.random().publicKey() } }), /unavailable/);
  assert.equal((await f.store.preparedVersion(f.record)).transactionHash, f.receipt.transactionHash);
});

test('plaintext, malformed envelope and invalid context are rejected before SQL', async () => {
  const f = fixture();
  for (const bad of [
    { ...f.record, envelope: { ...f.record.envelope, payload: 'medical plaintext' } },
    { ...f.record, envelope: { ...f.record.envelope, privateKey: 'unexpected' } },
    { ...f.record, context: { ...f.record.context, network: 'mainnet' } },
  ]) await assert.rejects(f.store.stageVersion(bad));
  assert.equal(f.trace.length, 0);
});

test('database failure never fabricates a confirmation', async () => {
  const f = fixture(); await f.store.stageVersion(f.record);
  const failing = clinicalNeonStore({ async query(sql, params) { if (sql.startsWith('UPDATE')) throw Error('database unavailable'); return f.client.query(sql, params); } });
  await assert.rejects(failing.confirmVersion({ ...f.record, receipt: f.receipt }), /database unavailable/);
  assert.equal((await f.store.preparedVersion(f.record)).state, 'prepared');
  await assert.rejects(f.store.loadEnvelope(f.record), /unavailable/);
});
