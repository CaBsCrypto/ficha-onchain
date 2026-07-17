//! Global end-to-end scenarios for TrustLeaf — D1 deliverable.
//!
//! The heart of the product: a registered doctor issues a soulbound
//! prescription to a patient, and revoking it makes it no longer valid. These
//! tests deploy the *real* DoctorRegistry and PrescriptionSoulbound contracts
//! (no stubs) and wire them exactly as production does — PrescriptionSoulbound
//! gates minting on the DoctorRegistry via a real cross-contract call.

use doctor_registry::{DoctorRegistry, DoctorRegistryClient};
use prescription_soulbound::{PrescriptionSoulbound, PrescriptionSoulboundClient, Status};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

/// Far enough ahead that nothing expires mid-test; the test ledger starts at 0.
const NEVER: u64 = 999_999_999;

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

    // PrescriptionSoulbound, wired to that registry at construction. The
    // dispensary registry is out of scope for these scenarios, so it gets a
    // placeholder — nothing below dispenses.
    let dispensary_id = Address::generate(&env);
    let rx_id = env.register(
        PrescriptionSoulbound,
        (admin.clone(), dreg_id.clone(), dispensary_id),
    );

    E2E {
        env,
        doctor,
        patient,
        dreg_id,
        rx_id,
    }
}

/// Issues a prescription from the wired doctor. `seed` just varies the rx hash.
fn issue(w: &E2E, rx: &PrescriptionSoulboundClient, seed: u8) -> u64 {
    rx.mint_prescription(
        &w.doctor,
        &w.patient,
        &BytesN::from_array(&w.env, &[seed; 32]),
        &String::from_str(&w.env, "Amoxicilina"),
        &String::from_str(&w.env, "500mg cada 8h"),
        &10u32,
        &NEVER,
    )
}

#[test]
fn test_e2e_issue_activate_then_revoke() {
    // Registered doctor → issues → patient holds it → activated → revoked →
    // no longer valid.
    let w = deploy();
    let rx = PrescriptionSoulboundClient::new(&w.env, &w.rx_id);

    let id = issue(&w, &rx, 1);
    let issued = rx.get_prescription(&id);
    assert_eq!(issued.status, Status::Registered); // issuing alone is not dispensable
    assert_eq!(issued.doctor_wallet, w.doctor);
    assert_eq!(issued.patient_wallet, w.patient);
    assert!(!rx.is_valid(&id));

    // Soulbound: the prescription is bound to the patient's wallet.
    assert_eq!(rx.get_prescriptions_by_patient(&w.patient).len(), 1);

    // Activated — the state a pharmacy honors.
    rx.activate(&w.patient, &id);
    assert_eq!(rx.get_prescription(&id).status, Status::Active);
    assert!(rx.is_valid(&id));

    // The doctor revokes it.
    rx.revoke(&w.doctor, &id);
    assert_eq!(rx.get_prescription(&id).status, Status::Revoked);
    assert!(!rx.is_valid(&id));

    // Terminal: a pharmacy scan sees `Revoked`, and the record cannot be acted
    // on again.
    assert_eq!(
        rx.try_revoke(&w.doctor, &id),
        Err(Ok(prescription_soulbound::Error::AlreadyRevoked))
    );
}

#[test]
fn test_e2e_registry_gates_issuance() {
    // The DoctorRegistry authorization is enforced live at mint time: once a
    // doctor's license is revoked in the registry, they can no longer issue.
    let w = deploy();
    let rx = PrescriptionSoulboundClient::new(&w.env, &w.rx_id);
    let dreg = DoctorRegistryClient::new(&w.env, &w.dreg_id);

    // While authorized, the doctor can issue.
    let id = issue(&w, &rx, 2);
    assert_eq!(rx.get_prescription(&id).status, Status::Registered);

    // Admin revokes the doctor's license in the registry.
    dreg.revoke_doctor(&w.doctor);
    assert!(!dreg.is_authorized(&w.doctor));

    // The now-unauthorized doctor can no longer issue. Nothing about the
    // signature changed — only the registry's answer — so this is the
    // cross-contract call doing its job.
    assert_eq!(
        rx.try_mint_prescription(
            &w.doctor,
            &w.patient,
            &BytesN::from_array(&w.env, &[3u8; 32]),
            &String::from_str(&w.env, "Amoxicilina"),
            &String::from_str(&w.env, "500mg cada 8h"),
            &10u32,
            &NEVER,
        ),
        Err(Ok(prescription_soulbound::Error::Unauthorized))
    );

    // What the doctor issued while authorized survives: losing a licence does
    // not retroactively void prescriptions a patient already holds.
    assert_eq!(rx.get_prescription(&id).status, Status::Registered);
}

#[test]
fn test_e2e_unregistered_doctor_cannot_issue() {
    // A wallet that never appeared in the registry cannot mint, however valid
    // its signature. `mock_all_auths` means require_auth passes — the registry
    // is the only thing between an impostor and a prescription.
    let w = deploy();
    let rx = PrescriptionSoulboundClient::new(&w.env, &w.rx_id);
    let impostor = Address::generate(&w.env);

    assert_eq!(
        rx.try_mint_prescription(
            &impostor,
            &w.patient,
            &BytesN::from_array(&w.env, &[4u8; 32]),
            &String::from_str(&w.env, "Amoxicilina"),
            &String::from_str(&w.env, "500mg cada 8h"),
            &10u32,
            &NEVER,
        ),
        Err(Ok(prescription_soulbound::Error::Unauthorized))
    );
}
