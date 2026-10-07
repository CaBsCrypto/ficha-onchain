import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { auditClinicalRunReceipts } from './clinical-receipt-audit.mjs';

const names = ['create_history', 'grant', 'append_pdf', 'correct_pdf', 'append_image', 'revoke'];
const bytes = value => nativeToScVal(Buffer.from(value, 'hex'));
const address = value => new Address(value).toScVal();
const struct = value => xdr.ScVal.scvMap(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1)
  .map(([key, val]) => new xdr.ScMapEntry({ key: nativeToScVal(key, { type: 'symbol' }), val })));

function fixture() {
  const patient = Keypair.random(), doctor = Keypair.random();
  const deployment = { network: 'testnet', contractId: StrKey.encodeContract(Buffer.alloc(32, 1)) };
  const context = { schemaVersion: 1, network: 'testnet', contractId: deployment.contractId, historyId: 'a'.repeat(64),
    entryId: 'b'.repeat(64), author: doctor.publicKey(), patient: patient.publicKey(), version: 1, previousCommitment: null };
  const state = { network: 'testnet', contractId: deployment.contractId, completed: true, runId: '01234567-89ab-4cde-8fab-0123456789ab',
    patient: patient.publicKey(), doctor: doctor.publicKey(), historyId: context.historyId,
    operations: Object.fromEntries(names.map((name, index) => [name, String(index + 1).repeat(64)])), transactions: {},
    records: { append_pdf: { context, commitment: 'c'.repeat(64) },
      correct_pdf: { context: { ...context, version: 2, previousCommitment: 'c'.repeat(64) }, commitment: 'd'.repeat(64) },
      append_image: { context: { ...context, entryId: 'e'.repeat(64) }, commitment: 'f'.repeat(64) } } };
  const attempts = [], receipts = new Map(), calls = [];
  for (const [index, name] of names.entries()) {
    const key = ['append_pdf', 'correct_pdf', 'append_image'].includes(name) ? doctor : patient;
    let method, args, value;
    if (name === 'create_history') {
      method = name; args = [address(state.patient), bytes(state.historyId), bytes(state.operations[name])];
      value = struct({ history_id: bytes(state.historyId), patient: address(state.patient), created_at: nativeToScVal(123n, { type: 'u64' }) });
    } else if (name === 'grant' || name === 'revoke') {
      const granted = name === 'grant'; method = 'set_permissions';
      args = [struct({ history_id: bytes(state.historyId), doctor: address(state.doctor), can_read: nativeToScVal(granted), can_append: nativeToScVal(granted),
        expected_revision: nativeToScVal(BigInt(granted ? 0 : 1), { type: 'u64' }), operation_id: bytes(state.operations[name]) })];
      value = struct({ can_read: nativeToScVal(granted), can_append: nativeToScVal(granted), revision: nativeToScVal(BigInt(granted ? 1 : 2), { type: 'u64' }) });
    } else {
      const record = state.records[name]; method = 'append_version';
      args = [struct({ history_id: bytes(state.historyId), entry_id: bytes(record.context.entryId), author: address(state.doctor), commitment: bytes(record.commitment),
        expected_version: nativeToScVal(record.context.version - 1, { type: 'u32' }), expected_grant_revision: nativeToScVal(1n, { type: 'u64' }), operation_id: bytes(state.operations[name]) })];
      value = struct({ author: address(state.doctor), commitment: bytes(record.commitment), version: nativeToScVal(record.context.version, { type: 'u32' }),
        previous_commitment: record.context.previousCommitment === null ? xdr.ScVal.scvVoid() : bytes(record.context.previousCommitment), created_at: nativeToScVal(123n, { type: 'u64' }) });
    }
    const tx = new TransactionBuilder(new Account(key.publicKey(), String(index + 10)), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(deployment.contractId).call(method, ...args)).setTimeout(180).build();
    tx.sign(key); const hash = tx.hash().toString('hex');
    attempts.push({ run_id: state.runId, operation_name: name, source_wallet: key.publicKey(), state: 'confirmed', transaction_hash: hash, signed_xdr: tx.toXDR() });
    state.transactions[name] = { source: key.publicKey(), status: 'SUCCESS', transactionHash: hash, ledger: 100 + index };
    receipts.set(hash, { status: 'SUCCESS', hash, ledger: 100 + index, envelopeXdr: tx.toEnvelope(), returnValue: value });
  }
  const server = { getNetwork: async () => ({ passphrase: Networks.TESTNET }), getTransaction: async hash => { calls.push(hash); return receipts.get(hash); },
    sendTransaction: () => { throw Error('audit must never transmit'); }, prepareTransaction: () => { throw Error('audit must never prepare'); } };
  return { deployment, state, attempts, server, receipts, calls, patient, doctor };
}

test('six exact actor-signed receipts are audited in semantic order without transmitting or exposing XDR', async () => {
  const f = fixture(); f.attempts.reverse(); const result = await auditClinicalRunReceipts(f);
  assert.deepEqual(result.map(row => row.name), names); assert.equal(f.calls.length, 6);
  assert.ok(result.every(row => row.signatureVerified && row.argumentsVerified && row.envelopeVerified));
  assert.equal(JSON.stringify(result).includes('signed_xdr'), false);
});

test('missing, duplicate, unfinished and foreign-run attempts never enter receipt verification', async () => {
  for (const change of [f => f.attempts.pop(), f => { f.attempts[0] = f.attempts[1]; },
    f => { f.attempts[0].state = 'submitted'; }, f => { f.attempts[0].run_id = 'other-run'; }, f => { f.state.completed = false; }]) {
    const f = fixture(); change(f); await assert.rejects(() => auditClinicalRunReceipts(f), /clinical_receipt_unverified/); assert.equal(f.calls.length, 0);
  }
});

test('source, saved hash and recipient changes cannot be relabeled as successful', async () => {
  for (const change of [f => { f.attempts[0].source_wallet = f.doctor.publicKey(); },
    f => { f.attempts[0].transaction_hash = '0'.repeat(64); }, f => { f.state.patient = Keypair.random().publicKey(); },
    f => { f.state.transactions.grant.transactionHash = '0'.repeat(64); }]) {
    const f = fixture(); change(f); await assert.rejects(() => auditClinicalRunReceipts(f), /clinical_receipt_unverified/); assert.equal(f.calls.length, 0);
  }
});

test('a wrong actor signature fails even when the forged hash, manifest and RPC envelope match', async () => {
  const f = fixture(), row = f.attempts[0];
  const envelope = TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET).toEnvelope(); envelope.v1().signatures([]);
  const forged = TransactionBuilder.fromXDR(envelope.toXDR('base64'), Networks.TESTNET); forged.sign(f.doctor);
  row.signed_xdr = forged.toXDR(); f.receipts.get(row.transaction_hash).envelopeXdr = forged.toEnvelope();
  await assert.rejects(() => auditClinicalRunReceipts(f), /clinical_receipt_unverified/); assert.equal(f.calls.length, 0);
});

test('exact contract and invocation arguments are required even for a properly signed substitute envelope', async () => {
  for (const altered of [false, true]) {
    const f = fixture(), row = f.attempts[0];
    const tx = new TransactionBuilder(new Account(f.patient.publicKey(), '10'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(altered ? StrKey.encodeContract(Buffer.alloc(32, 2)) : f.deployment.contractId)
        .call('create_history', address(f.patient.publicKey()), bytes(altered ? f.state.historyId : 'f'.repeat(64)), bytes(f.state.operations.create_history)))
      .setTimeout(180).build(); tx.sign(f.patient);
    row.signed_xdr = tx.toXDR(); row.transaction_hash = tx.hash().toString('hex');
    f.state.transactions.create_history.transactionHash = row.transaction_hash;
    f.receipts.set(row.transaction_hash, { status: 'SUCCESS', hash: row.transaction_hash, ledger: 100, envelopeXdr: tx.toEnvelope() });
    await assert.rejects(() => auditClinicalRunReceipts(f), /clinical_receipt_unverified/); assert.equal(f.calls.length, 0);
  }
});

test('RPC uncertainty, wrong envelope, hash, ledger and returned result cannot produce partial approval', async () => {
  for (const change of [r => { r.status = 'NOT_FOUND'; }, r => { r.status = 'FAILED'; }, r => { r.hash = 'f'.repeat(64); },
    r => { r.ledger++; }, r => { delete r.envelopeXdr; }, r => { delete r.returnValue; }, r => { r.returnValue = nativeToScVal('wrong'); }]) {
    const f = fixture(); change(f.receipts.get(f.attempts[0].transaction_hash));
    await assert.rejects(() => auditClinicalRunReceipts(f), /clinical_receipt_unverified/);
  }
  const f = fixture(); f.receipts.get(f.attempts[0].transaction_hash).envelopeXdr = f.receipts.get(f.attempts[1].transaction_hash).envelopeXdr;
  await assert.rejects(() => auditClinicalRunReceipts(f), /clinical_receipt_unverified/);
});

test('Mainnet provider and inconsistent versions reject without being displayed as verified', async () => {
  for (const change of [f => { f.server.getNetwork = async () => ({ passphrase: Networks.PUBLIC }); },
    f => { f.state.records.correct_pdf.context.previousCommitment = 'f'.repeat(64); }, f => { f.state.records.append_image.context.author = f.state.patient; }]) {
    const f = fixture(); change(f); await assert.rejects(() => auditClinicalRunReceipts(f), /clinical_receipt_unverified/); assert.equal(f.calls.length, 0);
  }
});
