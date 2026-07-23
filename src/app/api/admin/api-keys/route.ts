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
      try { signingWallet = Keypair.fromSecret(secret).publicKey(); } catch { /* leave null */ }
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
