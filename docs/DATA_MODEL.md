# 🗃️ Data model

The off-chain data model, and the line between what lives in the database and
what is anchored on Stellar Soroban.

> **The one rule:** only a **SHA-256 hash** (and, for prescriptions and
> licenses, a soulbound token) ever touches the chain. Every human-readable
> field — notes, PII, file bytes — lives off-chain in Postgres. The chain proves
> integrity; the database holds the payload.

---

## Where the schema lives

The off-chain store is **[Neon](https://neon.tech) Postgres** — serverless
Postgres over an HTTP driver (`@neondatabase/serverless`). Two branches:

| Branch | Endpoint | Used by |
|---|---|---|
| **dev** | `ep-lingering-water-ahzh89z5` | local `npm run dev`, tests |
| **prod** | `ep-rapid-shadow-ahq94785` | the Vercel deployment |

The schema has a **single source of truth**:
[`scripts/migrate.mjs`](../scripts/migrate.mjs). It is **idempotent** — every
statement is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, so it is
safe to re-run against either branch after adding schema:

```bash
node scripts/migrate.mjs      # reads DATABASE_URL from .env.local
```

> ⚠️ **Never** put `CREATE TABLE` in a route handler. The schema used to be
> scattered across eight route files as `ensureTable()` calls awaited on *every
> request*; consolidating it here is why the migration script exists. Add new
> schema to `migrate.mjs` and re-run it.

Every query goes through **one client**: `getDb()` in
[`src/lib/db.ts`](../src/lib/db.ts) returns the shared `neon(DATABASE_URL)`
handle. (This repo once carried five drifted copies of `getDb()` — check
`src/lib/` before writing a helper.)

---

## Identity & access

### `doctors`

The practitioner directory. A doctor is approved by an admin (`status`) before
they can be listed or booked. The profile and legal-identity columns feed the
prescription *membrete* required by Ley 20.724 / SNRE.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `name` | `TEXT NOT NULL` | Display name |
| `email` | `TEXT NOT NULL UNIQUE` | Login identity; the join key used across the schema |
| `specialty` | `TEXT` | Medical specialty |
| `license_num` | `TEXT` | Professional license number |
| `rut` | `TEXT` | Chilean national ID |
| `status` | `TEXT NOT NULL DEFAULT 'active'` | Admin approval state |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Row creation |
| `bio` | `TEXT` | Self-edited profile bio |
| `telemedicine` | `BOOLEAN NOT NULL DEFAULT TRUE` | Offers teleconsultation |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | Last profile edit |
| `phone` | `TEXT` | Contact for the receta membrete |
| `center_name` | `TEXT` | Clinic/center name on the receta |
| `center_address` | `TEXT` | Clinic/center address on the receta |
| `signature_url` | `TEXT` | Digital signature/seal stamped on prescriptions |

### `registered_users`

Everyone who has logged in through Privy, recorded on auth. Ties a Privy
identity to an (optional) email and embedded Stellar wallet.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `privy_id` | `TEXT NOT NULL UNIQUE` | Privy user identifier |
| `email` | `TEXT` | Email, if available from the auth provider |
| `wallet` | `TEXT` | Embedded Stellar wallet address |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | First login |

### `waitlist`

Landing-page signups, before onboarding.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `email` | `TEXT NOT NULL UNIQUE` | Signup email |
| `role` | `TEXT` | Self-declared role (doctor / patient / …) |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Signup time |

---

## Scheduling

### `appointments`

The booking row — and, since the consultation store was folded in, also the
**consultation record**: it carries the Jitsi/Meet space and the on-chain
**consent event** by which the patient authorizes their doctor to write their
ficha.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `doctor_email` | `TEXT NOT NULL` | Booked doctor |
| `patient_email` | `TEXT NOT NULL` | Booking patient |
| `patient_name` | `TEXT NOT NULL DEFAULT ''` | Patient display name |
| `date` | `DATE NOT NULL` | Appointment date |
| `time_slot` | `TEXT NOT NULL` | Slot label (e.g. `09:30`) |
| `type` | `TEXT NOT NULL DEFAULT 'Presencial'` | Presencial / telemedicine |
| `motivo` | `TEXT` | Reason for visit |
| `notes` | `TEXT` | Consultation notes |
| `status` | `TEXT NOT NULL DEFAULT 'scheduled'` | `scheduled` → `in_progress` → … / `cancelled` |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Booking time |
| `meet_link` | `TEXT` | Teleconsult room URL |
| `meeting_code` | `TEXT` | Teleconsult join code |
| `space_name` | `TEXT` | Teleconsult space name |
| `started_at` | `TIMESTAMPTZ` | When the consultation (and consent) began |
| `consent_tx` | `TEXT` | On-chain `grant_write_access` tx hash |
| `consent_mode` | `TEXT` | `onchain` \| `simulated` — did the grant land on-chain |
| `consent_wallet` | `TEXT` | Wallet granted write-access (the doctor's) |

**Indexes / constraints:** a partial unique index `uniq_appt_slot` on
`(doctor_email, date, time_slot) WHERE status <> 'cancelled'` prevents
double-booking in the database rather than in a racy route check; lookup indexes
`idx_appt_doctor_date` and `idx_appt_patient`.

### `doctor_availability`

The weekly availability grid the booking flow expands into slots.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `doctor_email` | `TEXT NOT NULL` | Owning doctor |
| `weekday` | `SMALLINT NOT NULL` | `0`=Sunday … `6`=Saturday (JS `getDay()`) |
| `start_time` | `TIME NOT NULL` | Block start |
| `end_time` | `TIME NOT NULL` | Block end |
| `slot_minutes` | `SMALLINT NOT NULL DEFAULT 30` | Slot length within the block |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Row creation |

**Constraints:** `weekday BETWEEN 0 AND 6`, `end_time > start_time`,
`slot_minutes > 0`. Indexed by `idx_availability_doctor`.

### `doctor_time_off`

Exceptions to the grid — holidays, conferences, blocked days.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `doctor_email` | `TEXT NOT NULL` | Owning doctor |
| `date` | `DATE NOT NULL` | Blocked day |
| `reason` | `TEXT` | Optional reason |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Row creation |

**Constraints:** `UNIQUE (doctor_email, date)`. Indexed by `idx_timeoff_doctor`.

---

## Clinical record

### `patient_health_records` — *antecedentes*

The patient's standing health profile: identity required by the ficha clínica
(Ley 20.584 / Decreto 41) plus vitals, allergies, chronic conditions and
vaccinations. Keyed by email — **one row per patient**. This table is
**off-chain only** — no hash is anchored (see the map below).

| Column | Type | Purpose |
|---|---|---|
| `patient_email` | `TEXT PRIMARY KEY` | Patient identity / key |
| `blood_type` | `TEXT` | Blood group |
| `height_cm` | `TEXT` | Height |
| `weight_kg` | `TEXT` | Weight |
| `bmi` | `TEXT` | Body-mass index |
| `allergies` | `JSONB DEFAULT '[]'` | Allergy list |
| `conditions` | `JSONB DEFAULT '[]'` | Chronic conditions list |
| `vaccinations` | `JSONB DEFAULT '[]'` | Vaccination list |
| `primary_doctor` | `TEXT` | Treating doctor |
| `primary_doctor_specialty` | `TEXT` | Treating doctor's specialty |
| `notes` | `TEXT` | Free-text notes |
| `updated_at` | `TIMESTAMPTZ DEFAULT NOW()` | Last edit |
| `full_name` | `TEXT` | Legal name (Ley 20.584) |
| `rut` | `TEXT` | Chilean national ID |
| `birthdate` | `DATE` | Date of birth |
| `phone` | `TEXT` | Contact phone |
| `address` | `TEXT` | Address |
| `prevision` | `TEXT` | Health-insurance scheme (Fonasa / Isapre) |
| `emergency_contact` | `TEXT` | Emergency contact |

### `clinical_entries` — the off-chain mirror of the ficha

Each row mirrors **one on-chain `ClinicalRecord` entry**. The chain stores only
the SHA-256 anchor plus author and timestamp; the readable `kind`/`summary`/
`detail` live here so the UI can render the history without decrypting anything.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `patient_email` | `TEXT NOT NULL` | Owning patient |
| `patient_wallet` | `TEXT` | Patient's record wallet |
| `kind` | `TEXT NOT NULL` | Entry type (consultation, diagnosis, …) |
| `summary` | `TEXT NOT NULL` | One-line summary for the timeline |
| `detail` | `TEXT` | Full body |
| `content_hash` | `TEXT NOT NULL` | **hex SHA-256 anchored on-chain** |
| `tx_hash` | `TEXT` | On-chain tx (null when simulated) |
| `mode` | `TEXT NOT NULL DEFAULT 'simulated'` | `onchain` \| `simulated` |
| `author_wallet` | `TEXT` | Wallet that signed the append |
| `doctor_email` | `TEXT` | Authoring doctor |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Entry time |

Indexed by `idx_clinical_entries_patient` on `(patient_email, created_at DESC)`.

### `clinical_documents` — exams, labs, imaging

A doctor attaches an exam file (PDF/image). **The bytes live here** (base64) so
both portals can view it; its SHA-256 is anchored on-chain as a
`DiagnosticReport` entry. The file itself never touches the chain.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `patient_email` | `TEXT NOT NULL` | Owning patient |
| `doctor_email` | `TEXT` | Uploading doctor |
| `category` | `TEXT NOT NULL DEFAULT 'Examen'` | Laboratorio \| Imagenología \| Informe \| Examen |
| `title` | `TEXT NOT NULL` | Document title |
| `file_name` | `TEXT` | Original filename |
| `mime_type` | `TEXT` | MIME type |
| `content_base64` | `TEXT NOT NULL` | **The file, base64-encoded** |
| `content_hash` | `TEXT NOT NULL` | **hex SHA-256 anchored on-chain** |
| `tx_hash` | `TEXT` | On-chain tx (null when simulated) |
| `mode` | `TEXT NOT NULL DEFAULT 'simulated'` | `onchain` \| `simulated` |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Upload time |

Indexed by `idx_clinical_documents_patient` on `(patient_email, created_at DESC)`.

### `medical_licenses` — sick-leave & certificates

Licenses and certificates, anchored via the **document-soulbound** contract.

> 🧩 **Reconciled from a legacy shape.** On dev/prod the table was first created
> by an old route's `ensureTable` with `start_date`/`days`/`diagnosis`/
> `rest_type` and `patient_email NOT NULL`, so the modern Spanish columns the
> `/api/licenses` route reads and writes were added later via
> `ADD COLUMN IF NOT EXISTS`, backfilled from the legacy columns, and the legacy
> `NOT NULL`s relaxed. The columns below are the current shape.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `doctor_email` | `TEXT NOT NULL` | Issuing doctor |
| `patient_email` | `TEXT` | Patient (legacy NOT NULL, relaxed) |
| `patient_name` | `TEXT NOT NULL` | Patient name |
| `patient_rut` | `TEXT` | Patient national ID |
| `fecha_inicio` | `DATE` | Start date of leave |
| `dias` | `INTEGER` | Number of days |
| `cie10` | `TEXT` | ICD-10 / CIE-10 diagnosis code |
| `tipo` | `TEXT` | License type |
| `diagnostico` | `TEXT` | Diagnosis text |
| `observaciones` | `TEXT` | Observations |
| `status` | `TEXT NOT NULL DEFAULT 'draft'` | Draft / issued / … |
| `tx_hash` | `TEXT` | On-chain mint tx (null when simulated) |
| `doc_hash` | `TEXT` | **hex SHA-256 anchored on-chain** |
| `doc_id` | `INTEGER` | Soulbound document id from the contract |
| `mode` | `TEXT` | `onchain` \| `simulated` |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Row creation |

<sub>Legacy columns `start_date` / `days` / `diagnosis` / `rest_type` may still
exist on migrated branches (backfilled into the columns above); no route reads
them.</sub>

### `pain_diary` — diario de dolor

The patient's self-reported pain log, one row per day, keyed by Privy id.

| Column | Type | Purpose |
|---|---|---|
| `id` | `SERIAL PK` | Row id |
| `privy_id` | `TEXT NOT NULL` | Patient (Privy identity) |
| `date` | `TEXT NOT NULL` | Log day |
| `entries` | `JSONB NOT NULL DEFAULT '[]'` | That day's pain entries |
| `saved_at` | `TIMESTAMPTZ DEFAULT NOW()` | Last save |

**Constraints:** `UNIQUE (privy_id, date)`.

---

## On-chain ↔ off-chain map

For each clinical artifact: what lives **off-chain** (the row) versus what is
**anchored on-chain**, and through which contract.

| Artifact | Off-chain (Postgres) | On-chain anchor | Contract | Anchor column(s) |
|---|---|---|---|---|
| **Clinical entry** (ficha) | `clinical_entries` row — `kind`/`summary`/`detail` | SHA-256 of the entry | **clinical-record** (`append_entry`) | `content_hash` → `tx_hash` / `mode` |
| **Exam / lab / imaging** | `clinical_documents` row — the file bytes (`content_base64`) | SHA-256 of the file (a `DiagnosticReport` entry) | **clinical-record** | `content_hash` → `tx_hash` / `mode` |
| **Medical license** | `medical_licenses` row | SHA-256 + soulbound document token | **document-soulbound** (`mint_document`) | `doc_hash` / `doc_id` → `tx_hash` / `mode` |
| **Prescription (receta)** | **none** — no DB table | Soulbound Rx token (data on-chain) | **prescription-soulbound** (`mint_prescription`) | listed via the contract |
| **Consent** | `appointments` row | `grant_write_access` transaction | **clinical-record** | `consent_tx` / `consent_wallet` / `consent_mode` |
| **Antecedentes** | `patient_health_records` row | ⚠️ **none — off-chain only** | — | *no hash anchored yet* |

Notes:

- **Prescriptions are not in the database.** They live entirely on-chain as
  soulbound tokens and are enumerated by querying the
  `prescription-soulbound` contract — there is no `prescriptions` table.
- **Antecedentes (`patient_health_records`) are off-chain only.** No hash is
  anchored today; anchoring it like clinical entries is a planned consistency
  improvement (see the README roadmap).

### The `mode` + `tx_hash` convention

Every anchorable artifact carries two bookkeeping columns that record whether the
anchor actually reached the chain:

- **`mode`** — `'onchain'` when the transaction landed, `'simulated'` when it did
  not. Writes degrade to `simulated` when the signer secrets
  (`DEMO_DOCTOR_SECRET` + `RELAYER_SECRET`) are absent, so every screen still
  works in demo mode.
- **`tx_hash`** (and `doc_hash`/`doc_id` for licenses) — the on-chain transaction
  hash, `NULL` while simulated. A non-null `tx_hash` with `mode = 'onchain'` is
  the proof an artifact is verifiable on Stellar.

---

## Table index

Eleven tables, all defined in [`scripts/migrate.mjs`](../scripts/migrate.mjs):

**Identity & access** — `doctors` · `registered_users` · `waitlist`
**Scheduling** — `appointments` · `doctor_availability` · `doctor_time_off`
**Clinical record** — `patient_health_records` · `clinical_entries` ·
`clinical_documents` · `medical_licenses` · `pain_diary`
