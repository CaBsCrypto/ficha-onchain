# ficha | onchain

**Your medical history. Verified. Always yours.**

Blockchain-verified medical prescriptions and clinical records on **Stellar
Soroban**. Doctors issue prescriptions as tamper-proof on-chain records;
patients receive them instantly — no fees, no paperwork, no borders.

Launching first in 🇨🇱 Chile.

---

## Tech stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** — clinical-blue / mint premium design system
- **@react-three/fiber + drei** — the floating 3D patient card
- **framer-motion** — scroll & entrance animations
- **Stellar Soroban** — Rust smart contracts (`contracts/`)

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

## Project structure

```
src/
  app/            # App Router: layout, landing page, global styles
  components/
    landing/      # Navbar, Hero, Problem, Solution, How, Audience, Roadmap, Waitlist, Footer
    ui/           # Button, Card, Badge, Reveal (shared primitives)
    3d/           # PatientCard3D — WebGL glass card
  hooks/
    useLanguage.ts  # EN/ES context + toggle (localStorage-persisted)
  lib/
    i18n.ts       # EN/ES translation dictionary
    stellar/      # Soroban client (placeholder)
    privy/        # Embedded wallet + Passkey (placeholder)
    fhir/         # FHIR data structures (placeholder)
  types/          # Shared TypeScript types

contracts/
  doctor-registry/         # authorize / revoke prescribers
  prescription-soulbound/  # non-transferable prescription records
  clinical-record/         # patient-owned FHIR history (Phase 1)
```

## Internationalization

The UI ships in **English and Spanish**. Language lives in a React context
(`useLanguage`) backed by a typed dictionary in `src/lib/i18n.ts` and persisted
to `localStorage`. Swap for `next-intl` when routing-level i18n is needed.

## Smart contracts

See [`contracts/README.md`](./contracts/README.md) for the on-chain
architecture. Contracts are scaffolds (signatures + storage layout) pending
Phase 0 implementation.

## Roadmap

| Phase | Milestone                          |
| ----- | ---------------------------------- |
| 0     | Prescriptions on-chain             |
| 1     | Clinical records (FHIR)            |
| 2     | AI health agent                    |
| 3     | Ecosystem & integrations           |

---

Built on Stellar Soroban.
