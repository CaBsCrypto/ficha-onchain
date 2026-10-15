import { xdr } from '@stellar/stellar-sdk';

/** RPC may return zero for either archived state or a live entry with unknown
 * TTL. This only validates metadata: the caller must also pin the entry/code
 * and require successful, authorization-free simulations without restoration. */
export function clinicalTtlMetadataUsable(ttl, ledger) {
  if (!Number.isSafeInteger(ledger) || ledger < 1 || ledger > 0xffff_ffff) return false;
  return ttl === undefined || (Number.isSafeInteger(ttl) && ttl >= 0 && ttl <= 0xffff_ffff && (ttl === 0 || ttl >= ledger));
}

/** Protocol 23+ may simulate archived state successfully without a legacy
 * restorePreamble. Such a result is not a verified live read until restored.
 * Never sign, restore or submit from this boundary. Malformed XDR fails closed. */
export function clinicalSimulationIsLive(simulation) {
  try {
    if (!simulation || 'restorePreamble' in simulation) return false;
    const data = simulation.transactionData.build();
    if (!(data instanceof xdr.SorobanTransactionData)) return false;
    const extension = data.ext();
    return extension.switch() === 0 || (extension.switch() === 1 && extension.resourceExt().archivedSorobanEntries().length === 0);
  } catch { return false; }
}
