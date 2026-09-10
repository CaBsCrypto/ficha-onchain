import { Address, BASE_FEE, Contract, Networks, StrKey, TransactionBuilder, rpc, scValToNative } from '@stellar/stellar-sdk';

export const PRIVATE_REGISTRY_ID = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';

export async function readAuthorization({ wallet, source, registryId, expectedAdmin, server = new rpc.Server('https://soroban-testnet.stellar.org') }) {
  if (registryId !== PRIVATE_REGISTRY_ID || !StrKey.isValidEd25519PublicKey(wallet) ||
      !StrKey.isValidEd25519PublicKey(source) || !StrKey.isValidEd25519PublicKey(expectedAdmin)) throw Error('registry_configuration_invalid');
  const account = await server.getAccount(source);
  async function read(method, args = [], missingAllowed = false) {
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(registryId).call(method, ...args)).setTimeout(60).build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      // Only the registry's Missing error from this exact read denotes absence.
      if (missingAllowed && /^\s*(?:HostError:\s*)?Error\(Contract,\s*#1\)(?:\s|$)/.test(sim.error)) return null;
      throw Error('registry_read_failed');
    }
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) throw Error('registry_read_failed');
    return scValToNative(sim.result.retval);
  }
  if (Number(await read('interface_version')) !== 1) throw Error('registry_interface_mismatch');
  const admin = await read('get_admin');
  if (admin !== expectedAdmin) throw Error('registry_authority_mismatch');
  const record = await read('get_authorization', [new Address(wallet).toScVal()], true);
  const authorized = await read('is_authorized', [new Address(wallet).toScVal()]);
  if (typeof authorized !== 'boolean') throw Error('registry_record_invalid');
  if (record === null) {
    if (authorized) throw Error('registry_record_changed');
    return { authorization: null, authorized: false, admin };
  }
  const authorization = { commitment: Buffer.from(record.commitment).toString('hex'), schema_version: Number(record.schema_version),
    version: Number(record.version), valid_until: Number(record.valid_until), revoked: record.revoked };
  if (!/^[a-f0-9]{64}$/.test(authorization.commitment) || authorization.schema_version !== 1 ||
      !Number.isSafeInteger(authorization.version) || authorization.version < 1 ||
      !Number.isSafeInteger(authorization.valid_until) || authorization.valid_until < 1 || typeof authorization.revoked !== 'boolean' ||
      (authorization.revoked && authorized)) throw Error('registry_record_invalid');
  return { authorization, authorized, admin };
}
