'use client';
/**
 * Privy wallet + auth integration
 * ------------------------------------------------------------------
 * Privy gives patients and doctors an embedded, non-custodial wallet
 * gated by email / Google — no seed phrases and no "crypto" UX.
 *
 * Embedded wallets use Ed25519 (same curve as Stellar), exposed via
 * the Solana wallet interface (base58-encoded 32-byte public key).
 * We convert to the Stellar G… address format with StrKey.
 */

import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { StrKey } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Minimal base58 decode — avoids pulling in @solana/web3.js just for this.
// ---------------------------------------------------------------------------
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(encoded: string): Uint8Array {
  const bytes = [0];
  for (const char of encoded) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) throw new Error(`Invalid base58 character: ${char}`);
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Prepend leading zero bytes for each leading '1' character
  for (const char of encoded) {
    if (char === '1') bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

/** Convert a Solana-format base58 public key to a Stellar G… address. */
function solanaToStellar(solanaAddress: string): string {
  const raw = base58Decode(solanaAddress); // 32-byte Ed25519 public key
  return StrKey.encodeEd25519PublicKey(Buffer.from(raw));
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePrivyAuth() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  return { ready, authenticated, user, login, logout };
}

export function usePrivyWallet() {
  // The /solana entrypoint returns only Solana Standard wallets (Ed25519 —
  // same curve as Stellar). Login is email/Google only, so the sole wallet
  // here is Privy's embedded Solana wallet.
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0];

  const stellarAddress = wallet?.address
    ? (() => {
        try {
          return solanaToStellar(wallet.address);
        } catch {
          // Fallback: return raw address if conversion fails
          return wallet.address;
        }
      })()
    : null;

  return {
    wallet,
    stellarAddress,
    isReady: !!wallet,
  };
}

// ---------------------------------------------------------------------------
// Legacy exports kept for backwards compatibility
// ---------------------------------------------------------------------------

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';

export interface EmbeddedWallet {
  address: string;
  chain: 'stellar';
}

/** @deprecated Use usePrivyWallet() instead. */
export function useEmbeddedWallet(): EmbeddedWallet | null {
  return null;
}
