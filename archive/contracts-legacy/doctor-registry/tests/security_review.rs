//! Focused local audit reproductions; no network or deployment.
use doctor_registry::{DoctorRegistry, DoctorRegistryClient, Error};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol};

#[test]
fn uninitialized_registry_accepts_arbitrary_admin_without_authentication() {
    let env = Env::default();
    let id = env.register(DoctorRegistry, ());
    let client = DoctorRegistryClient::new(&env, &id);
    let intended_admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    // No mocked signatures: an arbitrary first caller claims the admin slot.
    client.init(&attacker);
    assert_eq!(client.get_admin(), attacker);
    assert!(env.auths().is_empty());
    assert_eq!(client.try_init(&intended_admin), Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn permission_can_exist_without_doctor_registration() {
    let env = Env::default();
    let id = env.register(DoctorRegistry, ());
    let client = DoctorRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let stranger = Address::generate(&env);
    client.init(&admin);
    env.mock_all_auths();
    let permission = Symbol::new(&env, "CANNABIS");
    client.grant_permission(&stranger, &permission);
    assert!(client.has_permission(&stranger, &permission));
    assert!(!client.is_authorized(&stranger));
    assert!(client.try_get_doctor(&stranger).is_err());
}

#[test]
fn admin_mutations_fail_without_current_admin_auth() {
    let env = Env::default();
    let id = env.register(DoctorRegistry, ());
    let client = DoctorRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);
    client.init(&admin);
    env.mock_all_auths();
    client.register_doctor(&doctor, &String::from_str(&env, "Synthetic"), &String::from_str(&env, "TEST"));
    env.mock_auths(&[]);
    assert!(client.try_transfer_admin(&doctor).is_err());
    assert!(client.try_revoke_doctor(&doctor).is_err());
    assert!(client.try_revoke_permission(&doctor, &Symbol::new(&env, "CANNABIS")).is_err());
    assert_eq!(client.get_admin(), admin);
    assert!(client.is_authorized(&doctor));
}
