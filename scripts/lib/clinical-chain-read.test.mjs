import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Account, Address, Networks, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { createClinicalChainReader } from './clinical-chain-read.mjs';

const wallet = n => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n));
const config = { network: 'testnet', contractId: StrKey.encodeContract(Buffer.alloc(32, 1)),
  registryId: StrKey.encodeContract(Buffer.alloc(32, 2)), wasmHash: '3'.repeat(64), readerAddress: wallet(4) };
const selector = { deployment: { network: 'testnet', contractId: config.contractId }, historyId: '5'.repeat(64), reader: wallet(6) };
const b = value => Buffer.from(value, 'hex');

function fixture() {
  const state = { ledger: 100, patient: wallet(7), authorized: true,
    grant: { can_read: true, can_append: false, revision: 2n }, calls: [], auth: [], failure: null, restore: false };
  const server = {
    getNetwork: async () => ({ passphrase: Networks.TESTNET }),
    getLedgerEntries: async key => ({ latestLedger: state.ledger, entries: [{ key, liveUntilLedgerSeq: 500,
      val: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0),
        contract: new Address(config.contractId).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
        val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({
          executable: xdr.ContractExecutable.contractExecutableWasm(b(config.wasmHash)), storage: [],
        })),
      })),
    }] }),
    getAccount: async () => new Account(config.readerAddress, '10'),
    simulateTransaction: async tx => {
      assert.equal(tx.signatures.length, 0);
      const invocation = tx.operations[0].func.invokeContract();
      const method = invocation.functionName().toString();
      state.calls.push(method);
      assert.equal(Address.fromScAddress(invocation.contractAddress()).toString(), config.contractId);
      if (state.failure) return { latestLedger: state.ledger, error: state.failure };
      const values = {
        interface_version: 1, get_registry: config.registryId,
        get_history: { history_id: b(selector.historyId), patient: state.patient, created_at: 1n },
        get_grant: state.grant, can_read: state.authorized,
        get_version: { author: wallet(6), commitment: b('8'.repeat(64)), previous_commitment: null, version: 1, created_at: 2n },
      };
      const type = method === 'interface_version' ? 'u32' :
        method === 'get_version' ? { version: ['symbol', 'u32'] } : undefined;
      const response = { latestLedger: state.ledger, transactionData: {}, result: { auth: state.auth, retval: nativeToScVal(values[method], { type }) } };
      if (state.restore) response.restorePreamble = { transactionData: {} };
      return response;
    },
    sendTransaction: async () => { throw Error('read_must_never_submit'); },
  };
  return { state, server, reader: createClinicalChainReader(config, { server }) };
}

test('RPC reader pins Testnet, WASM, interface and registry using unsigned simulations only', async () => {
  const f = fixture();
  assert.equal((await f.reader.verifyDeployment()).wasmHash, config.wasmHash);
  const access = await f.reader.readAccess(selector);
  assert.equal(access.canRead, true); assert.equal(access.doctorAuthorized, true); assert.equal(access.grantRevision, 2);
  assert.deepEqual(f.state.calls.slice(-6), ['interface_version', 'get_registry', 'get_history', 'get_grant', 'can_read', 'get_grant']);
  const version = await f.reader.readVersion({ ...selector, entryId: '9'.repeat(64), version: 1 });
  assert.equal(version.state, 'confirmed'); assert.equal(version.commitment, '8'.repeat(64));
  assert.equal(version.context.patient, f.state.patient);
});

test('owner access is independent of medical grants; revoked and append-only access is denied', async () => {
  const f = fixture();
  f.state.patient = selector.reader;
  assert.equal((await f.reader.readAccess(selector)).grantRevision, 0);
  assert.equal(f.state.calls.includes('get_grant'), false);
  f.state.patient = wallet(7); f.state.authorized = false; f.state.grant.can_read = false; f.state.grant.can_append = true;
  assert.equal((await f.reader.readAccess(selector)).canRead, false);
});

test('network, code, account, restoration and unexpected authorization fail closed', async () => {
  for (const mutate of [
    f => { f.server.getNetwork = async () => ({ passphrase: Networks.PUBLIC }); },
    f => { f.server.getLedgerEntries = async () => ({ latestLedger: 100, entries: [] }); },
    f => { f.server.getAccount = async () => new Account(wallet(9), '10'); },
    f => { f.state.restore = true; },
    f => { f.state.auth = [{}]; },
    f => { f.state.failure = 'private provider detail'; },
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(() => f.reader.readAccess(selector), { message: 'clinical_chain_unavailable' });
  }
});

test('a permission change during the check cannot be presented as current access', async () => {
  const f = fixture(); const simulate = f.server.simulateTransaction;
  f.server.simulateTransaction = async tx => {
    const result = await simulate(tx);
    if (f.state.calls.at(-1) === 'can_read') f.state.grant = { ...f.state.grant, revision: 3n };
    return result;
  };
  await assert.rejects(() => f.reader.readAccess(selector), { message: 'clinical_chain_unavailable' });
});

test('selectors cannot redirect the verified deployment or request another version', async () => {
  const f = fixture();
  await assert.rejects(() => f.reader.readAccess({ ...selector, deployment: { ...selector.deployment, contractId: config.registryId } }));
  for (const version of [0, 1.5, 4294967296]) await assert.rejects(() => f.reader.readVersion({ ...selector, entryId: '9'.repeat(64), version }));
  assert.equal(f.state.calls.length, 0);
});
