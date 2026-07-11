/**
 * TrustLeaf traction metrics — manually updated until wired to real data.
 *
 * These are the numbers shown on the landing waitlist counter and the public
 * /traction page. Bump them by hand as the pilot grows; both surfaces read
 * from here so they never drift apart.
 */
export const METRICS = {
  /** People on the early-access waitlist. */
  waitlist: 147,
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
