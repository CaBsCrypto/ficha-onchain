<div align="center">

<img src="./docs/assets/banner.jpg" alt="TrustLeaf — Private Prescriptions on Stellar Soroban" width="100%" />

# 🌿 TrustLeaf

### Private prescriptions with doctor authorization, patient consent and an authorized booking

TrustLeaf demonstrates a prescription flow using **two smart contracts on Stellar Testnet**. A TrustLeaf administrator authorizes a doctor; a booking authority attests the consultation reservation; the patient signs consent; and the doctor issues a prescription to that patient. The clinical document is encrypted off-chain and its cryptographic commitment is recorded on-chain. The patient then retrieves the document through an access-controlled service.

**Current delivery: Week 1 / D1 technical evidence, as of September 7, 2026.** The demonstration uses synthetic identities and data, real signatures, Neon dev and Testnet transactions through services/CLI. The complete authenticated portal walkthrough is still pending.

Delivery package (local artifact: `docs/sow-delivery/d1-private-2026-09-07/LEER-PRIMERO.md`) · Flow evidence (local artifact: `docs/evidence/testnet-generation-2026-09-07/END_TO_END_STATUS.md`) · [Presentation & questions](#presentation--documentation)

</div>

## Current contracts

These are the two deployed contracts covered by the current delivery. Other contracts and modules retained in the repository are historical or outside this delivery.

| Contract | Purpose | Main methods | Testnet contract |
| --- | --- | --- | --- |
| **DoctorRegistryPrivate** | Administrator-controlled doctor authorization linked to a private dossier, with expiry, revocation and two-step administrator transfer | `authorize_doctor`, `get_authorization`, `is_authorized`, `revoke_doctor`, `propose_admin`, `accept_admin` | [CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2](https://stellar.expert/explorer/testnet/contract/CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2) |
| **PrescriptionPrivate v2** | Prescription issuance bound to a doctor, patient, consent and booking; initial assignment without retransfer | `attest_booking`, `authorize_prescriber`, `mint_prescription`, `get_prescription`, `activate`, `revoke`, `is_valid` | [CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE](https://stellar.expert/explorer/testnet/contract/CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE) |

The package records matching local build and Testnet WASM hashes:

- **DoctorRegistryPrivate:** `b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02`
- **PrescriptionPrivate v2:** `4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c`

Sources: doctor registry (local artifact: `contracts/doctor-registry-private/src/lib.rs`) and prescription contract (local artifact: `contracts/prescription-private/src/lib.rs`). The delivery snapshot and manifest (local artifact: `docs/sow-delivery/d1-private-2026-09-07/MANIFEST-SHA256.json`) identify the packaged artifacts.

## Demonstrated flow

1. **Authorize the doctor.** TrustLeaf's administrator signs an authorization linked to the encrypted synthetic dossier. The contract checks administrative authority; it does not independently verify professional qualifications.
2. **Bind the participants.** Signed wallet-ownership challenges bind the synthetic doctor and patient identities to their wallets.
3. **Authorize the booking.** The booking service checks an eligible consultation in Neon dev. The worker submits an attestation signed by the booking authority. The contract trusts that authority to validate the off-chain reservation.
4. **Obtain patient consent.** The patient signs consent for the same doctor and issuance identifier, with an expiry.
5. **Issue the private prescription.** The document is encrypted with AES-GCM; a commitment incorporating random blinding binds its content and issuance context. The doctor signs the mint. The contract checks authorization, consent and the matching booking, then consumes the consent and booking for that issuance.
6. **Retrieve the document.** A fresh possession proof, current patient binding and private/public integrity checks allow the patient to retrieve the encrypted document through the authorized service.

The relayer pays network fees through fee-bump transactions without replacing the required actor signatures. Duplicate checks reject reuse of the issuance or the same document commitment for that doctor and patient; they do not detect clinically equivalent treatments in different documents.

The same mint may appear in both contracts' explorer histories because issuance calls the doctor registry. It is one prescription transaction, not two emissions.

## Verified evidence — September 7, 2026

These are recorded results for the delivered version, not a claim that all repository modules or future changes are verified.

| Evidence | Recorded result |
| --- | --- |
| Private contract tests | **11 passed:** 4 registry tests and 7 prescription tests |
| Application tests | **137 passed** |
| TypeScript | `npx tsc --noEmit` completed without errors |
| Contract artifacts | Both local WASM builds matched the recorded Testnet hashes |
| Service flow | **13 checks passed**, including issuance and private retrieval |
| Independent completion audit | **12 checks passed**, including DB/chain integrity and exact signed transaction arguments |
| Transaction receipts | Doctor approval, booking, consent and mint confirmed with `SUCCESS` |
| Relay evidence | Six fee-bump envelopes with the expected fee payer in the packaged validation |

Doctor revocation, administrator transfer and the prescription lifecycle **Registered → Active → Revoked** are supported by local contract tests. The four flow receipts demonstrate approval, booking, consent and issuance; they do not demonstrate every lifecycle transition. Negative RPC simulations are identified separately from submitted transactions.

- [Confirmed prescription issuance](https://stellar.expert/explorer/testnet/tx/0e7102c770d100ea6b5f9aa375992dbbc76534535f48822fb066afca2cd672c8)
- Service execution evidence (local artifact: `docs/evidence/testnet-generation-2026-09-07/private-flow-verification.json`)
- Independent completion audit (local artifact: `docs/evidence/testnet-generation-2026-09-07/private-flow-completion-audit.json`)
- Packaged contract hashes, receipts and relay verification (local artifact: `docs/sow-delivery/d1-private-2026-09-07/evidence/closure-live-verification.json`)

## Privacy and delivery boundaries

**Private off-chain:** encrypted doctor dossiers and prescription contents, including the clinical document and its blinding value. The private flow requires an encryption key and does not fall back to plaintext.

**Public on-chain:** wallet addresses and relationships, cryptographic commitments, issuance identifiers, expiry values and lifecycle state. A commitment verifies correspondence with a document; it does not prove medical accuracy or the authenticity of a professional qualification.

The authorized server can decrypt. This is **not end-to-end encryption**, and revoking access cannot retrieve copies already downloaded. The demonstrated enrollment and possession proofs are synthetic service fixtures, not a completed Privy/browser login flow.

This delivery is technical Testnet evidence, not an independent security certification, legal compliance certification or authorization for clinical production use. Some legacy application modules use different controls; their presence or passing tests does not extend the private flow's guarantees to the entire repository.

## Local development

The application uses Next.js 16, React 19, TypeScript, Tailwind v4 and Neon Postgres. Contracts use Rust/Soroban. The Stellar SDK remains on **v14** for compatibility with the existing wallet dependencies.

Prerequisites: Node.js 22.x (project CI baseline), Rust/Cargo with the `wasm32v1-none` target and Stellar CLI 27.0.0. Read the installed Next.js guides under `node_modules/next/dist/docs/` before changing application code.

```bash
npm ci
cp .env.example .env.local
# Configure development credentials; never use the production database locally.
npm run dev
```

The development application opens at [localhost:3000](http://localhost:3000). Starting it does not reproduce the verified private CLI flow or establish that the portal is integrated with these two contracts.

Schema is maintained in `scripts/migrate.mjs` and mirrored in the administrative migration route. With the intended **dev** database configured, schema setup is an explicit database write:

```bash
node scripts/migrate.mjs
```

Never commit `.env.local`, connection strings, signing secrets or encryption keys.

## Verification commands

### Local checks — no chain transactions or database writes

Run from the repository root:

```bash
npm test
npx tsc --noEmit
cargo test --locked --manifest-path contracts/Cargo.toml -p doctor-registry-private -p prescription-private
node --test scripts/lib/private-doctor-dossier.test.mjs scripts/lib/private-prescription.test.mjs scripts/lib/read-private-prescription.test.mjs scripts/worker-prescription-bookings.test.mjs
```

Build the two contract artifacts from the contracts directory:

```bash
cd contracts
stellar contract build --locked --package doctor-registry-private
stellar contract build --locked --package prescription-private
```

### Read-only network/database audit

From the repository root:

```bash
node scripts/audit-private-flow-testnet.mjs
```

This reads the saved evidence, Neon dev and Testnet, verifies signatures and document commitments, and runs rejection simulations. It **does not submit transactions or write to the database**, but it updates the local completion-audit JSON. It requires the existing synthetic DB fixtures, `DATABASE_URL`, `TRUSTLEAF_DATA_KEY` in `.env.local`, and network access.

Recorded evidence remains a dated snapshot: authorizations can expire and Testnet state or RPC receipt availability can change. A later audit is not guaranteed to reproduce a historical live-state result.

### Explicit synthetic trials — database and/or Testnet writes

```bash
# Writes synthetic rows in Neon dev and submits signed Testnet transactions.
node scripts/validate-private-flow-testnet.mjs --run

# Contract-level consent/booking/mint/cancellation transactions; not a full service flow.
node scripts/validate-booking-contract-testnet.mjs --run

# Exercises real Neon dev services, creates and cleans up synthetic rows; no Stellar calls.
node scripts/validate-prescription-bookings-db.mjs --dev-only
```

These are purpose-built fixture runners, not a zero-configuration public demo. Inspect their prerequisites before use. The full flow requires the recorded deployment, migrated approved Neon dev branch, the encryption key, the configured synthetic doctor/patient/relayer secrets, and the administrator's Stellar secure-store alias. It currently references the original operator's local signer configuration. `.env.example` alone does not provision these resources.

The runners retain issuance identities and transaction hashes to reconcile uncertain outcomes. Do not delete evidence or blindly restart with new identifiers after a timeout. Never use real patient data or production credentials for these trials.

## Presentation & documentation

The private delivery files listed below are available in the local delivery package and are pending repository publication. Paths marked “local artifact” are not links to files already on GitHub.

- Current D1 delivery package and acceptance matrix (local artifact: `docs/sow-delivery/d1-private-2026-09-07/LEER-PRIMERO.md`)
- [Delivery index](./docs/sow-delivery/INDEX.md)
- Flow completion report and scope (local artifact: `docs/evidence/testnet-generation-2026-09-07/END_TO_END_STATUS.md`)
- Two contracts — presentation (local artifact: `docs/sow-delivery/d1-private-2026-09-07/TrustLeaf-dos-contratos.html`)
- Confirmed transactions — presentation (local artifact: `docs/sow-delivery/d1-private-2026-09-07/TrustLeaf-transacciones-de-prueba.html`)
- Questions and answers (local artifact: `docs/sow-delivery/d1-private-2026-09-07/TrustLeaf-preguntas.html`)
- Recording guide (local artifact: `docs/sow-delivery/GRABAR-SEMANA-1.html`)

Open the HTML presentation files locally in a browser; GitHub's source view is not the rendered presentation.

## Publication status and historical work

The private-contract delivery is packaged with source snapshots and hashes. This README documents the verified local delivery; the private implementation and supporting delivery files are not included in this documentation-only update. Their repository publication and formal owner acceptance remain pending. Historical CI or Vercel success must not be attributed to these new changes.

[PR #95](https://github.com/CaBsCrypto/ficha-onchain/pull/95) and [PR #98](https://github.com/CaBsCrypto/ficha-onchain/pull/98) refer to the earlier delivery. The [historical Week 1 report](./docs/sow-delivery/WEEK_1.md) and other repository modules retain that background. Clinical records, medical licenses, dispensing, MCP and other legacy surfaces are not claimed as delivered features of this two-contract package.

The next product milestone is the complete doctor/patient portal walkthrough with Privy and the private services integrated.

## License

**Proprietary — © 2026 Browns Studio / CaBsCrypto. All rights reserved.**

This source code is made available for evaluation and SOW validation purposes.
