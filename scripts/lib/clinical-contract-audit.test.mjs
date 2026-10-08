import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Address, Networks, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { CLINICAL_AUDIT_DOCTOR, PRIVATE_PRESCRIPTION_ID, createClinicalContractAuditor } from './clinical-contract-audit.mjs';
import { PRIVATE_REGISTRY_ID } from './private-registry.mjs';

const wallet = value => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, value));
const code = Buffer.from('synthetic-wasm-test-only');
const codeHash = createHash('sha256').update(code).digest('hex');
const deployed = { name: 'DoctorRegistryPrivate', contractId: PRIVATE_REGISTRY_ID, expectedWasmHash: codeHash,
  interfaceVersion: 1, configuration: { get_admin: wallet(3) } };
function fixture() {
  const state = { ledger: 100, code, hash: codeHash, interface: 1, admin: wallet(3), authorized: true, restore: false, auth: [],
    record: { commitment: Buffer.alloc(32, 4), schema_version: 1, version: 1, valid_until: 2000n, revoked: false },
    prescription: { id: 2n, doctor: wallet(6), patient: wallet(7), commitment: Buffer.alloc(32, 8), schema_version: 1,
      issued_at: 1000n, expires_at: 1500n, status: ['Active'] }, isValid: true, simulations: [], submissions: 0 };
  const server = {
    getNetwork: async () => ({ passphrase: Networks.TESTNET }),
    getLedgerEntries: async key => ({ latestLedger: state.ledger, entries: [{ key, liveUntilLedgerSeq: 1000,
      val: key.switch().name === 'contractCode'
        ? xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ ext: new xdr.ContractCodeEntryExt(0), hash: Buffer.from(state.hash, 'hex'), code: state.code }))
        : xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0),
          contract: new Address(PRIVATE_REGISTRY_ID).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent(),
          val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(state.hash, 'hex')), storage: [] })) })),
    }] }),
    simulateTransaction: async tx => {
      assert.equal(tx.signatures.length, 0);
      assert.equal(tx.operations.length, 1);
      const invocation = tx.operations[0].func.invokeContract();
      const method = invocation.functionName().toString();
      state.simulations.push(method);
      const values = { interface_version: state.interface, get_admin: state.admin, get_authorization: state.record,
        is_authorized: state.authorized, get_prescription: state.prescription, is_valid: state.isValid };
      const type = method === 'interface_version' ? 'u32' : ['get_authorization', 'get_prescription'].includes(method)
        ? { schema_version: ['symbol', 'u32'], version: ['symbol', 'u32'] } : undefined;
      const result = { latestLedger: state.ledger, transactionData: {}, result: { auth: state.auth, retval: nativeToScVal(values[method], { type }) } };
      if (state.restore) result.restorePreamble = { transactionData: {} };
      return result;
    },
    sendTransaction: async () => { state.submissions++; throw Error('must_not_submit'); },
  };
  return { state, server, auditor: createClinicalContractAuditor({ server, readerAddress: wallet(2) }) };
}
const rx = { contractId: PRIVATE_PRESCRIPTION_ID, rxId: '2', doctor: wallet(6), patient: wallet(7), commitment: '08'.repeat(32), expiresAt: 1500 };

test('public audit verifies actual WASM bytes, interface and admin using unsigned reads', async () => {
  const f = fixture();
  await f.auditor.network();
  const actual = await f.auditor.auditDeployment(deployed);
  assert.equal(actual.wasmVerified, true);
  assert.equal(actual.wasmBytes, code.length);
  assert.equal(actual.configurationVerified, true);
  assert.equal(actual.observedLedger, 100);
  assert.deepEqual(f.state.simulations, ['interface_version', 'get_admin']);
  assert.equal(f.state.submissions, 0);
});

test('wrong network and altered code bytes are rejected without submissions', async () => {
  const f = fixture();
  f.server.getNetwork = async () => ({ passphrase: Networks.PUBLIC });
  await assert.rejects(() => f.auditor.network(), { message: 'audit_network_mismatch' });
  f.state.code = Buffer.from('altered');
  await assert.rejects(() => f.auditor.auditDeployment(deployed), { message: 'audit_wasm_mismatch' });
  assert.equal(f.state.submissions, 0);
});

test('wrong executable, interface and authority fail closed', async () => {
  for (const mutate of [
    f => { f.state.hash = '1'.repeat(64); },
    f => { f.state.interface = 2; },
    f => { f.state.admin = wallet(9); },
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(() => f.auditor.auditDeployment(deployed));
    assert.equal(f.state.submissions, 0);
  }
});

test('archival preambles, required signatures and missing ledger state are not success', async () => {
  for (const mutate of [
    f => { f.state.restore = true; },
    f => { f.state.auth = [{}]; },
    f => { f.server.getLedgerEntries = async () => ({ latestLedger: 100, entries: [] }); },
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(() => f.auditor.auditDeployment(deployed));
    assert.equal(f.state.submissions, 0);
  }
});

test('expired doctor is reported as unauthorized; contradictory authorization is rejected', async () => {
  const f = fixture();
  f.state.authorized = false;
  const actual = await f.auditor.doctor(CLINICAL_AUDIT_DOCTOR, 2100);
  assert.equal(actual.authorized, false);
  assert.equal(actual.remainingSeconds, 0);
  assert.equal(actual.validUntil, 2000);
  f.state.authorized = true;
  await assert.rejects(() => f.auditor.doctor(CLINICAL_AUDIT_DOCTOR, 2100), { message: 'audit_authorization_invalid' });
});

test('existing prescription matches its public context without revealing or changing its document', async () => {
  const f = fixture();
  const actual = await f.auditor.prescription(rx, 1200);
  assert.equal(actual.isValid, true);
  assert.equal(actual.contentRead, false);
  assert.equal(actual.changed, false);
  f.state.isValid = false;
  assert.equal((await f.auditor.prescription(rx, 2000)).expired, true);
  assert.equal(f.state.submissions, 0);
});

test('authorization changed during the read cannot be presented as the same current version', async () => {
  const f = fixture(), simulate = f.server.simulateTransaction;
  f.server.simulateTransaction = async tx => {
    const result = await simulate(tx);
    if (f.state.simulations.at(-1) === 'is_authorized') f.state.record = { ...f.state.record, version: 2 };
    return result;
  };
  await assert.rejects(() => f.auditor.doctor(CLINICAL_AUDIT_DOCTOR, 1200), { message: 'audit_authorization_changed' });
  assert.equal(f.state.submissions, 0);
});

test('different recipient, schema, commitment or status cannot pass fixture verification', async () => {
  for (const mutate of [
    f => { f.state.prescription.patient = wallet(9); },
    f => { f.state.prescription.schema_version = 2; },
    f => { f.state.prescription.commitment = Buffer.alloc(32, 9); },
    f => { f.state.prescription.status = ['Unknown']; },
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(() => f.auditor.prescription(rx, 1200), { message: 'audit_fixture_mismatch' });
  }
});

test('unknown contract, malformed fixture and unlisted methods are never queried', async () => {
  const f = fixture();
  await assert.rejects(() => f.auditor.prescription({ ...rx, contractId: StrKey.encodeContract(Buffer.alloc(32, 9)) }, 1200), { message: 'audit_fixture_invalid' });
  await assert.rejects(() => f.auditor.auditDeployment({ ...deployed, configuration: { mint_prescription: 'no' } }), { message: 'audit_configuration_mismatch' });
  assert.equal(f.state.simulations.includes('mint_prescription'), false);
  assert.equal(f.state.submissions, 0);
});
