/**
 * API-key authentication for the external MCP — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * Keys look like `tl_sandbox_<random>` / `tl_live_<random>` — the prefix encodes
 * the environment, so a single check decides sandbox vs live end-to-end. We
 * store only sha256(key) + a short display prefix in `api_keys`, never the key
 * itself, so a DB dump cannot be replayed.
 *
 * Resolving a key yields the org context used to authorize + scope every
 * external call. The `env` here flows down to resolvePatientRecord() so a
 * sandbox key can only ever touch sandbox records — the isolation the hackathon
 * demo relies on.
 *
 * Fail closed for health data: any doubt → deny. A `live` key is rejected unless
 * MCP_LIVE_ENABLED === "true" (the kill-switch that keeps real writes off until
 * the production-readiness work is done).
 */
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

export type ApiEnv = "sandbox" | "live";

export interface ApiContext {
  orgId: number;
  orgName: string;
  env: ApiEnv;
  scopes: string[];
  trustLevel: string;
  /** G… wallet that is the on-chain author of this org's appends (may be null). */
  signingWallet: string | null;
}

export type AuthFailCode =
  | "missing_key"
  | "invalid_format"
  | "unknown_key"
  | "revoked"
  | "org_inactive"
  | "live_disabled"
  | "env_mismatch";

export type AuthResult =
  | { ok: true; ctx: ApiContext }
  | { ok: false; code: AuthFailCode; message: string };

/** sha256 hex of the full key — what we compare against api_keys.key_hash. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** The environment implied by a key's prefix, or null if it is not one of ours. */
export function envFromKey(key: string): ApiEnv | null {
  if (key.startsWith("tl_sandbox_")) return "sandbox";
  if (key.startsWith("tl_live_")) return "live";
  return null;
}

/** Pull the key from `Authorization: Bearer …` or the `x-api-key` header. */
export function extractApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  const x = request.headers.get("x-api-key");
  return x ? x.trim() || null : null;
}

/**
 * Authenticate the request's API key and return the org context, or a typed
 * failure. Never throws for bad input — only a genuine DB outage propagates.
 */
export async function authenticateApiKey(request: Request): Promise<AuthResult> {
  const key = extractApiKey(request);
  if (!key) {
    return { ok: false, code: "missing_key", message: "Falta la API key (Authorization: Bearer … o x-api-key)." };
  }
  const prefixEnv = envFromKey(key);
  if (!prefixEnv) {
    return { ok: false, code: "invalid_format", message: "Formato de API key inválido (esperado tl_sandbox_… o tl_live_…)." };
  }
  // Live kill-switch: a live key is inert unless explicitly enabled.
  if (prefixEnv === "live" && process.env.MCP_LIVE_ENABLED !== "true") {
    return { ok: false, code: "live_disabled", message: "El modo live está deshabilitado (MCP_LIVE_ENABLED)." };
  }

  const keyHash = hashApiKey(key);
  const sql = getDb();
  const rows = await sql<{
    env: ApiEnv;
    scopes: unknown;
    revoked_at: string | null;
    org_id: number;
    org_name: string;
    status: string;
    trust_level: string;
    signing_wallet: string | null;
  }>`
    SELECT k.env, k.scopes, k.revoked_at,
           o.id AS org_id, o.name AS org_name, o.status,
           o.trust_level, o.signing_wallet
    FROM api_keys k
    JOIN api_orgs o ON o.id = k.org_id
    WHERE k.key_hash = ${keyHash}
    LIMIT 1`;

  if (!rows.length) {
    return { ok: false, code: "unknown_key", message: "API key desconocida." };
  }
  const r = rows[0];
  if (r.revoked_at) {
    return { ok: false, code: "revoked", message: "API key revocada." };
  }
  if (r.status !== "active") {
    return { ok: false, code: "org_inactive", message: "La organización no está activa." };
  }
  // Defense in depth: the stored env must match the prefix the caller presented.
  if (r.env !== prefixEnv) {
    return { ok: false, code: "env_mismatch", message: "El entorno de la key no coincide con su prefijo." };
  }

  const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
  return {
    ok: true,
    ctx: {
      orgId: r.org_id,
      orgName: r.org_name,
      env: r.env,
      scopes,
      trustLevel: r.trust_level,
      signingWallet: r.signing_wallet,
    },
  };
}

/** True when the context carries the given scope (or the wildcard "*"). */
export function hasScope(ctx: ApiContext, scope: string): boolean {
  return ctx.scopes.includes("*") || ctx.scopes.includes(scope);
}
