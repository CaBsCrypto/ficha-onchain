//! Independent security checks. All authorizations are scoped; no mock_all_auths.
use doctor_registry::{DataKey, DoctorRegistry, DoctorRegistryClient, PERM_CANNABIS};
use soroban_sdk::{testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke, storage::Persistent}, Address, Env, IntoVal, String, Val, Vec};

fn authorize(env: &Env, id: &Address, signer: &Address, function: &str, args: Vec<Val>) {
    env.mock_auths(&[MockAuth { address: signer, invoke: &MockAuthInvoke {
        contract: id, fn_name: function, args, sub_invokes: &[],
    }}]);
}

#[test]
fn rotation_rejects_old_admin_even_with_old_admin_authorization() {
    let env = Env::default();
    let id = env.register(DoctorRegistry, ());
    let client = DoctorRegistryClient::new(&env, &id);
    let old = Address::generate(&env);
    let new = Address::generate(&env);
    let doctor = Address::generate(&env);
    client.init(&old);
    authorize(&env, &id, &old, "transfer_admin", (&new,).into_val(&env));
    client.transfer_admin(&new);
    let name = String::from_str(&env, "Synthetic");
    let license = String::from_str(&env, "SYNTH-1");
    authorize(&env, &id, &old, "register_doctor", (doctor.clone(), name.clone(), license.clone()).into_val(&env));
    assert!(client.try_register_doctor(&doctor, &name, &license).is_err());
    assert!(!client.is_authorized(&doctor));
    authorize(&env, &id, &new, "register_doctor", (doctor.clone(), name.clone(), license.clone()).into_val(&env));
    client.register_doctor(&doctor, &name, &license);
    assert!(client.is_authorized(&doctor));
}

#[test]
fn scoped_admin_authorization_cannot_be_retargeted_to_another_doctor() {
    let env = Env::default();
    let id = env.register(DoctorRegistry, ());
    let client = DoctorRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let intended = Address::generate(&env);
    let other = Address::generate(&env);
    client.init(&admin);
    authorize(&env, &id, &admin, "grant_permission", (&intended, &PERM_CANNABIS).into_val(&env));
    assert!(client.try_grant_permission(&other, &PERM_CANNABIS).is_err());
    assert!(!client.has_permission(&other, &PERM_CANNABIS));
    assert!(!client.has_permission(&intended, &PERM_CANNABIS));
}

#[test]
fn reregistration_restores_authority_with_retained_permissions_by_design() {
    let env = Env::default();
    let id = env.register(DoctorRegistry, ());
    let client = DoctorRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);
    client.init(&admin);
    let name = String::from_str(&env, "Synthetic");
    let license = String::from_str(&env, "SYNTH-2");
    authorize(&env, &id, &admin, "register_doctor", (doctor.clone(), name.clone(), license.clone()).into_val(&env));
    client.register_doctor(&doctor, &name, &license);
    authorize(&env, &id, &admin, "grant_permission", (&doctor, &PERM_CANNABIS).into_val(&env));
    client.grant_permission(&doctor, &PERM_CANNABIS);
    authorize(&env, &id, &admin, "revoke_doctor", (&doctor,).into_val(&env));
    client.revoke_doctor(&doctor);
    assert!(!client.is_authorized(&doctor));
    assert!(client.has_permission(&doctor, &PERM_CANNABIS));
    authorize(&env, &id, &admin, "register_doctor", (doctor.clone(), name.clone(), license.clone()).into_val(&env));
    client.register_doctor(&doctor, &name, &license);
    assert!(client.is_authorized(&doctor));
    assert!(client.has_permission(&doctor, &PERM_CANNABIS));
}

#[test]
fn ordinary_reads_and_revocation_do_not_extend_persistent_ttl() {
    let env = Env::default();
    env.ledger().set_min_persistent_entry_ttl(100);
    let id = env.register(DoctorRegistry, ());
    let client = DoctorRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);
    client.init(&admin);
    let name = String::from_str(&env, "Synthetic");
    let license = String::from_str(&env, "SYNTH-3");
    authorize(&env, &id, &admin, "register_doctor", (doctor.clone(), name.clone(), license.clone()).into_val(&env));
    client.register_doctor(&doctor, &name, &license);
    let ttl_before = env.as_contract(&id, || env.storage().persistent().get_ttl(&DataKey::Doctor(doctor.clone())));
    env.ledger().set_sequence_number(env.ledger().sequence() + 20);
    assert!(client.is_authorized(&doctor));
    authorize(&env, &id, &admin, "revoke_doctor", (&doctor,).into_val(&env));
    client.revoke_doctor(&doctor);
    let ttl_after = env.as_contract(&id, || env.storage().persistent().get_ttl(&DataKey::Doctor(doctor.clone())));
    assert_eq!(ttl_after, ttl_before - 20);
    assert!(!client.is_authorized(&doctor));
}

