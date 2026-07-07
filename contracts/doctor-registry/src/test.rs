#![cfg(test)]
//! DoctorRegistry test suite -- TrustLeaf D1.
//!
//! Tests cover:
//!   init, register_doctor, revoke_doctor, is_authorized, get_doctor,
//!   transfer_admin, get_admin,
//!   grant_permission, revoke_permission, has_permission, get_permissions.

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn dr_name(env: &Env) -> String {
    String::from_str(env, "Dr. Alice Nguyen")
}
fn dr_license(env: &Env) -> String {
    String::from_str(env, "MED-CR-0001")
}

// == Core registration tests =================================================

#[test]
fn test_register_doctor_success() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);
    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));

    assert!(client.is_authorized(&doctor));

    let record = client.get_doctor(&doctor);
    assert_eq!(record.wallet, doctor);
    assert_eq!(record.full_name, dr_name(&env));
    assert_eq!(record.license_id, dr_license(&env));
    assert!(record.authorized);
}

#[test]
fn test_register_doctor_unauthorized() {
    let env = Env::default();
    // No mock_all_auths() -- admin signature never provided.
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);

    let res = client.try_register_doctor(&doctor, &dr_name(&env), &dr_license(&env));
    assert!(res.is_err());
    assert!(!client.is_authorized(&doctor));
}

#[test]
fn test_revoke_doctor() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);
    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));
    assert!(client.is_authorized(&doctor));

    client.revoke_doctor(&doctor);
    assert!(!client.is_authorized(&doctor));

    // Record is kept (auditable) with authorized = false.
    assert!(!client.get_doctor(&doctor).authorized);

    // Revoking an unknown wallet is a typed error.
    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_revoke_doctor(&stranger),
        Err(Ok(Error::DoctorNotFound))
    );
}

#[test]
fn test_double_register() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);

    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));
    let updated = String::from_str(&env, "MED-CR-0001-RENEWED");
    client.register_doctor(&doctor, &dr_name(&env), &updated);

    assert!(client.is_authorized(&doctor));
    assert_eq!(client.get_doctor(&doctor).license_id, updated);

    // Re-registering after a revoke re-authorizes.
    client.revoke_doctor(&doctor);
    assert!(!client.is_authorized(&doctor));
    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));
    assert!(client.is_authorized(&doctor));
}

#[test]
fn test_transfer_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);
    client.transfer_admin(&new_admin);
    assert_eq!(client.get_admin(), new_admin);

    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));
    assert!(client.is_authorized(&doctor));

    // Old admin loses access.
    env.mock_auths(&[]);
    let victim = Address::generate(&env);
    assert!(client
        .try_register_doctor(&victim, &dr_name(&env), &dr_license(&env))
        .is_err());
    assert!(!client.is_authorized(&victim));
}

#[test]
fn test_init_is_one_time() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    client.init(&admin);
    assert_eq!(
        client.try_init(&Address::generate(&env)),
        Err(Ok(Error::AlreadyInitialized))
    );
}

// == Permission tests =========================================================

#[test]
fn test_grant_and_has_permission() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);
    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));

    // No permissions yet.
    assert!(!client.has_permission(&doctor, &PERM_CANNABIS));
    assert!(!client.has_permission(&doctor, &PERM_MNT_HLTH));
    assert_eq!(client.get_permissions(&doctor).len(), 0);

    // Grant CANNABIS.
    client.grant_permission(&doctor, &PERM_CANNABIS);
    assert!(client.has_permission(&doctor, &PERM_CANNABIS));
    assert!(!client.has_permission(&doctor, &PERM_MNT_HLTH));
    assert_eq!(client.get_permissions(&doctor).len(), 1);

    // Grant MNT_HLTH.
    client.grant_permission(&doctor, &PERM_MNT_HLTH);
    assert!(client.has_permission(&doctor, &PERM_CANNABIS));
    assert!(client.has_permission(&doctor, &PERM_MNT_HLTH));
    assert_eq!(client.get_permissions(&doctor).len(), 2);
}

#[test]
fn test_grant_permission_is_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);
    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));

    client.grant_permission(&doctor, &PERM_CANNABIS);
    client.grant_permission(&doctor, &PERM_CANNABIS); // duplicate
    client.grant_permission(&doctor, &PERM_CANNABIS); // duplicate

    // Still exactly one entry.
    assert_eq!(client.get_permissions(&doctor).len(), 1);
    assert!(client.has_permission(&doctor, &PERM_CANNABIS));
}

#[test]
fn test_revoke_permission() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);
    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));

    client.grant_permission(&doctor, &PERM_CANNABIS);
    client.grant_permission(&doctor, &PERM_MNT_HLTH);
    assert_eq!(client.get_permissions(&doctor).len(), 2);

    // Revoke one -- the other survives.
    client.revoke_permission(&doctor, &PERM_CANNABIS);
    assert!(!client.has_permission(&doctor, &PERM_CANNABIS));
    assert!(client.has_permission(&doctor, &PERM_MNT_HLTH));
    assert_eq!(client.get_permissions(&doctor).len(), 1);

    // Revoking a permission not held is a no-op.
    client.revoke_permission(&doctor, &PERM_CANNABIS);
    assert_eq!(client.get_permissions(&doctor).len(), 1);
}

#[test]
fn test_revoke_all_permissions() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);
    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));

    client.grant_permission(&doctor, &PERM_CANNABIS);
    client.grant_permission(&doctor, &PERM_MNT_HLTH);

    client.revoke_permission(&doctor, &PERM_CANNABIS);
    client.revoke_permission(&doctor, &PERM_MNT_HLTH);

    assert_eq!(client.get_permissions(&doctor).len(), 0);
    assert!(!client.has_permission(&doctor, &PERM_CANNABIS));
    assert!(!client.has_permission(&doctor, &PERM_MNT_HLTH));
}

#[test]
fn test_permissions_unknown_wallet_returns_empty() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    client.init(&admin);

    let stranger = Address::generate(&env);
    assert_eq!(client.get_permissions(&stranger).len(), 0);
    assert!(!client.has_permission(&stranger, &PERM_CANNABIS));
}

#[test]
fn test_permission_requires_admin() {
    let env = Env::default();
    // No mock_all_auths -- admin signature never provided.
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);

    let res = client.try_grant_permission(&doctor, &PERM_CANNABIS);
    assert!(res.is_err());
}

#[test]
fn test_permissions_independent_of_revoke_doctor() {
    let env = Env::default();
    env.mock_all_auths();
    let client = DoctorRegistryClient::new(&env, &env.register(DoctorRegistry, ()));

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);

    client.init(&admin);
    client.register_doctor(&doctor, &dr_name(&env), &dr_license(&env));
    client.grant_permission(&doctor, &PERM_CANNABIS);

    // Revoking the doctor's authorization does NOT clear their permissions
    // (permissions are auditable even after revocation).
    client.revoke_doctor(&doctor);
    assert!(!client.is_authorized(&doctor));
    assert!(client.has_permission(&doctor, &PERM_CANNABIS));
}
