import { FeeBumpTransaction, Networks, StrKey, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
const unavailable = () => new Error('clinical_funding_receipt_unverified');
function stroops(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,7})?$/.test(value)) throw unavailable();
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'));
}

/** Checks an already successful Testnet funding receipt. Inputs are public
 * Horizon records and expected synthetic destination. Never signs or sends. */
export function verifyClinicalTestnetFunding({ transactionHash, patient, transaction, operations }) {
  try {
    if (!/^[a-f0-9]{64}$/.test(transactionHash) || !StrKey.isValidEd25519PublicKey(patient) ||
        !transaction || transaction.hash !== transactionHash || transaction.successful !== true ||
        !Number.isSafeInteger(transaction.ledger) || transaction.ledger < 1 || transaction.operation_count !== 1 ||
        !StrKey.isValidEd25519PublicKey(transaction.source_account) || !Array.isArray(operations) || operations.length !== 1 ||
        !Number.isFinite(Date.parse(transaction.created_at))) throw unavailable();
    const parsed = TransactionBuilder.fromXDR(transaction.envelope_xdr, Networks.TESTNET);
    if (!(parsed instanceof Transaction || parsed instanceof FeeBumpTransaction) || parsed.hash().toString('hex') !== transactionHash) throw unavailable();
    const inner = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
    if (inner.source !== transaction.source_account || inner.operations.length !== 1 || inner.signatures.length === 0) throw unavailable();
    const operation = inner.operations[0], observed = operations[0];
    const funder = operation.source ?? inner.source;
    if (operation.type !== 'createAccount' || operation.destination !== patient || observed.type !== 'create_account' ||
        observed.transaction_hash !== transactionHash || observed.transaction_successful !== true || observed.account !== patient ||
        observed.funder !== funder || observed.source_account !== funder || !StrKey.isValidEd25519PublicKey(funder) ||
        stroops(operation.startingBalance) <= 0n || stroops(operation.startingBalance) !== stroops(observed.starting_balance)) throw unavailable();
    return { network: 'testnet', readOnly: true, status: 'verified', transactionHash, patient,
      ledger: transaction.ledger, confirmedAt: transaction.created_at, operation: 'create_account',
      amountXlm: observed.starting_balance, sourceAccount: transaction.source_account, operationSource: funder,
      feeChargedStroops: transaction.fee_charged, envelopeHashVerified: true, destinationVerified: true,
      operationsVerified: 1, clinicalOperation: false, explorer: `https://stellar.expert/explorer/testnet/tx/${transactionHash}` };
  } catch { throw unavailable(); }
}
