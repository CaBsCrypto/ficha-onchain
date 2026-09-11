#![no_std]

// DocumentSoulbound — Soroban Smart Contract
// ---------------------------------------------------------------------------
// General-purpose on-chain document NFT for the TrustLeaf platform.
// Covers three document categories, each with specific types:
//
//   Medical Certificates  → LaborRest, LaborFitness, Disability
//   Professional Licenses → MedicalLicense, DegreeTitle, ProfCredential
//   Mental Health Certs   → PsychCare, PsychEval, TreatmentDischarge
//
// Design principles
// -----------------
//   1. SOULBOUND  — bound to the recipient wallet; non-transferable.
//   2. CONTENT HASH — only BytesN<32> SHA-256 lives on-chain; all PII and
//                     clinical details stay off-chain (FHIR-like payload).
//   3. ISSUER AUTH  — the issuer (doctor, institution) must sign (require_auth).
//                     No registry cross-call by default: this makes the contract
//                     usable for doctors, universities, and licensing boards alike.
//                     A production deployment can add an IssuerRegistry later.
//   4. OPTIONAL EXPIRY — professional licenses carry an expires_at timestamp.
//                     expires_at = 0 means "no expiry".
//
// Lifecycle
// ---------
//   mint_document(issuer, recipient, doc_type, content_hash, expires_at)
//       → Active
//   revoke_document(id)  [only issuer]
//       Active → Revoked   (terminal)
//
// Events
// ------
//   topics: ("doc_mint", issuer_wallet, recipient_wallet)  value: doc_id (u64)
//   topics: ("doc_rev",  doc_id)                           value: ()

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
    Symbol,
};

#[cfg(test)]
mod test;

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/// Nine document types across three categories.
/// C-style enum — each variant has an explicit discriminant for ABI stability.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DocType {
    // ── Medical Certificates ────────────────────────────────────────────────
    /// Reposo laboral: work-rest certificate specifying days and diagnosis.
    LaborRest = 0,
    /// Aptitud laboral: fitness-for-work certificate (apt / not apt, restrictions).
    LaborFitness = 1,
    /// Incapacidad temporal o permanente: disability certificate.
    Disability = 2,

    // ── Professional Licenses ───────────────────────────────────────────────
    /// Licencia médica: issuance or renewal of a medical license with specialty.
    MedicalLicense = 3,
    /// Certificado de título: degree certificate (doctor, psychologist, nurse…).
    DegreeTitle = 4,
    /// Credencial de habilitación profesional: professional practice credential.
    ProfCredential = 5,

    // ── Mental Health Certificates ──────────────────────────────────────────
    /// Certificado de atención psicológica: "patient is/was in treatment".
    /// Does NOT include diagnosis or sensitive clinical details.
    PsychCare = 6,
    /// Certificado de evaluación psicológica: psychological evaluation for
    /// labor, legal or administrative proceedings.
    PsychEval = 7,
    /// Alta de tratamiento psicológico: formal discharge from psychological care.
    TreatmentDischarge = 8,
}

/// Lifecycle status of a document.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DocStatus {
    /// Document is valid and verifiable. The only state third parties should honor.
    Active = 0,
    /// Cancelled by the original issuer. Terminal.
    Revoked = 1,
}

/// Core on-chain record. PII lives off-chain; only the content hash is stored.
#[contracttype]
#[derive(Clone)]
pub struct MedDocument {
    /// Monotonic document id — the soulbound token identifier.
    pub id: u64,
    /// Category + type of document.
    pub doc_type: DocType,
    /// Wallet that issued the document (doctor, institution, licensing board).
    pub issuer_wallet: Address,
    /// Wallet of the document's subject / holder.
    pub recipient_wallet: Address,
    /// SHA-256 of the canonical off-chain payload (FHIR-like JSON).
    /// Verifiers re-hash the payload and compare against this value.
    pub content_hash: BytesN<32>,
    /// Ledger unix timestamp at issuance.
    pub issued_at: u64,
    /// Ledger unix timestamp at expiry. 0 means "does not expire".
    /// Professional licenses typically set this; medical certs typically don't.
    pub expires_at: u64,
    pub status: DocStatus,
}

/// Storage key namespace.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Monotonic id counter (instance storage).
    Counter,
    /// Document(id) → MedDocument (persistent storage).
    Document(u64),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    NotIssuer = 2,
    AlreadyFinalized = 3,
    InvalidExpiry = 4,
}

// ---------------------------------------------------------------------------
// Event topics
// ---------------------------------------------------------------------------

const TOPIC_MINTED: Symbol = symbol_short!("doc_mint");
const TOPIC_REVOKED: Symbol = symbol_short!("doc_rev");

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct DocumentSoulbound;

#[contractimpl]
impl DocumentSoulbound {
    /// Issue a new document. The issuer must sign this transaction.
    ///
    /// Parameters
    /// ----------
    /// issuer_wallet    — wallet of the professional or institution minting the doc.
    /// recipient_wallet — subject / holder of the document.
    /// doc_type         — one of the nine DocType variants.
    /// content_hash     — SHA-256 of the off-chain FHIR-like payload.
    /// expires_at       — unix timestamp; 0 means "does not expire".
    ///
    /// Returns the new document id.
    pub fn mint_document(
        env: Env,
        issuer_wallet: Address,
        recipient_wallet: Address,
        doc_type: DocType,
        content_hash: BytesN<32>,
        expires_at: u64,
    ) -> Result<u64, Error> {
        // The issuer must authorize this transaction.
        issuer_wallet.require_auth();

        // Optional expiry sanity check: if set, must be in the future.
        if expires_at != 0 && expires_at <= env.ledger().timestamp() {
            return Err(Error::InvalidExpiry);
        }

        let mut counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0u64);
        counter += 1;

        let doc = MedDocument {
            id: counter,
            doc_type,
            issuer_wallet: issuer_wallet.clone(),
            recipient_wallet: recipient_wallet.clone(),
            content_hash,
            issued_at: env.ledger().timestamp(),
            expires_at,
            status: DocStatus::Active,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Document(counter), &doc);
        env.storage()
            .instance()
            .set(&DataKey::Counter, &counter);

        env.events()
            .publish((TOPIC_MINTED, issuer_wallet, recipient_wallet), counter);

        Ok(counter)
    }

    /// Revoke a document. Only the original issuer may revoke.
    /// Once revoked the document is permanently invalid.
    pub fn revoke_document(env: Env, id: u64) -> Result<(), Error> {
        let key = DataKey::Document(id);
        let mut doc: MedDocument = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;

        // Soulbound guarantee: only the issuer can revoke.
        doc.issuer_wallet.require_auth();

        if doc.status != DocStatus::Active {
            return Err(Error::AlreadyFinalized);
        }

        doc.status = DocStatus::Revoked;
        env.storage().persistent().set(&key, &doc);

        env.events().publish((TOPIC_REVOKED, id), ());

        Ok(())
    }

    /// Read-only fetch of a document for public verification (QR scan).
    pub fn get_document(env: Env, id: u64) -> Result<MedDocument, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Document(id))
            .ok_or(Error::NotFound)
    }
}
