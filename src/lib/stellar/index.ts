/**
 * Stellar / Soroban integration — PLACEHOLDER
 * ------------------------------------------------------------------
 * This module will wrap the Soroban RPC + contract client used to
 * mint, revoke and query prescriptions on-chain.
 *
 * Planned dependencies: @stellar/stellar-sdk, soroban-client bindings
 * generated from `contracts/` via `stellar contract bindings typescript`.
 *
 * TODO:
 *  - initSorobanClient(network: "testnet" | "mainnet")
 *  - mintPrescription(payload) -> txHash
 *  - getPrescription(id) -> Prescription
 *  - verifyPrescription(id) -> { valid, status, issuer }
 */

import type { Prescription } from "@/types";

export const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ??
  "testnet") as "testnet" | "mainnet";

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
  "https://soroban-testnet.stellar.org";

/** Contract ids are injected at deploy time. */
export const CONTRACT_IDS = {
  doctorRegistry: process.env.NEXT_PUBLIC_DOCTOR_REGISTRY_ID ?? "",
  prescriptionSoulbound: process.env.NEXT_PUBLIC_PRESCRIPTION_ID ?? "",
  clinicalRecord: process.env.NEXT_PUBLIC_CLINICAL_RECORD_ID ?? "",
} as const;

/** Truncate a wallet / hash for display: 0x7f3a...c891 */
export function truncateHash(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getPrescription(_id: string): Promise<Prescription | null> {
  throw new Error("Not implemented — Soroban client pending (Phase 0).");
}
