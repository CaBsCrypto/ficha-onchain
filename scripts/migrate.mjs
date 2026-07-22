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
      prescription_type TEXT,               -- SIMPLE | RETENIDA | MAGISTRAL
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  // Added after the table shipped — idempotent for branches already migrated.
  await sql`ALTER TABLE prescriptions_log ADD COLUMN IF NOT EXISTS prescription_type TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_prescriptions_log_created
              ON prescriptions_log (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_prescriptions_log_doctor
              ON prescriptions_log (doctor_email, created_at DESC)`;
});

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  API/MCP externa de salud — familia de tablas unificada (Fase 0 · PR-0c)  ║
// ║  Ver docs/ARCHITECTURE_REVIEW.md. Resuelve C1 (una sola familia "centro")  ║
// ║  y C2 (un solo center_grants). Todo aditivo e idempotente — no toca datos. ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ── patient_records — directorio paciente → su contrato ClinicalRecord ──────
// La llave es rut_hash (HMAC, ver src/lib/identity/rut.ts): el RUT nunca se
// guarda en claro acá. deploy_salt es ALEATORIO (no el rut_hash) para que el
// despliegue del contrato sea idempotente SIN filtrar un valor derivado del RUT
// en el ledger (resuelve C7). env separa sandbox de datos reales.
step("patient_records", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS patient_records (
      id             SERIAL PRIMARY KEY,
      rut_hash       TEXT NOT NULL,
      env            TEXT NOT NULL DEFAULT 'sandbox',   -- 'sandbox' | 'live'
      contract_id    TEXT,                              -- C... ClinicalRecord (NULL hasta provisioning)
      patient_wallet TEXT,                              -- G... owner del contrato
      deploy_salt    TEXT,                              -- salt ALEATORIO del deploy (no derivado del RUT)
      patient_email  TEXT,                              -- índice de conveniencia, NO la llave
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  // Un paciente = una ficha POR entorno (permite un record sandbox y otro live).
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_records_rut_env
              ON patient_records (rut_hash, env)`;
});

// ── api_orgs — el centro médico autorizado (dueño de una signing wallet) ────
step("api_orgs", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS api_orgs (
      id             SERIAL PRIMARY KEY,
      name           TEXT NOT NULL,
      signing_wallet TEXT,                              -- G... author on-chain de append_entry
      key_custody    TEXT NOT NULL DEFAULT 'custodial', -- 'custodial' | 'self'
      trust_level    TEXT NOT NULL DEFAULT 'self_declared', -- self_declared|org_vouched|registry_verified
      status         TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'active' | 'suspended'
      contact_email  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
});

// ── api_keys — N keys por org; el prefijo codifica el entorno ───────────────
// Nunca se guarda la key en claro, solo su hash. key_prefix (ej. tl_sandbox_ab12)
// permite identificarla sin revelarla. Absorbe la idea de mcp_api_keys.
step("api_keys", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id           SERIAL PRIMARY KEY,
      org_id       INTEGER NOT NULL REFERENCES api_orgs(id),
      key_hash     TEXT NOT NULL,                       -- SHA-256 de la key
      key_prefix   TEXT NOT NULL,                       -- 'tl_sandbox_...' | 'tl_live_...'
      env          TEXT NOT NULL DEFAULT 'sandbox',     -- 'sandbox' | 'live'
      scopes       JSONB NOT NULL DEFAULT '[]',         -- ['ficha:append','ficha:read']
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_hash ON api_keys (key_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys (org_id)`;
});

// ── center_doctors — atribución fina del médico dentro del centro ───────────
// La atribución on-chain es a nivel de centro (signing_wallet); el médico exacto
// vive off-chain acá + dentro del payload hasheado.
step("center_doctors", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS center_doctors (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER NOT NULL REFERENCES api_orgs(id),
      doctor_rut_hash TEXT,                             -- identidad del médico, hasheada
      doctor_name     TEXT,
      doctor_registro TEXT,                             -- N° de registro profesional
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_center_doctors_org ON center_doctors (org_id)`;
});

// ── center_grants — espejo off-chain de grant_write_access (consentimiento) ──
// Un centro obtiene permiso del paciente (dueño) para escribir su ficha, una vez
// por centro (no por cita). Fuente de verdad = on-chain; esto es el espejo para
// consultar/expirar. Índice parcial: UN solo grant activo por (centro, paciente).
step("center_grants", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS center_grants (
      id               SERIAL PRIMARY KEY,
      org_id           INTEGER NOT NULL REFERENCES api_orgs(id),
      patient_rut_hash TEXT NOT NULL,
      record_contract  TEXT,                            -- C... ficha a la que aplica
      grantee_wallet   TEXT NOT NULL,                   -- G... signing wallet del centro
      status           TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'revoked' | 'expired'
      mode             TEXT NOT NULL DEFAULT 'simulated',-- 'onchain' | 'simulated'
      env              TEXT NOT NULL DEFAULT 'sandbox', -- 'sandbox' | 'live'
      grant_tx         TEXT,
      revoke_tx        TEXT,
      expires_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at       TIMESTAMPTZ
    )`;
  // Added after the table shipped (PR-1d) — idempotent for already-migrated branches.
  await sql`ALTER TABLE center_grants ADD COLUMN IF NOT EXISTS env TEXT NOT NULL DEFAULT 'sandbox'`;
  // env MUST scope the "one active grant" guarantee: a sandbox consent (auto-
  // approved, no real signature) must never satisfy a live check. Replace the
  // 2-column active index with a 3-column one that includes env.
  await sql`DROP INDEX IF EXISTS uq_center_grants_active`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_center_grants_active
              ON center_grants (org_id, patient_rut_hash, env)
              WHERE status = 'active'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_center_grants_patient
              ON center_grants (patient_rut_hash)`;
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
