use prescription_soulbound::{Error, PrescriptionSoulbound, PrescriptionSoulboundClient, Status};
use doctor_registry::{DoctorRegistry, DoctorRegistryClient};
use soroban_sdk::{testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke}, Address, BytesN, Env, IntoVal, String};

fn setup(env: &Env) -> (PrescriptionSoulboundClient<'_>, Address, Address) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let registry_id = env.register(DoctorRegistry, ());
    let registry = DoctorRegistryClient::new(env, &registry_id);
    registry.init(&admin);
    let doctor = Address::generate(env);
    registry.register_doctor(&doctor, &String::from_str(env, "synthetic"), &String::from_str(env, "audit"));
    let id = env.register(PrescriptionSoulbound, (admin, registry_id, Address::generate(env)));
    (PrescriptionSoulboundClient::new(env, &id), doctor, Address::generate(env))
}

fn mint(env: &Env, client: &PrescriptionSoulboundClient, doctor: &Address, patient: &Address, units: u32, expires: u64) -> u64 {
    client.mint_prescription(doctor, patient, &BytesN::from_array(env, &[1; 32]), &String::from_str(env, "synthetic"), &String::from_str(env, "synthetic"), &units, &expires)
}

// Reproduction tests assert the observed vulnerable behavior, not desired security.
#[test]
fn audit_unregistered_wallet_can_burn_and_prevent_revocation() {
    let env = Env::default();
    let (client, doctor, patient) = setup(&env);
    let id = mint(&env, &client, &doctor, &patient, 10, 1000);
    client.activate(&patient, &id);
    let attacker = Address::generate(&env); // never registered anywhere
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "dispense",
            args: (attacker.clone(), id, 10u32).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.dispense(&attacker, &id, &10);
    assert_eq!(client.get_prescription(&id).status, Status::Burned);
    env.mock_auths(&[MockAuth {
        address: &doctor,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "revoke",
            args: (doctor.clone(), id).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(client.try_revoke(&doctor, &id), Err(Ok(Error::InvalidStatus)));
}

#[test]
fn audit_zero_dispense_changes_status_without_consuming_balance() {
    let env = Env::default();
    let (client, doctor, patient) = setup(&env);
    let id = mint(&env, &client, &doctor, &patient, 10, 1000);
    client.activate(&patient, &id);
    assert!(client.is_valid(&id));
    client.dispense(&Address::generate(&env), &id, &0);
    assert_eq!(client.get_prescription(&id).balance, 10);
    assert_eq!(client.get_prescription(&id).status, Status::PartiallyDispensed);
    assert!(!client.is_valid(&id));
}

#[test]
fn audit_zero_unit_prescription_is_valid_and_expired_can_activate() {
    let env = Env::default();
    let (client, doctor, patient) = setup(&env);
    let id = mint(&env, &client, &doctor, &patient, 0, 1000);
    client.activate(&patient, &id);
    assert!(client.is_valid(&id));
    let env = Env::default();
    let (client, doctor, patient) = setup(&env);
    env.ledger().with_mut(|l| l.timestamp = 100);
    let id = mint(&env, &client, &doctor, &patient, 10, 99);
    client.activate(&patient, &id);
    assert_eq!(client.get_prescription(&id).status, Status::Active);
    assert!(!client.is_valid(&id));
}

#[test]
fn audit_activate_revoke_reject_wrong_actor_and_missing_signature() {
    let env = Env::default();
    let (client, doctor, patient) = setup(&env);
    let id = mint(&env, &client, &doctor, &patient, 10, 1000);
    let outsider = Address::generate(&env);
    assert_eq!(client.try_activate(&outsider, &id), Err(Ok(Error::Unauthorized)));
    assert_eq!(client.try_revoke(&outsider, &id), Err(Ok(Error::Unauthorized)));
    env.set_auths(&[]);
    assert!(client.try_activate(&patient, &id).is_err());
    assert!(client.try_revoke(&doctor, &id).is_err());
    assert_eq!(client.get_prescription(&id).status, Status::Registered);
}
