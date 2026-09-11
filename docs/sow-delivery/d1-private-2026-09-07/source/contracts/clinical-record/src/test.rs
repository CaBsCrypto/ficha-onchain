#![cfg(test)]
//! ClinicalRecord test suite — TrustLeaf.
//!
//! The record is patient-owned: the owner writes freely, doctors write only
//! after the owner grants them access, and a revoke takes that access away.
//!
//! Tests cover:
//!   - owner can write without a grant
//!   - a doctor with write access can write
//!   - a wallet with no access is rejected (Error::Unauthorized)
//!   - a non-owner cannot grant access
//!   - grant then revoke: the doctor can no longer write

use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

/// Deploy a fresh record owned by a freshly generated patient wallet.
/// Returns (env, client, owner).
fn deploy(env: &Env) -> (ClinicalRecordClient, Address) {
    let owner = Address::generate(env);
    let id = env.register(ClinicalRecord, (owner.clone(),));
    (ClinicalRecordClient::new(env, &id), owner)
}

fn kind(env: &Env) -> String {
    String::from_str(env, "Observation")
}

fn hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

// ✅ The owner can write without needing a grant.
#[test]
fn test_owner_can_write_without_grant() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, owner) = deploy(&env);

    assert!(client.has_write_access(&owner));
    client.append_entry(&owner, &kind(&env), &hash(&env));

    let entries = client.get_entries();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries.get(0).unwrap().author, owner);
}

// ✅ A doctor granted write access can write.
#[test]
fn test_granted_doctor_can_write() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _owner) = deploy(&env);

    let doctor = Address::generate(&env);
    assert!(!client.has_write_access(&doctor));

    client.grant_write_access(&doctor);
    assert!(client.has_write_access(&doctor));

    client.append_entry(&doctor, &kind(&env), &hash(&env));

    let entries = client.get_entries();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries.get(0).unwrap().author, doctor);
}

// ❌ A wallet with no access cannot write — Error::Unauthorized.
// mock_all_auths() satisfies `author.require_auth()`, so the call reaches (and
// is rejected by) the write-access check specifically.
#[test]
fn test_wallet_without_access_cannot_write() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _owner) = deploy(&env);

    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_append_entry(&stranger, &kind(&env), &hash(&env)),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(client.get_entries().len(), 0);
}

// ❌ A non-owner cannot grant access: without the owner's signature the grant
// is rejected (owner.require_auth() traps).
#[test]
fn test_non_owner_cannot_grant() {
    let env = Env::default();
    // No mock_all_auths() — the owner's signature is never provided.
    let (client, _owner) = deploy(&env);

    let doctor = Address::generate(&env);
    assert!(client.try_grant_write_access(&doctor).is_err());
    assert!(!client.has_write_access(&doctor));
}

// ✅→❌ Owner grants, then revokes: the doctor can write, then no longer can.
#[test]
fn test_grant_then_revoke_blocks_writes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _owner) = deploy(&env);

    let doctor = Address::generate(&env);

    // Grant → the doctor can write.
    client.grant_write_access(&doctor);
    client.append_entry(&doctor, &kind(&env), &hash(&env));
    assert_eq!(client.get_entries().len(), 1);

    // Revoke → access is gone and further writes are rejected.
    client.revoke_write_access(&doctor);
    assert!(!client.has_write_access(&doctor));
    assert_eq!(
        client.try_append_entry(&doctor, &kind(&env), &hash(&env)),
        Err(Ok(Error::Unauthorized))
    );

    // No new entry was appended.
    assert_eq!(client.get_entries().len(), 1);
}
