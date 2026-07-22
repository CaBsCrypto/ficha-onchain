/**
 * Smoke test — sandbox isolation for the external MCP.
 * ---------------------------------------------------------------------------
 *   node scripts/smoke-sandbox-isolation.mjs
 *
 * Proves, in one command, the guarantee the hackathon demo relies on: a center
 * with a `tl_sandbox_*` key can exercise the consent flow end-to-end, and NONE
 * of it touches live data — no live grants, no live patient records — while a
 * `tl_live_*` key is refused (kill-switch).
 *
 * Requires: a running server (SMOKE_BASE_URL, default http://localhost:3000),
 * DATABASE_URL pointing at a Neon *dev* branch (NEVER prod), and
 * TRUSTLEAF_RUT_PEPPER — both read from .env.local like scripts/migrate.mjs.
 *
 * It seeds a throwaway org/key, runs the checks, and always cleans up. Exit 0 if
 * every assertion passes, 1 otherwise.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";

// ── env (.env.local fallback, same as migrate.mjs) ──────────────────────────
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^(DATABASE_URL|TRUSTLEAF_RUT_PEPPER)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const DATABASE_URL = process.env.DATABASE_URL;
const PEPPER = process.env.TRUSTLEAF_RUT_PEPPER;
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

if (!DATABASE_URL) { console.error("DATABASE_URL no está configurado"); process.exit(1); }
if (!PEPPER) { console.error("TRUSTLEAF_RUT_PEPPER no está configurado"); process.exit(1); }

const sql = neon(DATABASE_URL);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const normalizeRut = (r) => r.replace(/[.\-\s]/g, "").toUpperCase();
const hashRut = (r) => createHmac("sha256", PEPPER).update(normalizeRut(r)).digest("hex");

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
};

async function rpc(key, name, args) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  return res.json();
}
const toolJson = (resp) => {
  try { return JSON.parse(resp.result.content[0].text); } catch { return null; }
};

const RUT = "12.345.678-5";           // valid test RUT (módulo-11)
const rutHash = hashRut(RUT);
const SANDBOX_KEY = "tl_sandbox_smoke_" + sha256("smoke-" + BASE).slice(0, 12);
const LIVE_KEY = "tl_live_smoke_dummy";
let orgId;

console.log(`\n  smoke: sandbox isolation\n  target: ${BASE}\n`);

try {
  // Seed a throwaway sandbox org + key.
  await sql`DELETE FROM api_keys WHERE key_prefix = 'tl_sandbox_smoke'`;
  await sql`DELETE FROM api_orgs WHERE name = '__smoke_org__'`;
  const [o] = await sql`
    INSERT INTO api_orgs (name, status, trust_level, signing_wallet)
    VALUES ('__smoke_org__', 'active', 'org_vouched', 'GSMOKEWALLET') RETURNING id`;
  orgId = o.id;
  await sql`
    INSERT INTO api_keys (org_id, key_hash, key_prefix, env, scopes)
    VALUES (${orgId}, ${sha256(SANDBOX_KEY)}, 'tl_sandbox_smoke', 'sandbox',
            ${JSON.stringify(["consent:manage", "consent:read"])}::jsonb)`;

  // 1) Consent flow with the sandbox key.
  const req = toolJson(await rpc(SANDBOX_KEY, "request_consent", { patient_rut: RUT }));
  check("request_consent → status 'active'", req?.status === "active");
  check("request_consent → env 'sandbox'", req?.env === "sandbox");

  const chk = toolJson(await rpc(SANDBOX_KEY, "check_consent", { patient_rut: RUT }));
  check("check_consent → 'active'", chk?.status === "active");

  // 2) The write stayed in sandbox — no live grants, exactly one active sandbox grant.
  const grants = await sql`SELECT env, status FROM center_grants WHERE org_id = ${orgId}`;
  check("center_grants: exactamente 1 fila", grants.length === 1);
  check("center_grants: env = 'sandbox'", grants[0]?.env === "sandbox");
  const liveGrants = await sql`SELECT count(*)::int c FROM center_grants WHERE org_id = ${orgId} AND env = 'live'`;
  check("center_grants: 0 filas 'live'", liveGrants[0].c === 0);

  // 3) The patient record was provisioned only in sandbox.
  const prSandbox = await sql`SELECT count(*)::int c FROM patient_records WHERE rut_hash = ${rutHash} AND env = 'sandbox'`;
  const prLive = await sql`SELECT count(*)::int c FROM patient_records WHERE rut_hash = ${rutHash} AND env = 'live'`;
  check("patient_records: fila 'sandbox' presente", prSandbox[0].c >= 1);
  check("patient_records: 0 filas 'live' para el paciente", prLive[0].c === 0);

  // 4) A live key is refused by the kill-switch (assumes MCP_LIVE_ENABLED off).
  const live = await rpc(LIVE_KEY, "request_consent", { patient_rut: RUT });
  check("key 'tl_live_*' → rechazada (live_disabled)", !!live?.error?.message?.includes("live_disabled"));

  // 5) No key at all → refused.
  const nokey = await rpc(null, "request_consent", { patient_rut: RUT });
  check("sin API key → rechazada", !!nokey?.error);

  // 6) revoke restores the no-consent state.
  const rev = toolJson(await rpc(SANDBOX_KEY, "revoke_consent", { patient_rut: RUT }));
  check("revoke_consent → revoked", rev?.revoked === true);
} catch (e) {
  console.error(`\n  ERROR: ${e instanceof Error ? e.message : e}`);
  fail++;
} finally {
  // Always clean up what we seeded.
  if (orgId) {
    await sql`DELETE FROM center_grants WHERE org_id = ${orgId}`.catch(() => {});
    await sql`DELETE FROM api_keys WHERE key_prefix = 'tl_sandbox_smoke'`.catch(() => {});
    await sql`DELETE FROM api_orgs WHERE id = ${orgId}`.catch(() => {});
  }
  await sql`DELETE FROM patient_records WHERE rut_hash = ${rutHash} AND env = 'sandbox'`.catch(() => {});
}

console.log(`\n  ${pass} pass, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
