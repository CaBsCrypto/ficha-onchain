#![cfg(test)]
// Unit tests for DocumentSoulbound contract.
// Full integration tests (cross-contract) live in contracts/e2e.

extern crate std;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

use crate::{DocumentSoulbound, DocumentSoulboundClient, DocType, DocStatus, Error};

fn setup(env: &Env) -> (Address, Address, DocumentSoulboundClient<'_>) {
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let contract_id = env.register(DocumentSoulbound, ());
    let client = DocumentSoulboundClient::new(&env, &contract_id);
    (issuer, recipient, client)
}

fn dummy_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

#[test]
fn mint_and_get() {
    let env = Env::default();
    let (issuer, recipient, client) = setup(&env);
    let hash = dummy_hash(&env);
    let id = client
        .mint_document(&issuer, &recipient, &DocType::LaborRest, &hash, &0u64);
    assert_eq!(id, 1);
    let doc = client.get_document(&id);
    assert_eq!(doc.id, 1);
    assert_eq!(doc.doc_type, DocType::LaborRest);
    assert_eq!(doc.status, DocStatus::Active);
    assert_eq!(doc.expires_at, 0);
}

#[test]
fn mint_all_types() {
    let env = Env::default();
    let (issuer, recipient, client) = setup(&env);
    let hash = dummy_hash(&env);
    let types = [
        DocType::LaborRest,
        DocType::LaborFitness,
        DocType::Disability,
        DocType::MedicalLicense,
        DocType::DegreeTitle,
        DocType::ProfCredential,
        DocType::PsychCare,
        DocType::PsychEval,
        DocType::TreatmentDischarge,
    ];
    for (i, dt) in types.iter().enumerate() {
        let id = client
            .mint_document(&issuer, &recipient, dt, &hash, &0u64);
        assert_eq!(id, (i as u64) + 1);
    }
}

#[test]
fn revoke() {
    let env = Env::default();
    let (issuer, recipient, client) = setup(&env);
    let hash = dummy_hash(&env);
    let id = client
        .mint_document(&issuer, &recipient, &DocType::PsychCare, &hash, &0u64);
    client.revoke_document(&id);
    let doc = client.get_document(&id);
    assert_eq!(doc.status, DocStatus::Revoked);
}

#[test]
fn revoke_already_revoked_errors() {
    let env = Env::default();
    let (issuer, recipient, client) = setup(&env);
    let hash = dummy_hash(&env);
    let id = client
        .mint_document(&issuer, &recipient, &DocType::Disability, &hash, &0u64);
    client.revoke_document(&id);
    assert_eq!(client.try_revoke_document(&id), Err(Ok(Error::AlreadyFinalized)));
}

#[test]
fn get_not_found_errors() {
    let env = Env::default();
    let (_issuer, _recipient, client) = setup(&env);
    assert!(matches!(client.try_get_document(&999u64), Err(Ok(Error::NotFound))));
}

#[test]
fn counter_increments() {
    let env = Env::default();
    let (issuer, recipient, client) = setup(&env);
    let hash = dummy_hash(&env);
    for expected in 1u64..=5 {
        let id = client
            .mint_document(&issuer, &recipient, &DocType::DegreeTitle, &hash, &0u64);
        assert_eq!(id, expected);
    }
}
