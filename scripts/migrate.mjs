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
  // Native Privy participants are immutable snapshots; historical rows remain unbound.
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id) ON DELETE RESTRICT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_user_id TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_wallet_id TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_wallet TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_user_id TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_wallet_id TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_wallet TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS attendance_user_id TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS attendance_at TIMESTAMPTZ`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_by TEXT`;
  await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`;
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
      category       TEXT NOT NULL DEFAULT 'Examen',  -- Laboratorio | Imagenología | Informe | Examen | Receta | Otro | 'self' (autoaporte del paciente, doctor_email NULL)
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

// ── Access log — quién miró la ficha (Ley 20.584) ──────────────────────────
step("api_access_log", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS api_access_log (
      id               SERIAL PRIMARY KEY,
      patient_email    TEXT,
      patient_rut_hash TEXT,
      accessor         TEXT NOT NULL,
      accessor_role    TEXT NOT NULL,
      action           TEXT NOT NULL,
      detail           TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_access_log_patient ON api_access_log (patient_email, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_access_log_ruthash ON api_access_log (patient_rut_hash, created_at DESC)`;
});

// ── Patient grants — a quién autorizó el paciente a escribir su ficha ───────
step("patient_grants", async () => {
  await sql`
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
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_patient_grants_email ON patient_grants (patient_email, granted_at DESC)`;
});

// ── MCP rate limiting — ventanas fijas de 1 minuto por org ──────────────────
step("api_rate_limits", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      org_id       INT NOT NULL,
      env          TEXT NOT NULL,
      bucket       TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count        INT NOT NULL DEFAULT 0,
      PRIMARY KEY (org_id, env, bucket, window_start)
    )`;
});

// ── Solicitudes de ficha clínica — Ley 20.584 art. 13 ───────────────────────
step("record_requests", async () => {
  await sql`
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
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_record_requests_email ON record_requests (patient_email, created_at DESC)`;
});

// ── Notificaciones in-app del paciente — Alertas de Salud & Ley 20.584 ─────
step("patient_notifications", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS patient_notifications (
      id             SERIAL PRIMARY KEY,
      patient_email  TEXT NOT NULL,
      type           TEXT NOT NULL,       -- 'health_alert' | 'access_log' | 'rx_expiry' | 'record_request' | 'system'
      title          TEXT NOT NULL,
      message        TEXT NOT NULL,
      read           BOOLEAN NOT NULL DEFAULT FALSE,
      link           TEXT,
      metadata       TEXT,                -- JSON string con detalles (tendencias, rx_id)
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_patient_notifications_patient
              ON patient_notifications (patient_email, read, created_at DESC)`;
});

step("private doctor dossiers", async () => {
  await sql`CREATE TABLE IF NOT EXISTS doctor_private_dossiers (
    id UUID PRIMARY KEY,
    network TEXT NOT NULL CHECK (network = 'testnet'),
    contract_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    schema_version INTEGER NOT NULL DEFAULT 1,
    valid_until BIGINT NOT NULL,
    commitment TEXT NOT NULL,
    encrypted_dossier TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('prepared', 'submitted', 'confirmed', 'revoked', 'abandoned')),
    transaction_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE doctor_private_dossiers DROP CONSTRAINT IF EXISTS doctor_private_dossiers_network_contract_id_wallet_version_key`;
  await sql`ALTER TABLE doctor_private_dossiers DROP CONSTRAINT IF EXISTS doctor_private_dossiers_status_check`;
  await sql`ALTER TABLE doctor_private_dossiers ADD CONSTRAINT doctor_private_dossiers_status_check
    CHECK (status IN ('prepared', 'submitted', 'confirmed', 'revoked', 'abandoned'))`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS doctor_private_dossiers_one_live_version
    ON doctor_private_dossiers(network,contract_id,wallet,version)
    WHERE status IN ('prepared','submitted','confirmed','revoked')`;
});

// Verified bindings are provisioned only after an independently verified wallet
// ownership challenge. Never copy registered_users.wallet into this table.
step("private doctor authorization requests", async () => {
  await sql`CREATE TABLE IF NOT EXISTS doctor_authorization_requests (
    id UUID PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    requested_by TEXT NOT NULL,
    requested_email TEXT NOT NULL,
    doctor_user_id TEXT NOT NULL,
    doctor_email TEXT NOT NULL,
    wallet_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    network TEXT NOT NULL CHECK (network='testnet'),
    contract_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('authorize','renew','revoke')),
    method TEXT NOT NULL CHECK (method IN ('authorize_doctor','renew_authorization','reauthorize_doctor','revoke_doctor')),
    expected_version INTEGER NOT NULL CHECK (expected_version>=0),
    target_version INTEGER NOT NULL CHECK (target_version>0),
    commitment TEXT NOT NULL CHECK (commitment ~ '^[0-9a-f]{64}$'),
    valid_until BIGINT NOT NULL,
    dossier_id UUID REFERENCES doctor_private_dossiers(id) ON DELETE RESTRICT,
    state TEXT NOT NULL CHECK (state IN ('pending','submitted','confirmed','failed')),
    prepared_xdr TEXT,
    transaction_hash TEXT,
    error_code TEXT,
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    CHECK ((prepared_xdr IS NULL)=(transaction_hash IS NULL))
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS doctor_authorization_one_pending ON doctor_authorization_requests(contract_id,wallet) WHERE state IN ('pending','submitted')`;
});
step("privy Stellar wallet bindings", async () => {
  await sql`CREATE TABLE IF NOT EXISTS privy_stellar_wallet_bindings (
    app_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    wallet_id TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (app_id,user_id),
    UNIQUE (app_id,wallet_id),
    UNIQUE (app_id,address),
    CHECK ((wallet_id IS NULL) = (address IS NULL))
  )`;
});
step("doctor onboarding requests", async () => {
  await sql`CREATE TABLE IF NOT EXISTS doctor_onboarding_requests (
    id UUID PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    source TEXT NOT NULL CHECK (source IN ('application','invitation')),
    email TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('invited','draft','submitted','changes_requested','rejected','authorization_pending','authorized','expired','revoked')),
    invited_by TEXT,
    invited_email TEXT,
    privy_user_id TEXT,
    wallet_id TEXT,
    wallet TEXT,
    expires_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    changes_requested_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    reopened_at TIMESTAMPTZ,
    authorization_request_id UUID REFERENCES doctor_authorization_requests(id) ON DELETE RESTRICT,
    authorized_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    reviewed_by TEXT,
    reviewed_email TEXT,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((privy_user_id IS NULL AND wallet_id IS NULL AND wallet IS NULL) OR
           (privy_user_id IS NOT NULL AND wallet_id IS NOT NULL AND wallet IS NOT NULL)),
    CHECK ((source='invitation' AND invited_by IS NOT NULL AND expires_at IS NOT NULL) OR source='application')
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS doctor_onboarding_one_active_email
    ON doctor_onboarding_requests ((LOWER(email)))
    WHERE state IN ('invited','draft','submitted','changes_requested','authorization_pending')`;
  await sql`CREATE INDEX IF NOT EXISTS doctor_onboarding_review_queue
    ON doctor_onboarding_requests (state, updated_at DESC)`;
});
step("prescription booking preparation", async () => {
  await sql`CREATE TABLE IF NOT EXISTS stellar_binding_challenges (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('doctor', 'patient')),
    wallet TEXT NOT NULL,
    message TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    verified_signature TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS stellar_verified_bindings (
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('doctor', 'patient')),
    user_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    verification_reference TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (email, role),
    UNIQUE (wallet)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS prescription_booking_requests (
    appointment_id INTEGER PRIMARY KEY REFERENCES appointments(id) ON DELETE RESTRICT,
    issuance_id TEXT NOT NULL UNIQUE CHECK (issuance_id ~ '^[0-9a-f]{64}$'),
    network TEXT NOT NULL CHECK (network = 'testnet'),
    contract_id TEXT NOT NULL,
    patient_requested_by TEXT NOT NULL,
    patient_email TEXT NOT NULL,
    doctor_email TEXT NOT NULL,
    patient_wallet TEXT NOT NULL,
    doctor_wallet TEXT NOT NULL,
    valid_until BIGINT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('prepared', 'submitted', 'confirmed', 'cancel_requested', 'revoked', 'consumed', 'failed')),
    transaction_hash TEXT,
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    prepared_xdr TEXT,
    tx_kind TEXT CHECK (tx_kind IN ('attest', 'revoke')),
    last_error TEXT,
    attestation_hash TEXT,
    revocation_hash TEXT,
    cancellation_requested_by TEXT,
    cancellation_requested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE prescription_booking_requests ADD COLUMN IF NOT EXISTS doctor_user_id TEXT`;
  await sql`ALTER TABLE prescription_booking_requests ADD COLUMN IF NOT EXISTS doctor_wallet_id TEXT`;
  await sql`ALTER TABLE prescription_booking_requests ADD COLUMN IF NOT EXISTS patient_wallet_id TEXT`;
  await sql`ALTER TABLE prescription_booking_requests ADD COLUMN IF NOT EXISTS attempts JSONB NOT NULL DEFAULT '[]'::jsonb`;
  // A role-checked state transition is allowed; bound participants and attendance are not mutable.
  await sql`CREATE OR REPLACE FUNCTION protect_prescription_appointment() RETURNS trigger AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM prescription_booking_requests WHERE appointment_id = OLD.id) THEN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'prescription_booking_locked' USING ERRCODE = '23514'; END IF;
      IF ROW(NEW.doctor_id,NEW.doctor_email,NEW.patient_email,NEW.doctor_user_id,NEW.patient_user_id,
        NEW.doctor_wallet_id,NEW.patient_wallet_id,NEW.doctor_wallet,NEW.patient_wallet,NEW.date,NEW.time_slot,
        NEW.attendance_user_id,NEW.attendance_at,NEW.started_by,NEW.started_at)
        IS DISTINCT FROM ROW(OLD.doctor_id,OLD.doctor_email,OLD.patient_email,OLD.doctor_user_id,OLD.patient_user_id,
        OLD.doctor_wallet_id,OLD.patient_wallet_id,OLD.doctor_wallet,OLD.patient_wallet,OLD.date,OLD.time_slot,
        OLD.attendance_user_id,OLD.attendance_at,OLD.started_by,OLD.started_at) THEN
        RAISE EXCEPTION 'prescription_booking_locked' USING ERRCODE = '23514';
      END IF;
      IF NEW.status='cancelled' AND OLD.status<>'cancelled' AND NOT EXISTS (
        SELECT 1 FROM prescription_booking_requests b WHERE b.appointment_id=OLD.id
          AND (b.state='revoked' OR (b.state='failed' AND b.last_error='cancelled_before_attestation'
            AND b.transaction_hash IS NULL AND b.prepared_xdr IS NULL AND b.attestation_hash IS NULL AND b.attempts='[]'::jsonb))
      ) THEN RAISE EXCEPTION 'booking_cancellation_pending' USING ERRCODE = '23514'; END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END; $$ LANGUAGE plpgsql`;
  await sql`DROP TRIGGER IF EXISTS protect_prescription_appointment ON appointments`;
  await sql`CREATE TRIGGER protect_prescription_appointment BEFORE UPDATE OR DELETE ON appointments
    FOR EACH ROW EXECUTE FUNCTION protect_prescription_appointment()`;
});

step("private prescriptions", async () => {
  await sql`CREATE TABLE IF NOT EXISTS private_prescriptions (
    id UUID PRIMARY KEY,
    network TEXT NOT NULL CHECK (network = 'testnet'),
    contract_id TEXT NOT NULL,
    appointment_id INTEGER NOT NULL REFERENCES prescription_booking_requests(appointment_id),
    issuance_id TEXT NOT NULL UNIQUE REFERENCES prescription_booking_requests(issuance_id),
    doctor_wallet TEXT NOT NULL,
    patient_wallet TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    commitment TEXT NOT NULL CHECK (commitment ~ '^[0-9a-f]{64}$'),
    ciphertext TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('prepared', 'submitted', 'confirmed')),
    transaction_hash TEXT,
    rx_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (state <> 'confirmed' OR (transaction_hash IS NOT NULL AND rx_id IS NOT NULL)),
    UNIQUE(network, contract_id, rx_id)
  )`;
});

step("private operations", async () => {
  await sql`CREATE TABLE IF NOT EXISTS private_operations (
    id UUID PRIMARY KEY,
    actor_user_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    wallet_id TEXT NOT NULL,
    source_wallet TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('consent','withdraw_consent','mint','activate','revoke')),
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
    prescription_id UUID REFERENCES private_prescriptions(id) ON DELETE RESTRICT,
    contract_id TEXT NOT NULL,
    method TEXT NOT NULL,
    expected JSONB NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('awaiting_signature','submitted','confirmed','failed','cancelled')),
    unsigned_xdr TEXT NOT NULL,
    signing_hash TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    signed_xdr TEXT,
    transaction_hash TEXT,
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    CHECK ((signed_xdr IS NULL)=(transaction_hash IS NULL))
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS private_operations_one_live_source ON private_operations(source_wallet) WHERE state IN ('awaiting_signature','submitted')`;
  await sql`CREATE INDEX IF NOT EXISTS private_operations_appointment ON private_operations(appointment_id)`;
});

// ── Run ─────────────────────────────────────────────────────────────────────
const host = process.env.DATABASE_URL.replace(/.*@([^/]+)\/.*/, "$1");
console.log(`\n  target: ${host}\n`);

const selectedStep = process.argv.find((arg) => arg.startsWith("--step="))?.slice(7);
if (selectedStep && !steps.some((s) => s.name === selectedStep)) throw new Error("Unknown migration step");
for (const { name, fn } of steps.filter((s) => !selectedStep || s.name === selectedStep)) {
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
