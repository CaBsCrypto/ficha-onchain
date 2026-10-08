import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Account, Address, Asset, BASE_FEE, Contract, FeeBumpTransaction, Keypair, Memo, Networks, Operation,
  Transaction, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { CLINICAL_CONTRACT, CLINICAL_WASM, assertClinicalSavedEnvelope, assertClinicalUnsigned, clinicalInvocation,
  createClinicalWebChain, deriveClinicalEntryId, deriveClinicalHistoryId, sponsorClinicalSignature } from '@/lib/clinical/chain';
import { PRIVATE_ADMIN, REGISTRY_PRIVATE } from '@/lib/private-config';
import type { ClinicalAction, ClinicalExpected } from '@/types/clinical';

// Deterministic test identities only. No deployed wallet secret is used.
const patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const doctor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2));
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3));
const historyId = deriveClinicalHistoryId(patient.publicKey());
const operationId = '4'.repeat(64);
const create: ClinicalExpected = { historyId, patient: patient.publicKey(), operationId };
const append: ClinicalExpected = { ...create, entryId: deriveClinicalEntryId(historyId, patient.publicKey(), operationId),
  author: patient.publicKey(), commitment: '5'.repeat(64), expectedVersion: 0, expectedGrantRevision: 0, previousCommitment: null };
const grant: ClinicalExpected = { ...create, doctor: doctor.publicKey(), canRead: true, canAppend: false, expectedRevision: 0 };
function build(action: ClinicalAction = 'create_history', expected = create, options: {
  source?: string; operation?: xdr.Operation; network?: string; timeout?: number; memo?: Memo; auth?: xdr.SorobanAuthorizationEntry[];
} = {}) {
  const invocation = options.operation ?? clinicalInvocation(action, expected);
  if (options.auth) invocation.body().invokeHostFunctionOp().auth(options.auth);
  const builder = new TransactionBuilder(new Account(options.source ?? patient.publicKey(), '10'), {
    fee: BASE_FEE, networkPassphrase: options.network ?? Networks.TESTNET,
  }).addOperation(invocation);
  if (options.memo) builder.addMemo(options.memo);
  return builder.setTimeout(options.timeout ?? 180).build();
}
function authFor(op: xdr.Operation, nested = false, addressAuth = false) {
  const root = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(op.body().invokeHostFunctionOp().hostFunction().invokeContract()),
    subInvocations: [],
  });
  if (nested) root.subInvocations([new xdr.SorobanAuthorizedInvocation({ function: root.function(), subInvocations: [] })]);
  return new xdr.SorobanAuthorizationEntry({
    credentials: addressAuth ? xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address: new Address(patient.publicKey()).toScAddress(), nonce: xdr.Int64.fromString('1'), signatureExpirationLedger: 100,
      signature: xdr.ScVal.scvVoid(),
    })) : xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: root,
  });
}
function saved(action: ClinicalAction = 'create_history', expected = create) {
  const unsigned = build(action, expected);
  const result = sponsorClinicalSignature(unsigned.toXDR(), patient.publicKey(), patient.sign(unsigned.hash()).toString('hex'), action, expected);
  return { unsigned_xdr: unsigned.toXDR(), signed_xdr: result.xdr, transaction_hash: result.hash, signing_hash: unsigned.hash().toString('hex'),
    source_wallet: patient.publicKey(), action, expected, contract_id: CLINICAL_CONTRACT, method: action };
}
const oldRelayer = process.env.RELAYER_SECRET;
beforeEach(() => { process.env.RELAYER_SECRET = payer.secret(); });
afterEach(() => { vi.restoreAllMocks(); if (oldRelayer === undefined) delete process.env.RELAYER_SECRET; else process.env.RELAYER_SECRET = oldRelayer; });

describe('clinical invocation and owner boundary', () => {
  it('derives history and entry ids deterministically with contract/network/owner binding', () => {
    expect(historyId).toMatch(/^[a-f0-9]{64}$/);
    expect(deriveClinicalHistoryId(patient.publicKey())).toBe(historyId);
    expect(deriveClinicalHistoryId(doctor.publicKey())).not.toBe(historyId);
    expect(deriveClinicalEntryId(historyId, doctor.publicKey(), operationId)).not.toBe(append.entryId);
    expect(deriveClinicalEntryId(historyId, patient.publicKey(), '6'.repeat(64))).not.toBe(append.entryId);
  });
  it.each([['create_history', create], ['append_version', append], ['set_permissions', grant]] as const)('validates exact %s invocation', (action, expected) => {
    const tx = build(action, expected);
    expect(() => assertClinicalUnsigned(tx, patient.publicKey(), action, expected)).not.toThrow();
    expect(tx.operations[0].type).toBe('invokeHostFunction');
  });
  it('encodes permission flags independently and appends only opaque proof fields', () => {
    const permissions = scValToNative(clinicalInvocation('set_permissions', grant).body().invokeHostFunctionOp().hostFunction().invokeContract().args()[0]);
    expect(permissions).toMatchObject({ can_read: true, can_append: false, expected_revision: BigInt(0) });
    const record = scValToNative(clinicalInvocation('append_version', append).body().invokeHostFunctionOp().hostFunction().invokeContract().args()[0]);
    expect(Object.keys(record).sort()).toEqual(['author', 'commitment', 'entry_id', 'expected_grant_revision', 'expected_version', 'history_id', 'operation_id']);
  });
  it.each([
    (tx: Transaction) => assertClinicalUnsigned(tx, doctor.publicKey(), 'create_history', create),
    (tx: Transaction) => assertClinicalUnsigned(tx, patient.publicKey(), 'set_permissions', grant),
    (tx: Transaction) => assertClinicalUnsigned(tx, patient.publicKey(), 'create_history', { ...create, operationId: '8'.repeat(64) }),
    (tx: Transaction) => assertClinicalUnsigned(tx, patient.publicKey(), 'create_history', { ...create, patient: doctor.publicKey() }),
  ])('rejects altered actor, action and opaque arguments', attempt => expect(() => attempt(build())).toThrow('clinical_prepared_operation_invalid'));
  it('rejects a different method, contract, memo and operation source', () => {
    const methods = [new Contract(CLINICAL_CONTRACT).call('get_registry'), clinicalInvocation('create_history', create)];
    methods[1].sourceAccount(xdr.MuxedAccount.keyTypeEd25519(patient.rawPublicKey()));
    for (const operation of [...methods, new Contract(REGISTRY_PRIVATE).call('create_history')]) {
      expect(() => assertClinicalUnsigned(build('create_history', create, { operation }), patient.publicKey(), 'create_history', create)).toThrow();
    }
    expect(() => assertClinicalUnsigned(build('create_history', create, { memo: Memo.text('clinical-secret') }), patient.publicKey(), 'create_history', create)).toThrow();
  });
  it('rejects another network, unbounded/long timeout, extra operations and any existing signature', () => {
    for (const options of [{ network: Networks.PUBLIC }, { timeout: 0 }, { timeout: 1000 }]) {
      expect(() => assertClinicalUnsigned(build('create_history', create, options), patient.publicKey(), 'create_history', create)).toThrow();
    }
    const extra = new TransactionBuilder(new Account(patient.publicKey(), '10'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(clinicalInvocation('create_history', create)).addOperation(Operation.payment({ destination: doctor.publicKey(), asset: Asset.native(), amount: '1' })).setTimeout(180).build();
    expect(() => assertClinicalUnsigned(extra, patient.publicKey(), 'create_history', create)).toThrow();
    const signed = build(); signed.sign(patient);
    expect(() => assertClinicalUnsigned(signed, patient.publicKey(), 'create_history', create)).toThrow();
  });
  it('accepts source-account authorization and rejects address, nested, duplicate or redirected authorization', () => {
    const op = clinicalInvocation('create_history', create);
    expect(() => assertClinicalUnsigned(build('create_history', create, { auth: [authFor(op)] }), patient.publicKey(), 'create_history', create)).not.toThrow();
    for (const auth of [[authFor(op, true)], [authFor(op, false, true)], [authFor(op), authFor(op)], [authFor(clinicalInvocation('set_permissions', grant))]]) {
      expect(() => assertClinicalUnsigned(build('create_history', create, { auth }), patient.publicKey(), 'create_history', create)).toThrow();
    }
  });
  it('rejects a wrong append commitment and invalid version/author/grant context', () => {
    expect(() => assertClinicalUnsigned(build('append_version', append), patient.publicKey(), 'append_version', { ...append, commitment: '6'.repeat(64) })).toThrow();
    for (const patch of [{ expectedVersion: -1 }, { expectedVersion: 1 }, { expectedGrantRevision: 1 }, { entryId: '0'.repeat(64) }, { author: doctor.publicKey() }]) {
      expect(() => clinicalInvocation('append_version', { ...append, ...patch })).toThrow();
    }
  });
  it('verifies the owner signature before building a fee-bump paid only by configured relayer', () => {
    const row = saved(); const tx = assertClinicalSavedEnvelope(row);
    expect(tx).toBeInstanceOf(FeeBumpTransaction);
    expect(tx.feeSource).toBe(payer.publicKey());
    expect(tx.innerTransaction.source).toBe(patient.publicKey());
    expect(tx.innerTransaction.hash().toString('hex')).toBe(row.signing_hash);
    const unsigned = build();
    expect(() => sponsorClinicalSignature(unsigned.toXDR(), patient.publicKey(), doctor.sign(unsigned.hash()).toString('hex'), 'create_history', create)).toThrow('owner_signature_invalid');
  });
  it.each(['signing_hash', 'transaction_hash', 'source_wallet', 'contract_id', 'method'])('rejects altered persistent %s', field => {
    const row = saved();
    const changed = { ...row, [field]: field.includes('hash') ? '0'.repeat(64) : 'changed' };
    expect(() => assertClinicalSavedEnvelope(changed)).toThrow();
  });
  it('rejects fee source changes, extra owner/relayer signatures, changed expected intent and unsigned fee bumps', () => {
    const row = saved();
    const tx = TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET) as FeeBumpTransaction;
    const extraInner = tx.innerTransaction; extraInner.sign(doctor);
    const extra = TransactionBuilder.buildFeeBumpTransaction(payer, '2000000', extraInner, Networks.TESTNET); extra.sign(payer);
    expect(() => assertClinicalSavedEnvelope({ ...row, signed_xdr: extra.toXDR(), transaction_hash: extra.hash().toString('hex') })).toThrow();
    tx.sign(doctor);
    expect(() => assertClinicalSavedEnvelope({ ...row, signed_xdr: tx.toXDR(), transaction_hash: tx.hash().toString('hex') })).toThrow();
    expect(() => assertClinicalSavedEnvelope({ ...row, expected: { ...create, operationId: '8'.repeat(64) } })).toThrow();
    process.env.RELAYER_SECRET = doctor.secret();
    expect(() => assertClinicalSavedEnvelope(row)).toThrow();
  });
  it('expired signed attempts remain auditable without generating a new signature', () => {
    const row = saved(); vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300_000);
    expect(() => assertClinicalSavedEnvelope(row)).not.toThrow();
    expect(() => sponsorClinicalSignature(row.unsigned_xdr, patient.publicKey(), patient.sign(Buffer.from(row.signing_hash, 'hex')).toString('hex'), 'create_history', create)).toThrow('signature_request_expired');
  });
  it('checks historical signatures after payer rotation without permitting a new submission by that payer', () => {
    const row = saved();
    delete process.env.RELAYER_SECRET;
    expect(() => assertClinicalSavedEnvelope(row, { historical: true })).not.toThrow();
    expect(() => assertClinicalSavedEnvelope(row)).toThrow();
    const changed = TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET) as FeeBumpTransaction;
    changed.sign(doctor);
    expect(() => assertClinicalSavedEnvelope({ ...row, signed_xdr: changed.toXDR() }, { historical: true })).toThrow();
  });
  it('missing or malformed relayer fails closed', () => {
    delete process.env.RELAYER_SECRET;
    const unsigned = build();
    expect(() => sponsorClinicalSignature(unsigned.toXDR(), patient.publicKey(), patient.sign(unsigned.hash()).toString('hex'), 'create_history', create)).toThrow('relayer_unavailable');
  });
});

function fixture() {
  const state = { ledger: 100, failure: '', restore: false, auth: [] as xdr.SorobanAuthorizationEntry[], missing: '',
    missingAccount: '', wrongNetwork: false, code: CLINICAL_WASM, head: 1, authorized: true, commitment: '5'.repeat(64),
    history: { history_id: Buffer.from(historyId, 'hex'), patient: patient.publicKey(), created_at: BigInt(1) },
    proofDigest: '', proofCommitment: '', proofKind: 'Version', calls: [] as string[], sent: [] as string[] };
  const server = {
    getNetwork: vi.fn(async () => ({ passphrase: state.wrongNetwork ? Networks.PUBLIC : Networks.TESTNET })),
    getLedgerEntries: vi.fn(async (key: xdr.LedgerKey) => {
      const contract = Address.fromScAddress(key.contractData().contract()).toString();
      return { latestLedger: state.ledger, entries: [{ key, liveUntilLedgerSeq: 500,
        val: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ext: new xdr.ExtensionPoint(0),
          contract: new Address(contract).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent(),
          val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ storage: [], executable: xdr.ContractExecutable.contractExecutableWasm(
            Buffer.from(contract === CLINICAL_CONTRACT ? state.code : 'b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02', 'hex')) })),
        })),
      }] };
    }),
    getAccount: vi.fn(async (source: string) => {
      if (source === state.missingAccount) throw Error('Account not found');
      return new Account(source, '10');
    }),
    simulateTransaction: vi.fn(async (tx: Transaction) => {
      const invocation = tx.operations[0].type === 'invokeHostFunction' ? tx.operations[0].func.invokeContract() : null;
      const method = invocation!.functionName().toString(); state.calls.push(method);
      if (state.failure || state.missing === method) return { latestLedger: state.ledger, error: state.failure || 'HostError: Error(Contract, #1)' };
      const values: Record<string, unknown> = { interface_version: 1, get_registry: REGISTRY_PRIVATE, get_admin: PRIVATE_ADMIN,
        get_history: state.history, get_history_for_patient: state.history, get_entry: { author: patient.publicKey(), head_version: state.head },
        get_grant: { can_read: true, can_append: false, revision: BigInt(1) }, is_authorized: state.authorized,
        get_version: { author: patient.publicKey(), commitment: Buffer.from(state.commitment, 'hex'), previous_commitment: null, version: 1, created_at: BigInt(2) } };
      const appendPayload = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('append'), new Address(CLINICAL_CONTRACT).toScVal(),
        clinicalInvocation('append_version', append).body().invokeHostFunctionOp().hostFunction().invokeContract().args()[0]]);
      values.get_operation = { digest: Buffer.from(state.proofDigest || createHash('sha256').update(appendPayload.toXDR()).digest('hex'), 'hex'),
        outcome: [state.proofKind, { ...(values.get_version as object), commitment: Buffer.from(state.proofCommitment || state.commitment, 'hex') }] };
      const result = { latestLedger: state.ledger, transactionData: {}, result: { auth: state.auth, retval: nativeToScVal(values[method], { type: method === 'interface_version' ? 'u32' : undefined }) } };
      return state.restore ? { ...result, restorePreamble: { transactionData: {} } } : result;
    }),
    prepareTransaction: vi.fn(async (tx: Transaction) => tx),
    getTransaction: vi.fn(async () => ({ status: 'NOT_FOUND' })),
    sendTransaction: vi.fn(async (tx: FeeBumpTransaction) => { state.sent.push(tx.toXDR()); return { status: 'PENDING', hash: tx.hash().toString('hex') }; }),
  };
  return { state, server, chain: createClinicalWebChain(server as unknown as Parameters<typeof createClinicalWebChain>[0]) };
}

describe('clinical Testnet RPC boundary', () => {
  it('pins code, configuration and registry using unsigned reads, once per request factory', async () => {
    const f = fixture(); expect(await f.chain.verifyDeployment()).toMatchObject({ contractId: CLINICAL_CONTRACT, wasmHash: CLINICAL_WASM });
    expect(await f.chain.historyForPatient(patient.publicKey())).toMatchObject({ id: historyId, patient: patient.publicKey() });
    expect(await f.chain.entry(historyId, append.entryId!)).toEqual({ author: patient.publicKey(), headVersion: 1 });
    expect(await f.chain.version(historyId, append.entryId!, 1)).toMatchObject({ state: 'confirmed', commitment: append.commitment,
      context: { patient: patient.publicKey(), author: patient.publicKey(), previousCommitment: null } });
    expect(await f.chain.grant(historyId, doctor.publicKey())).toEqual({ canRead: true, canAppend: false, revision: 1 });
    expect(await f.chain.doctorAuthorized(doctor.publicKey())).toBe(true);
    expect(f.server.getNetwork).toHaveBeenCalledTimes(1);
    expect(f.server.sendTransaction).not.toHaveBeenCalled();
  });
  it.each(['get_history_for_patient', 'get_entry', 'get_grant'])('treats only Missing#1 from %s as absence', async method => {
    const f = fixture(); f.state.missing = method;
    const result = method === 'get_history_for_patient' ? await f.chain.historyForPatient(patient.publicKey()) : method === 'get_entry'
      ? await f.chain.entry(historyId, append.entryId!) : await f.chain.grant(historyId, doctor.publicKey());
    expect(result).toBeNull();
  });
  it.each(['HostError: Error(Storage, MissingValue)', 'HostError: Error(Contract, #4)', 'RPC timeout with private diagnostic'])('keeps %s as a recoverable error', async failure => {
    const f = fixture(); await f.chain.verifyDeployment(); f.state.failure = failure;
    await expect(f.chain.historyForPatient(patient.publicKey())).rejects.toThrow('clinical_chain_unavailable');
  });
  it('rejects archival restoration, unexpected auth, network mismatch and WASM mismatch', async () => {
    for (const mutation of [
      (f: ReturnType<typeof fixture>) => { f.state.restore = true; },
      (f: ReturnType<typeof fixture>) => { f.state.auth = [authFor(clinicalInvocation('create_history', create))]; },
      (f: ReturnType<typeof fixture>) => { f.state.wrongNetwork = true; },
      (f: ReturnType<typeof fixture>) => { f.state.code = 'f'.repeat(64); },
    ]) {
      const f = fixture(); mutation(f); await expect(f.chain.verifyDeployment()).rejects.toThrow('clinical_chain_unavailable');
    }
  });
  it('rejects a reverse-index patient mismatch and invalid version evidence', async () => {
    const f = fixture(); f.state.history.patient = doctor.publicKey();
    await expect(f.chain.historyForPatient(patient.publicKey())).rejects.toThrow();
    const other = fixture(); other.state.commitment = 'ab';
    await expect(other.chain.version(historyId, append.entryId!, 1)).rejects.toThrow();
  });
  it('unfunded sources report the prerequisite without funding, preparing or submitting', async () => {
    const f = fixture(); f.state.missingAccount = patient.publicKey();
    await expect(f.chain.prepare(patient.publicKey(), 'create_history', create)).rejects.toThrow('clinical_account_funding_required');
    expect(f.server.prepareTransaction).not.toHaveBeenCalled(); expect(f.server.sendTransaction).not.toHaveBeenCalled();
  });
  it('rejects preparation changing method, actor or timebounds', async () => {
    for (const altered of [build('set_permissions', grant), build('create_history', create, { source: doctor.publicKey() }), build('create_history', create, { timeout: 1000 })]) {
      const f = fixture(); f.server.prepareTransaction = vi.fn(async () => altered);
      await expect(f.chain.prepare(patient.publicKey(), 'create_history', create)).rejects.toThrow('clinical_chain_unavailable');
    }
  });
  it('prepares a valid operation and recovery submits the exact saved envelope', async () => {
    const f = fixture(); const tx = await f.chain.prepare(patient.publicKey(), 'create_history', create);
    expect(tx.source).toBe(patient.publicKey());
    const row = saved(); assertClinicalSavedEnvelope(row);
    await expect(f.chain.submit(row.signed_xdr)).resolves.toBe('PENDING');
    expect(f.state.sent).toEqual([row.signed_xdr]);
  });
  it('rejects receipt/envelope hash mismatch and never treats NOT_FOUND as confirmation', async () => {
    const f = fixture(); const row = saved();
    expect((await f.chain.receipt(row.transaction_hash)).status).toBe('NOT_FOUND');
    f.server.getTransaction = vi.fn(async () => ({ status: 'SUCCESS', ledger: 100, envelopeXdr: build().toEnvelope() })) as typeof f.server.getTransaction;
    await expect(f.chain.receipt(row.transaction_hash)).rejects.toThrow('clinical_chain_unavailable');
  });
  it('reads durable operation evidence without a recent RPC receipt or transmission', async () => {
    const f = fixture();
    await expect(f.chain.verifyRecordedOperation('append_version', append)).resolves.toBe(true);
    expect(f.state.calls).toContain('get_operation');
    expect(f.server.getTransaction).not.toHaveBeenCalled();
    expect(f.server.sendTransaction).not.toHaveBeenCalled();
  });
  it('rejects missing, mismatched digest, different outcome or altered commitment', async () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.state.missing = 'get_operation'; },
      (f: ReturnType<typeof fixture>) => { f.state.proofDigest = 'a'.repeat(64); },
      (f: ReturnType<typeof fixture>) => { f.state.proofKind = 'Permissions'; },
      (f: ReturnType<typeof fixture>) => { f.state.proofCommitment = 'c'.repeat(64); },
    ]) {
      const f = fixture(); mutate(f);
      await expect(f.chain.verifyRecordedOperation('append_version', append)).rejects.toThrow('clinical_chain_unavailable');
    }
  });
});

