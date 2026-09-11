<div align="center">

<img src="./docs/assets/banner.jpg" alt="TrustLeaf — Private Prescriptions on Stellar Soroban" width="100%" />

# 🌿 TrustLeaf

### Private prescriptions on Stellar, with Privy and sponsored fees

TrustLeaf connects doctor and patient portals to **two smart contracts on Stellar Testnet**. Patients book a consultation and separately authorize one prescription. Doctors issue, activate and revoke prescriptions using their own Stellar wallets through Privy. TrustLeaf's relayer pays network fees; users do not need an external wallet or XLM purchases.

**Week 2 validated for final cut — September 11, 2026.** Testnet and synthetic data only. Administrator, doctor and patient flows are prepared for final validation in the canonical demo site: [trustleaf-demo.vercel.app](https://trustleaf-demo.vercel.app).

[Week 2 reviewer page](./docs/sow-delivery/week2-review/TrustLeaf-Entrega-semana-2.html) · [Evidence baseline (preview)](./docs/evidence/week2-preview-2026-09-10/README.md) · [Recording guide](./docs/sow-delivery/TrustLeaf-guia-video-semana-2.html) · [Current configuration template](./config/testnet-config.example.txt)

</div>

## Current status

- Three distinct test accounts have confirmed owner-signing probes with relayer-paid Testnet receipts: administrator, doctor and patient.
- Administrative doctor authorization is prepared in the branch for final merge to `main`; confirmation appears once approved in `main`.
- An isolated preview has completed two independent consultations with separated attendance and consent, where the doctor issued and activated both prescriptions and revoked one while preserving history. This remains the technical baseline for the final main run.
- The [preview evidence package](./docs/evidence/week2-preview-2026-09-10/README.md) records **12 successful receipts**, two consumed bookings, zero pending or duplicate operations, and encrypted-document persistence before each mint attempt. Doctor and patient opened both documents from their own sessions; the patient received no doctor-only controls.
- Current checks pass: **423 application tests in 35 suites, 43 private-service tests, 11 contract tests, TypeScript and production build**. Nine new controlled client tests cover signature rejection, response loss, replay, double click and cancellation-versus-mint outcomes without presenting them as real provider outages or PostgreSQL races.
- **Still pending for handoff:** run the full Day-2 flow on `main` at [https://trustleaf-demo.vercel.app](https://trustleaf-demo.vercel.app), attach the recorded Week 2 walkthrough, and obtain formal reviewer acceptance.

The preview is the technical baseline used for this documentation. The final handoff requires a re-run in `main` with the same three accounts and then attaching the recorded walkthrough from the canonical URL above. Its version, browser observations and receipts are recorded separately from the historical Week 1 evidence below.

## The two contracts

| Contract | Purpose and principal methods | Testnet explorer |
| --- | --- | --- |
| **DoctorRegistryPrivate** | Administrative authorization, expiry and revocation: `authorize_doctor`, `get_authorization`, `is_authorized`, `revoke_doctor` | [CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2](https://stellar.expert/explorer/testnet/contract/CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2) |
| **PrescriptionPrivate v2** | Booking, one-use consent and prescription lifecycle: `attest_booking`, `authorize_prescriber`, `mint_prescription`, `get_prescription`, `activate`, `revoke`, `is_valid` | [CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE](https://stellar.expert/explorer/testnet/contract/CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE) |

Sources: [doctor registry](./contracts/doctor-registry-private/src/lib.rs) and [prescription contract](./contracts/prescription-private/src/lib.rs). These are the only members of the active contract workspace. [Earlier contract sources](./archive/contracts-legacy/README.md) are archived outside that workspace.

The September 7 delivery recorded matching local/Testnet WASM hashes:

- Registry: `b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02`
- Prescriptions: `4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c`

## Portal flow

1. **Administrator:** create the synthetic doctor profile, review the private dossier and request authorization. The local worker signs with the contractual authority held in the secure store. The portal keeps the request pending until its receipt confirms. The administrator's Privy wallet identifies the approver; it does not sign on behalf of patients or doctors.
2. **Doctor and patient:** enter through `/login?role=doctor` or `/login?role=patient`. Each Privy user has a persistent, verified association with one native Stellar wallet. Changed or ambiguous associations block writes. Ethereum and Solana automatic wallet creation are disabled.
3. **Booking and consultation:** the doctor saves availability; the patient books a slot. Times use `America/Santiago`. The patient confirms attendance and the doctor starts the consultation, in either order. These actions open on the consultation date from 30 minutes before the booked time. Once both are recorded, a booking request is prepared with a **30-minute issuance window from preparation**; the worker confirms its attestation.
4. **Separate consent:** after booking confirmation, the patient reviews the doctor, one-prescription scope and expiry, then confirms with their own Privy signature. Attendance grants no consent. The patient can withdraw unused consent or request booking cancellation; cancellation may remain pending while its on-chain result is reconciled.
5. **Issue:** the doctor reviews the fixed recipient and synthetic document. The encrypted document is saved **immutably before transmission**. A prepared document is shown as pending, and can be reopened to resume the same issuance. Only a verified receipt, recipient and commitment produce `Registered`; issuance consumes that booking and consent.
6. **Activate, read and revoke:** the doctor separately confirms and signs activation. The patient and issuing doctor can open the private document with their authenticated accounts. The doctor can revoke a registered or active prescription while preserving its history. Expiry is displayed separately. The portal offers activation to the doctor; the contract also permits the patient to activate.

The relayer verifies the owner's signature and pays fees through a fee-bump envelope. Testnet account provisioning is separate from fee payment. The server prepares the contract, method and arguments; it does not accept arbitrary client XDR or hashes to sign. Signed envelopes and transaction hashes are stored before transmission, and timeouts, reloads and double clicks recover the same attempt. A failed or unknown result is never presented as a confirmed operation.

## Privacy and scope

**Encrypted off-chain:** doctor dossiers and prescription documents, including their blinding values. Storage does not fall back to plaintext. The authorized server can decrypt, so this is not end-to-end encryption. Revocation cannot retrieve copies already downloaded. The administrator role does not provide general access to clinical documents.

**Public on-chain:** wallet addresses and relationships, methods, commitments, issuance identifiers, expiries and lifecycle states. Commitments bind documents to their context; they do not prove medical accuracy or professional qualifications.

Clinical records, medical licenses, dispensing, MCP and other legacy modules are outside the active portal scope. Direct access to retired routes returns **HTTP 410**, independently of the private write switch. Historical data is preserved, and errors never reactivate old contracts. This is a technical validation environment for synthetic data, not a clinical production release.

## Local setup

The application uses Next.js 16, React 19, TypeScript, Tailwind v4 and Neon Postgres. Contracts use Rust/Soroban; the Stellar SDK remains on v14. Use Node.js 22.x, Rust/Cargo with `wasm32v1-none`, and Stellar CLI 27.0.0. Before changing application code, read the relevant installed Next.js guide under `node_modules/next/dist/docs/`.

Before starting the server, fill an ignored `.env.local` using the [current public template](./config/testnet-config.example.txt) and [Week 2 guide](./docs/sow-delivery/WEEK_2_PORTALS.md). The template is documentation, not an automatically loaded configuration. Never commit credentials or point local development at the historical production database.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Open [doctor login](http://127.0.0.1:3002/login?role=doctor), [patient login](http://127.0.0.1:3002/login?role=patient) or [administrator login](http://127.0.0.1:3002/login?role=admin). `/privy-check` is an optional local diagnostic, not the reviewer entry point.

**`TRUSTLEAF_PRIVATE_WRITES_ENABLED=false` is the default.** It pauses new business writes and transaction submission while retaining status reads and receipt reconciliation. Environment, database hostname, Privy application, contract IDs and authorities must match before enabling writes. The older `TRUSTLEAF_PRIVATE_PORTAL_ENABLED` switch is obsolete.

After checking the selected test database, apply the compatible migrations. This command **writes to the configured database**:

```bash
node --env-file=.env.local scripts/migrate.mjs
```

For an explicitly enabled test run, start the combined local worker. It **writes to the selected test database and may transmit Testnet transactions**:

```bash
node --env-file=.env.local scripts/worker-private-portal.mjs --watch
```

Run one worker per administrative authority, against one environment at a time. With the worker off, authorization and booking requests stay pending. The administrative key remains in the local secure store and is not exported to Vercel. Preview and the main test site require separate synthetic-data databases; pause and reconcile the previous environment before moving its worker. See the guide for configuration, sequencing and recovery.

## Verification

These checks do not submit transactions or write to Neon. They do not replace the browser acceptance run:

```bash
npm test
npm run test:private
npx tsc --noEmit --incremental false
npm run build
cargo test --manifest-path contracts/Cargo.toml --locked -p doctor-registry-private -p prescription-private --lib
```

Build only the active contract artifacts:

```bash
cd contracts
stellar contract build --locked --package doctor-registry-private
stellar contract build --locked --package prescription-private
```

Record fresh results, commit, deployment URL and receipts for Week 2. Its acceptance demonstration uses three separate accounts and **two independent bookings**: one prescription remains active and the other is revoked. The required reviewer evidence is the validated application link and a new recorded doctor/patient walkthrough. Formal acceptance remains with the reviewers.

## Week 1 evidence — September 7, 2026

The historical service/CLI demonstration used synthetic identities, encrypted storage and four confirmed actions: `authorize_doctor`, `attest_booking`, `authorize_prescriber`, and `mint_prescription`. One action belongs to the registry and three to the prescription contract. The same mint may appear in both explorer histories because it calls the registry; it is one issuance.

- **11 contract tests:** four registry tests and seven prescription tests.
- **137 application tests** and TypeScript without errors.
- **13 service-flow checks** and **12 independent completion-audit checks**, including private retrieval, document/chain integrity and unauthorized-identity rejection.
- Matching WASM hashes and six additional fee-bump envelopes verified in the package.
- [Confirmed Week 1 issuance receipt](https://stellar.expert/explorer/testnet/tx/0e7102c770d100ea6b5f9aa375992dbbc76534535f48822fb066afca2cd672c8).

The receipt demonstrates `Registered`. Activation and revocation were covered by local contract tests at that cutoff; those results are not Week 2 browser evidence. The material was updated on September 8 without implying a new execution.

The Week 1 package, manifests and presentations remain local delivery artifacts under `docs/sow-delivery/d1-private-2026-09-07/`: `LEER-PRIMERO.md`, `MANIFEST-SHA256.json`, `TrustLeaf-transacciones-de-prueba.html`, `TrustLeaf-dos-contratos.html` and `TrustLeaf-preguntas.html`. Historical execution/audit reports are under `docs/evidence/testnet-generation-2026-09-07/`. These references do not imply that every packaged artifact or original local trial script is published with this integration. The current repository commands are listed above.

[Historical Week 1 report](./docs/sow-delivery/WEEK_1.md), [PR #95](https://github.com/CaBsCrypto/ficha-onchain/pull/95) and [PR #98](https://github.com/CaBsCrypto/ficha-onchain/pull/98) retain earlier work. Their merges and CI results are not evidence for the private implementation or this portal candidate.

## License

**Proprietary — © 2026 Browns Studio / CaBsCrypto. All rights reserved.**

This source code is made available for evaluation and SOW validation purposes.
