# TrustLeaf — Private Soroban contracts

The active Cargo workspace contains two contracts on **Stellar Testnet**, used only with synthetic data:

| Contract | Purpose | Testnet ID |
| --- | --- | --- |
| `doctor-registry-private` | Administrative authorization, renewal and revocation of doctors; public commitment to the private dossier. | `CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2` |
| `prescription-private` (interface v2) | Attested booking, patient consent for one issuance, private-prescription commitment and lifecycle. | `CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE` |

Prescription issuance checks the private doctor's registry and consumes a matching booking and patient consent. Issuance produces `Registered`; activation and revocation are separate signed actions. The contract allows activation by either participant, while the Week 2 portal offers activation to the issuing doctor.

Doctor dossiers and prescription documents remain encrypted outside the chain. Wallet relationships, commitments, expiry and status are public. The contracts do not prove clinical suitability or that a consultation occurred.

## Verify locally

From this directory:

```sh
cargo test --locked --workspace
stellar contract build --locked --package doctor-registry-private --out-dir dist
stellar contract build --locked --package prescription-private --out-dir dist
```

Use Stellar CLI with target `wasm32v1-none`. CI runs the same private contract tests and builds; it does not deploy or use signing keys. The private prescription tests register the real private registry for cross-contract coverage.

Application services and worker tests run from the repository root with `npm run test:private`. Doctor/patient operations use owner signatures through Privy with sponsored fees; administrative and booking authority operations use the local secure signer.

## Historical material

Previous registry, prescription, clinical, document and dispensing sources, together with their former end-to-end crate, are preserved under [archive/contracts-legacy](../archive/contracts-legacy/README.md). They are excluded from this workspace and the active contract CI. Existing receipts, evidence packages and deployed contracts are preserved; no old data is automatically migrated or deleted.
