import { createHash } from 'node:crypto';
import { Account, Address, BASE_FEE, Contract, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { PRIVATE_REGISTRY_ID } from './private-registry.mjs';

export const CLINICAL_AUDIT_DOCTOR = 'GA2CSQROVUXJYUH6MTGN42UP3P624NY23HXUW2N3LYX5FSEQ4E2TX3TR';
export const PRIVATE_PRESCRIPTION_ID = 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE';
const HEX = /^[a-f0-9]{64}$/;
const METHODS = new Set(['interface_version', 'get_registry', 'get_admin', 'get_booking_authority', 'get_authorization', 'is_authorized', 'get_prescription', 'is_valid']);
const failed = reason => new Error(reason);
const sha = value => createHash('sha256').update(value).digest('hex');
const address = value => new Address(value).toScVal();

function unsignedInteger(value, minimum = 0) {
  if (!['number', 'bigint'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) throw failed('audit_result_invalid');
  return Number(value);
}
function exactFields(value, names) {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) throw failed('audit_result_invalid');
}
function bytes32(value) {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) throw failed('audit_result_invalid');
  return Buffer.from(value).toString('hex');
}

/** Public-only deployment audit. The adapter exposes simulations and ledger
 * reads, never signing, funding, restoring or submitting a transaction. */
export function createClinicalContractAuditor({ server, readerAddress }) {
  if (!server || !StrKey.isValidEd25519PublicKey(readerAddress)) throw failed('audit_configuration_invalid');
  let ledger = 0;
  async function read(contractId, method, args = []) {
    if (!StrKey.isValidContract(contractId) || !METHODS.has(method)) throw failed('audit_configuration_invalid');
    const tx = new TransactionBuilder(new Account(readerAddress, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(60).build();
    const result = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(result) || rpc.Api.isSimulationRestore(result) || !result.result ||
        !Array.isArray(result.result.auth) || result.result.auth.length !== 0) throw failed('audit_read_unavailable');
    const current = unsignedInteger(result.latestLedger, 1);
    if (current < ledger) throw failed('audit_ledger_regressed');
    ledger = current;
    return scValToNative(result.result.retval);
  }
  async function verifyWasm(contractId, expectedWasmHash) {
    if (!StrKey.isValidContract(contractId) || !HEX.test(expectedWasmHash)) throw failed('audit_configuration_invalid');
    const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }));
    const observed = await server.getLedgerEntries(key);
    const current = unsignedInteger(observed.latestLedger, 1);
    if (current < ledger || observed.entries?.length !== 1) throw failed('audit_instance_unavailable');
    const entry = observed.entries[0];
    if (!entry.key.toXDR().equals(key.toXDR()) || entry.val.switch().name !== 'contractData' ||
        !entry.val.contractData().contract().toXDR().equals(new Address(contractId).toScAddress().toXDR()) ||
        !entry.val.contractData().key().toXDR().equals(xdr.ScVal.scvLedgerKeyContractInstance().toXDR()) ||
        entry.val.contractData().durability().name !== 'persistent' || entry.val.contractData().val().switch().name !== 'scvContractInstance' ||
        (entry.liveUntilLedgerSeq !== undefined && unsignedInteger(entry.liveUntilLedgerSeq) < current)) throw failed('audit_instance_unavailable');
    const executable = entry.val.contractData().val().instance().executable();
    if (executable.switch().name !== 'contractExecutableWasm' || executable.wasmHash().toString('hex') !== expectedWasmHash) throw failed('audit_wasm_mismatch');
    ledger = current;
    const codeKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(expectedWasmHash, 'hex') }));
    const code = await server.getLedgerEntries(codeKey);
    const codeLedger = unsignedInteger(code.latestLedger, 1);
    if (codeLedger < ledger || code.entries?.length !== 1 || !code.entries[0].key.toXDR().equals(codeKey.toXDR()) ||
        code.entries[0].val.switch().name !== 'contractCode' ||
        (code.entries[0].liveUntilLedgerSeq !== undefined && unsignedInteger(code.entries[0].liveUntilLedgerSeq) < codeLedger)) throw failed('audit_code_unavailable');
    const value = code.entries[0].val.contractCode();
    if (value.hash().toString('hex') !== expectedWasmHash || sha(value.code()) !== expectedWasmHash) throw failed('audit_wasm_mismatch');
    ledger = codeLedger;
    return { observedWasmHash: expectedWasmHash, wasmBytes: value.code().length, observedLedger: ledger };
  }
  return {
    async auditDeployment({ name, contractId, expectedWasmHash, interfaceVersion, configuration = {} }) {
      const code = await verifyWasm(contractId, expectedWasmHash);
      if (await read(contractId, 'interface_version') !== interfaceVersion) throw failed('audit_interface_mismatch');
      const checks = ['network_testnet', 'instance_wasm_hash', 'code_bytes_sha256', 'interface_version'];
      for (const [method, expected] of Object.entries(configuration)) {
        if (!METHODS.has(method) || await read(contractId, method) !== expected) throw failed('audit_configuration_mismatch');
        checks.push(method);
      }
      return { name, contractId, explorer: `https://stellar.expert/explorer/testnet/contract/${contractId}`, expectedWasmHash,
        ...code, interfaceVersion, interfaceVerified: true, configurationVerified: true, wasmVerified: true, status: 'verified', checks, observedLedger: ledger };
    },
    async network() {
      if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw failed('audit_network_mismatch');
      return { network: 'testnet' };
    },
    async doctor(wallet = CLINICAL_AUDIT_DOCTOR, nowSeconds = Math.floor(Date.now() / 1000)) {
      if (!StrKey.isValidEd25519PublicKey(wallet) || !Number.isSafeInteger(nowSeconds)) throw failed('audit_configuration_invalid');
      const record = await read(PRIVATE_REGISTRY_ID, 'get_authorization', [address(wallet)]);
      exactFields(record, ['commitment', 'schema_version', 'version', 'valid_until', 'revoked']);
      const authorized = await read(PRIVATE_REGISTRY_ID, 'is_authorized', [address(wallet)]);
      const validUntil = unsignedInteger(record.valid_until, 1);
      const after = await read(PRIVATE_REGISTRY_ID, 'get_authorization', [address(wallet)]);
      exactFields(after, ['commitment', 'schema_version', 'version', 'valid_until', 'revoked']);
      if (bytes32(after.commitment) !== bytes32(record.commitment) || after.schema_version !== record.schema_version ||
          unsignedInteger(after.version, 1) !== unsignedInteger(record.version, 1) || unsignedInteger(after.valid_until, 1) !== validUntil ||
          after.revoked !== record.revoked) throw failed('audit_authorization_changed');
      if (typeof authorized !== 'boolean' || typeof record.revoked !== 'boolean' || record.schema_version !== 1 ||
          (authorized && (record.revoked || validUntil <= nowSeconds))) throw failed('audit_authorization_invalid');
      return { wallet, authorized, revoked: record.revoked, validUntil, validUntilUtc: new Date(validUntil * 1000).toISOString(),
        version: unsignedInteger(record.version, 1), commitment: bytes32(record.commitment), schemaVersion: 1,
        remainingSeconds: Math.max(0, validUntil - nowSeconds), observedLedger: ledger };
    },
    async prescription(fixture, nowSeconds = Math.floor(Date.now() / 1000)) {
      if (!fixture || fixture.contractId !== PRIVATE_PRESCRIPTION_ID || !/^[1-9]\d*$/.test(fixture.rxId) ||
          !StrKey.isValidEd25519PublicKey(fixture.doctor) || !StrKey.isValidEd25519PublicKey(fixture.patient) ||
          !HEX.test(fixture.commitment) || !Number.isSafeInteger(fixture.expiresAt) || fixture.expiresAt <= 0) throw failed('audit_fixture_invalid');
      const value = await read(fixture.contractId, 'get_prescription', [nativeToScVal(BigInt(fixture.rxId), { type: 'u64' })]);
      exactFields(value, ['id', 'doctor', 'patient', 'commitment', 'schema_version', 'issued_at', 'expires_at', 'status']);
      const status = Array.isArray(value.status) && value.status.length === 1 ? value.status[0] : null;
      if (String(value.id) !== fixture.rxId || value.doctor !== fixture.doctor || value.patient !== fixture.patient ||
          bytes32(value.commitment) !== fixture.commitment || value.schema_version !== 1 ||
          unsignedInteger(value.expires_at, 1) !== fixture.expiresAt || !['Registered', 'Active', 'Revoked', 'Blocked'].includes(status)) throw failed('audit_fixture_mismatch');
      const isValid = await read(fixture.contractId, 'is_valid', [nativeToScVal(BigInt(fixture.rxId), { type: 'u64' })]);
      if (typeof isValid !== 'boolean' || isValid !== (status === 'Active' && fixture.expiresAt > nowSeconds)) throw failed('audit_fixture_mismatch');
      return { status: 'verified', contractId: fixture.contractId, rxId: fixture.rxId, lifecycleState: status,
        expired: fixture.expiresAt <= nowSeconds, isValid, commitment: fixture.commitment,
        issuedAt: unsignedInteger(value.issued_at, 1), expiresAt: fixture.expiresAt, correspondenceVerified: true,
        contentRead: false, changed: false, evidenceKind: 'existing_public_record_read', observedLedger: ledger };
    },
  };
}
