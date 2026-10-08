/** Server-only clinical ledger boundary. Callers supply a persisted server intent,
 * never an intent reconstructed from browser XDR. No funding or restoration occurs. */
import { createHash } from 'node:crypto';
import { Account, Address, BASE_FEE, Contract, FeeBumpTransaction, Keypair, Networks,
  StrKey, Transaction, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { PRIVATE_ADMIN, REGISTRY_PRIVATE, PrivateFlowError } from '@/lib/private-config';
import type { ClinicalAction, ClinicalExpected } from '@/types/clinical';
import { validateClinicalContext } from '../../../scripts/lib/clinical-crypto.mjs';

export const CLINICAL_CONTRACT = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
export const CLINICAL_WASM = '29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0';
const REGISTRY_WASM = 'b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02';
const HEX = /^[a-f0-9]{64}$/;
const MAX_FEE = BigInt(100_000_000);
const unavailable = () => new PrivateFlowError('clinical_chain_unavailable', 503);
const invalid = () => new PrivateFlowError('clinical_prepared_operation_invalid');
export const CLINICAL_METHODS: Record<ClinicalAction, string> = {
  create_history: 'create_history', append_version: 'append_version', set_permissions: 'set_permissions',
};
function wallet(value: string) { if (!StrKey.isValidEd25519PublicKey(value)) throw invalid(); return new Address(value).toScVal(); }
function bytes(value: string) { if (!HEX.test(value) || /^0+$/.test(value)) throw invalid(); return nativeToScVal(Buffer.from(value, 'hex')); }
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if ((typeof value !== 'number' && typeof value !== 'bigint') || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw invalid();
  return Number(value);
}
function u64(value: unknown) { return nativeToScVal(BigInt(number(value)), { type: 'u64' }); }
function struct(value: Record<string, xdr.ScVal>) {
  return xdr.ScVal.scvMap(Object.keys(value).sort().map(key => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: value[key] })));
}
function bool(value: unknown) { if (typeof value !== 'boolean') throw invalid(); return nativeToScVal(value); }

/** Same tuple encoding as the deployed Rust derivation; no RPC or secrets. */
export function deriveClinicalHistoryId(patient: string) {
  const tuple = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('hist_id'), nativeToScVal(createHash('sha256').update(Networks.TESTNET).digest()),
    new Address(CLINICAL_CONTRACT).toScVal(), wallet(patient)]);
  return createHash('sha256').update(tuple.toXDR()).digest('hex');
}
export function deriveClinicalEntryId(historyId: string, author: string, operationId: string) {
  const tuple = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'), nativeToScVal(createHash('sha256').update(Networks.TESTNET).digest()),
    new Address(CLINICAL_CONTRACT).toScVal(), bytes(historyId), wallet(author), bytes(operationId)]);
  return createHash('sha256').update(tuple.toXDR()).digest('hex');
}
export function clinicalInvocation(action: ClinicalAction, e: ClinicalExpected) {
  if (!Object.hasOwn(CLINICAL_METHODS, action) || !e || typeof e !== 'object') throw invalid();
  bytes(e.historyId); wallet(e.patient); bytes(e.operationId);
  if (e.historyId !== deriveClinicalHistoryId(e.patient)) throw invalid();
  let args: xdr.ScVal[];
  if (action === 'create_history') {
    if (e.historyId !== deriveClinicalHistoryId(e.patient)) throw invalid();
    args = [wallet(e.patient), bytes(e.historyId), bytes(e.operationId)];
  } else if (action === 'set_permissions') {
    if (e.doctor === e.patient) throw invalid();
    args = [struct({ history_id: bytes(e.historyId), doctor: wallet(e.doctor!), can_read: bool(e.canRead), can_append: bool(e.canAppend),
      expected_revision: u64(e.expectedRevision), operation_id: bytes(e.operationId) })];
  } else {
    const head = number(e.expectedVersion, 0, 0xffff_fffe);
    if (head === 0 && e.entryId !== deriveClinicalEntryId(e.historyId, e.author!, e.operationId)) throw invalid();
    if (head === 0 ? e.previousCommitment != null : !e.previousCommitment || !HEX.test(e.previousCommitment)) throw invalid();
    const revision = number(e.expectedGrantRevision);
    if (e.author === e.patient ? revision !== 0 : revision < 1) throw invalid();
    args = [struct({ history_id: bytes(e.historyId), entry_id: bytes(e.entryId!), author: wallet(e.author!), commitment: bytes(e.commitment!),
      expected_version: nativeToScVal(head, { type: 'u32' }), expected_grant_revision: u64(revision), operation_id: bytes(e.operationId) })];
  }
  return new Contract(CLINICAL_CONTRACT).call(CLINICAL_METHODS[action], ...args);
}
function assertClinicalBody(tx: Transaction, source: string, action: ClinicalAction, expected: ClinicalExpected) {
  wallet(source);
  const actor = action === 'append_version' ? expected.author : expected.patient;
  const body = tx.toEnvelope().v1().tx();
  const op = tx.operations[0];
  const invocation = clinicalInvocation(action, expected).body().invokeHostFunctionOp().hostFunction();
  const maxTime = Number(tx.timeBounds?.maxTime), minTime = Number(tx.timeBounds?.minTime);
  if (tx.networkPassphrase !== Networks.TESTNET || tx.source !== source || actor !== source || tx.operations.length !== 1 ||
      op.type !== 'invokeHostFunction' || op.source !== undefined || body.memo().switch().name !== 'memoNone' ||
      body.cond().switch().name !== 'precondTime' || minTime !== 0 || !Number.isSafeInteger(maxTime) || maxTime < 1 ||
      maxTime > Math.floor(Date.now() / 1000) + 300 || !/^\d+$/.test(tx.sequence) || BigInt(tx.sequence) < BigInt(1) ||
      BigInt(tx.fee) < BigInt(BASE_FEE) || BigInt(tx.fee) > MAX_FEE || !op.func.toXDR().equals(invocation.toXDR()) ||
      (op.auth?.length ?? 0) > 1) throw invalid();
  for (const auth of op.auth ?? []) {
    const root = auth.rootInvocation();
    if (auth.credentials().switch().name !== 'sorobanCredentialsSourceAccount' || root.subInvocations().length ||
        root.function().switch().name !== 'sorobanAuthorizedFunctionTypeContractFn' ||
        !root.function().contractFn().toXDR().equals(invocation.invokeContract().toXDR())) throw invalid();
  }
}
export function assertClinicalUnsigned(tx: Transaction, source: string, action: ClinicalAction, expected: ClinicalExpected) {
  try { if (!(tx instanceof Transaction) || tx.signatures.length) throw invalid(); assertClinicalBody(tx, source, action, expected); }
  catch { throw invalid(); }
}
function relayer() {
  try { if (!process.env.RELAYER_SECRET) throw Error(); return Keypair.fromSecret(process.env.RELAYER_SECRET); }
  catch { throw new PrivateFlowError('relayer_unavailable', 503); }
}
function checkSingleSignature(tx: Transaction | FeeBumpTransaction, address: string) {
  const key = Keypair.fromPublicKey(address), signatures = tx.signatures;
  if (signatures.length !== 1 || !signatures[0].hint().equals(key.signatureHint()) || !key.verify(tx.hash(), signatures[0].signature())) throw invalid();
}
function assertFeeBump(tx: Transaction | FeeBumpTransaction, historical = false) {
  if (!(tx instanceof FeeBumpTransaction) || tx.networkPassphrase !== Networks.TESTNET || (!historical && tx.feeSource !== relayer().publicKey()) ||
      BigInt(tx.fee) > MAX_FEE || BigInt(tx.fee) <= BigInt(tx.innerTransaction.fee)) throw invalid();
  checkSingleSignature(tx, tx.feeSource);
  checkSingleSignature(tx.innerTransaction, tx.innerTransaction.source);
  return tx;
}
export function sponsorClinicalSignature(unsignedXdr: string, source: string, signatureHex: string, action: ClinicalAction, expected: ClinicalExpected) {
  const parsed = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
  if (!(parsed instanceof Transaction)) throw invalid();
  assertClinicalUnsigned(parsed, source, action, expected);
  const hex = signatureHex.replace(/^0x/, '');
  if (!/^[a-f0-9]{128}$/i.test(hex) || !Keypair.fromPublicKey(source).verify(parsed.hash(), Buffer.from(hex, 'hex'))) {
    throw new PrivateFlowError('owner_signature_invalid', 403);
  }
  if (Number(parsed.timeBounds?.maxTime) <= Math.floor(Date.now() / 1000)) throw new PrivateFlowError('signature_request_expired');
  parsed.addSignature(source, Buffer.from(hex, 'hex').toString('base64'));
  const payer = relayer();
  const bumped = TransactionBuilder.buildFeeBumpTransaction(payer, '2000000', parsed, Networks.TESTNET);
  bumped.sign(payer);
  assertFeeBump(bumped);
  return { xdr: bumped.toXDR(), hash: bumped.hash().toString('hex') };
}
export interface ClinicalSavedEnvelope {
  unsigned_xdr: string; signed_xdr: string; transaction_hash: string;
  source_wallet: string; signing_hash: string; action: ClinicalAction; expected: ClinicalExpected;
  method?: string; contract_id?: string;
}
/** This record must come from the persistent server store. Expired signed
 * envelopes remain verifiable for reconciliation; never re-sign a pending row. */
export function assertClinicalSavedEnvelope(row: ClinicalSavedEnvelope, options: { historical?: boolean } = {}) {
  try {
    const unsigned = TransactionBuilder.fromXDR(row.unsigned_xdr, Networks.TESTNET);
    if (!(unsigned instanceof Transaction) || !HEX.test(row.signing_hash) || !HEX.test(row.transaction_hash) ||
        (row.contract_id !== undefined && row.contract_id !== CLINICAL_CONTRACT) ||
        (row.method !== undefined && row.method !== CLINICAL_METHODS[row.action])) throw invalid();
    assertClinicalUnsigned(unsigned, row.source_wallet, row.action, row.expected);
    if (unsigned.hash().toString('hex') !== row.signing_hash) throw invalid();
    // Historical receipts retain their payer's public key and verifiable
    // signature even after a relayer rotation. New submissions still require
    // the currently configured payer.
    const signed = assertFeeBump(TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET), options.historical);
    assertClinicalBody(signed.innerTransaction, row.source_wallet, row.action, row.expected);
    if (signed.hash().toString('hex') !== row.transaction_hash || !signed.innerTransaction.hash().equals(unsigned.hash())) throw invalid();
    return signed;
  } catch { throw invalid(); }
}

type ClinicalRpc = Pick<rpc.Server, 'getNetwork' | 'getLedgerEntries' | 'getAccount' | 'simulateTransaction' | 'prepareTransaction' | 'sendTransaction' | 'getTransaction'>;
export interface ClinicalHistory { id: string; patient: string; createdAt: number }
function fields(value: unknown, expected: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) throw unavailable();
}
function hex32(value: unknown) { if (!(value instanceof Uint8Array) || value.byteLength !== 32) throw unavailable(); return Buffer.from(value).toString('hex'); }
function historyValue(value: unknown, id?: string, patient?: string): ClinicalHistory {
  fields(value, ['history_id', 'patient', 'created_at']);
  const actual = { id: hex32(value.history_id), patient: String(value.patient), createdAt: number(value.created_at) };
  wallet(actual.patient);
  if (actual.id !== deriveClinicalHistoryId(actual.patient) || (id && actual.id !== id) || (patient && actual.patient !== patient)) throw unavailable();
  return actual;
}
export function createClinicalWebChain(server: ClinicalRpc = new rpc.Server('https://soroban-testnet.stellar.org')) {
  let observedLedger = 0;
  let verified: Promise<{ network: 'testnet'; contractId: string; registryId: string; wasmHash: string; interfaceVersion: 1; ledger: number }> | undefined;
  async function read(contract: string, method: string, args: xdr.ScVal[] = [], missing = false): Promise<unknown> {
    const account = await server.getAccount(PRIVATE_ADMIN);
    if (account.accountId() !== PRIVATE_ADMIN) throw unavailable();
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(contract).call(method, ...args)).setTimeout(60).build();
    const sim = await server.simulateTransaction(tx);
    const ledger = number(sim.latestLedger, 1);
    if (ledger < observedLedger) throw unavailable();
    observedLedger = ledger;
    if ('restorePreamble' in sim) throw unavailable();
    if (rpc.Api.isSimulationError(sim)) {
      // Only the exact deployed contract's Missing error for this selected getter
      // is absence. Archival/restoration/provider failures always remain errors.
      if (missing && /^\s*(?:HostError:\s*)?Error\(Contract,\s*#1\)(?:\s|$)/.test(sim.error)) return null;
      throw unavailable();
    }
    if (!rpc.Api.isSimulationSuccess(sim) || rpc.Api.isSimulationRestore(sim) || !sim.result ||
        !Array.isArray(sim.result.auth) || sim.result.auth.length) throw unavailable();
    return scValToNative(sim.result.retval);
  }
  async function pinnedCode(contract: string, hash: string) {
    const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(contract).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
    const instance = await server.getLedgerEntries(key);
    const ledger = number(instance.latestLedger, 1);
    if (ledger < observedLedger) throw unavailable();
    observedLedger = ledger;
    if (instance.entries.length !== 1) throw unavailable();
    const entry = instance.entries[0];
    if (!entry.key.toXDR().equals(key.toXDR()) || entry.val.switch().name !== 'contractData' ||
        (entry.liveUntilLedgerSeq !== undefined && entry.liveUntilLedgerSeq < observedLedger)) throw unavailable();
    const data = entry.val.contractData();
    if (!data.contract().toXDR().equals(new Address(contract).toScAddress().toXDR()) || !data.key().toXDR().equals(xdr.ScVal.scvLedgerKeyContractInstance().toXDR()) ||
        data.durability().name !== 'persistent' || data.val().switch().name !== 'scvContractInstance') throw unavailable();
    const executable = data.val().instance().executable();
    if (executable.switch().name !== 'contractExecutableWasm' || executable.wasmHash().toString('hex') !== hash) throw unavailable();
  }
  async function verify() {
    try {
      if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw unavailable();
      await pinnedCode(CLINICAL_CONTRACT, CLINICAL_WASM);
      await pinnedCode(REGISTRY_PRIVATE, REGISTRY_WASM);
      if (await read(CLINICAL_CONTRACT, 'interface_version') !== 1 || await read(CLINICAL_CONTRACT, 'get_registry') !== REGISTRY_PRIVATE ||
          await read(REGISTRY_PRIVATE, 'interface_version') !== 1 || await read(REGISTRY_PRIVATE, 'get_admin') !== PRIVATE_ADMIN) throw unavailable();
      return { network: 'testnet' as const, contractId: CLINICAL_CONTRACT, registryId: REGISTRY_PRIVATE, wasmHash: CLINICAL_WASM, interfaceVersion: 1 as const, ledger: observedLedger };
    } catch { throw unavailable(); }
  }
  function ensure() { return verified ??= verify().catch(error => { verified = undefined; throw error; }); }
  async function checked<T>(fn: () => Promise<T>): Promise<T> { try { await ensure(); return await fn(); } catch { throw unavailable(); } }
  async function history(id: string) { return checked(async () => historyValue(await read(CLINICAL_CONTRACT, 'get_history', [bytes(id)]), id)); }
  return {
    verifyDeployment: ensure,
    deriveHistoryId: deriveClinicalHistoryId,
    deriveEntryId: deriveClinicalEntryId,
    history,
    historyForPatient: (patient: string) => checked(async () => {
      const value = await read(CLINICAL_CONTRACT, 'get_history_for_patient', [wallet(patient)], true);
      return value === null ? null : historyValue(value, undefined, patient);
    }),
    entry: (historyId: string, entryId: string) => checked(async () => {
      await history(historyId);
      const value = await read(CLINICAL_CONTRACT, 'get_entry', [bytes(historyId), bytes(entryId)], true);
      if (value === null) return null;
      fields(value, ['author', 'head_version']); wallet(String(value.author));
      return { author: String(value.author), headVersion: number(value.head_version, 1, 0xffff_ffff) };
    }),
    grant: (historyId: string, doctor: string) => checked(async () => {
      await history(historyId);
      const value = await read(CLINICAL_CONTRACT, 'get_grant', [bytes(historyId), wallet(doctor)], true);
      if (value === null) return null;
      fields(value, ['can_read', 'can_append', 'revision']);
      if (typeof value.can_read !== 'boolean' || typeof value.can_append !== 'boolean') throw unavailable();
      return { canRead: value.can_read, canAppend: value.can_append, revision: number(value.revision, 1) };
    }),
    version: (historyId: string, entryId: string, version: number) => checked(async () => {
      const h = await history(historyId);
      const value = await read(CLINICAL_CONTRACT, 'get_version', [bytes(historyId), bytes(entryId), nativeToScVal(number(version, 1, 0xffff_ffff), { type: 'u32' })]);
      fields(value, ['author', 'commitment', 'previous_commitment', 'version', 'created_at']);
      if (number(value.version, 1) !== version) throw unavailable();
      const context = validateClinicalContext({ schemaVersion: 1, network: 'testnet', contractId: CLINICAL_CONTRACT,
        historyId, entryId, patient: h.patient, author: value.author, version,
        previousCommitment: value.previous_commitment === null ? null : hex32(value.previous_commitment) });
      return { context, commitment: hex32(value.commitment), createdAt: number(value.created_at), state: 'confirmed' as const };
    }),
    /** Durable contract receipt, independent of RPC transaction retention.
     * The database may only reach confirmed after an exact successful envelope.
     * Re-reading this proof also checks the immutable invocation and outcome. */
    verifyRecordedOperation: (action: ClinicalAction, expected: ClinicalExpected) => checked(async () => {
      const invocation = clinicalInvocation(action, expected).body().invokeHostFunctionOp().hostFunction().invokeContract();
      const payload = action === 'create_history'
        ? [xdr.ScVal.scvSymbol('create'), new Address(CLINICAL_CONTRACT).toScVal(), wallet(expected.patient), bytes(expected.historyId), bytes(expected.operationId)]
        : [xdr.ScVal.scvSymbol(action === 'append_version' ? 'append' : 'grant'), new Address(CLINICAL_CONTRACT).toScVal(), invocation.args()[0]];
      const digest = createHash('sha256').update(xdr.ScVal.scvVec(payload).toXDR()).digest('hex');
      const value = await read(CLINICAL_CONTRACT, 'get_operation', [wallet(action === 'append_version' ? expected.author! : expected.patient), bytes(expected.operationId)]);
      fields(value, ['digest', 'outcome']);
      if (hex32(value.digest) !== digest || !Array.isArray(value.outcome) || value.outcome.length !== 2) throw unavailable();
      const [kind, result] = value.outcome;
      if (action === 'create_history') {
        if (kind !== 'History') throw unavailable();
        historyValue(result, expected.historyId, expected.patient);
      } else if (action === 'set_permissions') {
        fields(result, ['can_read', 'can_append', 'revision']);
        if (kind !== 'Permissions' || result.can_read !== expected.canRead || result.can_append !== expected.canAppend ||
            number(result.revision, 1) !== expected.expectedRevision! + 1) throw unavailable();
      } else {
        fields(result, ['author', 'commitment', 'previous_commitment', 'version', 'created_at']);
        if (kind !== 'Version' || result.author !== expected.author || hex32(result.commitment) !== expected.commitment ||
            number(result.version, 1) !== expected.expectedVersion! + 1 ||
            (result.previous_commitment === null ? null : hex32(result.previous_commitment)) !== expected.previousCommitment) throw unavailable();
        number(result.created_at);
      }
      return true;
    }),
    doctorAuthorized: (address: string) => checked(async () => {
      const value = await read(REGISTRY_PRIVATE, 'is_authorized', [wallet(address)]);
      if (typeof value !== 'boolean') throw unavailable();
      return value;
    }),
    async prepare(source: string, action: ClinicalAction, expected: ClinicalExpected) {
      await ensure();
      const invocation = clinicalInvocation(action, expected);
      let account: Account;
      try { account = await server.getAccount(source); }
      catch (error) {
        if (error instanceof Error && /account.*not found/i.test(error.message)) throw new PrivateFlowError('clinical_account_funding_required', 409);
        throw unavailable();
      }
      if (account.accountId() !== source) throw unavailable();
      try {
        const unsigned = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(invocation).setTimeout(180).build();
        const prepared = await server.prepareTransaction(unsigned);
        assertClinicalUnsigned(prepared, source, action, expected);
        if (prepared.sequence !== unsigned.sequence || JSON.stringify(prepared.timeBounds) !== JSON.stringify(unsigned.timeBounds)) throw invalid();
        return prepared;
      } catch { throw unavailable(); }
    },
    async receipt(hash: string) {
      if (!HEX.test(hash)) throw invalid();
      try {
        const receipt = await server.getTransaction(hash);
        if (!['SUCCESS', 'FAILED', 'NOT_FOUND'].includes(receipt.status)) throw unavailable();
        if (receipt.status !== 'NOT_FOUND' && (!receipt.envelopeXdr || TransactionBuilder.fromXDR(receipt.envelopeXdr, Networks.TESTNET).hash().toString('hex') !== hash ||
            !Number.isSafeInteger(receipt.ledger) || receipt.ledger < 1)) throw unavailable();
        return receipt;
      } catch { throw unavailable(); }
    },
    /** Only call after assertClinicalSavedEnvelope on the locked persistent row. */
    async submit(envelope: string) {
      await ensure();
      try {
        const tx = assertFeeBump(TransactionBuilder.fromXDR(envelope, Networks.TESTNET));
        const op = tx.innerTransaction.operations[0];
        if (tx.operations.length !== 1 || op.type !== 'invokeHostFunction' || op.func.switch().name !== 'hostFunctionTypeInvokeContract' ||
            Address.fromScAddress(op.func.invokeContract().contractAddress()).toString() !== CLINICAL_CONTRACT ||
            !Object.values(CLINICAL_METHODS).includes(op.func.invokeContract().functionName().toString())) throw invalid();
        const sent = await server.sendTransaction(tx);
        if (!['PENDING', 'DUPLICATE', 'TRY_AGAIN_LATER', 'ERROR'].includes(sent.status) || sent.hash !== tx.hash().toString('hex')) throw unavailable();
        return sent.status;
      } catch { throw unavailable(); }
    },
  };
}


