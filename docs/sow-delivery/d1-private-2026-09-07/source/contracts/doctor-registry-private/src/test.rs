use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

#[test]
fn lifecycle_and_expiry() {
    let e=Env::default(); e.mock_all_auths(); e.ledger().with_mut(|l| l.timestamp=100);
    let a=Address::generate(&e); let w=Address::generate(&e);
    let id=e.register(DoctorRegistryPrivate,(a,)); let c=DoctorRegistryPrivateClient::new(&e,&id);
    let h=BytesN::from_array(&e,&[7;32]);
    assert!(!c.is_authorized(&w));
    assert_eq!(c.try_authorize_doctor(&w,&h,&100),Err(Ok(Error::Invalid)));
    c.authorize_doctor(&w,&h,&200); assert!(c.is_authorized(&w));
    assert_eq!(c.try_authorize_doctor(&w,&h,&200),Err(Ok(Error::Exists)));
    c.renew_authorization(&w,&h,&300); assert_eq!(c.get_authorization(&w).version,2);
    e.ledger().with_mut(|l| l.timestamp=300); assert!(!c.is_authorized(&w));
    assert_eq!(c.try_renew_authorization(&w,&h,&400),Err(Ok(Error::Invalid)));
    c.reauthorize_doctor(&w,&h,&400); assert_eq!(c.get_authorization(&w).version,3);
    c.revoke_doctor(&w); assert!(!c.is_authorized(&w));
    assert_eq!(c.try_renew_authorization(&w,&h,&500),Err(Ok(Error::Revoked)));
    c.reauthorize_doctor(&w,&h,&500); assert!(c.is_authorized(&w));
    assert_eq!(c.get_authorization(&w).version,4);
}

#[test]
fn pause_does_not_prevent_revocation() {
    let e=Env::default(); e.mock_all_auths(); let a=Address::generate(&e); let w=Address::generate(&e);
    let id=e.register(DoctorRegistryPrivate,(a,)); let c=DoctorRegistryPrivateClient::new(&e,&id);
    let h=BytesN::from_array(&e,&[9;32]);c.authorize_doctor(&w,&h,&100);
    c.pause(); assert!(!c.is_authorized(&w));
    assert_eq!(c.try_renew_authorization(&w,&h,&200),Err(Ok(Error::Paused)));
    c.revoke_doctor(&w); c.unpause(); assert!(!c.is_authorized(&w));
}

#[test]
fn administrative_writes_require_signature() {
    let e=Env::default();let a=Address::generate(&e);let w=Address::generate(&e);
    let id=e.register(DoctorRegistryPrivate,(a,));let c=DoctorRegistryPrivateClient::new(&e,&id);
    assert!(c.try_authorize_doctor(&w,&BytesN::from_array(&e,&[1;32]),&100).is_err());
    assert!(c.try_pause().is_err());assert!(c.try_propose_admin(&w).is_err());
    assert!(!c.is_authorized(&w));
}

#[test]
fn admin_transfer_requires_acceptance() {
    let e=Env::default();e.mock_all_auths();let a=Address::generate(&e);let b=Address::generate(&e);
    let id=e.register(DoctorRegistryPrivate,(a.clone(),));let c=DoctorRegistryPrivateClient::new(&e,&id);
    c.propose_admin(&b);assert_eq!(c.get_admin(),a);
    e.mock_auths(&[]);assert!(c.try_accept_admin().is_err());assert_eq!(c.get_admin(),a);
    e.mock_all_auths();c.accept_admin();assert_eq!(c.get_admin(),b);
    assert_eq!(c.try_accept_admin(),Err(Ok(Error::NoPendingAdmin)));
}
