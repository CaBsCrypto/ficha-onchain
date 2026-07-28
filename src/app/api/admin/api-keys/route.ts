/**
 * POST /api/admin/api-keys — issue an API key for an external org (center).
 * ---------------------------------------------------------------------------
 * The one way to hand a hackathon team a key. Admin-only. Creates (or reuses)
 * the org and inserts a key, returning the plaintext key EXACTLY ONCE — only its
 * sha256 is stored, so it can never be recovered later.
 *
 * Body: { orgName, env?, scopes?, signingWallet? }
 *   - env:        'sandbox' (default) | 'live'
 *   - scopes:     defaults to the full consent+ficha set
 *   - signingWallet: the center's G-address. In sandbox we default to the
 *     custodial sandbox center wallet (derived from SANDBOX_CENTER_SECRET) so
 *     anchor_record can actually sign; override to use your own.
 */
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/admin";
import { getSandboxCenterSecret } from "@/lib/stellar/server";
import { isStellarAddress } from "@/lib/stellar/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SCOPES = ["consent:manage", "consent:read", "ficha:append", "ficha:read"];

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: { orgName?: unknown; env?: unknown; scopes?: unknown; signingWallet?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const orgName = String(body.orgName ?? "").trim();
  const env = body.env === "live" ? "live" : "sandbox";
  const scopes = Array.isArray(body.scopes) && body.scopes.length
    ? body.scopes.map(String)
    : DEFAULT_SCOPES;
  if (!orgName) {
    return NextResponse.json({ error: "orgName es obligatorio" }, { status: 400 });
  }

  // Signing wallet: explicit, else (sandbox) the custodial center wallet.
  let signingWallet = String(body.signingWallet ?? "").trim() || null;
  if (!signingWallet && env === "sandbox") {
    const secret = getSandboxCenterSecret();
    if (secret) {
      try {
        signingWallet = Keypair.fromSecret(secret).publicKey();
      } catch {
        // A configured-but-malformed secret used to be swallowed here ("leave
        // null"), which stored a sandbox org that could never receive a grant:
        // every request_consent then died on the NOT NULL grantee_wallet
        // constraint as an opaque 500. This is an admin endpoint — say it.
        return NextResponse.json(
          {
            error:
              "SANDBOX_CENTER_SECRET está configurado pero no es una secret key válida " +
              "(¿comillas, espacios o salto de línea al pegarlo?). Corrígelo y reintenta.",
          },
          { status: 500 },
        );
      }
    }
  }
  if (signingWallet && !isStellarAddress(signingWallet)) {
    return NextResponse.json({ error: "signingWallet no es una G-address válida" }, { status: 400 });
  }

  // Generate the key. The prefix (env + short random) is what we show later.
  const rand = randomBytes(24).toString("hex");
  const key = `tl_${env}_${rand}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const keyPrefix = `tl_${env}_${rand.slice(0, 6)}`;

  let sql;
  try { sql = getDb(); } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    throw err;
  }

  try {
    // Reuse the org by name, else create it.
    const [existing] = await sql<{ id: number }>`
      SELECT id FROM api_orgs WHERE name = ${orgName} LIMIT 1`;
    let orgId: number;
    if (existing) {
      orgId = existing.id;
      if (signingWallet) {
        await sql`UPDATE api_orgs SET signing_wallet = COALESCE(signing_wallet, ${signingWallet}) WHERE id = ${orgId}`;
      }
    } else {
      const [created] = await sql<{ id: number }>`
        INSERT INTO api_orgs (name, status, trust_level, signing_wallet)
        VALUES (${orgName}, 'active', 'org_vouched', ${signingWallet})
        RETURNING id`;
      orgId = created.id;
    }

    await sql`
      INSERT INTO api_keys (org_id, key_hash, key_prefix, env, scopes)
      VALUES (${orgId}, ${keyHash}, ${keyPrefix}, ${env}, ${JSON.stringify(scopes)}::jsonb)`;

    return NextResponse.json({
      key, // plaintext — shown ONCE, never stored
      keyPrefix,
      orgId,
      orgName,
      env,
      scopes,
      signingWallet,
      note: "Guarda 'key' ahora: solo se muestra una vez (guardamos únicamente su hash).",
    });
  } catch (err) {
    console.error("[admin/api-keys]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/api-keys — revoke a key by its prefix.
 * ---------------------------------------------------------------------------
 * Body: { keyPrefix, action: 'revoke' }. Sets revoked_at, which the auth gate
 * already honours (api-key.ts denies any key with revoked_at set) — the column
 * existed from day one, but nothing could ever write it: a leaked key was
 * irrevocable by construction. Prefix-based because the plaintext is shown
 * exactly once and only its sha256 is stored; the prefix is what an admin can
 * actually still see. Idempotent — revoking a revoked key reports it as such.
 */
export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: { keyPrefix?: unknown; action?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.action !== "revoke") {
    return NextResponse.json({ error: "action debe ser 'revoke'" }, { status: 400 });
  }
  const keyPrefix = String(body.keyPrefix ?? "").trim();
  if (!/^tl_(sandbox|live)_[0-9a-f]{4,}$/.test(keyPrefix)) {
    return NextResponse.json({ error: "keyPrefix inválido (ej: tl_sandbox_ab12cd)" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql<{ id: number; org_id: number; revoked_at: string | null }>`
      UPDATE api_keys SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE key_prefix = ${keyPrefix}
      RETURNING id, org_id, revoked_at`;
    if (!rows.length) {
      return NextResponse.json({ error: "no existe una key con ese prefijo" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      revoked: rows.map((r) => ({ keyId: r.id, orgId: r.org_id, revokedAt: r.revoked_at })),
    });
  } catch (err) {
    console.error("[admin/api-keys PATCH]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
