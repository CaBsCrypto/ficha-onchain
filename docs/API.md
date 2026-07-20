<div align="center">

# 🔌 TrustLeaf API Reference

### The REST surface, grouped by portal, with the auth model per route

</div>

The API is a set of **Next.js App Router route handlers** under
`src/app/api/**/route.ts` — Node runtime, `dynamic = "force-dynamic"`. This
document enumerates every endpoint, its purpose, key params/body, and **which
guard protects it**. It is generated from the route source; when a handler
changes, update this file in the same PR.

> Base URL is the deploy origin (`http://localhost:3000` in dev). All request
> and response bodies are JSON unless noted (file uploads are base64 in JSON;
> file *downloads* stream raw bytes).

---

## 🔑 Auth model

Client code calls the API with **`authedFetch`**, which attaches the user's
**Privy session as a `Bearer` JWT**. On the server, guards in
`src/lib/auth/**` verify that token and resolve the caller's identity from it —
**never from a request parameter** (several routes used to trust `?email=` and
were tightened after that let one caller read/overwrite another's record).

| Guard | Behaviour | Used by |
|---|---|---|
| **admin-token** | `?token=` (or JSON `token`) must equal `WAITLIST_ADMIN_TOKEN`, else `401`. | all `admin/*` |
| **`requireUser`** | Verifies the Privy JWT; returns the user or `401`. Self-only routes. | `patient/ficha`, `doctor/profile`, `prescriptions`, `prescriptions/activate` |
| **`resolveOwnerEmail`** | Verifies the token and confirms the caller **owns** the email in the param; demo mode passes through. | `doctor/availability`, `doctor/patients`, `doctor/slots`, `ficha/grant` |
| **`requireActor`** | Confirms the caller is **one of** the parties on the row (doctor *or* patient). | `appointments`, `licenses` |
| **`resolveOwnerOrTreating`** | Allows the patient themselves **or** a doctor with a granted **treating relationship** (consent row); else `403`. | `doctor/patient-record`, `ficha/document`, `ficha/document/[id]` |
| **`requireAuthOrDemo`** | Requires a valid token when enforcement is on; **passes through token-less in demo mode**. | `mint`, `revoke`, `ficha/entry`, `documents/mint`, `documents/revoke`, `patient-wallet`, `consultations` |
| **public** | No auth — QR verification, waitlist, relay. | `public/*`, `doctors` (GET), `waitlist`, `doctor-status` |

### Demo vs. enforced

Guarded routes **accept token-less calls in demo mode** so the flow scripts and
the logged-out demo keep working. Set **`TRUSTLEAF_REQUIRE_AUTH=true`** (or
`NEXT_PUBLIC_PASSKEY_ENABLED=true`) to reject anonymous callers with `401`; with
a token, owner-only / treating checks are already enforced either way.

### On-chain write convention: `mode`

Every route that anchors to Soroban returns a **`mode`** field:

- **`mode: "onchain"`** — a real, gasless transaction was signed (server demo
  keypair) and fee-bumped by the relayer; the response includes the `tx_hash`
  and a stellar.expert `explorer` URL.
- **`mode: "simulated"`** — the signer secret is missing, the doctor is not
  authorized in `DoctorRegistry`, or the network rejected the tx. A `reason` is
  returned and the event is still mirrored off-chain so the UI flow completes.

In production the user signs in-browser (passkey / Privy) and POSTs the signed
XDR to **`POST /api/relay`**, which fee-bumps and submits it.

---

## 🛡️ Admin portal

All guarded by **admin-token** (`?token=WAITLIST_ADMIN_TOKEN`). `401` without it.

| Method & path | Purpose | Params / body |
|---|---|---|
| `GET /api/admin/stats` | Dashboard summary counts. | `?token` |
| `GET /api/admin/overview` | Live snapshot of every domain table (per-table, degrades to `count:0` on missing tables). | `?token` |
| `GET /api/admin/activity` | Unified newest-first activity feed derived from `created_at` across tables. | `?token` |
| `GET /api/admin/doctors` | List all doctors (full private fields). | `?token` |
| `POST /api/admin/doctors` | Create a doctor. | `token`, doctor fields |
| `PATCH /api/admin/doctors` | Update / block a doctor. | `token`, `id`, fields |
| `DELETE /api/admin/doctors` | Delete a doctor. | `token`, `id` |
| `GET /api/admin/users` | List registered users. | `?token` |
| `POST /api/admin/users` | Track a user login (called client-side on auth). | user fields |
| `POST /api/admin/reset` | ⚠️ **DESTRUCTIVE, dev-only.** Wipe demo/test rows. Double-guarded. | `token`, `confirm:"RESET"`, `scope?:"transactional"\|"all"` |

> `POST /api/admin/users` is called from the client on login and does **not**
> require the admin token; the `GET` list does.

---

## 👩‍⚕️ Doctor portal

| Method & path | Purpose | Params / body | Auth |
|---|---|---|---|
| `GET /api/doctors` | **Public** list of active doctors for the booking picker (no RUT/license). | — | public |
| `POST /api/doctors` | Doctor self-registration → `status: pending`. | doctor fields | public |
| `GET /api/doctor/profile` | The caller's own doctor record. | — | `requireUser` |
| `PUT /api/doctor/profile` | Update self-service profile fields (not `status`). | profile fields | `requireUser` |
| `GET /api/doctor/availability` | The recurring weekly slot grid. | `?doctorEmail` | `resolveOwnerEmail` |
| `PUT /api/doctor/availability` | Replace the whole weekly grid. | `{ doctorEmail, blocks[] }` | `resolveOwnerEmail` |
| `GET /api/doctor/slots` | Computed bookable times for one doctor on one day. | `?doctorEmail&date=YYYY-MM-DD&all?=1` | `resolveOwnerEmail` |
| `GET /api/doctor/patients` | Deduplicated list of patients seen by this doctor. | `?doctorEmail` | `resolveOwnerEmail` |
| `GET /api/doctor/patient-record` | Read a patient's structured antecedentes. | `?patientEmail` | `resolveOwnerOrTreating` |
| `PATCH /api/doctor/patient-record` | A treating doctor updates antecedentes (clinical fields only). | `{ patientEmail, ...clinical }` | `resolveOwnerOrTreating` |
| `GET /api/doctor-status` | Is this wallet allowed to prescribe? (`source: chain\|demo\|unreachable`). | `?wallet=G…` | public |

---

## 🧑 Patient portal

| Method & path | Purpose | Params / body | Auth |
|---|---|---|---|
| `GET /api/patient/ficha` | The caller's **own** health record (blood type, allergies, conditions, notes). | — | `requireUser` |
| `PATCH /api/patient/ficha` | Update own health record. | record fields | `requireUser` |
| `GET /api/patient-wallet` | Resolve a registered patient's Stellar wallet by email (doctor auto-fill). | `?email` | `requireAuthOrDemo` |
| `GET /api/pain-diary` | Last N days of a user's pain entries. | `?privyId&days=30` | authenticated (per-user) |
| `POST /api/pain-diary` | Upsert a day's pain entries. | `{ privyId, date, entries }` | authenticated (per-user) |

> There is **deliberately no** way to request another patient's `/patient/ficha`
> — the doctor-side counterpart is `/doctor/patient-record`, gated by treating
> relationship.

---

## 📅 Appointments & teleconsult

| Method & path | Purpose | Params / body | Auth |
|---|---|---|---|
| `GET /api/appointments` | List appointments for a doctor or a patient. | `?doctorEmail` \| `?patientEmail` | `resolveOwnerEmail` |
| `POST /api/appointments` | Create an appointment. | appointment fields | `requireActor` |
| `PATCH /api/appointments` | Update status / notes. | `{ id, ... }` | `requireActor` (on the row) |
| `DELETE /api/appointments` | Delete an appointment. | `{ id }` | `requireActor` (on the row) |
| `POST /api/consultations` | Create a Google Meet teleconsult (needs doctor's Google auth). | `{ doctorWallet, patientWallet?, scheduledAt?, notes? }` | `requireAuthOrDemo` |
| `GET /api/consultations/[id]` | Fetch a consultation record by UUID. | path `id` | public |
| `GET /api/auth/google` | Start Google OAuth for a doctor (redirect to consent). | `?wallet=G…` | public (redirect) |
| `GET /api/auth/google/callback` | OAuth callback; stores tokens, redirects to portal. | `?code&state` | public (OAuth) |

---

## 🗂️ Ficha & on-chain writes

The patient-owned clinical record. Consent is on-chain; entries anchor a
SHA-256 hash. All writes return the `mode` convention above.

| Method & path | Purpose | Params / body | Auth |
|---|---|---|---|
| `POST /api/ficha/grant` | Patient grants their doctor on-chain **write access** (consent), tied to "start consultation"; marks appointment `in_progress`. | `{ appointmentId, patientEmail }` | `resolveOwnerEmail` |
| `POST /api/ficha/entry` | Doctor appends a clinical entry; anchors `SHA-256` on the ClinicalRecord (gasless). | `{ patientEmail, patientWallet?, kind, summary, detail?, doctorEmail? }` | `requireAuthOrDemo` |
| `GET /api/ficha/entries` | A patient's clinical history (off-chain mirror + anchors). | `?patientEmail` | (reads mirror) |
| `POST /api/ficha/document` | Attach an exam/lab/imaging file and anchor its hash as a DiagnosticReport. | `{ patientEmail, category?, title, fileName?, mimeType, base64, doctorEmail? }` | `resolveOwnerOrTreating` |
| `GET /api/ficha/document` | List a patient's documents (metadata only, no bytes). | `?patientEmail` | `resolveOwnerOrTreating` |
| `GET /api/ficha/document/[id]` | Stream one exam file's bytes with its real content-type. | path `id` | `resolveOwnerOrTreating` (from doc's own patient) |

### Prescriptions (soulbound Rx)

| Method & path | Purpose | Params / body | Auth |
|---|---|---|---|
| `POST /api/mint` | Issue a Decreto 41 prescription on-chain (FHIR bundle → `rx_hash`, gasless mint). | full Decreto 41 record + `patient` wallet | `requireAuthOrDemo` |
| `GET /api/prescriptions` | List prescriptions for a wallet with derived expiry overlay. | `?wallet=G…&role=doctor\|patient` | `requireUser` |
| `POST /api/prescriptions/activate` | Activate a prescription (Registrada → Activa). | `{ rxId }` | `requireUser` |
| `POST /api/revoke` | Revoke a prescription (issuing doctor only, on-chain). | `{ rxId }` | `requireAuthOrDemo` |

### Documents & licenses

| Method & path | Purpose | Params / body | Auth |
|---|---|---|---|
| `GET /api/licenses` | List medical licenses (reposo laboral). | `?doctorEmail` \| `?patientEmail` | `resolveOwnerEmail` |
| `POST /api/licenses` | Create a license (draft/signed). | license fields | `requireActor` |
| `PATCH /api/licenses` | Update a license. | `{ id, ... }` | `requireActor` |
| `DELETE /api/licenses` | Delete a license. | `{ id }` | `requireActor` |
| `POST /api/documents/mint` | Issue a medical document on-chain (`content_hash` via document-soulbound). | `{ recipient, docType, expiresAt?, payload }` | `requireAuthOrDemo` |
| `GET /api/documents` | List on-chain documents for a wallet. | `?wallet&role=issuer\|recipient&type?` | (reads chain) |
| `POST /api/documents/revoke` | Revoke a document on-chain (issuer only). | `{ docId }` | `requireAuthOrDemo` |
| `POST /api/documents/share` | Mint a 15-min HS256 share token for a document. | `{ docId, recipient }` | (issuer flow) |

---

## 🏥 Pharmacy & public verification

Public routes back the **QR scan flow** — no login required. Sanitized responses
never expose patient or doctor wallets.

| Method & path | Purpose | Params / body | Auth |
|---|---|---|---|
| `GET /api/public/prescription/[id]` | Public prescription validation (QR). Sanitized. | path `id` | public |
| `POST /api/public/prescription/[id]/dispense` | Register a dispensation against a prescription. | `Bearer <pharmacy_api_key>`; `{ amount, notes? }` | pharmacy API key (demo passes through) |
| `GET /api/public/document/[id]` | Public document verification (QR). Sanitized. | path `id` | public |
| `GET /api/public/pharmacy/verify` | Is a pharmacy wallet authorized to dispense? (`source: chain\|apikey\|demo`). | `?wallet=G…` | public |
| `POST /api/pharmacy/verify-pin` | Light PIN gate for the `/pharmacy` panel; sets `pharmacy_unlocked` cookie. | `{ pin }` | PIN (demo: any 6-digit) |
| `GET /api/pharmacy/lookup` | Resolve a patient RUT to on-chain prescriptions. | `?rut=` | `pharmacy_unlocked` cookie |

---

## 🔧 Infrastructure & misc

| Method & path | Purpose | Params / body | Auth |
|---|---|---|---|
| `POST /api/relay` | **Fee-bump relayer** — wraps a user-signed XDR so they spend no XLM; submits to testnet. | `{ xdr }` | same-origin guard |
| `POST /api/share` | Mint a 15-min share token for a prescription (QR at `/verify`). | `{ rxId, patient }` | (patient flow) |
| `POST /api/waitlist` | Join the launch waitlist. | `{ email, role? }` | public |
| `GET /api/waitlist` | List / count waitlist signups. | `?token` | admin-token |
| `POST /api/notify/prescription` | Email a patient when a prescription is signed. Needs `RESEND_API_KEY`. | patient + Rx fields, `mode` | internal |
| `POST /api/notify/license` | Email a patient when a license is issued. | patient + license fields, `mode` | internal |
| `GET /api/privy/stellar-wallet` | Resolve the caller's Privy embedded Stellar wallet. | `Bearer` Privy JWT | Privy `verifyAuthToken` |

---

## 📐 Response conventions

- **Success** — most routes return `{ data: … }`; some return a named key
  (`{ doctors }`, `{ prescriptions }`, `{ entries }`, `{ events }`). On-chain
  writes additionally carry `mode`, and `tx_hash` + `explorer` when
  `mode: "onchain"`.
- **Errors** — `{ error: "…" }` with an HTTP status: `400` malformed input,
  `401` unauthenticated / bad token, `403` authenticated but not permitted
  (treating check), `404` not found, `500` server / DB error.
- **Runtime** — every handler runs on the **Node runtime**
  (`export const runtime = "nodejs"`) and is `force-dynamic` (never cached).

---

<div align="center">

See also **[docs/ARCHITECTURE.md](./ARCHITECTURE.md)** ·
**[docs/CONTRACTS.md](./CONTRACTS.md)** ·
**[docs/DATA_MODEL.md](./DATA_MODEL.md)**

</div>
