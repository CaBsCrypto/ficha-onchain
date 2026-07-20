/**
 * Schema migration. Idempotent — safe to re-run.
 *
 *   node scripts/migrate.mjs
 *
 * Reads DATABASE_URL from .env.local (or the environment). Point it at a Neon
 * *dev branch*, never at the branch Vercel deploys against.
 *
 * This exists because the schema used to be scattered across eight route files
 * as `ensureTable()` calls awaited on every single request.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) process.env.DATABASE_URL = m[1].trim();
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (looked in the environment and .env.local)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const steps = [];
const step = (name, fn) => steps.push({ name, fn });

// ── Doctors ─────────────────────────────────────────────────────────────────
step("doctors", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS doctors (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT NOT NULL UNIQUE,
      specialty   TEXT,
      license_num TEXT,
      rut         TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  // Profile fields the doctor edits about themselves (specialty already exists).
  await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT`;
  await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS telemedicine BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  // Legal identity around the prescription (Ley 20.724 / SNRE): contact +
  // membrete of the receta + the digital signature/seal that gets stamped on it.
  await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS phone          TEXT`;
  await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS center_name    TEXT`;
  await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS center_address TEXT`;
  await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS signature_url  TEXT`;
});

// ── Appointments — now also the consultation record ─────────────────────────
step("appointments", async () => {
  await sql`
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
    )`;
  // Absorbs the in-memory consultation store: the Meet space now lives on the
  // booking row, so it survives restarts and is shared across instances.
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meet_link    TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meeting_code TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS space_name   TEXT`;
  // Consent event: the patient authorizes their doctor to write their on-chain
  // ficha when the consultation starts. status flips to 'in_progress'; the grant
  // tx + grantee wallet are recorded so both portals can show "acceso otorgado".
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_at     TIMESTAMPTZ`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consent_tx     TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consent_mode   TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consent_wallet TEXT`;
});

step("appointments: no double-booking", async () => {
  // Two patients must not hold the same slot. Enforced by the database rather
  // than a read-then-write check in the route, which races under concurrency.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_appt_slot
      ON appointments (doctor_email, date, time_slot)
      WHERE status <> 'cancelled'`;
});

step("appointments: lookup index", async () => {
  await sql`CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments (doctor_email, date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments (patient_email)`;
});

// ── Weekly availability grid ────────────────────────────────────────────────
step("doctor_availability", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS doctor_availability (
      id           SERIAL PRIMARY KEY,
      doctor_email TEXT     NOT NULL,
      weekday      SMALLINT NOT NULL,   -- 0=Sunday .. 6=Saturday (JS getDay())
      start_time   TIME     NOT NULL,
      end_time     TIME     NOT NULL,
      slot_minutes SMALLINT NOT NULL DEFAULT 30,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT weekday_range CHECK (weekday BETWEEN 0 AND 6),
      CONSTRAINT block_ordered CHECK (end_time > start_time),
      CONSTRAINT slot_positive CHECK (slot_minutes > 0)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_availability_doctor ON doctor_availability (doctor_email)`;
});

// ── Exceptions: holidays, conferences, blocked days ─────────────────────────
step("doctor_time_off", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS doctor_time_off (
      id           SERIAL PRIMARY KEY,
      doctor_email TEXT NOT NULL,
      date         DATE NOT NULL,
      reason       TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (doctor_email, date)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_timeoff_doctor ON doctor_time_off (doctor_email, date)`;
});

// ── Pre-existing tables, centralised here ───────────────────────────────────
step("medical_licenses", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS medical_licenses (
      id            SERIAL PRIMARY KEY,
      doctor_email  TEXT NOT NULL,
      patient_email TEXT NOT NULL,
      patient_name  TEXT NOT NULL DEFAULT '',
      patient_rut   TEXT,
      start_date    DATE NOT NULL,
      days          INTEGER NOT NULL,
      diagnosis     TEXT,
      rest_type     TEXT,
      status        TEXT NOT NULL DEFAULT 'active',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
});

step("patient_health_records", async () => {
  await sql`
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
    )`;
  // Legal identity the ficha clínica requires (Ley 20.584 / Decreto 41):
  // nombre, RUT, fecha nac., teléfono, dirección, previsión, contacto de
  // emergencia. All NULL-able so existing rows keep working.
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS full_name         TEXT`;
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS rut               TEXT`;
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS birthdate         DATE`;
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS phone             TEXT`;
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS address           TEXT`;
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS prevision         TEXT`;
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS emergency_contact TEXT`;
});

// ── Clinical record entries (off-chain mirror of the on-chain ficha) ────────
step("clinical_entries", async () => {
  // Each row mirrors one on-chain ClinicalRecord entry. The chain stores only
  // the SHA-256 anchor (content_hash) + author + timestamp; the human-readable
  // kind/summary live here so the UI can render the history without decrypting
  // anything. tx_hash + mode record whether the anchor made it on-chain.
  await sql`
    CREATE TABLE IF NOT EXISTS clinical_entries (
      id            SERIAL PRIMARY KEY,
      patient_email TEXT NOT NULL,
      patient_wallet TEXT,
      kind          TEXT NOT NULL,
      summary       TEXT NOT NULL,
      detail        TEXT,
      content_hash  TEXT NOT NULL,          -- hex SHA-256 anchored on-chain
      tx_hash       TEXT,                   -- on-chain tx (null when simulated)
      mode          TEXT NOT NULL DEFAULT 'simulated', -- 'onchain' | 'simulated'
      author_wallet TEXT,
      doctor_email  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_clinical_entries_patient
              ON clinical_entries (patient_email, created_at DESC)`;
});

// ── Run ─────────────────────────────────────────────────────────────────────
const host = process.env.DATABASE_URL.replace(/.*@([^/]+)\/.*/, "$1");
console.log(`\n  target: ${host}\n`);

for (const { name, fn } of steps) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}\n        ${err.message}`);
    process.exit(1);
  }
}

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY 1`;
console.log(`\n  tables now present (${tables.length}): ${tables.map((t) => t.table_name).join(", ")}\n`);
