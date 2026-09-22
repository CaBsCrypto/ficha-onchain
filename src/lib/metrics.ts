/**
 * TrustLeaf traction metrics — manually updated until wired to real data.
 *
 * Legacy /traction figures. Waitlist counts are intentionally not published.
 */
export const METRICS = {
  /** Prescriptions issued on-chain. */
  prescriptions: 23,
  /** Doctors registered on the platform. */
  doctors: 8,
  /** Stellar testnet transactions signed to date. */
  stellarTx: 31,
} as const;

/** Public Stellar testnet explorer — the network TrustLeaf writes to today. */
export const STELLAR_EXPLORER_URL =
  "https://stellar.expert/explorer/testnet";
