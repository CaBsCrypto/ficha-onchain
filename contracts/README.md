# TrustLeaf — Soroban Contracts

Smart contracts powering patient-owned, verifiable medical records on
**Stellar Soroban**.

`clinical-record`, `prescription-soulbound`, `document-soulbound` and
`doctor-registry` are **implemented and deployed to testnet**. For the full
reference — every method, deployed contract ID, and what is stored on-chain —
see **[../docs/CONTRACTS.md](../docs/CONTRACTS.md)**. The functional spec lives
in [../docs/contracts-spec.md](../docs/contracts-spec.md). The pharmacy contracts
(`dispensary-registry`, `dispense-record`) remain scaffolds pending deployment.

## Architecture

```
                    ┌─────────────────────┐
                    │   DoctorRegistry     │   who is allowed to prescribe
                    │  (admin-governed)    │
                    └──────────┬───────────┘
                               │ is_authorized(doctor)
                               ▼
   Doctor ──sign (Passkey)──► ┌─────────────────────────┐
                              │  PrescriptionSoulbound   │  non-transferable Rx
                              │  doctor, patient, hash,  │
                              │  timestamp, status       │
                              └────────────┬────────────┘
                                           │ get_prescription(id)
                                           ▼
   Pharmacy / Clinic ──scan QR──► verify authenticity + status on-chain

   ┌─────────────────────┐
   │   ClinicalRecord     │   Phase 1 — full FHIR-anchored patient history
   └─────────────────────┘
```

## Contracts

| Contract                 | Phase | Purpose                                             |
| ------------------------ | ----- | --------------------------------------------------- |
| `doctor-registry`        | 0     | Authorize / revoke licensed prescribers.            |
| `prescription-soulbound` | 0     | Soulbound (non-transferable) prescription records.  |
| `clinical-record`        | 1     | Patient-owned FHIR clinical history anchored on-chain. |

## Design notes

- **Soulbound**: prescriptions are bound to the patient wallet and cannot be
  transferred or resold — only issued, dispensed or revoked.
- **On-chain stores only a hash** of the encrypted FHIR payload. PII lives
  off-chain, encrypted with patient-held keys. See `src/lib/fhir`.
- **Fee-less UX**: patients never pay gas — a relayer sponsors transactions.
  See `src/lib/privy`.

## Build (once the Rust toolchain is set up)

```bash
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
stellar contract build
```

## Deploy (testnet)

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/doctor_registry.wasm \
  --network testnet
```
