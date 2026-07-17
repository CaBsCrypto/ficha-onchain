#![cfg(test)]
//! PrescriptionSoulbound — test suite TrustLeaf v2
//!
//! Cubre los 10 casos del ciclo de vida completo de una receta soulbound:
//!
//! 1.  Médico emite receta → `status == Registered`
//! 2.  Paciente activa receta → `status == Active`
//! 3.  Farmacia dispensa parcialmente → `PartiallyDispensed`, balance decrece
//! 4.  Farmacia dispensa todo → `Burned`, balance == 0
//! 5.  Médico revoca receta → `status == Revoked`
//! 6.  Farmacia intenta dispensar receta revocada → `Error::InvalidStatus`
//! 7.  Farmacia intenta dispensar receta vencida → `Error::Expired`
//! 8.  Llamada a mint sin firma del médico → falla por `require_auth`
//! 9.  Admin bloquea receta → `status == Blocked`
//! 10. Farmacia intenta dispensar receta bloqueada → `Error::InvalidStatus`

use super::{Error, PrescriptionSoulbound, PrescriptionSoulboundClient, Status};
use doctor_registry::{DoctorRegistry, DoctorRegistryClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, BytesN, Env, String,
};

// --- helpers -----------------------------------------------------------------

/// Hash de ejemplo (SHA-256 simulado): 32 bytes con valor 0xAB.
fn rx_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0xABu8; 32])
}

fn medication(env: &Env) -> String {
    String::from_str(env, "Amoxicilina")
}

fn dosage(env: &Env) -> String {
    String::from_str(env, "500mg capsulas")
}

/// Despliega el contrato junto a un DoctorRegistry real y retorna
/// `(client, admin, dispensary, registry)`.
///
/// El registry se despliega de verdad — no una address generada — porque
/// `mint_prescription` lo consulta via cross-contract. Un doctor sólo puede
/// emitir si está registrado ahí: ver `authorized_doctor`.
fn setup(
    env: &Env,
) -> (
    PrescriptionSoulboundClient,
    Address,
    Address,
    DoctorRegistryClient,
) {
    let admin = Address::generate(env);

    let registry_id = env.register(DoctorRegistry, ());
    let registry = DoctorRegistryClient::new(env, &registry_id);
    registry.init(&admin);

    let dispensary_registry = Address::generate(env);
    let contract_id = env.register(
        PrescriptionSoulbound,
        (admin.clone(), registry_id, dispensary_registry),
    );
    let client = PrescriptionSoulboundClient::new(env, &contract_id);
    let dispensary = Address::generate(env);
    (client, admin, dispensary, registry)
}

/// Genera un médico y lo registra, de modo que pueda emitir recetas.
///
/// Un `Address::generate` a secas ya no sirve para mintear: el contrato lo
/// rechaza con `Unauthorized`, que es justamente lo que prueba
/// `test_mint_rejects_unregistered_doctor`.
fn authorized_doctor(env: &Env, registry: &DoctorRegistryClient) -> Address {
    let doctor = Address::generate(env);
    registry.register_doctor(
        &doctor,
        &String::from_str(env, "Dra. Ana Rojas"),
        &String::from_str(env, "12345-CL"),
    );
    doctor
}

/// Emite una receta con valores por defecto: 10 unidades, vence en el futuro lejano.
fn mint_rx(
    env: &Env,
    client: &PrescriptionSoulboundClient,
    doctor: &Address,
    patient: &Address,
) -> u64 {
    client.mint_prescription(
        doctor,
        patient,
        &rx_hash(env),
        &medication(env),
        &dosage(env),
        &10u32,
        &999_999_999u64, // expires far in the future (ledger timestamp starts at 0 in tests)
    )
}

// --- tests -------------------------------------------------------------------

/// Test 1: Médico emite receta → status Registered, campos correctos.
#[test]
fn test_mint_sets_registered_status() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    assert_eq!(id, 1, "primer ID debe ser 1");

    let rx = client.get_prescription(&id);
    assert_eq!(rx.status, Status::Registered);
    assert_eq!(rx.doctor_wallet, doctor);
    assert_eq!(rx.patient_wallet, patient);
    assert_eq!(rx.units_total, 10);
    assert_eq!(rx.balance, 10);
    assert_eq!(rx.id, 1);

    // Segundo mint: contador monotónico
    let id2 = mint_rx(&env, &client, &doctor, &patient);
    assert_eq!(id2, 2);
}

/// Test 2: Paciente activa receta → Registered → Active.
#[test]
fn test_patient_activates_prescription() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    assert_eq!(client.get_prescription(&id).status, Status::Registered);

    client.activate(&patient, &id);
    assert_eq!(client.get_prescription(&id).status, Status::Active);
}

/// Test 3: Farmacia dispensa parcialmente → PartiallyDispensed, balance decrece.
#[test]
fn test_partial_dispense() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, dispensary, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.activate(&patient, &id);

    client.dispense(&dispensary, &id, &4u32); // retira 4 de 10

    let rx = client.get_prescription(&id);
    assert_eq!(rx.status, Status::PartiallyDispensed);
    assert_eq!(rx.balance, 6);
}

/// Test 4: Farmacia dispensa todo → Burned, balance == 0.
#[test]
fn test_full_dispense_burns() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, dispensary, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.activate(&patient, &id);

    client.dispense(&dispensary, &id, &10u32); // retira todo

    let rx = client.get_prescription(&id);
    assert_eq!(rx.status, Status::Burned);
    assert_eq!(rx.balance, 0);
}

/// Test 5: Médico revoca receta activa → Revoked.
#[test]
fn test_doctor_revokes_prescription() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.activate(&patient, &id);
    assert_eq!(client.get_prescription(&id).status, Status::Active);

    client.revoke(&doctor, &id);
    assert_eq!(client.get_prescription(&id).status, Status::Revoked);
}

/// Test 6: Farmacia intenta dispensar receta revocada → Error::InvalidStatus.
#[test]
fn test_dispense_revoked_returns_invalid_status() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, dispensary, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.activate(&patient, &id);
    client.revoke(&doctor, &id);
    assert_eq!(client.get_prescription(&id).status, Status::Revoked);

    assert_eq!(
        client.try_dispense(&dispensary, &id, &1u32),
        Err(Ok(Error::InvalidStatus))
    );
}

/// Test 7: Farmacia intenta dispensar receta vencida → Error::Expired.
#[test]
fn test_dispense_expired_returns_expired() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, dispensary, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    // Emitir con expiración en timestamp 1_000 (el ledger comienza en 0)
    let id = client.mint_prescription(
        &doctor,
        &patient,
        &rx_hash(&env),
        &medication(&env),
        &dosage(&env),
        &10u32,
        &1_000u64,
    );
    client.activate(&patient, &id);

    // Avanzar el ledger más allá de la expiración
    env.ledger().with_mut(|l| {
        l.timestamp = 2_000;
    });

    assert_eq!(
        client.try_dispense(&dispensary, &id, &1u32),
        Err(Ok(Error::Expired))
    );
}

/// Test 8: Llamada a mint sin firma del médico → falla por require_auth (error de host).
#[test]
fn test_mint_without_auth_fails() {
    let env = Env::default();
    // Sin mock_all_auths: doctor_wallet.require_auth() fallará a nivel de host
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    assert!(
        client
            .try_mint_prescription(
                &doctor,
                &patient,
                &rx_hash(&env),
                &medication(&env),
                &dosage(&env),
                &10u32,
                &999_999_999u64,
            )
            .is_err(),
        "mint sin firma debe fallar"
    );
}

/// Test 9: Admin bloquea receta → status Blocked.
#[test]
fn test_admin_blocks_prescription() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.activate(&patient, &id);
    assert_eq!(client.get_prescription(&id).status, Status::Active);

    client.block(&id);
    assert_eq!(client.get_prescription(&id).status, Status::Blocked);
}

/// Test 10: Farmacia intenta dispensar receta bloqueada → Error::InvalidStatus.
#[test]
fn test_dispense_blocked_returns_invalid_status() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, dispensary, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.activate(&patient, &id);
    client.block(&id);
    assert_eq!(client.get_prescription(&id).status, Status::Blocked);

    assert_eq!(
        client.try_dispense(&dispensary, &id, &1u32),
        Err(Ok(Error::InvalidStatus))
    );
}

// --- tests adicionales (edge cases) ------------------------------------------

/// Médico puede activar una receta (no solo el paciente).
#[test]
fn test_doctor_can_also_activate() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.activate(&doctor, &id); // doctor activa en lugar del paciente
    assert_eq!(client.get_prescription(&id).status, Status::Active);
}

/// No se puede activar una receta que ya está Active.
#[test]
fn test_activate_already_active_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.activate(&patient, &id);

    assert_eq!(
        client.try_activate(&patient, &id),
        Err(Ok(Error::InvalidStatus))
    );
}

/// No se puede revocar una receta ya revocada.
#[test]
fn test_revoke_already_revoked_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);
    client.revoke(&doctor, &id);

    assert_eq!(
        client.try_revoke(&doctor, &id),
        Err(Ok(Error::AlreadyRevoked))
    );
}

/// is_valid retorna true solo para recetas Active y no expiradas.
#[test]
fn test_is_valid() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, dispensary, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    let id = mint_rx(&env, &client, &doctor, &patient);

    // Registered: no válida para dispensar
    assert!(!client.is_valid(&id));

    client.activate(&patient, &id);
    // Active y no expirada: válida
    assert!(client.is_valid(&id));

    client.dispense(&dispensary, &id, &10u32);
    // Burned: ya no válida
    assert!(!client.is_valid(&id));
}

/// get_prescriptions_by_patient retorna todas las recetas del paciente.
#[test]
fn test_get_prescriptions_by_patient() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);
    let other_patient = Address::generate(&env);

    mint_rx(&env, &client, &doctor, &patient);
    mint_rx(&env, &client, &doctor, &patient);
    mint_rx(&env, &client, &doctor, &other_patient); // no debe aparecer

    let rxs = client.get_prescriptions_by_patient(&patient);
    assert_eq!(rxs.len(), 2);

    let other_rxs = client.get_prescriptions_by_patient(&other_patient);
    assert_eq!(other_rxs.len(), 1);
}

/// Un médico que no está en el DoctorRegistry no puede emitir recetas.
///
/// Este es el control que separa una receta de un papel cualquiera: la firma
/// sólo prueba quién llama, no que tenga habilitación para prescribir. La
/// validación cross-contract vivió comentada como un TODO mientras el registry
/// existía y no lo consultaba nadie.
#[test]
fn test_mint_rejects_unregistered_doctor() {
    let env = Env::default();
    env.mock_all_auths(); // la firma es válida — igual debe rechazar
    let (client, _, _, _registry) = setup(&env);

    let impostor = Address::generate(&env); // firma bien, no está registrado
    let patient = Address::generate(&env);

    let res = client.try_mint_prescription(
        &impostor,
        &patient,
        &rx_hash(&env),
        &medication(&env),
        &dosage(&env),
        &10u32,
        &999_999_999u64,
    );
    assert_eq!(res, Err(Ok(Error::Unauthorized)));
}

/// Un médico revocado deja de poder emitir.
///
/// Registrar no es permanente: revoke_doctor tiene que cortar la emisión de
/// inmediato, o revocar a alguien no significaría nada.
#[test]
fn test_mint_rejects_revoked_doctor() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, registry) = setup(&env);

    let doctor = authorized_doctor(&env, &registry);
    let patient = Address::generate(&env);

    // Emite bien mientras está autorizado.
    mint_rx(&env, &client, &doctor, &patient);

    registry.revoke_doctor(&doctor);

    let res = client.try_mint_prescription(
        &doctor,
        &patient,
        &rx_hash(&env),
        &medication(&env),
        &dosage(&env),
        &10u32,
        &999_999_999u64,
    );
    assert_eq!(res, Err(Ok(Error::Unauthorized)));
}
