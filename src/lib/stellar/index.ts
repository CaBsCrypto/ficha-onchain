/**
 * Public entry for the Stellar/Soroban integration.
 *
 * `config` is browser-safe (constants + formatting helpers). `client` is
 * server-only (pulls in @stellar/stellar-sdk and hits the RPC) — import it from
 * API route handlers / server components, not from client components.
 */
export * from "./config";
// Browser-safe: derived expiry + status display metadata (no SDK import).
export * from "./expiry";
export { statusMeta, STATUS_META, formatLedgerDate } from "./status";
export type { StatusMeta } from "./status";
export type {
  OnChainPrescription,
  RxStatus,
  DoctorRecord,
} from "./client";
