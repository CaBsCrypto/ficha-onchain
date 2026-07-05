/**
 * Privy wallet + auth integration — PLACEHOLDER
 * ------------------------------------------------------------------
 * Privy gives patients and doctors an embedded, non-custodial wallet
 * gated by Passkeys / email — so no seed phrases and no "crypto" UX.
 *
 * Planned dependency: @privy-io/react-auth
 *
 * TODO:
 *  - <PrivyProvider> wrapper in app/providers.tsx
 *  - usePasskeySignature() for doctor prescription signing
 *  - relayer hand-off so transactions are fee-less for patients
 */

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export interface EmbeddedWallet {
  address: string;
  chain: "stellar";
}

/** Placeholder — will return the current user's embedded wallet. */
export function useEmbeddedWallet(): EmbeddedWallet | null {
  return null;
}
