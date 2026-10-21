import { createHash } from 'node:crypto';
import { Account, Address, BASE_FEE, Networks, Operation, SorobanDataBuilder, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';

const unavailable = () => new Error('clinical_restoration_unavailable');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Build an explicit maintenance transaction from a trusted RPC preamble.
 * This does not sign, submit, change permissions or infer confirmation. The
 * caller must persist its exact signed envelope and hold the source lock.
 * Scope is this clinical contract and its pinned code, never the registry or
 * another patient's off-chain data. A public restore grants no private access. */
export function buildClinicalRestoration({ deployment, sourceAccount, preamble }) {
  try {
    if (deployment?.network !== 'testnet' || !StrKey.isValidContract(deployment.contractId) ||
        !/^[a-f0-9]{64}$/.test(deployment.wasmHash) || !(sourceAccount instanceof Account) ||
        !StrKey.isValidEd25519PublicKey(sourceAccount.accountId()) ||
        !/^\d+$/.test(preamble?.minResourceFee ?? '')) throw unavailable();
    const resourceFee = BigInt(preamble.minResourceFee);
    // An explicit conservative cap prevents a provider response causing an
    // unbounded spend. Raising it requires an operational decision.
    if (resourceFee > 10_000_000n) throw unavailable();
    const input = preamble.transactionData?.build instanceof Function
      ? preamble.transactionData.build() : preamble.transactionData;
    const data = new SorobanDataBuilder(input).build();
    if (data.resources().diskReadBytes() < 1 || data.resources().writeBytes() < 1) throw unavailable();
    const footprint = data.resources().footprint();
    const keys = footprint.readWrite();
    if (footprint.readOnly().length || !keys.length || keys.length > 128) throw unavailable();
    const seen = new Set();
    for (const key of keys) {
      const encoded = key.toXDR('base64');
      if (seen.has(encoded)) throw unavailable();
      seen.add(encoded);
      if (key.switch().name === 'contractData') {
        const entry = key.contractData();
        if (entry.durability().name !== 'persistent' ||
            !entry.contract().toXDR().equals(new Address(deployment.contractId).toScAddress().toXDR())) throw unavailable();
      } else if (key.switch().name === 'contractCode') {
        if (key.contractCode().hash().toString('hex') !== deployment.wasmHash) throw unavailable();
      } else throw unavailable();
    }
    if (BigInt(data.resourceFee().toString()) !== resourceFee) throw unavailable();
    const transaction = new TransactionBuilder(
      new Account(sourceAccount.accountId(), sourceAccount.sequenceNumber()),
      // SDK 14 adds Soroban resourceFee to this inclusion fee at build time.
      { fee: BASE_FEE, networkPassphrase: Networks.TESTNET },
    ).setSorobanData(data).addOperation(Operation.restoreFootprint({})).setTimeout(180).build();
    return { transaction, footprintHash: hash(data.resources().footprint().toXDR()),
      keyCount: keys.length, network: 'testnet', contractId: deployment.contractId };
  } catch { throw unavailable(); }
}
