use super::*;
use doctor_registry_private::{DoctorRegistryPrivate,DoctorRegistryPrivateClient};
use soroban_sdk::testutils::{Address as _,Ledger};
use soroban_sdk::{IntoVal, testutils::{MockAuth, MockAuthInvoke}};

#[test]
fn booking_requires_authority_signature_and_exact_arguments() {
    let e=Env::default();
    let admin=Address::generate(&e);let authority=Address::generate(&e);
    let doctor=Address::generate(&e);let patient=Address::generate(&e);
    let registry=e.register(DoctorRegistryPrivate,(admin.clone(),));
    let id=e.register(PrescriptionPrivate,(admin.clone(),registry,authority.clone()));
    let c=PrescriptionPrivateClient::new(&e,&id);let nonce=BytesN::from_array(&e,&[7;32]);
    assert_eq!(c.get_booking_authority(),authority);
    assert_eq!(c.interface_version(),2);
    assert!(c.try_attest_booking(&doctor,&patient,&nonce,&100).is_err());
    let args: soroban_sdk::Vec<soroban_sdk::Val>=(doctor.clone(),patient.clone(),nonce.clone(),100u64).into_val(&e);
    for signer in [admin,doctor.clone(),patient.clone()] {
        e.mock_auths(&[MockAuth{address:&signer,invoke:&MockAuthInvoke{contract:&id,fn_name:"attest_booking",args:args.clone(),sub_invokes:&[]}}]);
        assert!(c.try_attest_booking(&doctor,&patient,&nonce,&100).is_err());
    }
    e.mock_auths(&[MockAuth{address:&authority,invoke:&MockAuthInvoke{contract:&id,fn_name:"attest_booking",args:args.clone(),sub_invokes:&[]}}]);
    assert!(c.try_attest_booking(&doctor,&patient,&nonce,&101).is_err());
    e.mock_auths(&[MockAuth{address:&authority,invoke:&MockAuthInvoke{contract:&id,fn_name:"attest_booking",args,sub_invokes:&[]}}]);
    c.attest_booking(&doctor,&patient,&nonce,&100);
    e.mock_auths(&[]);assert!(c.try_revoke_booking(&nonce).is_err());
    e.mock_auths(&[MockAuth{address:&authority,invoke:&MockAuthInvoke{contract:&id,fn_name:"revoke_booking",args:(nonce.clone(),).into_val(&e),sub_invokes:&[]}}]);
    c.revoke_booking(&nonce);assert_eq!(c.get_booking(&nonce).status,BookingStatus::Revoked);
}

#[test]
fn direct_mint_requires_matching_live_booking_and_consumes_it_atomically() {
    let e=Env::default();e.mock_all_auths();e.ledger().with_mut(|l|l.timestamp=10);
    let admin=Address::generate(&e);let authority=Address::generate(&e);
    let doctor=Address::generate(&e);let patient=Address::generate(&e);let other=Address::generate(&e);
    let registry=e.register(DoctorRegistryPrivate,(admin.clone(),));let r=DoctorRegistryPrivateClient::new(&e,&registry);
    let id=e.register(PrescriptionPrivate,(admin,registry,authority));let c=PrescriptionPrivateClient::new(&e,&id);
    let h=BytesN::from_array(&e,&[5;32]);r.authorize_doctor(&doctor,&h,&500);
    for scenario in 1..=5u8 {
        let nonce=BytesN::from_array(&e,&[scenario;32]);
        c.authorize_prescriber(&patient,&doctor,&nonce,&400);
        if scenario!=1 {
            c.attest_booking(&if scenario==4 {other.clone()} else {doctor.clone()},&if scenario==5 {other.clone()} else {patient.clone()},&nonce,&20);
        }
        if scenario==2 { c.revoke_booking(&nonce); }
        if scenario==3 { e.ledger().with_mut(|l|l.timestamp=20); }
        assert_eq!(c.try_mint_prescription(&doctor,&patient,&nonce,&h,&1000),Err(Ok(Error::BookingRequired)));
        assert_eq!(c.try_get_prescription(&1),Err(Ok(Error::Missing)));
        e.ledger().with_mut(|l|l.timestamp=10);
    }
    let nonce=BytesN::from_array(&e,&[9;32]);
    c.attest_booking(&doctor,&patient,&nonce,&100);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&nonce,&h,&1000),Err(Ok(Error::ConsentRequired)));
    assert_eq!(c.get_booking(&nonce).status,BookingStatus::Active);
    c.authorize_prescriber(&patient,&doctor,&nonce,&100);
    r.revoke_doctor(&doctor);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&nonce,&h,&1000),Err(Ok(Error::Unauthorized)));
    assert_eq!(c.get_booking(&nonce).status,BookingStatus::Active);
    r.reauthorize_doctor(&doctor,&h,&500);
    let rx=c.mint_prescription(&doctor,&patient,&nonce,&h,&1000);
    assert_eq!(c.get_prescription(&rx).doctor,doctor);
    assert_eq!(c.get_booking(&nonce).status,BookingStatus::Consumed);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&nonce,&h,&1000),Err(Ok(Error::Duplicate)));
    assert_eq!(c.try_attest_booking(&doctor,&patient,&nonce,&200),Err(Ok(Error::Duplicate)));
    assert_eq!(c.try_revoke_booking(&nonce),Err(Ok(Error::InvalidStatus)));
    let cancelled=BytesN::from_array(&e,&[2;32]);
    assert_eq!(c.try_attest_booking(&doctor,&patient,&cancelled,&200),Err(Ok(Error::Duplicate)));
}

#[test]
fn patient_consent_is_scoped_revocable_expiring_and_single_use() {
    let e=Env::default();e.mock_all_auths();e.ledger().with_mut(|l|l.timestamp=10);
    let a=Address::generate(&e);let doctor=Address::generate(&e);let patient=Address::generate(&e);let other=Address::generate(&e);
    let reg=e.register(DoctorRegistryPrivate,(a.clone(),));let r=DoctorRegistryPrivateClient::new(&e,&reg);
    let id=e.register(PrescriptionPrivate,(a.clone(),reg,a.clone()));let c=PrescriptionPrivateClient::new(&e,&id);
    let h=BytesN::from_array(&e,&[5;32]);r.authorize_doctor(&doctor,&h,&500);r.authorize_doctor(&other,&h,&500);
    c.attest_booking(&doctor,&patient,&h,&100);
    c.authorize_prescriber(&patient,&doctor,&h,&20);
    assert_eq!(c.try_mint_prescription(&other,&patient,&h,&h,&100),Err(Ok(Error::ConsentRequired)));
    assert_eq!(c.try_mint_prescription(&doctor,&other,&h,&h,&100),Err(Ok(Error::ConsentRequired)));
    c.revoke_consent(&patient,&doctor,&h);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&h,&h,&100),Err(Ok(Error::ConsentRequired)));
    c.authorize_prescriber(&patient,&doctor,&h,&20);e.ledger().with_mut(|l|l.timestamp=20);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&h,&h,&100),Err(Ok(Error::ConsentRequired)));
    c.authorize_prescriber(&patient,&doctor,&h,&30);c.mint_prescription(&doctor,&patient,&h,&h,&100);
    assert_eq!(c.try_authorize_prescriber(&patient,&doctor,&h,&40),Err(Ok(Error::Duplicate)));
}

#[test]
fn only_patient_can_authorize_or_revoke_consent() {
    let e=Env::default();let a=Address::generate(&e);let d=Address::generate(&e);let p=Address::generate(&e);
    let reg=e.register(DoctorRegistryPrivate,(a.clone(),));let id=e.register(PrescriptionPrivate,(a.clone(),reg,a.clone()));
    let c=PrescriptionPrivateClient::new(&e,&id);let h=BytesN::from_array(&e,&[1;32]);
    assert!(c.try_authorize_prescriber(&p,&d,&h,&100).is_err());
    assert!(c.try_revoke_consent(&p,&d,&h).is_err());
}

#[test]
fn only_the_authorized_doctors_signature_can_issue_to_the_signed_recipient() {
    let e=Env::default();e.mock_all_auths();
    let admin=Address::generate(&e);let doctor=Address::generate(&e);
    let relayer=Address::generate(&e);let patient=Address::generate(&e);
    let other_patient=Address::generate(&e);
    let registry=e.register(DoctorRegistryPrivate,(admin.clone(),));
    let r=DoctorRegistryPrivateClient::new(&e,&registry);
    let id=e.register(PrescriptionPrivate,(admin.clone(),registry,admin.clone()));
    let c=PrescriptionPrivateClient::new(&e,&id);
    let nonce=BytesN::from_array(&e,&[7;32]);let h=BytesN::from_array(&e,&[8;32]);
    r.authorize_doctor(&doctor,&h,&500);
    c.attest_booking(&doctor,&patient,&nonce,&400);
    c.authorize_prescriber(&patient,&doctor,&nonce,&400);
    let args: soroban_sdk::Vec<soroban_sdk::Val>=(doctor.clone(),patient.clone(),nonce.clone(),h.clone(),1000u64).into_val(&e);
    // Admin, fee payer, or recipient authorization cannot replace the issuer's authorization.
    for signer in [admin,relayer,patient.clone()] {
        e.mock_auths(&[MockAuth{address:&signer,invoke:&MockAuthInvoke{contract:&id,fn_name:"mint_prescription",args:args.clone(),sub_invokes:&[]}}]);
        assert!(c.try_mint_prescription(&doctor,&patient,&nonce,&h,&1000).is_err());
        assert_eq!(c.try_get_prescription(&1),Err(Ok(Error::Missing)));
    }
    // Doctor's authorization is scoped to the intended recipient and exact arguments.
    e.mock_auths(&[MockAuth{address:&doctor,invoke:&MockAuthInvoke{contract:&id,fn_name:"mint_prescription",args:args.clone(),sub_invokes:&[]}}]);
    assert!(c.try_mint_prescription(&doctor,&other_patient,&nonce,&h,&1000).is_err());
    e.mock_auths(&[MockAuth{address:&doctor,invoke:&MockAuthInvoke{contract:&id,fn_name:"mint_prescription",args,sub_invokes:&[]}}]);
    let rx=c.mint_prescription(&doctor,&patient,&nonce,&h,&1000);
    assert_eq!(c.get_prescription(&rx).patient,patient);
}

#[test]
fn authorized_private_issuance_lifecycle_and_duplicates() {
    let e=Env::default();e.mock_all_auths();e.ledger().with_mut(|l|l.timestamp=100);
    let admin=Address::generate(&e);let doctor=Address::generate(&e);let patient=Address::generate(&e);
    let registry=e.register(DoctorRegistryPrivate,(admin.clone(),));let r=DoctorRegistryPrivateClient::new(&e,&registry);
    let id=e.register(PrescriptionPrivate,(admin.clone(),registry,admin.clone()));let c=PrescriptionPrivateClient::new(&e,&id);
    let nonce=BytesN::from_array(&e,&[1;32]);let hash=BytesN::from_array(&e,&[2;32]);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&nonce,&hash,&1000),Err(Ok(Error::Unauthorized)));
    r.authorize_doctor(&doctor,&hash,&500);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&nonce,&hash,&1000),Err(Ok(Error::ConsentRequired)));
    c.attest_booking(&doctor,&patient,&nonce,&400);
    c.authorize_prescriber(&patient,&doctor,&nonce,&400);
    let rx=c.mint_prescription(&doctor,&patient,&nonce,&hash,&1000);
    let record=c.get_prescription(&rx);assert_eq!(record.patient,patient);assert_eq!(record.commitment,hash);
    assert!(!c.is_valid(&rx));
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&nonce,&BytesN::from_array(&e,&[3;32]),&1000),Err(Ok(Error::Duplicate)));
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&BytesN::from_array(&e,&[3;32]),&hash,&1000),Err(Ok(Error::Duplicate)));
    assert_eq!(c.try_activate(&Address::generate(&e),&rx),Err(Ok(Error::Unauthorized)));
    c.activate(&patient,&rx);assert!(c.is_valid(&rx));
    r.revoke_doctor(&doctor);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&BytesN::from_array(&e,&[4;32]),&hash,&1000),Err(Ok(Error::Unauthorized)));
    // Doctor revocation prevents new issuance; individual existing Rx needs its own revocation.
    assert!(c.is_valid(&rx));c.revoke(&rx);assert!(!c.is_valid(&rx));
    r.reauthorize_doctor(&doctor,&hash,&500);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&nonce,&hash,&1000),Err(Ok(Error::Duplicate)));
}

#[test]
fn signatures_expiry_and_blocking() {
    let e=Env::default();e.mock_all_auths();let admin=Address::generate(&e);let doctor=Address::generate(&e);let patient=Address::generate(&e);
    let registry=e.register(DoctorRegistryPrivate,(admin.clone(),));let r=DoctorRegistryPrivateClient::new(&e,&registry);
    let id=e.register(PrescriptionPrivate,(admin.clone(),registry,admin.clone()));let c=PrescriptionPrivateClient::new(&e,&id);
    let h=BytesN::from_array(&e,&[1;32]);r.authorize_doctor(&doctor,&h,&100);
    assert_eq!(c.try_mint_prescription(&doctor,&patient,&h,&h,&0),Err(Ok(Error::Expired)));
    e.mock_auths(&[]);assert!(c.try_mint_prescription(&doctor,&patient,&h,&h,&100).is_err());
    e.mock_all_auths();c.attest_booking(&doctor,&patient,&h,&40);c.authorize_prescriber(&patient,&doctor,&h,&40);let rx=c.mint_prescription(&doctor,&patient,&h,&h,&50);
    e.mock_auths(&[]);assert!(c.try_activate(&patient,&rx).is_err());assert!(c.try_revoke(&rx).is_err());assert!(c.try_block(&rx).is_err());
    e.mock_all_auths();c.activate(&patient,&rx);e.ledger().with_mut(|l|l.timestamp=50);assert!(!c.is_valid(&rx));
    c.block(&rx);assert_eq!(c.get_prescription(&rx).status,Status::Blocked);
    assert!(c.try_activate(&patient,&rx).is_err());
}
