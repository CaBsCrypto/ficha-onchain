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
// Schema mirrors what /api/licenses reads and writes (fecha_inicio/dias/cie10/
// tipo/... plus the on-chain sign result tx_hash/doc_hash/doc_id/mode). An
// earlier version of this step declared start_date/days/diagnosis/rest_type,
// columns no route or component ever used; the route's own ensureTable created
// the real shape on first request. IF NOT EXISTS makes this a no-op on the
// already-migrated dev/prod branches and correct on a fresh one.
step("medical_licenses", async () => {
  await sql`
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
    )`;

  // Reconcile a LEGACY shape that predates the Spanish columns the /api/licenses
  // route reads and writes. On dev/prod the table was first created by an old
  // route ensureTable with start_date/days/diagnosis/rest_type and
  // patient_email NOT NULL, so CREATE TABLE IF NOT EXISTS above is a no-op and
  // the real columns were never added. Add them and relax the legacy NOT NULLs
  // so the route's INSERT (fecha_inicio/dias/cie10/tipo/…) succeeds. All
  // statements are idempotent; the legacy-only ones no-op on a fresh branch.
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS fecha_inicio  DATE`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS dias          INTEGER`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS cie10         TEXT`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS tipo          TEXT`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS diagnostico   TEXT`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS observaciones TEXT`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS tx_hash       TEXT`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS doc_hash      TEXT`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS doc_id        INTEGER`;
  await sql`ALTER TABLE medical_licenses ADD COLUMN IF NOT EXISTS mode          TEXT`;

  // Backfill new columns from legacy ones (no-ops if the legacy column is
  // absent, hence the per-statement catch).
  await sql`UPDATE medical_licenses
              SET fecha_inicio = COALESCE(fecha_inicio, start_date),
                  dias         = COALESCE(dias, days),
                  diagnostico  = COALESCE(diagnostico, diagnosis),
                  tipo         = COALESCE(tipo, rest_type)`.catch(() => {});

  // Relax legacy NOT NULLs so inserts that omit those columns are accepted.
  for (const col of ["patient_email", "start_date", "days", "diagnosis", "rest_type"]) {
    await sql.query(`ALTER TABLE medical_licenses ALTER COLUMN ${col} DROP NOT NULL`).catch(() => {});
  }
});

// ── Waitlist signups (landing page) ─────────────────────────────────────────
step("waitlist", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
      id         SERIAL PRIMARY KEY,
      email      TEXT    NOT NULL UNIQUE,
      role       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
});

// ── Registered users (tracked on auth login) ────────────────────────────────
step("registered_users", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS registered_users (
      id         SERIAL PRIMARY KEY,
      privy_id   TEXT NOT NULL UNIQUE,
      email      TEXT,
      wallet     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
});

// ── Pain diary (diario de dolor) ────────────────────────────────────────────
step("pain_diary", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS pain_diary (
      id         SERIAL PRIMARY KEY,
      privy_id   TEXT NOT NULL,
      date       TEXT NOT NULL,
      entries    JSONB NOT NULL DEFAULT '[]',
      saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (privy_id, date)
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
  // On-chain anchor of the antecedentes: SHA-256 of the structured record +
  // the tx that appended it to the patient's ClinicalRecord (null if simulated).
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS content_hash TEXT`;
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS tx_hash      TEXT`;
  await sql`ALTER TABLE patient_health_records ADD COLUMN IF NOT EXISTS mode         TEXT`;
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

// ── Clinical documents (exams / labs / imaging attached to the ficha) ───────
step("clinical_documents", async () => {
  // A doctor attaches an exam file (PDF/image). The file bytes are stored here
  // (base64) so both portals can view it; its SHA-256 is anchored on-chain as a
  // DiagnosticReport entry — the chain proves integrity, the file itself never
  // touches the chain. tx_hash + mode record whether the anchor made it on-chain.
  await sql`
    CREATE TABLE IF NOT EXISTS clinical_documents (
      id             SERIAL PRIMARY KEY,
      patient_email  TEXT NOT NULL,
      doctor_email   TEXT,
      category       TEXT NOT NULL DEFAULT 'Examen',  -- Laboratorio | Imagenología | Informe | Examen
      title          TEXT NOT NULL,
      file_name      TEXT,
      mime_type      TEXT,
      content_base64 TEXT NOT NULL,          -- the file, base64-encoded
      content_hash   TEXT NOT NULL,          -- hex SHA-256 anchored on-chain
      tx_hash        TEXT,
      mode           TEXT NOT NULL DEFAULT 'simulated',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_clinical_documents_patient
              ON clinical_documents (patient_email, created_at DESC)`;
});

step("prescriptions_log", async () => {
  // Prescriptions live on-chain (prescription-soulbound), not in a table — so
  // the global activity feed had no way to surface them. This is a thin OFF-chain
  // MIRROR written right after a mint: enough to list "who prescribed what, when,
  // on-chain or simulated" in /admin/historial. The chain stays the source of
  // truth; this is only for observability. No PII beyond what a receta already
  // carries; the clinical payload itself is never stored here.
  await sql`
    CREATE TABLE IF NOT EXISTS prescriptions_log (
      id             SERIAL PRIMARY KEY,
      rx_id          TEXT,                 -- on-chain prescription id (null if simulated)
      tx_hash        TEXT,
      mode           TEXT NOT NULL DEFAULT 'simulated',  -- 'onchain' | 'simulated'
      patient_email  TEXT,
      patient_name   TEXT,
      doctor_email   TEXT,
      medication     TEXT,
      dosage         TEXT,
      quantity       INTEGER,
      cie10          TEXT,
      diagnosis      TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_prescriptions_log_created
              ON prescriptions_log (created_at DESC)`;
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
