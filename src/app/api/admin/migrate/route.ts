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
//
// PARITY IS NOT OPTIONAL. This file and scripts/migrate.mjs describe the same
// schema for different databases, and they drifted: the consent columns on
// appointments were added to the script but never here, so in production the
// patient's "Iniciar consulta · Autorizar a mi médico" died with db_error —
// discovered live, during the rehearsal of the demo. The core tables
// (doctors, appointments, availability, licenses…) were only ever created in
// prod by a hand-run of the script, which is why their absence here went
// unnoticed. src/__tests__/schema-parity.test.ts now fails on any table or
// column present in one file and missing in the other.
const STATEMENTS: Array<[string, string]> = [
  ["doctors", `
    CREATE TABLE IF NOT EXISTS doctors (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT NOT NULL UNIQUE,
      specialty   TEXT,
      license_num TEXT,
      rut         TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["doctors.bio", `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT`],
  ["doctors.telemedicine", `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS telemedicine BOOLEAN NOT NULL DEFAULT TRUE`],
  ["doctors.updated_at", `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`],
  ["doctors.phone", `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS phone TEXT`],
  ["doctors.center_name", `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS center_name TEXT`],
  ["doctors.center_address", `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS center_address TEXT`],
  ["doctors.signature_url", `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS signature_url TEXT`],

  ["appointments", `
    CREATE TABLE IF NOT EXISTS appointments (
      id            SERIAL PRIMARY KEY,
      doctor_email  TEXT NOT NULL,
      patient_email TEXT NOT NULL,
      patient_name  TEXT NOT NULL DEFAULT '',
      date          DATE NOT NULL,
      time_slot     TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'Presencial',
      motivo        TEXT,
      notes         TEXT,
      status        TEXT NOT NULL DEFAULT 'scheduled',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["appointments.meet_link", `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meet_link TEXT`],
  ["appointments.meeting_code", `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meeting_code TEXT`],
  ["appointments.space_name", `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS space_name TEXT`],
  // The consent event — the four columns whose absence broke the consultation
  // start in production.
  ["appointments.started_at", `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`],
  ["appointments.consent_tx", `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consent_tx TEXT`],
  ["appointments.consent_mode", `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consent_mode TEXT`],
  ["appointments.consent_wallet", `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consent_wallet TEXT`],
  ["appointments.uq_slot", `
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_appt_slot
      ON appointments (doctor_email, date, time_slot)
      WHERE status <> 'cancelled'`],
  ["appointments.idx_doctor_date", `CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments (doctor_email, date)`],
  ["appointments.idx_patient", `CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments (patient_email)`],

  ["doctor_availability", `
    CREATE TABLE IF NOT EXISTS doctor_availability (
      id           SERIAL PRIMARY KEY,
      doctor_email TEXT     NOT NULL,
      weekday      SMALLINT NOT NULL,
      start_time   TIME     NOT NULL,
      end_time     TIME     NOT NULL,
      slot_minutes SMALLINT NOT NULL DEFAULT 30,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT weekday_range CHECK (weekday BETWEEN 0 AND 6),
      CONSTRAINT block_ordered CHECK (end_time > start_time),
      CONSTRAINT slot_positive CHECK (slot_minutes > 0)
    )`],
  ["doctor_availability.idx", `CREATE INDEX IF NOT EXISTS idx_availability_doctor ON doctor_availability (doctor_email)`],

  ["doctor_time_off", `
    CREATE TABLE IF NOT EXISTS doctor_time_off (
      id           SERIAL PRIMARY KEY,
      doctor_email TEXT NOT NULL,
      date         DATE NOT NULL,
      reason       TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (doctor_email, date)
    )`],
  ["doctor_time_off.idx", `CREATE INDEX IF NOT EXISTS idx_timeoff_doctor ON doctor_time_off (doctor_email, date)`],

  ["medical_licenses", `
    CREATE TABLE IF NOT EXISTS medical_licenses (
      id            SERIAL PRIMARY KEY,
      doctor_email  TEXT NOT NULL,
      patient_email TEXT,
      patient_name  TEXT NOT NULL,
      patient_rut   TEXT,
      fecha_inicio  DATE NOT NULL,
      dias          INTEGER NOT NULL,
      cie10         TEXT NOT NULL,
      tipo          TEXT NOT NULL,
      diagnostico   TEXT,
      observaciones TEXT,
      status        TEXT NOT NULL DEFAULT 'draft',
      tx_hash       TEXT,
      doc_hash      TEXT,
      doc_id        INTEGER,
      mode          TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["medical_licenses.fecha_inicio", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS fecha_inicio DATE`],
  ["medical_licenses.dias", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS dias INTEGER`],
  ["medical_licenses.cie10", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS cie10 TEXT`],
  ["medical_licenses.tipo", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS tipo TEXT`],
  ["medical_licenses.diagnostico", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS diagnostico TEXT`],
  ["medical_licenses.observaciones", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS observaciones TEXT`],
  ["medical_licenses.tx_hash", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS tx_hash TEXT`],
  ["medical_licenses.doc_hash", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS doc_hash TEXT`],
  ["medical_licenses.doc_id", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS doc_id INTEGER`],
  ["medical_licenses.mode", `ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS mode TEXT`],

  ["waitlist", `
    CREATE TABLE IF NOT EXISTS waitlist (
      id         SERIAL PRIMARY KEY,
      email      TEXT    NOT NULL UNIQUE,
      role       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],

  ["registered_users", `
    CREATE TABLE IF NOT EXISTS registered_users (
      id         SERIAL PRIMARY KEY,
      privy_id   TEXT NOT NULL UNIQUE,
      email      TEXT,
      wallet     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],

  ["pain_diary", `
    CREATE TABLE IF NOT EXISTS pain_diary (
      id         SERIAL PRIMARY KEY,
      privy_id   TEXT NOT NULL,
      date       TEXT NOT NULL,
      entries    JSONB NOT NULL DEFAULT '[]',
      saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (privy_id, date)
    )`],

  ["clinical_entries", `
    CREATE TABLE IF NOT EXISTS clinical_entries (
      id            SERIAL PRIMARY KEY,
      patient_email TEXT NOT NULL,
      patient_wallet TEXT,
      kind          TEXT NOT NULL,
      summary       TEXT NOT NULL,
      detail        TEXT,
      content_hash  TEXT NOT NULL,
      tx_hash       TEXT,
      mode          TEXT NOT NULL DEFAULT 'simulated',
      author_wallet TEXT,
      doctor_email  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["clinical_entries.idx", `
    CREATE INDEX IF NOT EXISTS idx_clinical_entries_patient
      ON clinical_entries (patient_email, created_at DESC)`],

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

  ["api_access_log", `
    CREATE TABLE IF NOT EXISTS api_access_log (
      id               SERIAL PRIMARY KEY,
      patient_email    TEXT,
      patient_rut_hash TEXT,
      accessor         TEXT NOT NULL,
      accessor_role    TEXT NOT NULL,
      action           TEXT NOT NULL,
      detail           TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["api_access_log.idx_email", `CREATE INDEX IF NOT EXISTS idx_access_log_patient ON api_access_log (patient_email, created_at DESC)`],
  ["api_access_log.idx_rut", `CREATE INDEX IF NOT EXISTS idx_access_log_ruthash ON api_access_log (patient_rut_hash, created_at DESC)`],

  ["patient_grants", `
    CREATE TABLE IF NOT EXISTS patient_grants (
      id             SERIAL PRIMARY KEY,
      patient_email  TEXT NOT NULL,
      grantee_wallet TEXT NOT NULL,
      grantee_name   TEXT,
      tx_hash        TEXT,
      mode           TEXT NOT NULL,
      revoke_tx_hash TEXT,
      revoke_mode    TEXT,
      granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at     TIMESTAMPTZ
    )`],
  ["patient_grants.idx", `CREATE INDEX IF NOT EXISTS idx_patient_grants_email ON patient_grants (patient_email, granted_at DESC)`],

  ["api_rate_limits", `
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      org_id       INT NOT NULL,
      env          TEXT NOT NULL,
      bucket       TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count        INT NOT NULL DEFAULT 0,
      PRIMARY KEY (org_id, env, bucket, window_start)
    )`],

  ["record_requests", `
    CREATE TABLE IF NOT EXISTS record_requests (
      id             SERIAL PRIMARY KEY,
      patient_email  TEXT NOT NULL,
      provider_name  TEXT NOT NULL,
      provider_email TEXT,
      request_text   TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'draft',
      sent_at        TIMESTAMPTZ,
      due_at         TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`],
  ["record_requests.idx", `CREATE INDEX IF NOT EXISTS idx_record_requests_email ON record_requests (patient_email, created_at DESC)`],
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
