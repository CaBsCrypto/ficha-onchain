# 🎬 DEMO — the full logged-in médico ↔ paciente journey

Reproduce the **complete patient journey** on localhost, with **real Privy
logins** and **real on-chain anchoring** on Stellar testnet: a doctor sets
availability, a patient books and grants consent, the doctor writes the ficha /
prescription / license, the patient activates the Rx — and every anchored step
shows up live in the admin activity log with a real tx hash.

> **Why localhost?** The signer secrets (`DEMO_DOCTOR_SECRET`,
> `DEMO_PATIENT_SECRET`, `RELAYER_SECRET`) are **not** in Vercel, so the deploy
> degrades every on-chain write to `mode:"simulated"`. Real anchoring happens
> **only on your machine**, where `.env.local` holds those keys.

---

## 1. Prerequisites

### 1.1 Base setup

```bash
npm install
cp .env.example .env.local     # then fill it in — see below
node scripts/migrate.mjs       # apply the schema (idempotent, safe to re-run)
npm run dev                    # http://localhost:3000
```

### 1.2 `.env.local` — what each var unlocks

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | **Everything** — off-chain store | Point at a **Neon dev branch**, never production. |
| `WAITLIST_ADMIN_TOKEN` | The `/admin` panel + doctor approval | Any strong string; you type it to log into `/admin`. |
| `DEMO_DOCTOR_SECRET` | Doctor-signed anchors (ficha append, Rx, license) | A **funded testnet** account secret (`S…`). |
| `DEMO_PATIENT_SECRET` | Patient-signed anchors (consent grant, Rx activation) | A **funded testnet** account secret (`S…`). |
| `RELAYER_SECRET` | Gasless fee-bump on every tx | A **funded testnet** account secret (`S…`). |

> 💡 **Degradation is graceful.** Leave the signer secrets blank and every
> screen still works — on-chain writes just return `mode:"simulated"` instead of
> a tx hash. Fill them in to anchor for real. Fund testnet accounts at the
> [Friendbot](https://friendbot.stellar.org) / Stellar Lab faucet.

To confirm on-chain is live before you start: any anchored step's API response
should carry `mode:"onchain"` and a 64-hex tx hash (not `mode:"simulated"`).

---

## 2. Two ways to run it

### Option A — Scripted (fast, one command)

```bash
node scripts/seed-demo-journey.mjs
```

Runs **one realistic journey end-to-end** against the running dev server and
**leaves the data in place** (no cleanup), so the whole flow lights up in the
admin panel. It performs, in order:

1. Approves any **pending doctor** (needs `WAITLIST_ADMIN_TOKEN`).
2. Sets the doctor's **availability** (L–V 09:00–13:00).
3. Creates a patient **appointment** (Telemedicina, ~2 weekdays out, 10:00).
4. Records the patient's **consent grant** (on-chain).
5. Appends **3 clinical entries** — a condition, an observation, a medication
   request (each anchored on-chain, with a 6s pause so the shared signer's tx
   sequence confirms between submits).
6. Issues a **prescription** (Decreto 41, hash anchored).
7. Creates a **medical license** draft.

**Where to see it:** open **`/admin/flujo`** (the live system-flow board) and
**`/admin/historial`** (the global activity log) — the journey appears as a
finished patient story, one row per anchored action.

> The script runs in demo-mode (no Privy token), so the guarded routes pass
> through. On-chain steps produce **real testnet tx hashes** when the DEMO
> secrets are present, otherwise `mode:"simulated"`.

### Option B — Manual, two logged-in portals (the believable demo)

The convincing version: **doctor and patient are two different Privy
identities** (Google or email), each in its own real session.

**A browser holds one Privy session at a time.** So run the two roles in **two
separate browsers or profiles** (e.g. Chrome + a Chrome Incognito/second
profile, or two devices). Recommend a **distinct email per role** so the
identities never collide.

- **Role is by route, not by account.** `/doctor` is the doctor workspace,
  `/patient` the patient workspace, `/admin` the admin panel. The same logged-in
  account can visit both `/doctor` and `/patient` — but for a clean demo, use
  one identity for each.
- Keep a **third window on `/admin/historial`** to narrate the on-chain events
  as they land.

---

## 3. The step-by-step journey (manual)

Each step notes **what is anchored on-chain**. Do the setup once
(`node scripts/migrate.mjs`, `npm run dev`), then:

**0. Approve the doctor (admin, once).** Log into `/admin` with
`WAITLIST_ADMIN_TOKEN`, open **Médicos**, and approve/add the doctor account.
(The owner `cabscryptocontacto@gmail.com` is already active.) *On-chain:*
`doctor-registry` makes `is_authorized=true`, unlocking real minting.

1. **Doctor logs in → `/doctor` → Disponibilidad.** Set weekly blocks (e.g.
   L–V 09:00–13:00, 30-min slots). *On-chain:* none — availability is off-chain.

2. **Patient logs in → `/patient` → Consultas → Solicitar.** Pick the doctor,
   a date, and a free time slot; choose type (Telemedicina). *On-chain:* none —
   the booking is off-chain (anti double-booking is enforced).

3. **Patient clicks "Iniciar consulta · Autorizar a mi médico".** This is the
   consent handshake. ✅ *On-chain:* `clinical-record.grant_write_access` — the
   patient authorizes the doctor to write to their record. This is the
   transaction that makes the doctor's later writes valid.

4. **Doctor → Pacientes → [patient] → Ficha.** Three sub-actions:
   - Write a **clinical entry** → ✅ *on-chain:* `clinical-record.append_entry`
     (SHA-256 of the note anchored).
   - Fill **Antecedentes** (vitals, allergies, chronic conditions) → off-chain
     (treating-doctor edit; hash anchoring is a planned improvement).
   - Attach an **Exam / lab** (PDF or image) → ✅ *on-chain:* the file's hash is
     anchored.

5. **Doctor → Nueva Receta** (Decreto 41 form — includes patient **domicilio**,
   RUT, sex, birth date, diagnosis + CIE-10). Sign it. ✅ *On-chain:*
   `prescription-soulbound.mint_prescription` — soulbound Rx, FHIR hash anchored.

6. **Doctor → Nueva Licencia** (sick-leave / certificate). Sign it. ✅
   *On-chain:* `document-soulbound.mint_document`.

7. **Patient → Recetas → Activar.** The patient activates the prescription. ✅
   *On-chain:* `prescription-soulbound.activate`. A **QR code** is produced for
   the pharmacy to scan and verify.

8. **Watch it all appear live in `/admin/historial`.** Every anchored step above
   streams into the global activity log as it happens — the running commentary
   for the demo.

---

## 4. Admin panel & reset

**Log into `/admin`** with your `WAITLIST_ADMIN_TOKEN`.

- **`/admin/flujo`** — the live system-flow board (each stage of the journey).
- **`/admin/historial`** — the global on-chain + off-chain activity log.

**Start clean** (between demo takes) either way:

- In the UI: `/admin/flujo` → **"Limpiar datos de prueba"**.
- Or via API:

  ```bash
  curl -X POST http://localhost:3000/api/admin/reset \
    -H "Content-Type: application/json" \
    -d '{"token":"YOUR_WAITLIST_ADMIN_TOKEN","confirm":"RESET","scope":"transactional"}'
  ```

  `scope:"transactional"` (default) clears the per-run flow tables only —
  **doctors, profiles and availability survive**. Use `scope:"all"` for a deeper
  wipe. Point `DATABASE_URL` at a **Neon dev branch** before resetting.

**Check current state** any time:

```bash
node scripts/db-snapshot.mjs      # prints current row counts per table
```

---

## 5. Enforcement — real ownership checks

By default the guarded routes accept **token-less** calls (so the seed script
and the automated suites work in demo-mode). To exercise **real auth**:

```bash
# in .env.local
TRUSTLEAF_REQUIRE_AUTH=true
```

With it set, the guarded routes (the `withAuth` ones and the
`resolveOwnerEmail` ones — `doctor/availability`, `doctor/patients`) **401
without a valid Privy token**, and enforce owner-only access with one. Do this
for the believable, logged-in demo.

> **Leave it off** (unset) when running `npm run test:phases` /
> `npm run test:flow` / `npm run test:onchain` and `seed-demo-journey.mjs` —
> those call the API without a token and rely on demo-mode pass-through.

---

## 6. Verifying on-chain

Every anchored action returns a **tx hash** in its API response (and the admin
log shows it). Open it on the testnet explorer:

```
https://stellar.expert/explorer/testnet/tx/<hash>
```

There you can see the transaction, the invoked contract, and the fee-bump from
the relayer. If a response shows `mode:"simulated"` instead of a hash, the
signer secrets are missing from `.env.local` (see §1.2) — you're on demo-mode,
not real anchoring.

---

**Related:** [README.md](../README.md) ·
[docs/FLUJO_TESTEO.md](./FLUJO_TESTEO.md) (per-step status map) ·
[docs/ARCHITECTURE.md](./ARCHITECTURE.md) · [docs/CONTRACTS.md](./CONTRACTS.md)
