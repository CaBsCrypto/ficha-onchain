import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { knownClinicalRestorationKeys } from './restore-clinical-testnet.mjs';

function fixture() {
  const deployment = { network: 'testnet', contractId: StrKey.encodeContract(Buffer.alloc(32, 1)), wasmHash: 'a'.repeat(64) };
  const patient = Keypair.random().publicKey(), doctor = Keypair.random().publicKey();
  const context = { schemaVersion: 1, network: 'testnet', contractId: deployment.contractId,
    historyId: 'b'.repeat(64), entryId: 'c'.repeat(64), patient, author: doctor, version: 1, previousCommitment: null };
  const state = { network: 'testnet', contractId: deployment.contractId, completed: true, patient, doctor,
    historyId: context.historyId, operations: Object.fromEntries(['create_history', 'grant', 'append_pdf', 'correct_pdf', 'append_image', 'revoke'].map((name, i) => [name, String(i + 1).repeat(64)])),
    records: { append_pdf: { context, commitment: 'd'.repeat(64) },
      correct_pdf: { context: { ...context, version: 2, previousCommitment: 'd'.repeat(64) }, commitment: 'e'.repeat(64) },
      append_image: { context: { ...context, entryId: 'f'.repeat(64) }, commitment: 'a'.repeat(64) } } };
  return { deployment, state };
}

test('known completed synthetic run selects exactly 16 unique persistent keys', () => {
  const f = fixture(); const keys = knownClinicalRestorationKeys(f.deployment, f.state);
  assert.equal(keys.length, 16); assert.equal(new Set(keys.map(k => k.toXDR('base64'))).size, 16);
  assert.equal(keys.filter(k => k.switch().name === 'contractCode').length, 1);
  assert.ok(keys.filter(k => k.switch().name === 'contractData').every(k => k.contractData().durability().name === 'persistent'));
});

test('unfinished, wrong-network and foreign-contract runs cannot choose a maintenance footprint', () => {
  for (const change of [f => { f.state.completed = false; }, f => { f.deployment.network = 'mainnet'; },
    f => { f.state.contractId = StrKey.encodeContract(Buffer.alloc(32, 2)); }]) {
    const f = fixture(); change(f); assert.throws(() => knownClinicalRestorationKeys(f.deployment, f.state));
  }
});

test('substituted patient, author, version and correction chain are rejected', () => {
  for (const change of [f => { f.state.records.append_image.context.patient = Keypair.random().publicKey(); },
    f => { f.state.records.append_image.context.author = f.state.patient; },
    f => { f.state.records.correct_pdf.context.version = 3; },
    f => { f.state.records.correct_pdf.context.previousCommitment = 'f'.repeat(64); }]) {
    const f = fixture(); change(f); assert.throws(() => knownClinicalRestorationKeys(f.deployment, f.state));
  }
});

test('unknown operations, reused identifiers and substituted record sets cannot expand recovery', () => {
  for (const change of [f => { f.state.operations.unknown = 'a'.repeat(64); },
    f => { f.state.operations.revoke = f.state.operations.grant; },
    f => { delete f.state.records.correct_pdf; }, f => { f.state.records.extra = f.state.records.append_pdf; }]) {
    const f = fixture(); change(f); assert.throws(() => knownClinicalRestorationKeys(f.deployment, f.state));
  }
});
