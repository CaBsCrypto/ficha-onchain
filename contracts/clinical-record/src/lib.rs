#![no_std]

// ClinicalRecord — Soroban Smart Contract (Phase 1)
// Functions: append_entry, grant_access, revoke_access, get_entries
//
// A patient-owned clinical history. The patient wallet is the sole owner and
// controls who may read their record (doctors, clinics, labs). Each entry
// anchors the SHA-256 hash of an encrypted FHIR resource (Observation,
// Condition, DiagnosticReport, ...). The plaintext never touches the chain.
//
// This is a Phase 1 scaffold — signatures and storage layout only.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct RecordEntry {
    /// FHIR resource type, e.g. "Observation", "Condition".
    pub kind: soroban_sdk::String,
    /// SHA-256 hash of the encrypted FHIR payload (stored off-chain).
    pub content_hash: BytesN<32>,
    /// Doctor / clinic wallet that authored the entry.
    pub author: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Owner(patient) — the wallet that owns this record.
    Owner,
    /// Entries — append-only clinical history.
    Entries,
    /// Access(reader) -> bool — read grants.
    Access(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotOwner = 3,
    AccessDenied = 4,
}

#[contract]
pub struct ClinicalRecord;

#[contractimpl]
impl ClinicalRecord {
    /// Bind this record to its owning patient wallet.
    pub fn init(env: Env, patient: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Owner) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Owner, &patient);
        Ok(())
    }

    /// Append a clinical entry. Author must be a granted reader/writer.
    pub fn append_entry(
        env: Env,
        author: Address,
        kind: soroban_sdk::String,
        content_hash: BytesN<32>,
    ) -> Result<(), Error> {
        author.require_auth();
        // TODO: verify `author` has write access (owner or granted clinic).
        let mut entries: Vec<RecordEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::Entries)
            .unwrap_or(Vec::new(&env));
        entries.push_back(RecordEntry {
            kind,
            content_hash,
            author,
            timestamp: env.ledger().timestamp(),
        });
        env.storage().persistent().set(&DataKey::Entries, &entries);
        Ok(())
    }

    /// Owner grants read access to a doctor / clinic wallet.
    pub fn grant_access(env: Env, reader: Address) -> Result<(), Error> {
        Self::require_owner(&env)?;
        env.storage().persistent().set(&DataKey::Access(reader), &true);
        Ok(())
    }

    /// Owner revokes a previously granted read access.
    pub fn revoke_access(env: Env, reader: Address) -> Result<(), Error> {
        Self::require_owner(&env)?;
        env.storage().persistent().set(&DataKey::Access(reader), &false);
        Ok(())
    }

    /// Read the full history. TODO: gate by caller access grant.
    pub fn get_entries(env: Env) -> Vec<RecordEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::Entries)
            .unwrap_or(Vec::new(&env))
    }

    // --- internal ---------------------------------------------------------

    fn require_owner(env: &Env) -> Result<(), Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;
        owner.require_auth();
        Ok(())
    }
}
