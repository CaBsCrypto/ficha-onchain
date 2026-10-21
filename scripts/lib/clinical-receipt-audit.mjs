import { Address, Contract, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { validateClinicalContext } from './clinical-crypto.mjs';

const NAMES = ['create_history', 'grant', 'append_pdf', 'correct_pdf', 'append_image', 'revoke'];
const RECORDS = ['append_pdf', 'correct_pdf', 'append_image'];
const HEX = /^[a-f0-9]{64}$/;
const fail = () => new Error('clinical_receipt_unverified');
const bytes = value => nativeToScVal(Buffer.from(value, 'hex'));
const address = value => new Address(value).toScVal();
const struct = value => xdr.ScVal.scvMap(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1)
  .map(([key, val]) => new xdr.ScMapEntry({ key: nativeToScVal(key, { type: 'symbol' }), val })));
const exactNames = (value, names) => value && typeof value === 'object' &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));

function expectedCalls(deployment, state) {
  if (deployment?.network !== 'testnet' || !StrKey.isValidContract(deployment.contractId) ||
      state?.network !== 'testnet' || state.contractId !== deployment.contractId || state.completed !== true ||
      !StrKey.isValidEd25519PublicKey(state.patient) || !StrKey.isValidEd25519PublicKey(state.doctor) ||
      state.patient === state.doctor || !HEX.test(state.historyId ?? '') ||
      !exactNames(state.operations, NAMES) || !exactNames(state.transactions, NAMES) || !exactNames(state.records, RECORDS) ||
      NAMES.some(name => !HEX.test(state.operations[name])) || new Set(Object.values(state.operations)).size !== NAMES.length) throw fail();
  const records = Object.fromEntries(RECORDS.map(name => {
    const record = state.records[name], context = validateClinicalContext(record?.context);
    if (context.contractId !== deployment.contractId || context.historyId !== state.historyId ||
        context.patient !== state.patient || context.author !== state.doctor ||
        context.version !== (name === 'correct_pdf' ? 2 : 1) || !HEX.test(record.commitment ?? '')) throw fail();
    return [name, { context, commitment: record.commitment }];
  }));
  if (records.correct_pdf.context.entryId !== records.append_pdf.context.entryId ||
      records.correct_pdf.context.previousCommitment !== records.append_pdf.commitment ||
      records.append_image.context.entryId === records.append_pdf.context.entryId) throw fail();
  const contract = new Contract(deployment.contractId);
  return NAMES.map(name => {
    const source = RECORDS.includes(name) ? state.doctor : state.patient;
    let method, args;
    if (name === 'create_history') {
      method = 'create_history'; args = [address(state.patient), bytes(state.historyId), bytes(state.operations[name])];
    } else if (name === 'grant' || name === 'revoke') {
      method = 'set_permissions'; const granted = name === 'grant';
      args = [struct({ history_id: bytes(state.historyId), doctor: address(state.doctor),
        can_read: nativeToScVal(granted), can_append: nativeToScVal(granted),
        expected_revision: nativeToScVal(BigInt(granted ? 0 : 1), { type: 'u64' }), operation_id: bytes(state.operations[name]) })];
    } else {
      method = 'append_version'; const record = records[name];
      args = [struct({ history_id: bytes(state.historyId), entry_id: bytes(record.context.entryId), author: address(source),
        commitment: bytes(record.commitment), expected_version: nativeToScVal(record.context.version - 1, { type: 'u32' }),
        expected_grant_revision: nativeToScVal(1n, { type: 'u64' }), operation_id: bytes(state.operations[name]) })];
    }
    const manifest = { ...state.transactions[name] };
    if (manifest.source !== source || manifest.status !== 'SUCCESS' || !HEX.test(manifest.transactionHash ?? '') ||
        !Number.isSafeInteger(manifest.ledger) || manifest.ledger < 1) throw fail();
    return { name, source, method, operation: contract.call(method, ...args), manifest, record: records[name],
      patient: state.patient, historyId: state.historyId };
  });
}

function matchesCall(transaction, expected) {
  if (transaction.innerTransaction || transaction.source !== expected.source || transaction.operations.length !== 1) return false;
  const operation = transaction.toEnvelope().v1().tx().operations()[0];
  if (operation.sourceAccount() || operation.body().switch().name !== 'invokeHostFunction') return false;
  const actual = operation.body().invokeHostFunctionOp();
  const wanted = expected.operation.body().invokeHostFunctionOp().hostFunction();
  if (!actual.hostFunction().toXDR().equals(wanted.toXDR())) return false;
  for (const authorization of actual.auth()) {
    const root = authorization.rootInvocation(), fn = root.function();
    if (authorization.credentials().switch().name !== 'sorobanCredentialsSourceAccount' || root.subInvocations().length ||
        fn.switch().name !== 'sorobanAuthorizedFunctionTypeContractFn' || !fn.contractFn().toXDR().equals(wanted.invokeContract().toXDR())) return false;
  }
  return transaction.signatures.some(signature => Keypair.fromPublicKey(expected.source).verify(transaction.hash(), signature.signature()));
}

function matchesReturn(value, expected) {
  if (expected.name === 'create_history') return value?.patient === expected.patient &&
    value.history_id instanceof Uint8Array && Buffer.from(value.history_id).toString('hex') === expected.historyId &&
    Number.isSafeInteger(Number(value.created_at)) && Number(value.created_at) >= 0;
  if (expected.name === 'grant' || expected.name === 'revoke') {
    const granted = expected.name === 'grant';
    return value?.can_read === granted && value.can_append === granted && value.revision === BigInt(granted ? 1 : 2);
  }
  return value?.author === expected.source && value.version === expected.record.context.version &&
    value.commitment instanceof Uint8Array && Buffer.from(value.commitment).toString('hex') === expected.record.commitment &&
    (value.previous_commitment === null ? null : value.previous_commitment instanceof Uint8Array
      ? Buffer.from(value.previous_commitment).toString('hex') : undefined) === expected.record.context.previousCommitment &&
    Number.isSafeInteger(Number(value.created_at)) && Number(value.created_at) >= 0;
}

/** Audits a completed synthetic run, never signs, prepares, funds or submits.
 * Expected calls come from the preserved run context, not RPC response values.
 * A provider's SUCCESS is insufficient without the exact saved envelope, actor
 * signature, invocation arguments and returned result. No XDR is returned/logged.
 */
export async function auditClinicalRunReceipts({ deployment, state, attempts, server }) {
  try {
    const expected = expectedCalls(deployment, state);
    if (!Array.isArray(attempts) || attempts.length !== NAMES.length ||
        new Set(attempts.map(row => row.operation_name)).size !== NAMES.length ||
        attempts.some(row => !NAMES.includes(row.operation_name) || (row.run_id !== undefined && row.run_id !== state.runId)) ||
        typeof server?.getNetwork !== 'function' || typeof server?.getTransaction !== 'function') throw fail();
    const saved = expected.map(call => {
      const row = attempts.find(candidate => candidate.operation_name === call.name);
      if (row.state !== 'confirmed' || row.source_wallet !== call.source || row.transaction_hash !== call.manifest.transactionHash ||
          typeof row.signed_xdr !== 'string' || Buffer.byteLength(row.signed_xdr) > 1_000_000) throw fail();
      const transaction = TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET);
      if (transaction.hash().toString('hex') !== row.transaction_hash || !matchesCall(transaction, call)) throw fail();
      return { call, transaction, hash: row.transaction_hash };
    });
    if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw fail();
    const results = [];
    for (const { call, transaction, hash } of saved) {
      const receipt = await server.getTransaction(hash);
      if (receipt.status !== 'SUCCESS' || (receipt.hash !== undefined && receipt.hash !== hash) ||
          !Number.isSafeInteger(receipt.ledger) || receipt.ledger !== call.manifest.ledger ||
          !receipt.envelopeXdr?.toXDR().equals(transaction.toEnvelope().toXDR()) ||
          !receipt.returnValue || !matchesReturn(scValToNative(receipt.returnValue), call)) throw fail();
      results.push({ name: call.name, source: call.source, contractId: deployment.contractId, method: call.method,
        transactionHash: hash, status: 'SUCCESS', ledger: receipt.ledger,
        signatureVerified: true, argumentsVerified: true, envelopeVerified: true });
    }
    return results;
  } catch { throw fail(); }
}
