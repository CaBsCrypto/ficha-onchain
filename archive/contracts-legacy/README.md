# Historical contracts

These sources are preserved for historical review and are excluded from the active Cargo workspace and CI. Their application routes are retired as part of the private-portal migration.

The active contracts are `DoctorRegistryPrivate` and `PrescriptionPrivate v2`; see [the active workspace](../../contracts/README.md).

The directories retain their original files, including tests and any existing snapshots. `Cargo.historical.toml`, `Cargo.historical.lock` and `README.historical.md` preserve the previous workspace description. They are historical snapshots, not a supported build entrypoint. Older relative dependencies can refer to locations from the original workspace.

The archived `e2e/tests/private_registry.rs` integrates the private registry with the previous `PrescriptionSoulbound`, so it is not a test of the current private prescription contract. Current cross-contract tests live in `contracts/prescription-private/src/test.rs` and use the actual private registry.

Moving these sources does not delete or migrate chain deployments, application data, receipts, evidence packages or WASM binaries.
