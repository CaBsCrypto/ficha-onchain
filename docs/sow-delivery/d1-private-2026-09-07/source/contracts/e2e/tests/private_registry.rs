use doctor_registry_private::{DoctorRegistryPrivate, DoctorRegistryPrivateClient};
use prescription_soulbound::{PrescriptionSoulbound, PrescriptionSoulboundClient};
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, BytesN, Env, String};

#[test]
fn private_registry_gates_prescription_without_identity_fields() {
    let e=Env::default();e.mock_all_auths();e.ledger().with_mut(|l|l.timestamp=100);
    let admin=Address::generate(&e);let doctor=Address::generate(&e);let patient=Address::generate(&e);
    let id=e.register(DoctorRegistryPrivate,(admin.clone(),));let registry=DoctorRegistryPrivateClient::new(&e,&id);
    // Dispensing is outside this local test; no placeholder is deployed on network.
    let rxid=e.register(PrescriptionSoulbound,(admin,id,Address::generate(&e)));
    let rx=PrescriptionSoulboundClient::new(&e,&rxid);
    let medication=String::from_str(&e,"TEST");let dosage=String::from_str(&e,"TEST");
    let issue=|seed|rx.try_mint_prescription(&doctor,&patient,&BytesN::from_array(&e,&[seed;32]),&medication,&dosage,&1,&1000);
    assert!(issue(1).is_err());
    registry.authorize_doctor(&doctor,&BytesN::from_array(&e,&[3;32]),&200);
    assert!(issue(2).is_ok());
    registry.pause();assert!(issue(3).is_err());registry.unpause();
    registry.revoke_doctor(&doctor);assert!(issue(4).is_err());
    registry.reauthorize_doctor(&doctor,&BytesN::from_array(&e,&[4;32]),&200);
    e.ledger().with_mut(|l|l.timestamp=200);assert!(issue(5).is_err());
}
