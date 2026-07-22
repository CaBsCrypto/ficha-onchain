/**
 * RUT identity — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * The one place that turns a Chilean RUT into the canonical, privacy-preserving
 * identity key used across the on-chain clinical-record system:
 *
 *   rut_hash = HMAC-SHA256(TRUSTLEAF_RUT_PEPPER, normalizeRut(rut))
 *
 * WHY a hash (and never the raw RUT):
 *   - The RUT is PII and must never touch the chain. We anchor / key by its hash.
 *   - The RUT space is small and enumerable, so a plain SHA-256 would be trivially
 *     reversible by brute force. A keyed HMAC with a secret pepper makes the map
 *     one-way unless the pepper leaks — so the pepper is server-only, never
 *     NEXT_PUBLIC, and rotating it re-keys every mapping (versioned rollout).
 *
 * SINGLE SOURCE OF TRUTH: `normalizeRut` / `isValidRut` live in decreto41.ts
 * (browser-safe, módulo-11). We reuse them here so there is exactly one
 * normalizer — every table keyed by rut_hash MUST hash the same normalized form
 * with the same pepper, or the mappings silently stop cross-referencing.
 *
 * This module imports `node:crypto`, so it must only be used from server code
 * (API route handlers, scripts) — never from a client component.
 */
import { createHmac } from "node:crypto";
import { normalizeRut, isValidRut } from "@/lib/decreto41";

// Re-export the canonical helpers so server callers have a single import point.
export { normalizeRut, isValidRut };

/** Thrown when a RUT cannot be turned into an identity key. */
export class RutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RutError";
  }
}

/** Read the pepper, failing CLOSED — a security primitive must never run unkeyed. */
function getPepper(): string {
  const pepper = process.env.TRUSTLEAF_RUT_PEPPER;
  if (!pepper || pepper.length < 16) {
    throw new RutError(
      "TRUSTLEAF_RUT_PEPPER no está configurado (o es demasiado corto). " +
        "Es obligatorio: sin él el hash de RUT sería reversible.",
    );
  }
  return pepper;
}

/**
 * Deterministic identity key for a patient's RUT.
 *
 * Validates the RUT (módulo-11) first — an invalid RUT is never a real person's
 * key and would let garbage keys collide, so we reject it. Returns a lowercase
 * hex HMAC-SHA256 digest (64 chars).
 *
 * @throws {RutError} if the RUT is invalid or the pepper is not configured.
 */
export function hashRut(rut: string): string {
  const clean = normalizeRut(rut);
  if (!isValidRut(clean)) {
    throw new RutError("RUT inválido (dígito verificador).");
  }
  return createHmac("sha256", getPepper()).update(clean).digest("hex");
}

/**
 * Non-throwing variant: returns the hash or null when the RUT is invalid.
 * Still throws {@link RutError} if the pepper is missing — a misconfigured
 * server is a bug to surface, not to swallow.
 */
export function tryHashRut(rut: string): string | null {
  const clean = normalizeRut(rut);
  if (!isValidRut(clean)) return null;
  return createHmac("sha256", getPepper()).update(clean).digest("hex");
}
