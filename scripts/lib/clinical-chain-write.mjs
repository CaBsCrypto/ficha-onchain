import { createHash } from 'node:crypto';
import { BASE_FEE, Keypair, Networks, StrKey, TransactionBuilder, scValToNative } from '@stellar/stellar-sdk';

const unavailable = () => new Error('clinical_transaction_unavailable');
const digest = value => createHash('sha256').update(value).digest('hex');

/** Technical Testnet execution boundary. Operation construction and policy are
 * trusted server-side dependencies, never caller-supplied transaction XDR.
 * The store must durably save the signed envelope before submission. Its lock
 * must coordinate this source with other flows; uncertain jobs retain ownership.
 * No retry constructs another transaction for the same intent. */
export function createClinicalTransactionRunner({ network, source, server, store, sign,
  assertExclusive, verifyOperation, writesEnabled = false }) {
  if (network !== 'testnet' || !StrKey.isValidEd25519PublicKey(source) ||
      typeof assertExclusive !== 'function' || typeof verifyOperation !== 'function') throw unavailable();
  function matchesOperation(tx, operation) {
    const actual = tx.toEnvelope().v1().tx().operations()[0];
    if (!actual || Boolean(actual.sourceAccount()) !== Boolean(operation.sourceAccount()) ||
        (actual.sourceAccount() && !actual.sourceAccount().toXDR().equals(operation.sourceAccount().toXDR()))) return false;
    if (actual.body().switch().name !== 'invokeHostFunction' || operation.body().switch().name !== 'invokeHostFunction') return false;
    const invoked = actual.body().invokeHostFunctionOp(), expected = operation.body().invokeHostFunctionOp().hostFunction();
    if (!invoked.hostFunction().toXDR().equals(expected.toXDR())) return false;
    for (const authorization of invoked.auth()) {
      const root = authorization.rootInvocation();
      if (authorization.credentials().switch().name !== 'sorobanCredentialsSourceAccount' || root.subInvocations().length) return false;
      const fn = root.function();
      const matches = expected.switch().name === 'hostFunctionTypeInvokeContract'
        ? fn.switch().name === 'sorobanAuthorizedFunctionTypeContractFn' && fn.contractFn().toXDR().equals(expected.invokeContract().toXDR())
        : expected.switch().name === 'hostFunctionTypeCreateContractV2'
          ? fn.switch().name === 'sorobanAuthorizedFunctionTypeCreateContractV2HostFn' && fn.createContractV2HostFn().toXDR().equals(expected.createContractV2().toXDR())
          : false;
      if (!matches) return false;
    }
    return true;
  }
  function verifyEnvelope(saved, operation) {
    const tx = TransactionBuilder.fromXDR(saved.xdr, Networks.TESTNET);
    if (tx.innerTransaction || tx.source !== source || tx.operations.length !== 1 ||
        !tx.operations[0].type || tx.hash().toString('hex') !== saved.hash ||
        !matchesOperation(tx, operation) ||
        !tx.signatures.some(s => Keypair.fromPublicKey(source).verify(tx.hash(), s.signature()))) throw unavailable();
    return tx;
  }
  return {
    async run({ id, operation, resubmitSaved = false }) {
      let phase = 'configuration';
      try {
        if (typeof id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(id)) throw unavailable();
        if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw unavailable();
        await verifyOperation(operation);
        await assertExclusive();
        const intent = digest(Buffer.concat([Buffer.from('clinical-testnet-v1:' + source), operation.body().toXDR()]));
        phase = 'load_attempt';
        let saved = await store.load(id);
        if (saved && (saved.intent !== intent || saved.source !== source)) throw unavailable();
        if (!saved) {
          if (!writesEnabled) return { status: 'writes_paused' };
          if (store.reserve) await store.reserve(id, { intent, source });
          phase = 'prepare';
          const unsigned = new TransactionBuilder(await server.getAccount(source), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
            .addOperation(operation).setTimeout(180).build();
          const prepared = await server.prepareTransaction(unsigned);
          // Preparation cannot redirect the caller's operation or change source.
          if (prepared.source !== source || prepared.operations.length !== 1 ||
              !matchesOperation(prepared, operation)) throw unavailable();
          await assertExclusive();
          phase = 'sign';
          const signed = TransactionBuilder.fromXDR(await sign(prepared.toXDR()), Networks.TESTNET);
          if (!signed.hash().equals(prepared.hash())) throw unavailable();
          saved = { intent, source, hash: signed.hash().toString('hex'), xdr: signed.toXDR() };
          verifyEnvelope(saved, operation);
          await assertExclusive();
          phase = 'persist';
          await store.save(id, saved);
          await assertExclusive();
          // A lost reply preserves the exact signed transaction for reconciliation.
          phase = 'submit';
          await server.sendTransaction(signed);
        }
        const tx = verifyEnvelope(saved, operation);
        await assertExclusive();
        phase = 'reconcile';
        const receipt = await server.getTransaction(saved.hash);
        if (receipt.status === 'SUCCESS' || receipt.status === 'FAILED') {
          if (!receipt.envelopeXdr || !receipt.envelopeXdr.toXDR().equals(tx.toEnvelope().toXDR()) ||
              !Number.isSafeInteger(receipt.ledger) || receipt.ledger < 1) throw unavailable();
          await assertExclusive();
          return { status: receipt.status, transactionHash: saved.hash, ledger: receipt.ledger,
            value: receipt.returnValue ? scValToNative(receipt.returnValue) : null };
        }
        if (receipt.status !== 'NOT_FOUND') throw unavailable();
        if (resubmitSaved && writesEnabled) {
          const expiry = Number(tx.timeBounds?.maxTime ?? 0);
          if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) {
            return { status: 'pending', transactionHash: saved.hash, expired: true };
          }
          await assertExclusive();
          await server.sendTransaction(tx);
        }
        return { status: 'pending', transactionHash: saved.hash };
      } catch { const error = unavailable(); error.phase = phase; throw error; }
    },
  };
}
