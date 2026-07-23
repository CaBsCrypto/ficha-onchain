/**
 * POST /api/admin/migrate — run the idempotent schema against the deployed DB.
 * ---------------------------------------------------------------------------
 * A one-shot admin tool to bring PRODUCTION's Neon branch up to date without
 * needing its connection string locally (Vercel does not expose it to
 * `vercel env pull`). It runs the CREATE TABLE / ADD COLUMN IF NOT EXISTS for
 * the tables the recent features need — everything here is additive and
 * idempotent, so re-running is safe and never drops or alters existing data.
 *
 * Auth: requireAdmin (Privy allowlist OR the admin token). Guard 2: confirm.
 *
 * This mirrors the relevant steps of scripts/migrate.mjs. Keep them in sync when
 * adding schema; the script stays the source of truth for local/dev.
 */
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each entry is a single idempotent statement. Ordered so tables exist before
// their ALTERs. Names are static (no user input) — no injection surface.
const STATEMENTS: Array<[string, string]> = [
  ["clinical_documents", `
    CREATE TABLE IF NOT EXISTS clinical_documents (
      id             SERIAL PRIMARY KEY,
      patient_email  TEXT NOT NULL,
      doctor_email   TEXT,
      category       TEXT NOT NULL DEFAULT 'Examen',
      title          TEXT NOT NULL,
      file_name      TEXT,
      mime_type      TEXT,
      content_base64 TEXT NOT NULL,
      content_hash   TEXT NOT NULL,
      tx_hash        TEXT,
      mode           TEXT NOT NULL DEFAULT 'simulated',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["clinical_documents.idx", `CREATE INDEX IF NOT EXISTS idx_clinical_documents_patient ON clinical_documents (patient_email, created_at DESC)`],

  ["patient_health_records", `
    CREATE TABLE IF NOT EXISTS patient_health_records (
      patient_email            TEXT PRIMARY KEY,
      blood_type               TEXT,
      height_cm                TEXT,
      weight_kg                TEXT,
      bmi                      TEXT,
      allergies                JSONB DEFAULT '[]',
      conditions               JSONB DEFAULT '[]',
      vaccinations             JSONB DEFAULT '[]',
      primary_doctor           TEXT,
      primary_doctor_specialty TEXT,
      notes                    TEXT,
      updated_at               TIMESTAMPTZ DEFAULT NOW()
    )`],
  ["phr.full_name", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS full_name TEXT`],
  ["phr.rut", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS rut TEXT`],
  ["phr.birthdate", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS birthdate DATE`],
  ["phr.phone", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS phone TEXT`],
  ["phr.address", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS address TEXT`],
  ["phr.prevision", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS prevision TEXT`],
  ["phr.emergency_contact", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS emergency_contact TEXT`],
  ["phr.content_hash", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS content_hash TEXT`],
  ["phr.tx_hash", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS tx_hash TEXT`],
  ["phr.mode", `ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS mode TEXT`],

  ["prescriptions_log", `
    CREATE TABLE IF NOT EXISTS prescriptions_log (
      id             SERIAL PRIMARY KEY,
      rx_id          TEXT,
      tx_hash        TEXT,
      mode           TEXT NOT NULL DEFAULT 'simulated',
      patient_email  TEXT,
      patient_name   TEXT,
      doctor_email   TEXT,
      medication     TEXT,
      dosage         TEXT,
      quantity       INTEGER,
      cie10          TEXT,
      diagnosis      TEXT,
      prescription_type TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["rxlog.prescription_type", `ALTER TABLE prescriptions_log ADD COLUMN IF NOT EXISTS prescription_type TEXT`],
  ["rxlog.idx_created", `CREATE INDEX IF NOT EXISTS idx_prescriptions_log_created ON prescriptions_log (created_at DESC)`],
  ["rxlog.idx_doctor", `CREATE INDEX IF NOT EXISTS idx_prescriptions_log_doctor ON prescriptions_log (doctor_email, created_at DESC)`],

  // ── API/MCP externa de salud (mirror de scripts/migrate.mjs) ──────────────
  ["patient_records", `
    CREATE TABLE IF NOT EXISTS patient_records (
      id             SERIAL PRIMARY KEY,
      rut_hash       TEXT NOT NULL,
      env            TEXT NOT NULL DEFAULT 'sandbox',
      contract_id    TEXT,
      patient_wallet TEXT,
      deploy_salt    TEXT,
      patient_email  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["patient_records.uq", `CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_records_rut_env ON patient_records (rut_hash, env)`],

  ["api_orgs", `
    CREATE TABLE IF NOT EXISTS api_orgs (
      id             SERIAL PRIMARY KEY,
      name           TEXT NOT NULL,
      signing_wallet TEXT,
      key_custody    TEXT NOT NULL DEFAULT 'custodial',
      trust_level    TEXT NOT NULL DEFAULT 'self_declared',
      status         TEXT NOT NULL DEFAULT 'pending',
      contact_email  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],

  ["api_keys", `
    CREATE TABLE IF NOT EXISTS api_keys (
      id           SERIAL PRIMARY KEY,
      org_id       INTEGER NOT NULL REFERENCES api_orgs(id),
      key_hash     TEXT NOT NULL,
      key_prefix   TEXT NOT NULL,
      env          TEXT NOT NULL DEFAULT 'sandbox',
      scopes       JSONB NOT NULL DEFAULT '[]',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ
    )`],
  ["api_keys.uq", `CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_hash ON api_keys (key_hash)`],
  ["api_keys.idx", `CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys (org_id)`],

  ["center_doctors", `
    CREATE TABLE IF NOT EXISTS center_doctors (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER NOT NULL REFERENCES api_orgs(id),
      doctor_rut_hash TEXT,
      doctor_name     TEXT,
      doctor_registro TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["center_doctors.idx", `CREATE INDEX IF NOT EXISTS idx_center_doctors_org ON center_doctors (org_id)`],

  ["center_grants", `
    CREATE TABLE IF NOT EXISTS center_grants (
      id               SERIAL PRIMARY KEY,
      org_id           INTEGER NOT NULL REFERENCES api_orgs(id),
      patient_rut_hash TEXT NOT NULL,
      record_contract  TEXT,
      grantee_wallet   TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'active',
      mode             TEXT NOT NULL DEFAULT 'simulated',
      env              TEXT NOT NULL DEFAULT 'sandbox',
      grant_tx         TEXT,
      revoke_tx        TEXT,
      expires_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at       TIMESTAMPTZ
    )`],
  ["center_grants.env", `ALTER TABLE center_grants ADD COLUMN IF NOT EXISTS env TEXT NOT NULL DEFAULT 'sandbox'`],
  ["center_grants.uq", `CREATE UNIQUE INDEX IF NOT EXISTS uq_center_grants_active ON center_grants (org_id, patient_rut_hash, env) WHERE status = 'active'`],
  ["center_grants.idx", `CREATE INDEX IF NOT EXISTS idx_center_grants_patient ON center_grants (patient_rut_hash)`],
];

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: { confirm?: unknown };
  try { body = (await request.json()) as typeof body; } catch { body = {}; }
  if (body.confirm !== "MIGRATE") {
    return NextResponse.json({ error: "confirmation_required", hint: "send confirm:'MIGRATE'" }, { status: 400 });
  }

  let sql;
  try { sql = getDb(); } catch (err) {
    console.error("[admin/migrate]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const ran: string[] = [];
  const failed: Array<{ step: string; error: string }> = [];
  for (const [step, stmt] of STATEMENTS) {
    try {
      await sql.query(stmt);
      ran.push(step);
    } catch (err) {
      failed.push({ step, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`.catch(() => []);

  return NextResponse.json({
    ok: failed.length === 0,
    ran,
    failed,
    tables: (tables as Array<{ table_name: string }>).map((t) => t.table_name),
  });
}
