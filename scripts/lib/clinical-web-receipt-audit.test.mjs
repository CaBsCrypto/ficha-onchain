import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Account, Address, Asset, BASE_FEE, Contract, Keypair, Memo, Networks, Operation,
  TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { createClinicalWebAuditor, WEB_CLINICAL_CONTRACT, webClinicalHistoryId } from './clinical-web-receipt-audit.mjs';

// Deterministic local keys and controlled SDK responses only. No credentials,
// environment files, HTTP calls, database connections, signing providers or RPC.
const patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 31));
const doctor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 32));
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 33));
const other = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 34));
const doctorTarget = { id: 7, address: doctor.publicKey() };
const HISTORY = 'e829603d343a983375f452a987642b075d5edb3a8effcf820355b4275d4a847e';
const OPERATION = '11'.repeat(32), COMMITMENT = 'aa'.repeat(32), PRIOR = 'bb'.repeat(32);
const sha = data => createHash('sha256').update(data).digest();
const addr = key => new Address(key).toScVal();
const bytes = value => nativeToScVal(Buffer.from(value, 'hex'));
const map = value => xdr.ScVal.scvMap(Object.keys(value).sort().map(key =>
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: value[key] })));
const deriveEntry = operation => sha(xdr.ScVal.scvVec([
  xdr.ScVal.scvSymbol('entry_id'), nativeToScVal(sha(Networks.TESTNET)),
  new Address(WEB_CLINICAL_CONTRACT).toScVal(), bytes(HISTORY), addr(patient.publicKey()), bytes(operation),
]).toXDR()).toString('hex');
const ENTRY = deriveEntry(OPERATION);
const clone = value => structuredClone(value);

function authorization(operation, { foreignRoot = false, nested = false } = {}) {
  const invocation = operation.body().invokeHostFunctionOp().hostFunction().invokeContract();
  const root = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(foreignRoot
      ? new Contract(WEB_CLINICAL_CONTRACT).call('get_history', bytes(HISTORY)).body().invokeHostFunctionOp().hostFunction().invokeContract()
      : invocation),
    subInvocations: [],
  });
  if (nested) root.subInvocations([xdr.SorobanAuthorizedInvocation.fromXDR(root.toXDR())]);
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: root,
  });
}

function fixture(action = 'create_history', { correction = false, metaVersion = 3 } = {}) {
  const payload = action === 'create_history' ? {}
    : action === 'append_version' ? correction ? { entryId: ENTRY, expectedVersion: 1 } : {}
      : { doctorId: 7, canRead: true, canAppend: false, expectedRevision: 0 };
  const args = action === 'create_history' ? [addr(patient.publicKey()), bytes(HISTORY), bytes(OPERATION)]
    : action === 'append_version' ? [map({
      history_id: bytes(HISTORY), entry_id: bytes(ENTRY), author: addr(patient.publicKey()),
      commitment: bytes(COMMITMENT), expected_version: nativeToScVal(correction ? 1 : 0, { type: 'u32' }),
      expected_grant_revision: nativeToScVal(0n, { type: 'u64' }), operation_id: bytes(OPERATION),
    })] : [map({
      history_id: bytes(HISTORY), doctor: addr(doctor.publicKey()), can_read: nativeToScVal(true), can_append: nativeToScVal(false),
      expected_revision: nativeToScVal(0n, { type: 'u64' }), operation_id: bytes(OPERATION),
    })];
  const call = new Contract(WEB_CLINICAL_CONTRACT).call(action, ...args);
  const resultScVal = value => nativeToScVal(value, { type: action === 'append_version' ? { version: ['symbol', 'u32'] } : undefined });
  const value = action === 'create_history' ? { history_id: Buffer.from(HISTORY, 'hex'), patient: patient.publicKey(), created_at: 1700000000n }
    : action === 'append_version' ? {
      author: patient.publicKey(), commitment: Buffer.from(COMMITMENT, 'hex'),
      previous_commitment: correction ? Buffer.from(PRIOR, 'hex') : null, version: correction ? 2 : 1, created_at: 1700000000n,
    } : { can_read: true, can_append: false, revision: 1n };
  const tag = action === 'create_history' ? 'create' : action === 'append_version' ? 'append' : 'grant';
  const proofArgs = action === 'create_history' ? args : [args[0]];
  const proof = {
    digest: sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(tag), new Address(WEB_CLINICAL_CONTRACT).toScVal(), ...proofArgs]).toXDR()),
    outcome: [action === 'create_history' ? 'History' : action === 'append_version' ? 'Version' : 'Permissions', clone(value)],
  };
  const state = {
    network: Networks.TESTNET, ledger: 101, reads: [], requests: [], forbiddenCalls: 0,
    chainValue: clone(value), previous: { ...clone(value), version: 1, commitment: Buffer.from(PRIOR, 'hex'), previous_commitment: null },
    proof, auth: [], restore: false, readError: false, metaVersion, events: [],
  };
  const operation = { id: '592cc5ac-9427-4f12-8d7c-62ad7ed9ecf5', action, state: 'confirmed', transactionHash: '' };
  const receipt = { status: 'SUCCESS', feeBump: true, ledger: 100, txHash: '', envelopeXdr: null, returnValue: resultScVal(value) };
  let outer;
  function correspondence(returnValue = receipt.returnValue, version = state.metaVersion) {
    receipt.returnValue = returnValue;
    const resultHash = sha(new xdr.InvokeHostFunctionSuccessPreImage({ returnValue, events: state.events }).toXDR());
    const hostResult = xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(
      xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(resultHash)));
    const innerResult = new xdr.InnerTransactionResult({
      feeCharged: xdr.Int64.fromString('100'), result: xdr.InnerTransactionResultResult.txSuccess([hostResult]),
      ext: new xdr.InnerTransactionResultExt(0),
    });
    receipt.resultXdr = new xdr.TransactionResult({
      feeCharged: xdr.Int64.fromString('10000'), result: xdr.TransactionResultResult.txFeeBumpInnerSuccess(
        new xdr.InnerTransactionResultPair({ transactionHash: outer.innerTransaction.hash(), result: innerResult })),
      ext: new xdr.TransactionResultExt(0),
    });
    receipt.resultMetaXdr = version === 3
      ? new xdr.TransactionMeta(3, new xdr.TransactionMetaV3({
        ext: new xdr.ExtensionPoint(0), txChangesBefore: [], operations: [], txChangesAfter: [],
        sorobanMeta: new xdr.SorobanTransactionMeta({ ext: new xdr.SorobanTransactionMetaExt(0), events: state.events,
          returnValue, diagnosticEvents: [] }),
      }))
      : new xdr.TransactionMeta(4, new xdr.TransactionMetaV4({
        ext: new xdr.ExtensionPoint(0), txChangesBefore: [], txChangesAfter: [],
        operations: [new xdr.OperationMetaV2({ ext: new xdr.ExtensionPoint(0), changes: [], events: state.events })],
        sorobanMeta: new xdr.SorobanTransactionMetaV2({ ext: new xdr.SorobanTransactionMetaExt(0), returnValue }),
        events: [], diagnosticEvents: [],
      }));
  }
  function rebuild({
    source = patient, innerSigner = patient, feeSource = payer, outerSigner = feeSource,
    selectedCall = call, extraOperations = [], auth = [], explicitSource, memo,
    network = Networks.TESTNET, additionalInner, additionalOuter,
  } = {}) {
    if (auth.length) {
      selectedCall = xdr.Operation.fromXDR(selectedCall.toXDR());
      selectedCall.body().invokeHostFunctionOp().auth(auth);
    }
    if (explicitSource) {
      selectedCall = xdr.Operation.fromXDR(selectedCall.toXDR());
      selectedCall.sourceAccount(xdr.MuxedAccount.keyTypeEd25519(Keypair.fromPublicKey(explicitSource).rawPublicKey()));
    }
    const builder = new TransactionBuilder(new Account(source.publicKey(), '100'), { fee: BASE_FEE, networkPassphrase: network })
      .addOperation(selectedCall).setTimebounds(0, 1600000000); // Historical receipts remain auditable after expiry.
    if (memo) builder.addMemo(memo);
    for (const extra of extraOperations) builder.addOperation(extra);
    const inner = builder.build();
    if (innerSigner) inner.sign(innerSigner);
    if (additionalInner) inner.sign(additionalInner);
    outer = TransactionBuilder.buildFeeBumpTransaction(feeSource, '2000000', inner, network);
    if (outerSigner) outer.sign(outerSigner);
    if (additionalOuter) outer.sign(additionalOuter);
    receipt.envelopeXdr = outer.toEnvelope();
    operation.transactionHash = outer.hash().toString('hex');
    receipt.txHash = operation.transactionHash;
    correspondence();
  }
  const forbidden = async () => { state.forbiddenCalls++; throw Error('PRIVATE PROVIDER SENTINEL'); };
  const server = {
    getNetwork: async () => ({ passphrase: state.network }),
    getTransaction: async hash => { state.requests.push(hash); return receipt; },
    simulateTransaction: async transaction => {
      assert.equal(transaction.signatures.length, 0);
      const invocation = transaction.operations[0].func.invokeContract();
      const method = invocation.functionName().toString();
      const selector = invocation.args().map(scValToNative);
      state.reads.push({ method, selector });
      if (state.readError) throw Error('postgres://credential PRIVATE PROVIDER SENTINEL');
      let observed;
      if (method === 'get_operation') observed = state.proof;
      else if (method === 'get_history') observed = state.chainValue;
      else if (method === 'get_version') observed = selector[2] === 1 && correction ? state.previous : state.chainValue;
      else throw Error('unexpected_controlled_read');
      const retval = method === 'get_operation' && observed
        ? map(Object.fromEntries(Object.entries(observed).map(([key, val]) => [key, key === 'outcome'
          ? xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(val[0]), resultScVal(val[1])]) : nativeToScVal(val)])))
        : resultScVal(observed);
      const result = { latestLedger: state.ledger, transactionData: {}, result: { auth: state.auth, retval } };
      if (state.restore) result.restorePreamble = { transactionData: {} };
      return result;
    },
    getAccount: forbidden, getLedgerEntries: forbidden, prepareTransaction: forbidden, sendTransaction: forbidden,
  };
  rebuild();
  const auditor = createClinicalWebAuditor({ server, relayer: payer.publicKey(), now: () => 1800000000000 });
  const verify = () => auditor.operation(operation, {
    action, patient: patient.publicKey(), doctor: doctorTarget, payload,
    snapshot: { history: { id: HISTORY, patient: patient.publicKey() } },
  });
  return { state, operation, receipt, payload, args, value, call, server, auditor, verify, rebuild, correspondence,
    get outer() { return outer; } };
}
async function rejected(f) {
  await assert.rejects(f.verify, { message: 'rehearsal_receipt_invalid' });
  assert.equal(f.state.forbiddenCalls, 0);
}


test('history derivation is pinned to a fixed patient, Testnet and the clinical contract', () => {
  assert.equal(webClinicalHistoryId(patient.publicKey()), HISTORY);
  assert.notEqual(webClinicalHistoryId(other.publicKey()), HISTORY);
  assert.throws(() => webClinicalHistoryId('S_PRIVATE_SEED_SENTINEL'), { message: 'rehearsal_receipt_invalid' });
});

test('three clinical actions verify historical signed fee bumps and independent durable outcomes without writes', async () => {
  for (const action of ['create_history', 'append_version', 'set_permissions']) {
    const f = fixture(action), result = await f.verify();
    assert.equal(result.hash, f.operation.transactionHash);
    assert.equal(result.historyId, HISTORY);
    assert.equal(result.method, action);
    assert.equal(result.signatureVerified, true);
    assert.equal(result.argumentsVerified, true);
    assert.equal(result.chainProofVerified, true);
    assert.deepEqual(f.state.requests, [f.operation.transactionHash]);
    assert.equal(f.state.forbiddenCalls, 0);
    const publicResult = JSON.stringify(result);
    assert.ok(!publicResult.includes(f.outer.toXDR()));
    assert.ok(!publicResult.includes('signed_xdr'));
    assert.ok(!publicResult.includes('PRIVATE'));
  }
});

test('protocol metadata v4 verifies its operation events and return value', async () => {
  const f = fixture('append_version', { metaVersion: 4 });
  assert.equal((await f.verify()).version, 1);
  assert.equal(f.state.forbiddenCalls, 0);
});

test('correction reads the earlier immutable version and preserves its commitment', async () => {
  const f = fixture('append_version', { correction: true }), result = await f.verify();
  assert.equal(result.entryId, ENTRY);
  assert.equal(result.version, 2);
  assert.equal(result.commitment, COMMITMENT);
  assert.deepEqual(f.state.reads.filter(row => row.method === 'get_version').map(row => row.selector[2]), [1, 2]);
});

test('grant evidence remains auditable after a later withdrawal', async () => {
  const f = fixture('set_permissions');
  // get_grant is intentionally unavailable: current permissions cannot rewrite
  // the historical outcome associated with an exact executed operation.
  f.state.chainValue = { can_read: false, can_append: false, revision: 2n };
  assert.equal((await f.verify()).method, 'set_permissions');
  assert.deepEqual(f.state.reads.map(row => row.method), ['get_operation']);
});

test('patient, physician and relayer must be independent actors before preflight reads', async () => {
  for (const [patientAddress, physician] of [
    [patient.publicKey(), { ...doctorTarget, address: patient.publicKey() }],
    [payer.publicKey(), doctorTarget],
  ]) {
    const f = fixture();
    await assert.rejects(() => f.auditor.preflight({ patient: patientAddress, doctor: physician }), { message: 'rehearsal_actor_invalid' });
    assert.equal(f.state.requests.length, 0);
    assert.equal(f.state.reads.length, 0);
    assert.equal(f.state.forbiddenCalls, 0);
  }
});

test('unfinished API states, wrong action, wrong network and unrelated envelope hashes cannot pass', async () => {
  for (const mutate of [
    f => { f.operation.state = 'submitted'; },
    f => { f.operation.action = 'append_version'; },
    f => { f.state.network = Networks.PUBLIC; },
    f => { f.operation.transactionHash = '22'.repeat(32); },
  ]) { const f = fixture(); mutate(f); await rejected(f); }
});

test('NOT_FOUND, FAILED, missing fee-bump marker and invalid ledger never become successful evidence', async () => {
  for (const mutate of [
    f => { f.receipt.status = 'NOT_FOUND'; },
    f => { f.receipt.status = 'FAILED'; },
    f => { f.receipt.feeBump = false; },
    f => { f.receipt.ledger = 0; },
    f => { f.receipt.ledger = 1.5; },
    f => { delete f.receipt.envelopeXdr; },
    f => { delete f.receipt.returnValue; },
  ]) { const f = fixture(); mutate(f); await rejected(f); }
});

test('the expected patient must sign the inner transaction exactly once', async () => {
  for (const options of [{ innerSigner: null }, { innerSigner: other }, { additionalInner: other }]) {
    const f = fixture(); f.rebuild(options); await rejected(f);
  }
});

test('the expected relayer must be the fee source and sign the fee bump exactly once', async () => {
  for (const options of [{ feeSource: other }, { outerSigner: null }, { outerSigner: other }, { additionalOuter: other }]) {
    const f = fixture(); f.rebuild(options); await rejected(f);
  }
});

test('a properly signed substitute source, explicit source, memo or extra operation is rejected', async () => {
  for (const options of [
    { source: other, innerSigner: other },
    { explicitSource: patient.publicKey() },
    { memo: Memo.text('private-sentinel') },
    { extraOperations: [Operation.payment({ destination: other.publicKey(), asset: Asset.native(), amount: '1' })] },
  ]) { const f = fixture(); f.rebuild(options); await rejected(f); }
});

test('an exact source authorization is allowed while foreign roots, nested calls and extra authorizations fail', async () => {
  const valid = fixture(); valid.rebuild({ auth: [authorization(valid.call)] });
  assert.equal((await valid.verify()).chainProofVerified, true);
  for (const authOptions of [{ foreignRoot: true }, { nested: true }, null]) {
    const f = fixture();
    const auth = authOptions === null ? [authorization(f.call), authorization(f.call)] : [authorization(f.call, authOptions)];
    f.rebuild({ auth }); await rejected(f);
  }
});

test('a different contract, method or history cannot substitute a correctly signed invocation', async () => {

  for (const change of ['contract', 'method', 'history']) {
    const f = fixture();
    const contract = change === 'contract' ? new Address(other.publicKey()).toScAddress() : new Address(WEB_CLINICAL_CONTRACT).toScAddress();
    const altered = xdr.Operation.fromXDR(f.call.toXDR());
    const invocation = altered.body().invokeHostFunctionOp().hostFunction().invokeContract();
    invocation.contractAddress(contract);
    if (change === 'method') invocation.functionName('set_permissions');
    if (change === 'history') invocation.args([f.args[0], bytes('33'.repeat(32)), f.args[2]]);
    f.rebuild({ selectedCall: altered }); await rejected(f);
  }
});

test('typed append arguments prevent a signed wrong version, grant revision, entry or extra field', async () => {
  for (const mutate of [
    fields => { fields.expected_version = nativeToScVal(0n, { type: 'u64' }); },
    fields => { fields.expected_grant_revision = nativeToScVal(1n, { type: 'u64' }); },
    fields => { fields.entry_id = bytes('44'.repeat(32)); },
    fields => { fields.private_note = nativeToScVal('PRIVATE NOTE'); },
  ]) {
    const f = fixture('append_version');
    const fields = Object.fromEntries(f.args[0].map().map(row => [row.key().sym().toString(), row.val()]));
    mutate(fields);
    f.rebuild({ selectedCall: new Contract(WEB_CLINICAL_CONTRACT).call('append_version', map(fields)) }); await rejected(f);
  }
});

test('snapshot owner or derived history mismatch fails even with an exact successful receipt', async () => {
  for (const history of [{ id: '55'.repeat(32), patient: patient.publicKey() }, { id: HISTORY, patient: other.publicKey() }]) {
    const f = fixture();
    await assert.rejects(() => f.auditor.operation(f.operation, {
      action: 'create_history', patient: patient.publicKey(), doctor: doctorTarget, payload: {}, snapshot: { history },
    }), { message: 'rehearsal_receipt_invalid' });
  }
});

test('append receipt commitment, author and returned version must match its call and independent chain version', async () => {
  for (const mutate of [
    f => { f.state.chainValue.commitment = Buffer.alloc(32, 3); },
    f => { f.state.chainValue.author = other.publicKey(); },
    f => { f.state.chainValue.version = 2; },
    f => { f.correspondence(nativeToScVal({ ...f.value, commitment: Buffer.alloc(32, 4) })); },
    f => { f.correspondence(nativeToScVal({ ...f.value, version: 2 })); },
  ]) { const f = fixture('append_version'); mutate(f); await rejected(f); }
});

test('correction cannot hide a missing or changed previous commitment', async () => {
  for (const mutate of [
    f => { f.state.previous.commitment = Buffer.alloc(32, 5); },
    f => { f.correspondence(nativeToScVal({ ...f.value, previous_commitment: null })); },
  ]) { const f = fixture('append_version', { correction: true }); mutate(f); await rejected(f); }
});

test('returned permissions cannot silently broaden access or skip the expected revision', async () => {
  for (const value of [
    { can_read: true, can_append: true, revision: 1n },
    { can_read: false, can_append: false, revision: 1n },
    { can_read: true, can_append: false, revision: 2n },

  ]) { const f = fixture('set_permissions'); f.correspondence(nativeToScVal(value)); await rejected(f); }
});

test('a missing, different or malformed durable operation proof cannot approve a receipt', async () => {
  for (const mutate of [
    f => { f.state.proof.digest = Buffer.alloc(32, 6); },
    f => { f.state.proof.outcome[0] = 'Permissions'; },
    f => { f.state.proof.outcome[1].patient = other.publicKey(); },
    f => { f.state.proof.extra = 'PRIVATE SENTINEL'; },
    f => { f.state.proof = null; },
  ]) { const f = fixture(); mutate(f); await rejected(f); }
});

test('unavailable, archival, signed or regressing chain reads remain errors and sanitize diagnostics', async () => {
  for (const mutate of [
    f => { f.state.readError = true; },
    f => { f.state.restore = true; },
    f => { f.state.auth = [{}]; },
    f => { f.state.ledger = 0; },
    f => { const original = f.server.simulateTransaction; f.server.simulateTransaction = async tx => {
      const result = await original(tx); result.latestLedger = f.state.reads.length === 1 ? 102 : 101; return result;
    }; },
  ]) { const f = fixture(); mutate(f); await rejected(f); }
});

test('SUCCESS cannot contradict failed outer, inner or host-function XDR results', async () => {
  for (const mutate of [
    f => { f.receipt.resultXdr.result(xdr.TransactionResultResult.txFailed([])); },
    f => { f.receipt.resultXdr.result().innerResultPair().result().result(xdr.InnerTransactionResultResult.txFailed([])); },
    f => { f.receipt.resultXdr.result().innerResultPair().result().result().results()[0] = xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped())); },
    f => { f.receipt.resultXdr.result().innerResultPair().transactionHash(Buffer.alloc(32, 7)); },
    f => { delete f.receipt.resultXdr; },
  ]) { const f = fixture(); mutate(f); await rejected(f); }
});

test('the return value must correspond to metadata and the host-function success preimage', async () => {
  for (const mutate of [
    f => { f.receipt.returnValue = nativeToScVal('PRIVATE SUBSTITUTE'); },
    f => { f.receipt.resultMetaXdr.value().sorobanMeta().returnValue(nativeToScVal('PRIVATE SUBSTITUTE')); },
    f => { f.receipt.resultXdr.result().innerResultPair().result().result().results()[0] = xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32, 8)))); },
    f => { f.receipt.resultMetaXdr = new xdr.TransactionMeta(0, []); },
    f => { f.receipt.resultMetaXdr.value().sorobanMeta(null); },
    f => { delete f.receipt.resultMetaXdr; },
  ]) { const f = fixture(); mutate(f); await rejected(f); }
});

test('metadata v4 cannot omit its operation events or substitute its return value', async () => {
  for (const mutate of [
    f => { f.receipt.resultMetaXdr.value().operations([]); },
    f => { f.receipt.resultMetaXdr.value().sorobanMeta().returnValue(nativeToScVal('PRIVATE SUBSTITUTE')); },
  ]) { const f = fixture('append_version', { metaVersion: 4 }); mutate(f); await rejected(f); }
});




test('typed permission arguments bind the selected physician, independent flags and revision', async () => {
  for (const mutate of [
    fields => { fields.doctor = addr(other.publicKey()); },
    fields => { fields.can_append = nativeToScVal(true); },
    fields => { fields.expected_revision = nativeToScVal(0, { type: 'u32' }); },
  ]) {
    const f = fixture('set_permissions');
    const fields = Object.fromEntries(f.args[0].map().map(row => [row.key().sym().toString(), row.val()]));
    mutate(fields);
    f.rebuild({ selectedCall: new Contract(WEB_CLINICAL_CONTRACT).call('set_permissions', map(fields)) });
    await rejected(f);
  }
  const changedTarget = fixture('set_permissions');
  changedTarget.payload.doctorId = 8;
  await rejected(changedTarget);
});

test('malformed or expanded return fields cannot be represented as verified clinical results', async () => {
  for (const [action, mutate] of [
    ['create_history', fields => { delete fields.history_id; }],
    ['create_history', fields => { fields.created_at = nativeToScVal('PRIVATE TIMESTAMP'); }],
    ['append_version', fields => { fields.extra = nativeToScVal('PRIVATE NOTE'); }],
    ['append_version', fields => { fields.version = nativeToScVal(1n, { type: 'u64' }); }],
    ['set_permissions', fields => { fields.revision = nativeToScVal(1, { type: 'u32' }); }],
  ]) {
    const f = fixture(action);
    const fields = Object.fromEntries(f.receipt.returnValue.map().map(row => [scValToNative(row.key()), row.val()]));
    mutate(fields);
    f.correspondence(map(fields));
    await rejected(f);
  }
});
