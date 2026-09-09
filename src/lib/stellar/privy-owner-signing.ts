import { PrivyClient } from '@privy-io/server-auth';
import { generateAuthorizationSignature } from '@privy-io/server-auth/wallet-api';
import { Keypair, Networks, TransactionBuilder, Transaction } from '@stellar/stellar-sdk';

export interface OwnerBinding {
  userId: string;
  walletId: string;
  address: string;
}

export interface PreparedOwnerTransaction {
  userId: string;
  walletId: string;
  address: string;
  network: 'testnet';
  unsignedXdr: string;
  hash: string;
  expiresAt: number;
}

/** Server-only boundary. The caller must load both records from persistent storage,
 * authorize the action and lock the intent. Never construct them from request JSON.
 * This module does not broadcast or grant an administrator signing authority.
 */
export async function signPreparedOwnerTransaction(
  token: string,
  binding: OwnerBinding,
  intent: PreparedOwnerTransaction,
  dependencies: {
    privy: Pick<PrivyClient, 'verifyAuthToken' | 'getUser' | 'walletApi'>;
    appId: string;
    appSecret: string;
    fetch?: typeof fetch;
    now?: () => number;
  },
): Promise<{ signedXdr: string; hash: string }> {
  const now = dependencies.now ?? Date.now;
  const claims = await dependencies.privy.verifyAuthToken(token);
  if (claims.userId !== binding.userId || intent.userId !== binding.userId ||
      intent.walletId !== binding.walletId || intent.address !== binding.address) {
    throw new Error('owner_mismatch');
  }
  if (intent.network !== 'testnet' || intent.expiresAt <= now()) throw new Error('intent_expired_or_wrong_network');
  const tx = TransactionBuilder.fromXDR(intent.unsignedXdr, Networks.TESTNET);
  if (!(tx instanceof Transaction) || tx.signatures.length || tx.source !== binding.address ||
      tx.hash().toString('hex') !== intent.hash || !tx.timeBounds ||
      Number(tx.timeBounds.maxTime) === 0 || Number(tx.timeBounds.maxTime) * 1000 > intent.expiresAt ||
      Number(tx.timeBounds.maxTime) * 1000 <= now()) throw new Error('invalid_prepared_transaction');

  const wallet = await dependencies.privy.walletApi.getWallet({ id: binding.walletId });
  const user = await dependencies.privy.getUser(claims.userId);
  const linked = user.linkedAccounts as Array<{ type: string; id?: string; address?: string; chainType?: string }>;
  if (wallet.id !== binding.walletId || wallet.chainType !== 'stellar' || wallet.address !== binding.address ||
      !wallet.ownerId || !linked.some(w => w.type === 'wallet' && w.id === binding.walletId &&
        w.address === binding.address && w.chainType === 'stellar')) throw new Error('wallet_binding_changed');

  // Obtain a temporary owner key on this request only. Never mutate a shared
  // SDK client's authorization key (which could mix concurrent users).
  const signer = await dependencies.privy.walletApi.generateUserSigner({ userJwt: token });
  if (signer.expiresAt.getTime() <= now() || !signer.wallets.some(w =>
    w.id === binding.walletId && w.address === binding.address && w.chainType === 'stellar' && w.ownerId === wallet.ownerId
  )) throw new Error('owner_signer_unavailable');
  const url = `https://api.privy.io/v1/wallets/${encodeURIComponent(binding.walletId)}/raw_sign`;
  const body = { params: { hash: `0x${intent.hash}` } };
  const headers = { 'privy-app-id': dependencies.appId };
  const authorization = generateAuthorizationSignature({
    input: { version: 1, method: 'POST', url, body, headers },
    authorizationPrivateKey: signer.authorizationKey,
  });
  if (!authorization) throw new Error('owner_authorization_failed');
  const response = await (dependencies.fetch ?? fetch)(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${dependencies.appId}:${dependencies.appSecret}`).toString('base64')}`,
      'privy-authorization-signature': authorization },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`privy_signing_failed_${response.status}`);
  const result = await response.json();
  const hex = result?.data?.signature?.replace(/^0x/, '');
  if (result?.method !== 'raw_sign' || result?.data?.encoding !== 'hex' ||
      typeof hex !== 'string' || !/^[a-fA-F0-9]{128}$/.test(hex)) throw new Error('invalid_privy_signature');
  const signature = Buffer.from(hex, 'hex');
  if (!Keypair.fromPublicKey(binding.address).verify(tx.hash(), signature)) throw new Error('wrong_wallet_signature');
  if (intent.expiresAt <= now()) throw new Error('intent_expired_or_wrong_network');
  tx.addSignature(binding.address, signature.toString('base64'));
  return { signedXdr: tx.toXDR(), hash: intent.hash };
}
