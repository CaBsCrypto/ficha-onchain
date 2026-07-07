<div align="center">

# 🌿 TrustLeaf

### On-chain medical records on Stellar Soroban

Doctors issue **clinical records, prescriptions, and medical licenses** as
**soulbound NFTs** — tamper-proof, patient-owned, and publicly verifiable.

[![Stellar](https://img.shields.io/badge/Stellar-Soroban-black?style=flat-square&logo=stellar&logoColor=white)](https://stellar.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-WASM-CE422B?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![FHIR](https://img.shields.io/badge/FHIR-R4-E1352C?style=flat-square&logo=hl7&logoColor=white)](https://hl7.org/fhir/R4/)

[![contracts](https://github.com/CaBsCrypto/ficha-onchain/actions/workflows/contracts.yml/badge.svg)](https://github.com/CaBsCrypto/ficha-onchain/actions/workflows/contracts.yml)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg?style=flat-square)](#-license)

</div>

---

## 🩺 The flow, at a glance

```
   👩‍⚕️  DOCTOR                 ⛓️  STELLAR BLOCKCHAIN                🧑  PATIENT / 🏥 PHARMACY
  ┌──────────────┐            ┌───────────────────────┐            ┌───────────────────────┐
  │  Issues a    │  ── sign ─▶│  Seals it as a         │  ── QR ──▶│  Verifies authenticity │
  │  document    │  (Passkey) │  soulbound NFT +       │  scan     │  & status — publicly,  │
  │  (Rx / cert) │            │  on-chain hash         │           │  no login required     │
  └──────────────┘            └───────────────────────┘            └───────────────────────┘
       EMITS                        VERIFIES · SEALS                       VERIFIES
```

> **Soulbound** = non-transferable. A prescription is bound to the patient's
> wallet — it can be issued, dispensed, or revoked, but never sold or forged.

<div align="center">

![Demo](./docs/demo.gif)

_🎬 Interactive demo — **(coming soon)**_

</div>

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Client["🖥️  Frontend — Next.js 16 · React 19 · Tailwind v4"]
        UI["Doctor · Patient · Pharmacy portals<br/>QR verification · Google Meet teleconsult"]
    end

    subgraph Server["⚙️  API Routes (App Router)"]
        API["Documents · Consultations · Pharmacy<br/>Relayer (fee-bump) · Share tokens (JWT)"]
    end

    subgraph Chain["⛓️  Stellar Soroban — Rust / WASM"]
        C1["📇 doctor-registry"]
        C2["💊 prescription-soulbound"]
        C3["📜 document-soulbound"]
        C4["🏥 dispensary-registry"]
    end

    FHIR["🧬 FHIR R4<br/>encrypted payload · off-chain PII"]

    UI --> API
    API -->|"@stellar/stellar-sdk"| Chain
    API -.->|"hash anchored on-chain"| FHIR
    C1 -->|is_authorized| C2
    C2 -->|get_prescription| C4
    C1 --> C3
```

- **On-chain stores only a hash** of the encrypted FHIR R4 payload — PII stays
  off-chain, encrypted with patient-held keys.
- **Fee-less UX** — patients never pay gas; a relayer sponsors transactions.
- **Passkey auth** — doctors sign with a device passkey, no seed phrases.

---

## ⚡ How it works

| # | Step | What happens |
|---|------|--------------|
| 1️⃣ | **Doctor registers** | A licensed prescriber is authorized in `doctor-registry` (with extensible permissions). |
| 2️⃣ | **Doctor issues a document** | A prescription, license, or certificate is minted as a soulbound NFT to the patient's wallet. |
| 3️⃣ | **Blockchain seals it** | Soroban anchors the document hash, issuer, timestamp, and status — immutable and timestamped. |
| 4️⃣ | **Anyone verifies via QR** | Patient or pharmacy scans a QR to confirm authenticity and status on-chain — **no account needed**. |

---

## ✨ Features

| | Feature | Description |
|--|---------|-------------|
| 🩺 | **Ficha Clínica** | On-chain medical consultations with dedicated doctor & patient portals. |
| 💊 | **Prescriptions** | Digital soulbound prescriptions, QR-verifiable — compliant with **Decreto 41** (MINSAL Chile). |
| 📜 | **Licenses** | Medical certificates & professional licenses across **9 types**, publicly verifiable. |
| 🏥 | **Pharmacy Panel** | Pharmacists verify prescriptions and mark them dispensed on-chain. |
| 🎥 | **Google Meet** | Integrated teleconsultation — spin up a Meet room straight from a consultation. |
| 🔑 | **On-chain Permissions** | Extensible permission system (`CANNABIS`, `MNT_HLTH`, …) — add capabilities with **no redeploy**. |

---

## 📜 Smart Contracts

Soroban contracts written in Rust, compiled to WASM (`contracts/`).

| Contract | Function | Status |
|----------|----------|--------|
| `doctor-registry` | Registers doctors & grants extensible permissions | 🟢 `deployed (testnet)` |
| `prescription-soulbound` | Non-transferable prescription NFTs | 🟢 `deployed (testnet)` |
| `document-soulbound` | Soulbound medical licenses & certificates | 🟡 `testnet` |
| `dispensary-registry` | Registry of verified pharmacies | 🟡 `testnet` |

> Deployed testnet IDs live in [`.env.example`](./.env.example).
> See [`contracts/README.md`](./contracts/README.md) for the on-chain design.

---

## 🧰 Tech stack

| Tech | Version | Purpose |
|------|---------|---------|
| ![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs&logoColor=white) | `16.2` | App Router, API routes, Turbopack |
| ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black) | `19.2` | UI runtime |
| ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white) | `5.x` | End-to-end type safety |
| ![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) | `4.x` | Clinical-blue / mint design system |
| ![Stellar](https://img.shields.io/badge/Stellar_SDK-13-black?style=flat-square&logo=stellar&logoColor=white) | `13.3` | Soroban RPC & transaction building |
| ![Rust](https://img.shields.io/badge/Rust-WASM-CE422B?style=flat-square&logo=rust&logoColor=white) | `soroban-sdk` | Smart contracts |
| ![Three.js](https://img.shields.io/badge/Three.js-r185-000?style=flat-square&logo=threedotjs&logoColor=white) | `0.185` | 3D patient card (WebGL) |
| ![FHIR](https://img.shields.io/badge/FHIR-R4-E1352C?style=flat-square&logo=hl7&logoColor=white) | `R4` | Interoperable clinical data model |

Plus: **framer-motion** (animations) · **passkey-kit** (passkey wallets) ·
**qrcode** (QR generation) · **googleapis** (Meet) · **jose** (JWT share tokens).

---

## 🚀 Getting started

```bash
# 1. Clone
git clone https://github.com/CaBsCrypto/ficha-onchain.git
cd ficha-onchain

# 2. Install
npm install

# 3. Configure environment
cp .env.example .env.local     # then fill in the values below

# 4. Run
npm run dev                    # http://localhost:3000
```

Build for production with `npm run build && npm start`.

> 💡 Every seam runs in **demo mode** out of the box — leave passkeys, pharmacy
> keys, and the Meet integration blank and the app works against mock/testnet
> data. No infra required to explore.

---

## 🔐 Environment variables

Copy [`.env.example`](./.env.example) → `.env.local`. Key variables:

| Variable | Description | Required |
|----------|-------------|:--------:|
| `NEXT_PUBLIC_STELLAR_NETWORK` | Target network (`testnet` / `public`) | ✅ |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Soroban RPC endpoint | ✅ |
| `NEXT_PUBLIC_DOCTOR_REGISTRY_ID` | Deployed `doctor-registry` contract ID | ✅ |
| `NEXT_PUBLIC_PRESCRIPTION_ID` | Deployed `prescription-soulbound` contract ID | ✅ |
| `RELAYER_SECRET` | Funded testnet account that fee-bumps transactions | ✅ |
| `JWT_SECRET` | HS256 signing key for 15-min share tokens | ✅ |
| `NEXT_PUBLIC_PASSKEY_ENABLED` | Toggle real passkey login (`false` = mock wallets) | ⚪️ |
| `DISPENSARY_REGISTRY_ID` | `dispensary-registry` contract ID (Phase 1) | ⚪️ |
| `DISPENSE_RECORD_ID` | `dispense-record` contract ID (Phase 1) | ⚪️ |
| `PHARMACY_API_KEYS` | `apikey:GWALLET,…` map for the pharmacy API | ⚪️ |
| `PHARMACY_PIN` | 6-digit PIN gating the pharmacist console | ⚪️ |
| `NEXT_PUBLIC_RX_VALIDITY_DAYS` | Prescription validity window (default `30`) | ⚪️ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth for Google Meet teleconsult | ⚪️ |
| `NEXT_PUBLIC_APP_URL` | Public base URL (OAuth callbacks) | ✅ |

⚪️ = optional (blank → demo mode). Server-only secrets belong in your host's
project settings, **never** in the repo.

---

## ⚖️ Compliance

- **🇨🇱 Decreto 41 (MINSAL)** — digital prescriptions follow the format and
  validity rules of Chile's Reglamento de Farmacias, including derived expiry
  windows and the required prescriber/patient fields.
- **🧬 FHIR R4** — clinical data is modeled on HL7 FHIR R4 resources for
  interoperability. Only the **hash** of the encrypted payload touches the
  chain; PII stays off-chain under patient-held keys.

---

## 🗺️ Roadmap

- [x] Prescriptions on-chain (soulbound) + QR verification
- [x] Doctor registry with extensible permissions (`CANNABIS`, `MNT_HLTH`)
- [x] Pharmacy panel — verify & dispense
- [x] Medical licenses & certificates (`document-soulbound`)
- [x] Google Meet teleconsultation
- [ ] Full FHIR R4 clinical records (patient-owned history)
- [ ] Mainnet deployment
- [ ] AI health agent over patient-authorized records
- [ ] Ecosystem integrations (EHRs, insurers, labs)

---

## 📄 License

**Proprietary — © 2026 Browns Studio. All rights reserved.** This source code is
made available for evaluation purposes only. No license is granted to use, copy,
modify, distribute, or create derivative works.

<div align="center">

**Built on Stellar Soroban.** Launching first in 🇨🇱 Chile.

</div>

---

© 2026 Browns Studio. All rights reserved. This source code is made available for evaluation purposes only. No license is granted to use, copy, modify, distribute, or create derivative works.
