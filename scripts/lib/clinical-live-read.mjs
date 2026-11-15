import { rpc, SorobanDataBuilder, xdr } from '@stellar/stellar-sdk';

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

/** Extract SDK-decoded archival evidence. Only the exact caller can decide
 * whether these persistent keys belong to the getter and record requested. */
export function clinicalArchivedLedgerKeys(simulation) {
  try {
    if (simulation?._parsed !== true || rpc.Api.isSimulationError(simulation) || !rpc.Api.isSimulationSuccess(simulation) ||
        !(simulation.transactionData instanceof SorobanDataBuilder) || !(simulation.result?.retval instanceof xdr.ScVal) ||
        !Array.isArray(simulation.result.auth) || simulation.result.auth.length !== 0) return [];
    let keys;
    if ('restorePreamble' in simulation) {
      if (!rpc.Api.isSimulationRestore(simulation) || !(simulation.restorePreamble.transactionData instanceof SorobanDataBuilder)) return [];
      const data = simulation.restorePreamble.transactionData.build();
      if (!(data instanceof xdr.SorobanTransactionData)) return [];
      const footprint = data.resources().footprint();
      if (data.ext().switch() !== 0 || footprint.readOnly().length) return [];
      keys = footprint.readWrite();
    } else {
      const data = simulation.transactionData.build();
      if (!(data instanceof xdr.SorobanTransactionData)) return [];
      const extension = data.ext();
      if (extension.switch() !== 1) return [];
      const indices = extension.resourceExt().archivedSorobanEntries();
      const readWrite = data.resources().footprint().readWrite();
      if (indices.some((index, position) => !Number.isInteger(index) || index < 0 || index >= readWrite.length ||
          (position > 0 && index <= indices[position - 1]))) return [];
      keys = indices.map(index => readWrite[index]);
    }
    if (keys.some(key => !(key instanceof xdr.LedgerKey) || key.switch().name !== 'contractData' ||
        key.contractData().durability().name !== 'persistent') ||
        new Set(keys.map(key => key.toXDR('base64'))).size !== keys.length) return [];
    return keys;
  } catch { return []; }
}
