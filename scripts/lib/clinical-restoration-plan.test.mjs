import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account, Address, Keypair, Networks, SorobanDataBuilder, StrKey, xdr } from '@stellar/stellar-sdk';
import { buildClinicalRestoration } from './clinical-restoration-plan.mjs';

function fixture() {
  const contractId = StrKey.encodeContract(Buffer.alloc(32, 1));
  const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: new Address(contractId).toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent(),
  }));
  const data = new SorobanDataBuilder().setReadWrite([key]).setResources(0, 1000, 1000).setResourceFee('1000');
  return { deployment: { network: 'testnet', contractId, wasmHash: 'a'.repeat(64) },
    sourceAccount: new Account(Keypair.random().publicKey(), '10'),
    preamble: { minResourceFee: '1000', transactionData: data }, key, data };
}

test('restoration plan preserves exact footprint and uses Testnet without changing source sequence', () => {
  const f = fixture(); const result = buildClinicalRestoration(f);
  assert.equal(result.transaction.operations[0].type, 'restoreFootprint');
  assert.equal(result.transaction.networkPassphrase, Networks.TESTNET);
  assert.equal(result.transaction.fee, '1100');
  assert.equal(result.transaction.signatures.length, 0);
  assert.equal(f.sourceAccount.sequenceNumber(), '10');
  assert.equal(result.keyCount, 1);
});

test('foreign contract, temporary data, unrelated ledger key and foreign code are rejected', () => {
  for (const makeKey of [
    f => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(StrKey.encodeContract(Buffer.alloc(32, 2))).toScAddress(), key: f.key.contractData().key(), durability: xdr.ContractDataDurability.persistent() })),
    f => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: f.key.contractData().contract(), key: f.key.contractData().key(), durability: xdr.ContractDataDurability.temporary() })),
    () => xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.alloc(32, 3) })),
    () => xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: new Address(Keypair.random().publicKey()).toScAddress().accountId() })),
  ]) {
    const f = fixture(); f.data.setReadWrite([makeKey(f)]);
    assert.throws(() => buildClinicalRestoration(f), /clinical_restoration_unavailable/);
  }
});

test('empty, duplicate, read-only and excessive footprints fail closed', () => {
  for (const change of [f => f.data.setReadWrite([]), f => f.data.setReadWrite([f.key, f.key]),
    f => f.data.setReadOnly([f.key]), f => f.data.setReadWrite(Array(129).fill(f.key))]) {
    const f = fixture(); change(f);
    assert.throws(() => buildClinicalRestoration(f), /clinical_restoration_unavailable/);
  }
});

test('wrong network and mismatched, malformed or excessive fees cannot produce a plan', () => {
  for (const change of [f => { f.deployment.network = 'mainnet'; },
    f => { f.preamble.minResourceFee = '1001'; }, f => { f.preamble.minResourceFee = '1e6'; },
    f => { f.preamble.minResourceFee = '10000001'; }, f => { f.preamble.transactionData = 'invalid'; },
    f => { f.data.setResources(0, 0, 0); }]) {
    const f = fixture(); change(f);
    assert.throws(() => buildClinicalRestoration(f), /clinical_restoration_unavailable/);
  }
});
