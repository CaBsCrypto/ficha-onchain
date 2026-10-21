import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrKey } from '@stellar/stellar-sdk';
import { clinicalAttemptStore } from './clinical-attempt-store.mjs';

const source = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const runId = '00000000-0000-4000-8000-000000000001';
const record = { source, intent: '2'.repeat(64), hash: '3'.repeat(64), xdr: 'signed-synthetic-test-envelope' };
function fixture() {
  const state = { row: null, prescription: false, persistenceFailure: false }; const trace = [];
  const client = { query: async (sql, params = []) => {
    trace.push(sql);
    if (['BEGIN','COMMIT','ROLLBACK'].includes(sql) || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('SELECT id FROM private_operations')) return { rows: state.prescription ? [{ id: 'another' }] : [] };
    if (sql.startsWith('INSERT')) {
      if (state.row && state.row.name !== params[1] && ['prepared','submitted'].includes(state.row.state)) throw Error('unique source');
      if (!state.row) state.row = { name: params[1], intent: params[3], state: 'prepared', signed_xdr: null, transaction_hash: null };
      return { rows: [] };
    }
    if (sql.startsWith('SELECT intent')) return { rows: state.row?.name === params[1] ? [structuredClone(state.row)] : [] };
    if (sql.startsWith('UPDATE') && sql.includes('signed_xdr=$5')) {
      if (state.persistenceFailure) throw Error('database failure');
      if (!state.row || state.row.intent !== params[3] || state.row.state !== 'prepared') return { rows: [] };
      Object.assign(state.row, { signed_xdr: params[4], transaction_hash: params[5], state: 'submitted' }); return { rows: [{ operation_name: params[1] }] };
    }
    if (sql.startsWith('UPDATE')) {
      if (state.row?.transaction_hash !== params[3] || !['submitted',params[4]].includes(state.row.state)) return { rows: [] };
      state.row.state = params[4]; return { rows: [{ operation_name: params[1] }] };
    }
    throw Error('unexpected fixture SQL');
  } };
  return { state, trace, store: clinicalAttemptStore(client, { runId, source }) };
}
test('prepared reservation precedes signature persistence; retries recover the same signed envelope', async () => {
  const f = fixture(); await f.store.reserve('append', record);
  assert.equal(await f.store.load('append'), null);
  await f.store.save('append', record); assert.deepEqual(await f.store.load('append'), record);
  await assert.rejects(() => f.store.save('append', { ...record, hash: '4'.repeat(64) }));
  await f.store.complete('append', { status: 'SUCCESS', transactionHash: record.hash });
  assert.deepEqual(await f.store.load('append'), record); assert.equal(f.state.row.state, 'confirmed');
});
test('existing prescription or another clinical intent prevents source allocation', async () => {
  const f = fixture(); f.state.prescription = true;
  await assert.rejects(() => f.store.reserve('append', record)); assert.equal(f.state.row, null);
  f.state.prescription = false; await f.store.reserve('append', record);
  await assert.rejects(() => f.store.reserve('another', record));
  await assert.rejects(() => f.store.reserve('append', { ...record, intent: '5'.repeat(64) }));
});
test('uncertain receipt and failed persistence cannot falsely complete or replace the attempt', async () => {
  const f = fixture(); await f.store.reserve('append', record); f.state.persistenceFailure = true;
  await assert.rejects(() => f.store.save('append', record)); assert.equal(f.state.row.state, 'prepared');
  assert.equal(f.trace.at(-1), 'ROLLBACK');
  await assert.rejects(() => f.store.complete('append', { status: 'NOT_FOUND', transactionHash: record.hash }));
  f.state.persistenceFailure = false; await f.store.save('append', record);
  await assert.rejects(() => f.store.complete('append', { status: 'SUCCESS', transactionHash: '6'.repeat(64) }));
  assert.equal(f.state.row.state, 'submitted');
});
