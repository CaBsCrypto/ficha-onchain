/**
 * Pharmacy authorization utilities — server-side only.
 * ---------------------------------------------------------------------------
 * Two-tier authorization for pharmacies / dispensaries:
 *
 * Tier 1 — API key lookup (always available, no contracts required):
 *   Set PHARMACY_API_KEYS="apikey1:GPHARMACY1...,apikey2:GPHARMACY2..."
 *   The public endpoints accept "Authorization: Bearer <apikey>" and map it
 *   to the registered pharmacy wallet address.
 *
 * Tier 2 — On-chain DispensaryRegistry (Phase 1, optional):
 *   When DISPENSARY_REGISTRY_ID is configured, the resolved wallet is also
 *   checked against the deployed DispensaryRegistry contract. If the contract
 *   is not reachable the check degrades gracefully to Tier 1.
 *
 * Demo mode (no PHARMACY_API_KEYS set):
 *   All requests are accepted without auth; source reports "demo". This
 *   mirrors the behavior of existing endpoints (mint, revoke) in demo mode.
 */
import { Address } from "@stellar/stellar-sdk";
import { callRead } from "./client";

// ---------------------------------------------------------------------------
// API key parsing
// ---------------------------------------------------------------------------

/**
 * Parse PHARMACY_API_KEYS env var into a Map of { apiKey → G-address }.
 *
 * Format: "key1:GPHARMACY1...,key2:GPHARMACY2..."
 * Entries with a missing colon or blank fields are silently skipped.
 */
export function parsePharmacyApiKeys(): Map<string, string> {
  const raw = process.env.PHARMACY_API_KEYS ?? "";
  const map = new Map<string, string>();
  if (!raw.trim()) return map;
  for (const entry of raw.split(",")) {
    const colon = entry.indexOf(":");
    if (colon < 1) continue;
    const key = entry.slice(0, colon).trim();
    const wallet = entry.slice(colon + 1).trim();
    if (key && wallet) map.set(key, wallet);
  }
  return map;
}

/** Extract the token from "Authorization: Bearer <token>" or return null. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// Authorization results
// ---------------------------------------------------------------------------

export interface PharmacyAuthResult {
  authorized: boolean;
  /** Resolved pharmacy wallet (G-address), or null in demo mode / invalid. */
  wallet: string | null;
  source: "api_key" | "chain" | "demo" | "unauthorized";
}

export interface PharmacyVerifyResult {
  authorized: boolean;
  source: "chain" | "api_key" | "demo" | "not_found";
}

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/**
 * Authorize a pharmacy from an inbound HTTP Authorization header.
 *
 * Used by POST /api/public/prescription/[id]/dispense.
 * - Demo mode (no PHARMACY_API_KEYS): always authorized, source "demo".
 * - API key present → resolve wallet; optionally verify on-chain.
 * - No / invalid key → unauthorized.
 */
export async function authorizePharmacy(
  authHeader: string | null,
): Promise<PharmacyAuthResult> {
  const rawKeys = process.env.PHARMACY_API_KEYS ?? "";

  // Demo mode: no API key registry configured.
  if (!rawKeys.trim()) {
    return { authorized: true, wallet: null, source: "demo" };
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    return { authorized: false, wallet: null, source: "unauthorized" };
  }

  const wallet = parsePharmacyApiKeys().get(token) ?? null;
  if (!wallet) {
    return { authorized: false, wallet: null, source: "unauthorized" };
  }

  // Optional on-chain check via DispensaryRegistry.
  const registryId = process.env.DISPENSARY_REGISTRY_ID;
  if (registryId) {
    try {
      const onChain = await callRead<boolean>(registryId, "is_authorized", [
        new Address(wallet).toScVal(),
      ]);
      return { authorized: onChain, wallet, source: "chain" };
    } catch {
      // Contract not deployed or network error — fall through to API key auth.
    }
  }

  return { authorized: true, wallet, source: "api_key" };
}

/**
 * Verify if a given pharmacy wallet is authorized.
 *
 * Used by GET /api/public/pharmacy/verify.
 * Checks on-chain first (if registry deployed), then API key config, then demo.
 */
export async function isPharmacyAuthorized(
  wallet: string,
): Promise<PharmacyVerifyResult> {
  // 1. On-chain check (preferred).
  const registryId = process.env.DISPENSARY_REGISTRY_ID;
  if (registryId) {
    try {
      const onChain = await callRead<boolean>(registryId, "is_authorized", [
        new Address(wallet).toScVal(),
      ]);
      return { authorized: onChain, source: "chain" };
    } catch {
      // Fall through if contract unavailable.
    }
  }

  // 2. API key config.
  const rawKeys = process.env.PHARMACY_API_KEYS ?? "";
  if (rawKeys.trim()) {
    const knownWallets = new Set(parsePharmacyApiKeys().values());
    return knownWallets.has(wallet)
      ? { authorized: true, source: "api_key" }
      : { authorized: false, source: "not_found" };
  }

  // 3. Demo mode.
  return { authorized: true, source: "demo" };
}
