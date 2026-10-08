import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { verifyClinicalTestnetFunding } from './clinical-funding-audit.mjs';
function fixture() {
  const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)), patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
  const tx = new TransactionBuilder(new Account(payer.publicKey(), '10'), { networkPassphrase: Networks.TESTNET, fee: '100' })
    .addOperation(Operation.createAccount({ destination: patient, startingBalance: '10000' })).setTimeout(60).build();
  tx.sign(payer);
  const transactionHash = tx.hash().toString('hex');
  return { transactionHash, patient, transaction: { hash: transactionHash, successful: true, ledger: 100,
    operation_count: 1, source_account: payer.publicKey(), created_at: '2026-10-07T04:41:02Z', envelope_xdr: tx.toXDR(), fee_charged: '100' },
  operations: [{ type: 'create_account', transaction_hash: transactionHash, transaction_successful: true, account: patient,
    funder: payer.publicKey(), source_account: payer.publicKey(), starting_balance: '10000.0000000' }] };
}
test('successful funding matches exact Testnet envelope, synthetic destination and amount', () => {
  const actual = verifyClinicalTestnetFunding(fixture());
  assert.equal(actual.status, 'verified'); assert.equal(actual.envelopeHashVerified, true);
  assert.equal(actual.clinicalOperation, false); assert.equal(actual.amountXlm, '10000.0000000');
});
test('wrong hash, failed receipt and different patient or amount cannot pass', () => {
  for (const change of [
    f => { f.transaction.hash = '0'.repeat(64); },
    f => { f.transaction.successful = false; },
    f => { f.patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey(); },
    f => { f.operations[0].starting_balance = '9999.0000000'; },
    f => { f.operations[0].transaction_successful = false; },
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyClinicalTestnetFunding(f), { message: 'clinical_funding_receipt_unverified' });
  }
});
test('missing or extra operations, mismatched source, and malformed envelope fail closed', () => {
  for (const change of [
    f => { f.operations = []; },
    f => { f.operations.push(f.operations[0]); },
    f => { f.operations[0].source_account = f.patient; },
    f => { f.transaction.envelope_xdr = 'malformed'; },
    f => { f.operations[0].starting_balance = '1e4'; },
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyClinicalTestnetFunding(f), { message: 'clinical_funding_receipt_unverified' });
  }
});
