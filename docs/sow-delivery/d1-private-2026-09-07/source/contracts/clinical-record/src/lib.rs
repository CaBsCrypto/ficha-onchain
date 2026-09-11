#![no_std]

// ClinicalRecord — Soroban Smart Contract (Phase 1)
// Functions: append_entry, grant_write_access, revoke_write_access,
//            get_entries, get_owner, has_write_access
//
// A patient-owned clinical history. THE PATIENT WALLET IS THE SOLE OWNER of
// the record and the only party that can hand out write access. Doctors,
// clinics and labs can only append to the history if the patient has granted
// them write access. Each entry anchors the SHA-256 hash of an encrypted FHIR
// resource (Observation, Condition, DiagnosticReport, ...). The plaintext
// never touches the chain.
//
// Access model
// ────────────
//   owner: Address                → the patient; set once, at deploy, by the
//                                    constructor (no separate `init` call, so
//                                    there is no init front-running window).
//   write_access: Map<Address,bool>→ wallets the patient authorized to write.
//   entries: Vec<RecordEntry>      → append-only clinical history.
//
// A wallet may append an entry iff it is the owner OR it holds
// `write_access[wallet] == true`. Only the owner can grant or revoke access.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, Map, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct RecordEntry {
    /// FHIR resource type, e.g. "Observation", "Condition".
    pub kind: soroban_sdk::String,
    /// SHA-256 hash of the encrypted FHIR payload (stored off-chain).
    pub content_hash: BytesN<32>,
    /// Owner or authorized clinic wallet that authored the entry.
    pub author: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Owner(patient) — the wallet that owns this record.
    Owner,
    /// WriteAccess -> Map<Address, bool> — wallets allowed to append entries.
    WriteAccess,
    /// Entries — append-only clinical history.
    Entries,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    /// The record has no owner set (should be impossible after deploy).
    NotInitialized = 1,
    /// The caller is neither the owner nor a granted writer.
    Unauthorized = 2,
}

#[contract]
pub struct ClinicalRecord;

#[contractimpl]
impl ClinicalRecord {
    /// Bind this record to its owning patient wallet at deploy time.
    ///
    /// Using a constructor (Soroban 22) instead of a separate `init` entry
    /// point closes the classic front-running gap where an attacker could call
    /// `init` between deploy and the owner's own `init`. The owner is fixed
    /// atomically with instantiation and an empty write-access map is seeded.
    pub fn __constructor(env: Env, owner: Address) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage()
            .persistent()
            .set(&DataKey::WriteAccess, &Map::<Address, bool>::new(&env));
    }

    /// Append a clinical entry.
    ///
    /// The `author` must sign the call AND be authorized to write: either the
    /// owner (the patient), or a wallet the owner granted write access to. Any
    /// other wallet is rejected with `Error::Unauthorized`
    /// ("unauthorized: no write access").
    pub fn append_entry(
        env: Env,
        author: Address,
        kind: soroban_sdk::String,
        content_hash: BytesN<32>,
    ) -> Result<(), Error> {
        author.require_auth();

        // Write-access check: owner writes freely; everyone else needs a grant.
        let owner = Self::owner(&env)?;
        if author != owner && Self::write_access(&env).get(author.clone()) != Some(true) {
            // unauthorized: no write access
            return Err(Error::Unauthorized);
        }

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

    /// Owner grants write access to a doctor / clinic wallet.
    ///
    /// Only the owner (patient) may call this — enforced by requiring the
    /// owner's signature.
    pub fn grant_write_access(env: Env, grantee: Address) -> Result<(), Error> {
        Self::require_owner(&env)?;
        let mut access = Self::write_access(&env);
        access.set(grantee, true);
        env.storage()
            .persistent()
            .set(&DataKey::WriteAccess, &access);
        Ok(())
    }

    /// Owner revokes a previously granted write access.
    ///
    /// The grant is flipped to `false` (kept as an auditable trail) rather than
    /// deleted; the write check treats anything other than `Some(true)` as no
    /// access. Only the owner may call this.
    pub fn revoke_write_access(env: Env, grantee: Address) -> Result<(), Error> {
        Self::require_owner(&env)?;
        let mut access = Self::write_access(&env);
        access.set(grantee, false);
        env.storage()
            .persistent()
            .set(&DataKey::WriteAccess, &access);
        Ok(())
    }

    /// Read the full history.
    ///
    /// NOTE: on Soroban the ledger is public — every entry (including the
    /// content hashes) is readable by anyone via RPC regardless of what this
    /// function does, so gating reads inside the contract would be security
    /// theater. Real confidentiality comes from the payloads being encrypted
    /// off-chain; only their hashes are anchored here. Reads are therefore left
    /// open. `has_write_access` / `get_owner` are provided for the UI to reason
    /// about permissions.
    pub fn get_entries(env: Env) -> Vec<RecordEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::Entries)
            .unwrap_or(Vec::new(&env))
    }

    /// The patient wallet that owns this record.
    pub fn get_owner(env: Env) -> Result<Address, Error> {
        Self::owner(&env)
    }

    /// Whether `who` may currently append entries (owner or granted writer).
    pub fn has_write_access(env: Env, who: Address) -> bool {
        match Self::owner(&env) {
            Ok(owner) if who == owner => true,
            Ok(_) => Self::write_access(&env).get(who) == Some(true),
            Err(_) => false,
        }
    }

    // --- internal ---------------------------------------------------------

    fn owner(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)
    }

    fn write_access(env: &Env) -> Map<Address, bool> {
        env.storage()
            .persistent()
            .get(&DataKey::WriteAccess)
            .unwrap_or(Map::new(env))
    }

    fn require_owner(env: &Env) -> Result<(), Error> {
        let owner = Self::owner(env)?;
        owner.require_auth();
        Ok(())
    }
}

#[cfg(test)]
mod test;
