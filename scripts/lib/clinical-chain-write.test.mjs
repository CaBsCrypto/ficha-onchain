import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account, Contract, Keypair, Networks, nativeToScVal, StrKey, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { createClinicalTransactionRunner } from './clinical-chain-write.mjs';

function fixture() {
  const key = Keypair.random(); const jobs = new Map();
  const counts = { signatures: 0, submissions: 0, prepared: 0, locks: 0 };
  const state = { exclusive: true, receipt: 'SUCCESS', lostReply: false };
  const operation = new Contract(StrKey.encodeContract(Buffer.alloc(32, 1))).call('interface_version');
  const server = {
    getNetwork: async () => ({ passphrase: Networks.TESTNET }), getAccount: async () => new Account(key.publicKey(), '10'),
    prepareTransaction: async tx => { counts.prepared++; return tx; },
    sendTransaction: async tx => {
      counts.submissions++; assert.equal(jobs.size, 1, 'signature must be durable before sending');
      state.envelope = tx.toEnvelope(); if (state.lostReply) throw Error('provider secret'); return { status: 'PENDING' };
    },
    getTransaction: async () => ({ status: state.receipt, envelopeXdr: state.envelope, ledger: 100, returnValue: nativeToScVal(1, { type: 'u32' }) }),
  };
  const configuration = { network: 'testnet', source: key.publicKey(), server,
    store: { load: async id => jobs.get(id), save: async (id, value) => { assert.equal(jobs.has(id), false); jobs.set(id, structuredClone(value)); } },
    sign: async envelope => { counts.signatures++; const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET); tx.sign(key); return tx.toXDR(); },
    assertExclusive: async () => { counts.locks++; if (!state.exclusive) throw Error('lock lost'); },
    verifyOperation: async op => assert.ok(op.body().toXDR().equals(operation.body().toXDR())), writesEnabled: true };
  return { counts, state, jobs, configuration, operation, run: options => createClinicalTransactionRunner({ ...configuration, ...options }) };
}

test('exact signature and envelope are saved before send; retries only reconcile', async () => {
  const f = fixture(); const runner = f.run();
  assert.equal((await runner.run({ id: 'append', operation: f.operation })).status, 'SUCCESS');
  assert.equal((await runner.run({ id: 'append', operation: f.operation })).status, 'SUCCESS');
  assert.equal(f.counts.signatures, 1); assert.equal(f.counts.submissions, 1);
});
test('lost RPC reply and restart reuse the same persisted attempt without another signature', async () => {
  const f = fixture(); f.state.lostReply = true;
  await assert.rejects(() => f.run().run({ id: 'append', operation: f.operation }), { message: 'clinical_transaction_unavailable' });
  assert.equal(f.jobs.size, 1);
  f.state.lostReply = false;
  assert.equal((await f.run().run({ id: 'append', operation: f.operation })).status, 'SUCCESS');
  assert.equal(f.counts.signatures, 1); assert.equal(f.counts.submissions, 1);
});
test('uncertain and failed transactions never become confirmed or get rebuilt', async () => {
  const f = fixture(); f.state.receipt = 'NOT_FOUND';
  assert.equal((await f.run().run({ id: 'append', operation: f.operation })).status, 'pending');
  f.state.receipt = 'FAILED';
  assert.equal((await f.run().run({ id: 'append', operation: f.operation })).status, 'FAILED');
  assert.equal(f.counts.prepared, 1);
});
test('a crash before transmission can explicitly resubmit the identical saved envelope', async () => {
  const f = fixture(); f.state.receipt = 'NOT_FOUND';
  await f.run().run({ id: 'append', operation: f.operation });
  const original = f.jobs.get('append').xdr;
  await f.run().run({ id: 'append', operation: f.operation, resubmitSaved: true });
  assert.equal(f.jobs.get('append').xdr, original);
  assert.equal(f.counts.signatures, 1); assert.equal(f.counts.submissions, 2);
  await f.run({ writesEnabled: false }).run({ id: 'append', operation: f.operation, resubmitSaved: true });
  assert.equal(f.counts.submissions, 2);
});
test('disabled writes permit reconciliation but never preparation or transmission', async () => {
  const f = fixture();
  assert.equal((await f.run({ writesEnabled: false }).run({ id: 'append', operation: f.operation })).status, 'writes_paused');
  assert.equal(f.counts.signatures, 0); assert.equal(f.counts.submissions, 0);
  await f.run().run({ id: 'append', operation: f.operation });
  assert.equal((await f.run({ writesEnabled: false }).run({ id: 'append', operation: f.operation })).status, 'SUCCESS');
  assert.equal(f.counts.submissions, 1);
});
test('network mismatch, lost lock, wrong signer and changed intent reject without transmission', async () => {
  for (const mutate of [
    f => { f.configuration.server.getNetwork = async () => ({ passphrase: Networks.PUBLIC }); },
    f => { f.state.exclusive = false; },
    f => { f.configuration.sign = async envelope => { const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET); tx.sign(Keypair.random()); return tx.toXDR(); }; },
    f => { f.configuration.store.save = async () => { throw Error('database unavailable'); }; },
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(() => f.run().run({ id: 'append', operation: f.operation }));
    assert.equal(f.counts.submissions, 0);
  }
});
test('receipt for another envelope cannot confirm the intended operation', async () => {
  const f = fixture(); await f.run().run({ id: 'append', operation: f.operation });
  f.state.envelope = TransactionBuilder.fromXDR(f.jobs.get('append').xdr, Networks.TESTNET).toEnvelope();
  f.state.envelope.v1().tx().seqNum(f.state.envelope.v1().tx().seqNum().constructor.fromString('99'));
  await assert.rejects(() => f.run().run({ id: 'append', operation: f.operation }));
});
test('preparation may add only source authorization for the exact invocation, with no extra calls', async () => {
  for (const altered of [false, true]) {
    const f = fixture();
    f.configuration.server.prepareTransaction = async tx => {
      const envelope = tx.toEnvelope(), operation = envelope.v1().tx().operations()[0].body().invokeHostFunctionOp();
      const root = new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(operation.hostFunction().invokeContract()), subInvocations: [] });
      if (altered) root.subInvocations([new xdr.SorobanAuthorizedInvocation({ function: root.function(), subInvocations: [] })]);
      operation.auth([new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: root })]);
      return TransactionBuilder.fromXDR(envelope.toXDR('base64'), Networks.TESTNET);
    };
    if (altered) { await assert.rejects(() => f.run().run({ id: 'append', operation: f.operation })); assert.equal(f.counts.signatures, 0); }
    else assert.equal((await f.run().run({ id: 'append', operation: f.operation })).status, 'SUCCESS');
  }
});
