/**
 * Stellar / Soroban network + contract configuration.
 *
 * These NEXT_PUBLIC_* values are safe to expose to the browser (network URL and
 * contract ids are public). Signing secrets live only in server-side env and are
 * read in the API route handlers, never here.
 */
export const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ??
  "testnet") as "testnet" | "mainnet";

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
  "https://soroban-testnet.stellar.org";

/** Standard Stellar network passphrases (kept inline to avoid importing the SDK). */
export const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";

/** Deployed contract ids (Soroban Testnet). */
export const CONTRACT_IDS = {
  doctorRegistry:
    process.env.NEXT_PUBLIC_DOCTOR_REGISTRY_ID ??
    "CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O",
  prescriptionSoulbound:
    process.env.NEXT_PUBLIC_PRESCRIPTION_ID ??
    "CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL",
  /**
   * Phase 1 contracts — set these env vars when the contracts are deployed.
   * Leaving them undefined puts dispense/pharmacy endpoints in simulated mode.
   */
  dispensaryRegistry: process.env.DISPENSARY_REGISTRY_ID as string | undefined,
  dispenseRecord: process.env.DISPENSE_RECORD_ID as string | undefined,
  /**
   * Phase 2 — document-soulbound contract for medical certs, professional
   * licenses, and mental health certificates. Set env var when deployed.
   */
  documentSoulbound: process.env.DOCUMENT_SOULBOUND_ID as string | undefined,
} as const;

export const STELLAR_EXPERT_TX = (hash: string) =>
  `https://stellar.expert/explorer/${STELLAR_NETWORK}/tx/${hash}`;

export const STELLAR_EXPERT_ACCOUNT = (wallet: string) =>
  `https://stellar.expert/explorer/${STELLAR_NETWORK}/account/${wallet}`;

export const STELLAR_EXPERT_CONTRACT = (id: string) =>
  `https://stellar.expert/explorer/${STELLAR_NETWORK}/contract/${id}`;

/** Truncate a wallet / hash for display: GBQD7X…F3K2 */
export function truncateHash(value: string, lead = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= lead + tail) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
