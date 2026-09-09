'use client';
import { usePrivy } from '@privy-io/react-auth';

export function usePrivyAuth() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  return { ready, authenticated, user, login, logout };
}

/** Only native Stellar wallets are identities. Never convert another chain's key. */
export function usePrivyWallet() {
  const { ready, authenticated, user } = usePrivy();
  const wallets = user?.linkedAccounts.filter(a => a.type === 'wallet' && a.chainType === 'stellar') ?? [];
  const wallet = wallets.length === 1 ? wallets[0] : null;
  return { wallet, stellarAddress: wallet && 'address' in wallet ? wallet.address : null, isReady: ready && authenticated && !!wallet };
}

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
export interface EmbeddedWallet { address: string; chain: 'stellar' }
export function useEmbeddedWallet(): EmbeddedWallet | null {
  const { stellarAddress } = usePrivyWallet();
  return stellarAddress ? { address: stellarAddress, chain: 'stellar' } : null;
}
