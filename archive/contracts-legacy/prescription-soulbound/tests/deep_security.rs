//! Independent review: synthetic native-host tests; no mock_all_auths, no transactions.
//! Vulnerability reproduction assertions describe current behavior, not a security pass.
use doctor_registry::{DoctorRegistry, DoctorRegistryClient};
use prescription_soulbound::{DataKey, Error, PrescriptionSoulbound, PrescriptionSoulboundClient, Status};
use soroban_sdk::{testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke, storage::{Instance as _, Persistent as _}}, Address, BytesN, Env, IntoVal, String, Val, Vec};

fn auth(env: &Env, actor: &Address, contract: &Address, name: &str, args: Vec<Val>) {
    env.mock_auths(&[MockAuth { address: actor, invoke: &MockAuthInvoke {
        contract, fn_name: name, args, sub_invokes: &[],
    }}]);
}
struct Fixture { env: Env, rx: Address, registry: Address, admin: Address, doctor: Address, patient: Address }
impl Fixture {
    fn new() -> Self {
        let env = Env::default();
        let admin = Address::generate(&env);
        let doctor = Address::generate(&env);
        let patient = Address::generate(&env);
        let registry = env.register(DoctorRegistry, ());
        let client = DoctorRegistryClient::new(&env, &registry);
        client.init(&admin);
        let label = String::from_str(&env, "SYNTHETIC");
        auth(&env, &admin, &registry, "register_doctor", (doctor.clone(), label.clone(), label.clone()).into_val(&env));
        client.register_doctor(&doctor, &label, &label);
        let rx = env.register(PrescriptionSoulbound, (admin.clone(), registry.clone(), Address::generate(&env)));
        Self { env, rx, registry, admin, doctor, patient }
    }
    fn client(&self) -> PrescriptionSoulboundClient<'_> { PrescriptionSoulboundClient::new(&self.env, &self.rx) }
    fn mint_args(&self, hash: u8, units: u32, expires: u64) -> Vec<Val> {
        (self.doctor.clone(), self.patient.clone(), BytesN::from_array(&self.env, &[hash;32]), String::from_str(&self.env,"SYNTHETIC"), String::from_str(&self.env,"SYNTHETIC"), units, expires).into_val(&self.env)
    }
    fn mint(&self, hash: u8, units: u32, expires: u64) -> u64 {
        auth(&self.env, &self.doctor, &self.rx, "mint_prescription", self.mint_args(hash, units, expires));
        self.client().mint_prescription(&self.doctor, &self.patient, &BytesN::from_array(&self.env,&[hash;32]), &String::from_str(&self.env,"SYNTHETIC"), &String::from_str(&self.env,"SYNTHETIC"), &units, &expires)
    }
    fn activate(&self, id: u64) {
        auth(&self.env,&self.patient,&self.rx,"activate",(self.patient.clone(),id).into_val(&self.env));
        self.client().activate(&self.patient,&id);
    }
    fn dispense(&self, id: u64, units: u32) {
        let attacker = Address::generate(&self.env);
        auth(&self.env,&attacker,&self.rx,"dispense",(attacker.clone(),id,units).into_val(&self.env));
        self.client().dispense(&attacker,&id,&units);
    }
}

#[test]
fn specific_auth_unregistered_attacker_burns_and_prevents_both_remedies() {
    let f=Fixture::new(); let id=f.mint(1,10,1000); f.activate(id); f.dispense(id,10);
    assert_eq!(f.client().get_prescription(&id).status,Status::Burned);
    auth(&f.env,&f.doctor,&f.rx,"revoke",(f.doctor.clone(),id).into_val(&f.env));
    assert_eq!(f.client().try_revoke(&f.doctor,&id),Err(Ok(Error::InvalidStatus)));
    auth(&f.env,&f.admin,&f.rx,"block",(id,).into_val(&f.env));
    assert_eq!(f.client().try_block(&id),Err(Ok(Error::InvalidStatus)));
}

#[test]
fn missing_signatures_fail_closed_for_all_mutations() {
    let f=Fixture::new(); let id=f.mint(1,10,1000);
    f.env.set_auths(&[]);
    assert!(f.client().try_mint_prescription(&f.doctor,&f.patient,&BytesN::from_array(&f.env,&[2;32]),&String::from_str(&f.env,"S"),&String::from_str(&f.env,"S"),&10,&1000).is_err());
    assert!(f.client().try_activate(&f.patient,&id).is_err());
    assert!(f.client().try_revoke(&f.doctor,&id).is_err());
    assert!(f.client().try_block(&id).is_err());
    f.activate(id); f.env.set_auths(&[]);
    assert!(f.client().try_dispense(&Address::generate(&f.env),&id,&10).is_err());
    assert_eq!(f.client().get_prescription(&id).balance,10);
}

#[test]
fn positive_partial_withdrawal_also_disagrees_with_validity() {
    let f=Fixture::new(); let id=f.mint(1,10,1000); f.activate(id); f.dispense(id,1);
    assert_eq!(f.client().get_prescription(&id).balance,9);
    assert!(!f.client().is_valid(&id));
    f.dispense(id,9); // accepted despite is_valid=false
    assert_eq!(f.client().get_prescription(&id).status,Status::Burned);
}

#[test]
fn exact_expiry_blocks_dispensing_without_state_changes() {
    let f=Fixture::new(); let id=f.mint(1,10,1000); f.activate(id);
    f.env.ledger().set_timestamp(999); f.dispense(id,1);
    f.env.ledger().set_timestamp(1000);
    let actor=Address::generate(&f.env);
    auth(&f.env,&actor,&f.rx,"dispense",(actor.clone(),id,1u32).into_val(&f.env));
    assert_eq!(f.client().try_dispense(&actor,&id,&1),Err(Ok(Error::Expired)));
    assert_eq!(f.client().get_prescription(&id).balance,9);
}

#[test]
fn max_units_arithmetic_and_insufficient_balance_are_safe() {
    let f=Fixture::new(); let id=f.mint(1,u32::MAX,u64::MAX); f.activate(id); f.dispense(id,u32::MAX-1);
    let actor=Address::generate(&f.env);
    auth(&f.env,&actor,&f.rx,"dispense",(actor.clone(),id,u32::MAX).into_val(&f.env));
    assert_eq!(f.client().try_dispense(&actor,&id,&u32::MAX),Err(Ok(Error::InsufficientBalance)));
    assert_eq!(f.client().get_prescription(&id).balance,1);
    f.dispense(id,1); assert_eq!(f.client().get_prescription(&id).balance,0);
}

#[test]
fn duplicate_key_survives_all_reachable_statuses() {
    for state in 0..6 {
        let f=Fixture::new(); let id=f.mint(1,10,1000);
        match state {
            1 => f.activate(id),
            2 => { auth(&f.env,&f.admin,&f.rx,"block",(id,).into_val(&f.env)); f.client().block(&id); },
            3 => { f.activate(id); f.dispense(id,1); },
            4 => { f.activate(id); f.dispense(id,10); },
            5 => { auth(&f.env,&f.doctor,&f.rx,"revoke",(f.doctor.clone(),id).into_val(&f.env)); f.client().revoke(&f.doctor,&id); },
            _ => (),
        }
        // Changed metadata/amount/expiration cannot bypass exact canonical-hash dedupe.
        auth(&f.env,&f.doctor,&f.rx,"mint_prescription",f.mint_args(1,99,2000));
        assert_eq!(f.client().try_mint_prescription(&f.doctor,&f.patient,&BytesN::from_array(&f.env,&[1;32]),&String::from_str(&f.env,"SYNTHETIC"),&String::from_str(&f.env,"SYNTHETIC"),&99,&2000),Err(Ok(Error::DuplicatePrescription)));
        assert_eq!(f.mint(2,10,1000),2); // failed duplicate never advances counter
    }
}

#[test]
fn revoked_doctor_cannot_mint_but_existing_rx_remains_activatable_and_revocable() {
    let f=Fixture::new(); let id=f.mint(1,10,1000);
    auth(&f.env,&f.admin,&f.registry,"revoke_doctor",(f.doctor.clone(),).into_val(&f.env));
    DoctorRegistryClient::new(&f.env,&f.registry).revoke_doctor(&f.doctor);
    auth(&f.env,&f.doctor,&f.rx,"mint_prescription",f.mint_args(2,10,1000));
    assert_eq!(f.client().try_mint_prescription(&f.doctor,&f.patient,&BytesN::from_array(&f.env,&[2;32]),&String::from_str(&f.env,"SYNTHETIC"),&String::from_str(&f.env,"SYNTHETIC"),&10,&1000),Err(Ok(Error::Unauthorized)));
    auth(&f.env,&f.doctor,&f.rx,"activate",(f.doctor.clone(),id).into_val(&f.env));
    f.client().activate(&f.doctor,&id);
    auth(&f.env,&f.doctor,&f.rx,"revoke",(f.doctor.clone(),id).into_val(&f.env));
    f.client().revoke(&f.doctor,&id);
    assert_eq!(f.client().get_prescription(&id).status,Status::Revoked);
}

#[test]
fn lifecycle_updates_extend_record_only_not_instance_index_or_dedupe() {
    let f=Fixture::new(); let id=f.mint(1,10,1000);
    let before=f.env.as_contract(&f.rx,||f.env.storage().persistent().get_ttl(&DataKey::Prescription(id)));
    let start=f.env.ledger().sequence();
    f.env.ledger().set_sequence_number(start+before-40);
    f.activate(id);
    f.env.as_contract(&f.rx,|| {
        assert_eq!(f.env.storage().persistent().get_ttl(&DataKey::Prescription(id)),100);
        assert_eq!(f.env.storage().instance().get_ttl(),40);
        assert_eq!(f.env.storage().persistent().get_ttl(&DataKey::IssuedPrescription(f.doctor.clone(),f.patient.clone(),BytesN::from_array(&f.env,&[1;32]))),40);
        assert_eq!(f.env.storage().persistent().get_ttl(&DataKey::PrescriptionsByPatient(f.patient.clone())),40);
    });
}

#[test]
fn signed_outsiders_cannot_activate_revoke_or_impersonate_admin_or_doctor() {
    let f=Fixture::new(); let id=f.mint(1,10,1000); let outsider=Address::generate(&f.env);
    auth(&f.env,&outsider,&f.rx,"activate",(outsider.clone(),id).into_val(&f.env));
    assert_eq!(f.client().try_activate(&outsider,&id),Err(Ok(Error::Unauthorized)));
    auth(&f.env,&outsider,&f.rx,"revoke",(outsider.clone(),id).into_val(&f.env));
    assert_eq!(f.client().try_revoke(&outsider,&id),Err(Ok(Error::Unauthorized)));
    auth(&f.env,&outsider,&f.rx,"block",(id,).into_val(&f.env));
    assert!(f.client().try_block(&id).is_err());
    auth(&f.env,&outsider,&f.rx,"mint_prescription",f.mint_args(2,10,1000));
    assert!(f.client().try_mint_prescription(&f.doctor,&f.patient,&BytesN::from_array(&f.env,&[2;32]),&String::from_str(&f.env,"SYNTHETIC"),&String::from_str(&f.env,"SYNTHETIC"),&10,&1000).is_err());
    assert_eq!(f.client().get_prescription(&id).status,Status::Registered);
    assert_eq!(f.client().get_prescriptions_by_patient(&f.patient).len(),1);
}

#[test]
fn unavailable_registry_fails_closed_and_writes_no_prescription_or_index() {
    let f=Fixture::new();
    let missing_registry=Address::generate(&f.env);
    let broken=f.env.register(PrescriptionSoulbound,(f.admin.clone(),missing_registry,Address::generate(&f.env)));
    let client=PrescriptionSoulboundClient::new(&f.env,&broken);
    auth(&f.env,&f.doctor,&broken,"mint_prescription",f.mint_args(1,10,1000));
    assert!(client.try_mint_prescription(&f.doctor,&f.patient,&BytesN::from_array(&f.env,&[1;32]),&String::from_str(&f.env,"SYNTHETIC"),&String::from_str(&f.env,"SYNTHETIC"),&10,&1000).is_err());
    assert_eq!(client.try_get_prescription(&1).err(),Some(Ok(Error::PrescriptionNotFound)));
    assert_eq!(client.get_prescriptions_by_patient(&f.patient).len(),0);
    assert_eq!(client.get_prescriptions_by_doctor(&f.doctor).len(),0);
    f.env.as_contract(&broken,|| {
        assert_eq!(f.env.storage().instance().get::<_,u64>(&DataKey::Counter),Some(0));
        assert!(!f.env.storage().persistent().has(&DataKey::IssuedPrescription(f.doctor.clone(),f.patient.clone(),BytesN::from_array(&f.env,&[1;32]))));
    });
}
