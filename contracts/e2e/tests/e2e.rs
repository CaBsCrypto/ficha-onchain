//! Global end-to-end scenarios for TrustLeaf — D1 deliverable.
//!
//! The heart of the product: a registered doctor issues a soulbound
//! prescription to a patient, and revoking it makes it no longer valid. These
//! tests deploy the *real* DoctorRegistry and PrescriptionSoulbound contracts
//! (no stubs) and wire them exactly as production would — PrescriptionSoulbound
//! gates minting on the DoctorRegistry via a real cross-contract call.

use doctor_registry::{DoctorRegistry, DoctorRegistryClient};
use prescription_soulbound::{PrescriptionSoulbound, PrescriptionSoulboundClient, Status};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

/// A wired TrustLeaf deployment with one authorized doctor. Holds only owned
/// handles; clients are rebuilt per test to avoid tying the struct to a borrow.
struct E2E {
    env: Env,
    doctor: Address,
    patient: Address,
    dreg_id: Address,
    rx_id: Address,
}

/// Deploy DoctorRegistry + PrescriptionSoulbound, wire them, and authorize one
/// doctor — the common preamble.
fn deploy() -> E2E {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let doctor = Address::generate(&env);
    let patient = Address::generate(&env);

    // DoctorRegistry: authorize the prescriber.
    let dreg_id = env.register(DoctorRegistry, ());
    let dreg = DoctorRegistryClient::new(&env, &dreg_id);
    dreg.init(&admin);
    dreg.register_doctor(
        &doctor,
        &String::from_str(&env, "Dr. Bob Reyes"),
        &String::from_str(&env, "MED-CR-9001"),
    );
    assert!(dreg.is_authorized(&doctor));

    // PrescriptionSoulbound: wired to the DoctorRegistry.
    let rx_id = env.register(PrescriptionSoulbound, ());
    PrescriptionSoulboundClient::new(&env, &rx_id).init(&dreg_id);

    E2E {
        env,
        doctor,
        patient,
        dreg_id,
        rx_id,
    }
}

#[test]
fn test_e2e_issue_then_revoke() {
    // Registered doctor → issues prescription → patient receives it → doctor
    // revokes it → it is no longer valid.
    let w = deploy();
    let rx = PrescriptionSoulboundClient::new(&w.env, &w.rx_id);
    let hash = BytesN::from_array(&w.env, &[1u8; 32]);

    // Doctor issues a soulbound prescription bound to the patient.
    let id = rx.mint_prescription(&w.doctor, &w.patient, &hash);
    let issued = rx.get_prescription(&id);
    assert_eq!(issued.status, Status::Active); // the state a pharmacy honors
    assert_eq!(issued.doctor_wallet, w.doctor);
    assert_eq!(issued.patient_wallet, w.patient);

    // Doctor revokes it.
    rx.revoke_prescription(&id);
    assert_eq!(rx.get_prescription(&id).status, Status::Revoked);

    // No longer valid: a pharmacy scan sees `Revoked`, and the terminal record
    // cannot be acted on again.
    assert_eq!(
        rx.try_revoke_prescription(&id),
        Err(Ok(prescription_soulbound::Error::AlreadyFinalized))
    );
}

#[test]
fn test_e2e_registry_gates_issuance() {
    // The DoctorRegistry authorization is enforced live at mint time: once a
    // doctor's license is revoked in the registry, they can no longer issue.
    let w = deploy();
    let rx = PrescriptionSoulboundClient::new(&w.env, &w.rx_id);
    let dreg = DoctorRegistryClient::new(&w.env, &w.dreg_id);
    let hash = BytesN::from_array(&w.env, &[2u8; 32]);

    // While authorized, the doctor can issue.
    let id = rx.mint_prescription(&w.doctor, &w.patient, &hash);
    assert_eq!(rx.get_prescription(&id).status, Status::Active);

    // Admin revokes the doctor's license in the registry.
    dreg.revoke_doctor(&w.doctor);
    assert!(!dreg.is_authorized(&w.doctor));

    // The now-unauthorized doctor can no longer issue new prescriptions.
    assert_eq!(
        rx.try_mint_prescription(&w.doctor, &w.patient, &hash),
        Err(Ok(prescription_soulbound::Error::DoctorNotAuthorized))
    );
}
