# 📜 Smart contracts

TrustLeaf's on-chain layer is four Soroban contracts, written in Rust and
compiled to WASM. They anchor the **integrity** of medical records without ever
touching the underlying data: only SHA-256 hashes and non-transferable
(*soulbound*) tokens live on-chain. Everything sensitive — clinical notes, PII,
FHIR payloads, exam files — stays off-chain and encrypted.

This document is the reference for every deployed contract: its purpose, its
Testnet address, and a method table built from the actual `pub fn`s in its
`lib.rs`.

> **Source of truth.** Signatures below are read straight from
> [`contracts/`](../contracts). If you change a contract, update its table here.

---

## At a glance

| Contract | Role | Testnet ID | Source |
|---|---|---|---|
| **clinical-record** | Patient-owned ficha — one record per patient | [`CCATYIFO…22GY5`](https://stellar.expert/explorer/testnet/contract/CCATYIFOHLLRS6CMONJQZ66A6QN3Z7EQFU3O4HD4RMTNS67F2U422GY5) | [`clinical-record/src/lib.rs`](../contracts/clinical-record/src/lib.rs) |
| **prescription-soulbound** | Non-transferable Rx (Decreto 41) | [`CA3I4NLB…LXYL`](https://stellar.expert/explorer/testnet/contract/CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL) | [`prescription-soulbound/src/lib.rs`](../contracts/prescription-soulbound/src/lib.rs) |
| **document-soulbound** | Licenses & certificates (9 types) | [`CBNX6WYT…CMON`](https://stellar.expert/explorer/testnet/contract/CBNX6WYTQUWTKKJSDLKARXQHONUW6H435CSZ4VA6O4U7TGI5E2IVCMON) | [`document-soulbound/src/lib.rs`](../contracts/document-soulbound/src/lib.rs) |
| **doctor-registry** | Who may prescribe + specialised permissions | [`CC246CYK…2X2O`](https://stellar.expert/explorer/testnet/contract/CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O) | [`doctor-registry/src/lib.rs`](../contracts/doctor-registry/src/lib.rs) |
| `dispensary-registry` · `dispense-record` | Pharmacy dispensation | ⏳ not yet deployed | — |

Contract IDs are wired into the frontend through
[`src/lib/stellar/config.ts`](../src/lib/stellar/config.ts) (`CONTRACT_IDS`) and
mirrored in `.env.local` as `NEXT_PUBLIC_*` overrides.

---

## 🗂️ clinical-record

**The patient-owned ficha clínica.** A single append-only clinical history whose
**sole owner is the patient's wallet**. Doctors, clinics, and labs can only add
to it once the patient has granted them write access *on-chain* — that grant is
the consent. Each entry anchors the **SHA-256 hash** of an encrypted FHIR
resource (`Observation`, `Condition`, `DiagnosticReport`, …); the plaintext
never touches the chain.

- **Testnet (demo patient):** [`CCATYIFOHLLRS6CMONJQZ66A6QN3Z7EQFU3O4HD4RMTNS67F2U422GY5`](https://stellar.expert/explorer/testnet/contract/CCATYIFOHLLRS6CMONJQZ66A6QN3Z7EQFU3O4HD4RMTNS67F2U422GY5)

> **⚠️ One record per patient.** This is *not* one global contract — there is one
> `clinical-record` instance per patient, and the owner is **fixed at deploy
> time by the constructor** (there is no separate `init`, so no init
> front-running window). The Testnet ID above is only the **demo patient's**
> record; production resolves a patient's record contract from a directory.
> `config.ts` exposes it as `clinicalRecordDemo`.

### Methods

| Method | What it does | Who may call it |
|---|---|---|
| `__constructor(owner)` | Binds the record to its owning patient wallet at deploy; seeds an empty write-access map. Runs once, atomically with deploy. | Deployer (once) |
| `grant_write_access(grantee)` | Authorizes a doctor/clinic wallet to append entries. **This is the on-chain consent.** | Owner (patient) only |
| `revoke_write_access(grantee)` | Flips a grant to `false` (kept as an auditable trail, not deleted). | Owner (patient) only |
| `append_entry(author, kind, content_hash)` | Appends one clinical entry — `kind` (FHIR type) + 32-byte SHA-256 hash + author + ledger timestamp. **Requires a prior `grant_write_access`.** | Owner, or a granted writer (`author` must sign) |
| `has_write_access(who) → bool` | Whether `who` may currently append (owner or granted writer). | Anyone (read-only) |
| `get_entries() → Vec<RecordEntry>` | The full append-only history. Reads are open — the ledger is public anyway; confidentiality comes from off-chain encryption. | Anyone (read-only) |
| `get_owner() → Address` | The patient wallet that owns this record. | Anyone (read-only) |

**Consent flow:** a doctor's `append_entry` is rejected with
`Error::Unauthorized` unless the patient has first called
`grant_write_access(doctorWallet)`. Owner writes are always allowed. Revoke, and
the doctor loses write access on the next entry.

---

## 💊 prescription-soulbound

**Non-transferable digital prescriptions**, modelled on Chile's **Decreto 41
(MINSAL)** — the Reglamento de Farmacias. A prescription is *soulbound*: there is
no transfer function, so it is bound to the `patient_wallet` at mint and can
never change holder, be sold, or be forged. Only the `rx_hash` (SHA-256 of the
full FHIR `MedicationRequest`) and the minimal clinical metadata a pharmacy needs
to dispense live on-chain — no PII.

- **Testnet:** [`CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL`](https://stellar.expert/explorer/testnet/contract/CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL)

### Lifecycle

```
                    ┌─ dispense (partial) ─► PartiallyDispensed ─► Burned
Registered ─activate─► Active ─┤
                    └─ dispense (full) ────► Burned
                    └─ revoke ─────────────► Revoked
(any non-terminal state) ─ block ──────────► Blocked
```

`Status`: `Registered(0)` · `Active(1)` · `Blocked(2)` · `PartiallyDispensed(3)`
· `Burned(4)` · `Revoked(5)`.

### Methods

| Method | What it does | Who may call it |
|---|---|---|
| `__constructor(admin, doctor_registry, dispensary_registry)` | Sets the admin and the sibling registry addresses; zeroes the ID counter. Runs once at deploy. | Deployer (once) |
| `mint_prescription(doctor_wallet, patient_wallet, rx_hash, medication, dosage, units_total, expires_at) → id` | Issues a soulbound Rx at status `Registered`. Two checks, both required: `require_auth` proves the doctor signed, and **doctor-registry `is_authorized`** proves they may prescribe. Returns the new ID. | An **authorized** doctor (must sign) |
| `activate(caller, prescription_id)` | `Registered → Active`. | Patient or issuing doctor (must sign) |
| `dispense(dispensary, prescription_id, units)` | Deducts `units`; `→ PartiallyDispensed` (balance left) or `→ Burned` (balance 0). Rejects if expired (Decreto 41) or over balance. Dispensary-registry cross-check is a future TODO. | Dispensary (must sign) |
| `revoke(doctor_wallet, prescription_id)` | `→ Revoked`. Cannot revoke a `Burned` Rx. | Issuing doctor only |
| `block(prescription_id)` | `→ Blocked` (fraud/admin error). Cannot block terminal or already-blocked states. | Admin only |
| `is_valid(id) → bool` | `true` iff the Rx exists, is `Active`, and has not expired. Fast pharmacy scan. | Anyone (read-only) |
| `get_prescription(id) → Prescription` | The full Rx record. | Anyone (read-only) |
| `get_prescriptions_by_patient(patient) → Vec<Prescription>` | All of a patient's prescriptions (index lookup). | Anyone (read-only) |
| `get_prescriptions_by_doctor(doctor) → Vec<Prescription>` | All prescriptions a doctor issued (index lookup). | Anyone (read-only) |

> **Note:** `mint_prescription`'s registry check currently degrades in practice —
> see the doctor-registry limitation below.

---

## 📜 document-soulbound

**General-purpose soulbound document tokens** for medical certificates,
professional licenses, and mental-health certificates. Like prescriptions, each
document is bound to its `recipient_wallet` and non-transferable; only a
`content_hash` (SHA-256 of the off-chain FHIR-like payload) is stored. By design
there is **no registry cross-call** — the issuer just signs — so the same
contract serves doctors, universities, and licensing boards alike.

- **Testnet:** [`CBNX6WYTQUWTKKJSDLKARXQHONUW6H435CSZ4VA6O4U7TGI5E2IVCMON`](https://stellar.expert/explorer/testnet/contract/CBNX6WYTQUWTKKJSDLKARXQHONUW6H435CSZ4VA6O4U7TGI5E2IVCMON)

### The 9 document types (`DocType`)

| # | Variant | Meaning |
|---|---|---|
| **Medical certificates** ||
| 0 | `LaborRest` | Reposo laboral — work-rest certificate (days + diagnosis) |
| 1 | `LaborFitness` | Aptitud laboral — fitness-for-work certificate |
| 2 | `Disability` | Incapacidad — temporary or permanent disability |
| **Professional licenses** ||
| 3 | `MedicalLicense` | Licencia médica — issuance/renewal with specialty |
| 4 | `DegreeTitle` | Certificado de título — degree (doctor, psychologist, nurse…) |
| 5 | `ProfCredential` | Credencial de habilitación profesional |
| **Mental-health certificates** ||
| 6 | `PsychCare` | Atención psicológica — "in/was in treatment" (no diagnosis) |
| 7 | `PsychEval` | Evaluación psicológica — for labor/legal/admin proceedings |
| 8 | `TreatmentDischarge` | Alta de tratamiento psicológico |

`DocStatus`: `Active(0)` · `Revoked(1)`.

### Methods

| Method | What it does | Who may call it |
|---|---|---|
| `mint_document(issuer_wallet, recipient_wallet, doc_type, content_hash, expires_at) → id` | Issues a soulbound document at status `Active`. `expires_at = 0` means no expiry; a non-zero value must be in the future. Returns the new ID. | Issuer (must sign) |
| `revoke_document(id)` | `Active → Revoked` (terminal). | Original issuer only |
| `get_document(id) → MedDocument` | Read-only fetch for public verification (QR scan). | Anyone (read-only) |

---

## 📇 doctor-registry

**Governs which wallets may prescribe** and which specialised permissions they
hold. An admin (the clinic / medical authority) authorizes a doctor *after*
verifying their national medical license off-chain. Permissions are a separate,
extensible `Vec<Symbol>` per wallet, so new clearances can be added without a
redeploy. Two are pre-declared: `PERM_CANNABIS` (`CANNABIS`) and `PERM_MNT_HLTH`
(`MNT_HLTH`).

- **Testnet:** [`CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O`](https://stellar.expert/explorer/testnet/contract/CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O)

### Methods

| Method | What it does | Who may call it |
|---|---|---|
| `init(admin)` | One-time setup: sets the governing admin. Errors if already initialized. | Deployer (once) |
| `register_doctor(wallet, full_name, license_id)` | Authorizes a doctor (`authorized = true`) after off-chain license check. | Admin only |
| `revoke_doctor(wallet)` | Sets `authorized = false` (record kept for audit; permissions not auto-cleared). | Admin only |
| `is_authorized(wallet) → bool` | Is this wallet currently allowed to prescribe? `false` for unknown or revoked. | Anyone (read-only) |
| `get_doctor(wallet) → Doctor` | Full doctor record. | Anyone (read-only) |
| `grant_permission(doctor_wallet, permission)` | Adds a named `Symbol` permission (idempotent). | Admin only |
| `revoke_permission(doctor_wallet, permission)` | Removes a permission (idempotent). | Admin only |
| `has_permission(doctor_wallet, permission) → bool` | Does the doctor hold the given permission? | Anyone (read-only) |
| `get_permissions(doctor_wallet) → Vec<Symbol>` | Full permission list for a doctor. | Anyone (read-only) |
| `transfer_admin(new_admin)` | Hands the admin role to a new address. | Current admin only |
| `get_admin() → Address` | The current governing admin. | Anyone (read-only) |

> ### ⚠️ Known limitation — the deployed registry is admin-locked
>
> The **admin secret for the deployed registry is not held by the team**. Its
> admin is `GB2PFKB24QPIEB3VIKYTIEG7M4KRH5I4KBPV26LUC6KOE2YAWSCPXKZ6`. Because
> `register_doctor` requires the admin's signature, **it cannot be called**, so
> `is_authorized` returns `false` for *everyone*.
>
> As a consequence, `prescription-soulbound.mint_prescription` — which trusts
> `is_authorized` — could never succeed against the real registry. To keep the
> demo working, **`/api/mint` treats any valid `G`-address as a
> demo-authorized prescriber** instead of relying on the on-chain check.
>
> **The fix is to redeploy the registry with an admin key we hold**, register the
> real doctors, and remove the demo shortcut.

---

## 🔨 Build & deploy

The contracts are a Cargo workspace under [`contracts/`](../contracts), built
Rust → WASM.

**The Rust toolchain does not run locally.** WDAC blocks `rustc` from loading
proc-macro DLLs (`os error 4551`); under the release profile it disguises itself
as "can't find crate for `serde_with_macros`". So **CI is the only place a
deployable WASM comes from** — the
[`contracts.yml`](../.github/workflows/contracts.yml) GitHub Action:

1. **Test** — `cargo test` runs on **three crates only**: `doctor-registry`,
   `prescription-soulbound`, `clinical-record`, plus the `trustleaf-e2e`
   integration crate. Scoped deliberately so an unfinished contract elsewhere in
   the workspace can't redden the badge. (`document-soulbound` compiles and
   deploys but is kept out of the test scope — its `test.rs` is unfinished.)
2. **Build WASM** — `cargo build --target wasm32-unknown-unknown --release` for
   `doctor-registry`, `prescription-soulbound`, `clinical-record`, and
   `document-soulbound`.
3. **Optimize** — `stellar contract optimize` (CLI v27) strips reference-types /
   multivalue instructions that Soroban's VM rejects. **Required, not
   cosmetic**: a raw artifact fails to deploy with
   `Error(WasmVm, InvalidAction)` — "reference-types not enabled". This can't be
   fixed with `-C target-feature` (since Rust 1.82 those live in the target spec).
4. **Upload** — the `*.optimized.wasm` files are uploaded as the
   `contracts-wasm` artifact (30-day retention).

**To deploy:** download the `contracts-wasm` artifact from a CI run, then
`stellar contract deploy --wasm <file>` to Testnet. A newly deployed contract's
ID must be wired into
[`src/lib/stellar/config.ts`](../src/lib/stellar/config.ts) (`CONTRACT_IDS`) and
`.env.local` (`NEXT_PUBLIC_*`). CI does **not** deploy — deployment is manual.

> `dispensary-registry` and `dispense-record` exist in the workspace but are
> **not deployed**; their config IDs stay `undefined`, which puts the pharmacy /
> dispense endpoints in simulated mode.

---

## 🔒 What's stored on-chain

**Only hashes and soulbound tokens. Never PII, never clinical text.**

| On-chain | Off-chain (Neon Postgres, encrypted) |
|---|---|
| 32-byte **SHA-256** of each clinical entry (`content_hash`) | The clinical note / FHIR resource itself |
| 32-byte **SHA-256** of each prescription (`rx_hash`) | Full FHIR `MedicationRequest`, patient details |
| 32-byte **SHA-256** of each document (`content_hash`) | The certificate / license payload |
| Wallet **addresses** (owner, author, doctor, patient, issuer, recipient) | Names, license IDs, diagnoses, exam files |
| Minimal Rx metadata (medication DCI, dosage, units, expiry, status) | — |
| Consent grants, permission symbols, event logs | — |

**Why this is safe *and* private:** the Soroban ledger is public — anyone can
read every entry over RPC — so gating reads inside a contract would be security
theater. Real confidentiality comes from the payloads being **encrypted
off-chain**; only their hashes are anchored. A verifier re-hashes the off-chain
payload and compares it to the on-chain value: tamper-evident, patient-owned,
and publicly verifiable, with zero PHI exposure.

---

## See also

- **[docs/ARCHITECTURE.md](./ARCHITECTURE.md)** — on-chain/off-chain model,
  signing + relayer, auth & enforcement.
- **[docs/API.md](./API.md)** — the REST surface that calls these contracts.
- **[docs/DATA_MODEL.md](./DATA_MODEL.md)** — Postgres schema + on-chain vs
  off-chain data map.
