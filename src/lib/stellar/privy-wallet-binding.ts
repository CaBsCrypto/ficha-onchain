import type { Sql } from '@/lib/db';
import { StrKey } from '@stellar/stellar-sdk';
type Wallet = { id?: string | null; address?: string; chainType?: string; type?: string };
type Binding = { wallet_id: string | null; address: string | null };
export class WalletBindingError extends Error {}
export interface WalletProvider {
  getUser(id: string): Promise<{ linkedAccounts: Wallet[] }>;
  walletApi: {
    getWallet(args: { id: string }): Promise<Wallet>;
    createWallet(args: { chainType: 'stellar'; owner: { userId: string } }): Promise<Wallet>;
  };
}
/** Persist a claim before creation. Never retry an uncertain create response. */
export async function resolveStellarWallet(sql: Sql, provider: WalletProvider, appId: string, userId: string, allowCreate = false): Promise<{walletId:string;address:string;chain:'stellar';created:false}> {
  const rows = await sql<Binding>`SELECT wallet_id, address FROM privy_stellar_wallet_bindings WHERE app_id=${appId} AND user_id=${userId}`;
  const linked = (await provider.getUser(userId)).linkedAccounts.filter(w => w.type === 'wallet' && w.chainType === 'stellar');
  const saved = rows[0];
  let wallet: Wallet | undefined;
  if (saved?.wallet_id) {
    wallet = linked.find(w => w.id === saved.wallet_id && w.address === saved.address);
    if (!wallet) throw new WalletBindingError('wallet_binding_changed');
  } else {
    if (linked.length > 1) throw new WalletBindingError('wallet_binding_ambiguous');
    wallet = linked[0];
  }
  if (!wallet) {
    if (saved) throw new WalletBindingError('wallet_creation_pending');
    if (!allowCreate) throw new WalletBindingError('wallet_creation_required');
    const claim = await sql`INSERT INTO privy_stellar_wallet_bindings (app_id,user_id) VALUES (${appId},${userId}) ON CONFLICT DO NOTHING RETURNING user_id`;
    if (!claim.length) throw new WalletBindingError('wallet_creation_pending');
    await provider.walletApi.createWallet({ chainType: 'stellar', owner: { userId } });
    return resolveStellarWallet(sql, provider, appId, userId, false);
  }
  if (!wallet.id || !wallet.address || !StrKey.isValidEd25519PublicKey(wallet.address)) throw new WalletBindingError('wallet_invalid');
  const actual = await provider.walletApi.getWallet({ id: wallet.id });
  if (actual.id !== wallet.id || actual.address !== wallet.address || actual.chainType !== 'stellar') throw new WalletBindingError('wallet_binding_changed');
  const stored = await sql<Binding>`INSERT INTO privy_stellar_wallet_bindings (app_id,user_id,wallet_id,address)
    VALUES (${appId},${userId},${wallet.id},${wallet.address})
    ON CONFLICT (app_id,user_id) DO UPDATE SET wallet_id=EXCLUDED.wallet_id,address=EXCLUDED.address
    WHERE privy_stellar_wallet_bindings.wallet_id IS NULL
      OR (privy_stellar_wallet_bindings.wallet_id=EXCLUDED.wallet_id AND privy_stellar_wallet_bindings.address=EXCLUDED.address)
    RETURNING wallet_id,address`;
  if (!stored.length) throw new WalletBindingError('wallet_binding_changed');
  return { walletId: wallet.id, address: wallet.address, chain: 'stellar', created: false };
}
