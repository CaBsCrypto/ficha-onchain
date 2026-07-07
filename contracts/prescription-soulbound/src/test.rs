#![cfg(test)]
//! PrescriptionSoulbound test suite — TrustLeaf D1.
//!
//! Tests target the *implemented* interface of `lib.rs`:
//!   init, mint_prescription, revoke_prescription, get_prescription.
//!
//! Soulbound lifecycle: `Registered → Active → Revoked`. A prescription is
//! written on-chain already `Active` at mint time; `Registered` is the genesis
//! (pre-issuance) state. `Revoked` is terminal.
//!
//! `mint_prescription` makes a real cross-contract call into the DoctorRegistry
//! to gate issuance. To drive the authorized and unauthorized paths in
//! isolation we wire the contract to tiny in-test registry stubs
//! (`AllowRegistry` / `DenyRegistry`). The real DoctorRegistry ↔ Prescription
//! wiring is exercised end-to-end by the `contracts/e2e` crate.

use super::{Error, PrescriptionSoulbound, PrescriptionSoulboundClient, Status};
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, BytesN, Env};

// --- in-test DoctorRegistry stubs -------------------------------------------

#[contract]
pub struct AllowRegistry;
#[contractimpl]
impl AllowRegistry {
    pub fn is_authorized(_env: Env, _wallet: Address) -> bool {
        true
    }
}

#[contract]
pub struct DenyRegistry;
#[contractimpl]
impl DenyRegistry {
    pub fn is_authorized(_env: Env, _wallet: Address) -> bool {
        false
    }
}

// --- helpers ----------------------------------------------------------------

fn allow(env: &Env) -> Address {
    env.register(AllowRegistry, ())
}
fn deny(env: &Env) -> Address {
    env.register(DenyRegistry, ())
}
fn rx_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

/// Register + init a PrescriptionSoulbound wired to the given DoctorRegistry.
fn init_contract(env: &Env, registry: &Address) -> Address {
    let id = env.register(PrescriptionSoulbound, ());
    PrescriptionSoulboundClient::new(env, &id).init(registry);
    id
}

// --- tests ------------------------------------------------------------------

#[test]
fn test_mint_prescription() {
    let env = Env::default();
    env.mock_all_auths();
    let client = PrescriptionSoulboundClient::new(&env, &init_contract(&env, &allow(&env)));

    let doctor = Address::generate(&env);
    let patient = Address::generate(&env);

    let id = client.mint_prescription(&doctor, &patient, &rx_hash(&env));
    assert_eq!(id, 1);

    // Minted straight to Active with the right parties recorded.
    let rx = client.get_prescription(&id);
    assert_eq!(rx.id, 1);
    assert_eq!(rx.status, Status::Active);
    assert_eq!(rx.doctor_wallet, doctor);
    assert_eq!(rx.patient_wallet, patient);

    // The id counter is monotonic.
    let id2 = client.mint_prescription(&doctor, &patient, &rx_hash(&env));
    assert_eq!(id2, 2);
}

#[test]
fn test_mint_unauthorized_doctor() {
    let env = Env::default();
    env.mock_all_auths();
    // Registry denies everyone.
    let client = PrescriptionSoulboundClient::new(&env, &init_contract(&env, &deny(&env)));

    let doctor = Address::generate(&env);
    let patient = Address::generate(&env);

    // Even with a valid signature, a doctor not authorized in the registry
    // cannot issue a prescription.
    assert_eq!(
        client.try_mint_prescription(&doctor, &patient, &rx_hash(&env)),
        Err(Ok(Error::DoctorNotAuthorized))
    );
}

#[test]
fn test_mint_requires_doctor_signature() {
    let env = Env::default();
    // No auth mocked: the doctor's signature is absent.
    let client = PrescriptionSoulboundClient::new(&env, &init_contract(&env, &allow(&env)));

    let doctor = Address::generate(&env);
    let patient = Address::generate(&env);

    // Soulbound issuance requires the doctor to sign; without it, mint fails.
    assert!(client
        .try_mint_prescription(&doctor, &patient, &rx_hash(&env))
        .is_err());
}

#[test]
fn test_soulbound_lifecycle() {
    // Registered (genesis) → Active (mint) → Revoked (revoke).
    let env = Env::default();
    env.mock_all_auths();
    let client = PrescriptionSoulboundClient::new(&env, &init_contract(&env, &allow(&env)));

    let doctor = Address::generate(&env);
    let patient = Address::generate(&env);

    let id = client.mint_prescription(&doctor, &patient, &rx_hash(&env));
    assert_eq!(client.get_prescription(&id).status, Status::Active);

    client.revoke_prescription(&id);
    assert_eq!(client.get_prescription(&id).status, Status::Revoked);
}

#[test]
fn test_revoked_prescription_cannot_be_used() {
    let env = Env::default();
    env.mock_all_auths();
    let client = PrescriptionSoulboundClient::new(&env, &init_contract(&env, &allow(&env)));

    let doctor = Address::generate(&env);
    let patient = Address::generate(&env);

    let id = client.mint_prescription(&doctor, &patient, &rx_hash(&env));
    client.revoke_prescription(&id);
    assert_eq!(client.get_prescription(&id).status, Status::Revoked);

    // A revoked (terminal) prescription can no longer be acted on: revoking it
    // again is rejected as already finalized.
    assert_eq!(
        client.try_revoke_prescription(&id),
        Err(Ok(Error::AlreadyFinalized))
    );
}

#[test]
fn test_revoke_missing_prescription() {
    let env = Env::default();
    env.mock_all_auths();
    let client = PrescriptionSoulboundClient::new(&env, &init_contract(&env, &allow(&env)));

    // Revoking an id that was never minted is a clean, typed error.
    assert_eq!(
        client.try_revoke_prescription(&999u64),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn test_get_missing_prescription() {
    let env = Env::default();
    env.mock_all_auths();
    let client = PrescriptionSoulboundClient::new(&env, &init_contract(&env, &allow(&env)));

    // `Prescription` has no `PartialEq`, so assert on the error arm via `.err()`.
    assert_eq!(
        client.try_get_prescription(&999u64).err(),
        Some(Ok(Error::NotFound))
    );
}
