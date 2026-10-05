import { Account, Address, BASE_FEE, Contract, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { validateClinicalContext } from './clinical-crypto.mjs';

const TESTNET_RPC = 'https://soroban-testnet.stellar.org';
const HEX_32 = /^[a-f0-9]{64}$/;
const READ_METHODS = new Set(['interface_version', 'get_registry', 'get_history', 'get_grant', 'can_read', 'get_version']);
const unavailable = () => new Error('clinical_chain_unavailable');
const bytes = value => nativeToScVal(Buffer.from(value, 'hex'));
const address = value => new Address(value).toScVal();

function uint(value, minimum = 0) {
  if ((typeof value !== 'number' && typeof value !== 'bigint') || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) throw unavailable();
  return Number(value);
}

function hex(value) {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) throw unavailable();
  return Buffer.from(value).toString('hex');
}

function fields(value, expected) {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) throw unavailable();
}

function historyFrom(value, historyId) {
  fields(value, ['history_id', 'patient', 'created_at']);
  if (hex(value.history_id) !== historyId || !StrKey.isValidEd25519PublicKey(value.patient)) throw unavailable();
  uint(value.created_at);
  return { patient: value.patient };
}

function grantFrom(value) {
  if (value === null) return null;
  fields(value, ['can_read', 'can_append', 'revision']);
  if (typeof value.can_read !== 'boolean' || typeof value.can_append !== 'boolean') throw unavailable();
  return { canRead: value.can_read, canAppend: value.can_append, revision: uint(value.revision, 1) };
}

/** Read-only adapter for the immutable clinical contract. The optional server
 * parameter is a trusted test dependency, never an HTTP/request parameter.
 * No method signs, submits, funds, restores or extends actual ledger state.
 * Simulation TTL changes are not submitted and do not maintain contract TTL. */
export function createClinicalChainReader(configuration, { server = new rpc.Server(TESTNET_RPC) } = {}) {
  try {
    if (!configuration || configuration.network !== 'testnet' || !StrKey.isValidContract(configuration.contractId) ||
        !StrKey.isValidContract(configuration.registryId) || typeof configuration.wasmHash !== 'string' ||
        !HEX_32.test(configuration.wasmHash) || !StrKey.isValidEd25519PublicKey(configuration.readerAddress)) throw unavailable();
  } catch { throw unavailable(); }
  const configured = Object.freeze({
    network: 'testnet', contractId: configuration.contractId, registryId: configuration.registryId,
    wasmHash: configuration.wasmHash, readerAddress: configuration.readerAddress,
  });
  const deployment = Object.freeze({ network: configured.network, contractId: configured.contractId });

  function checkSelector(selector) {
    if (!selector || !selector.deployment || selector.deployment.network !== configured.network ||
        selector.deployment.contractId !== configured.contractId || typeof selector.historyId !== 'string' || !HEX_32.test(selector.historyId)) throw unavailable();
  }

  async function verifiedReadSession() {
    const network = await server.getNetwork();
    if (network.passphrase !== Networks.TESTNET) throw unavailable();
    const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
      contract: new Address(configured.contractId).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }));
    const ledger = await server.getLedgerEntries(key);
    let observedLedger = uint(ledger.latestLedger, 1);
    if (!Array.isArray(ledger.entries) || ledger.entries.length !== 1) throw unavailable();
    const entry = ledger.entries[0];
    if (!entry.key.toXDR().equals(key.toXDR()) || entry.val.switch().name !== 'contractData') throw unavailable();
    const data = entry.val.contractData();
    if (!data.contract().toXDR().equals(new Address(configured.contractId).toScAddress().toXDR()) ||
        !data.key().toXDR().equals(xdr.ScVal.scvLedgerKeyContractInstance().toXDR()) ||
        data.durability().name !== 'persistent' || data.val().switch().name !== 'scvContractInstance') throw unavailable();
    const executable = data.val().instance().executable();
    if (executable.switch().name !== 'contractExecutableWasm' || executable.wasmHash().toString('hex') !== configured.wasmHash ||
        (entry.liveUntilLedgerSeq !== undefined && uint(entry.liveUntilLedgerSeq) < observedLedger)) throw unavailable();
    const account = await server.getAccount(configured.readerAddress);
    if (account.accountId() !== configured.readerAddress || !/^\d+$/.test(account.sequenceNumber())) throw unavailable();
    const sourceSequence = account.sequenceNumber();
    async function read(method, args = [], missingGrantAllowed = false) {
      if (!READ_METHODS.has(method) || (missingGrantAllowed && method !== 'get_grant')) throw unavailable();
      const tx = new TransactionBuilder(new Account(configured.readerAddress, sourceSequence), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(new Contract(configured.contractId).call(method, ...args)).setTimeout(60).build();
      const simulation = await server.simulateTransaction(tx);
      const currentLedger = uint(simulation.latestLedger, 1);
      if (currentLedger < observedLedger) throw unavailable();
      observedLedger = currentLedger;
      if (rpc.Api.isSimulationError(simulation)) {
        // Only this exact contract's Missing error on its grant getter denotes
        // absence. Provider, auth and archival errors are never an empty grant.
        if (missingGrantAllowed && typeof simulation.error === 'string' &&
            /^\s*(?:HostError:\s*)?Error\(Contract,\s*#1\)(?:\s|$)/.test(simulation.error)) return null;
        throw unavailable();
      }
      if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation) || !simulation.result ||
          !Array.isArray(simulation.result.auth) || simulation.result.auth.length > 0) throw unavailable();
      return scValToNative(simulation.result.retval);
    }
    if (await read('interface_version') !== 1 || await read('get_registry') !== configured.registryId) throw unavailable();
    return { read, ledger: () => observedLedger };
  }

  return {
    deployment,
    async verifyDeployment() {
      try {
        const session = await verifiedReadSession();
        return { ...deployment, registryId: configured.registryId, wasmHash: configured.wasmHash, interfaceVersion: 1, ledger: session.ledger() };
      } catch { throw unavailable(); }
    },
    async readAccess(selector) {
      try {
        checkSelector(selector);
        if (!StrKey.isValidEd25519PublicKey(selector.reader)) throw unavailable();
        const { read } = await verifiedReadSession();
        const history = historyFrom(await read('get_history', [bytes(selector.historyId)]), selector.historyId);
        if (history.patient === selector.reader) {
          if (await read('can_read', [bytes(selector.historyId), address(selector.reader)]) !== true) throw unavailable();
          return { historyId: selector.historyId, patient: history.patient, reader: selector.reader, canRead: true, grantRevision: 0, doctorAuthorized: false };
        }
        const grantArgs = [bytes(selector.historyId), address(selector.reader)];
        const before = grantFrom(await read('get_grant', grantArgs, true));
        const allowed = await read('can_read', grantArgs);
        if (typeof allowed !== 'boolean') throw unavailable();
        const after = grantFrom(await read('get_grant', grantArgs, true));
        if (JSON.stringify(before) !== JSON.stringify(after) || (allowed && (!after || !after.canRead))) throw unavailable();
        // can_read in this pinned WASM requires both the current registry check
        // and the read grant for non-owners. Append is intentionally insufficient.
        return { historyId: selector.historyId, patient: history.patient, reader: selector.reader,
          canRead: allowed, grantRevision: after?.revision ?? 0, doctorAuthorized: allowed };
      } catch { throw unavailable(); }
    },
    async readVersion(selector) {
      try {
        checkSelector(selector);
        if (typeof selector.entryId !== 'string' || !HEX_32.test(selector.entryId) ||
            !Number.isInteger(selector.version) || selector.version < 1 || selector.version > 0xffff_ffff) throw unavailable();
        const { read } = await verifiedReadSession();
        const history = historyFrom(await read('get_history', [bytes(selector.historyId)]), selector.historyId);
        const value = await read('get_version', [bytes(selector.historyId), bytes(selector.entryId), nativeToScVal(selector.version, { type: 'u32' })]);
        fields(value, ['author', 'commitment', 'previous_commitment', 'version', 'created_at']);
        if (uint(value.version, 1) !== selector.version) throw unavailable();
        uint(value.created_at);
        const context = validateClinicalContext({ schemaVersion: 1, ...deployment, historyId: selector.historyId,
          entryId: selector.entryId, author: value.author, patient: history.patient, version: selector.version,
          previousCommitment: value.previous_commitment == null ? null : hex(value.previous_commitment) });
        return { context, commitment: hex(value.commitment), state: 'confirmed' };
      } catch { throw unavailable(); }
    },
  };
}
