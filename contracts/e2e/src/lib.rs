#![no_std]
//! TrustLeaf — cross-contract end-to-end integration tests.
//!
//! This crate intentionally contains no contract logic. The end-to-end
//! scenarios that wire the real DoctorRegistry, DispensaryRegistry,
//! PrescriptionSoulbound and DispenseRecord contracts together live in
//! `tests/e2e.rs` and run with `cargo test`.
