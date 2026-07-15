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
