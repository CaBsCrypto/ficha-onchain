#![no_std]

// PrescriptionSoulbound — Soroban Smart Contract
// Stores: doctor_wallet, patient_wallet, rx_hash, timestamp, status
// Functions: init, mint_prescription, revoke_prescription, get_prescription
//
// Each prescription is a *soulbound* record: bound to the patient wallet and
// non-transferable. It can only be issued (mint) or revoked — never
// transferred or resold. Only doctors authorized in the DoctorRegistry may mint.
//
// Lifecycle
// ---------
//   Registered ──mint_prescription──► Active ──revoke_prescription──► Revoked
//
// `Registered` is the genesis (pre-issuance) state; a prescription is written
// on-chain already `Active` at mint time. `Active` is the only state a pharmacy
// should honor. `Revoked` is terminal.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, symbol_short, Address,
    BytesN, Env, Symbol,
};

#[cfg(test)]
mod test;

// --- external contract interface (type-safe cross-contract client) -----------

#[contractclient(name = "DoctorRegistryClient")]
pub trait DoctorRegistryInterface {
    fn is_authorized(env: Env, wallet: Address) -> bool;
}

// --- data model --------------------------------------------------------------

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    /// Genesis / pre-issuance state.
    Registered = 0,
    /// Issued and valid — the state a pharmacy honors.
    Active = 1,
    /// Cancelled by the issuing doctor. Terminal.
    Revoked = 2,
}

#[contracttype]
#[derive(Clone)]
pub struct Prescription {
    pub id: u64,
    pub doctor_wallet: Address,
    pub patient_wallet: Address,
    /// SHA-256 hash of the encrypted FHIR MedicationRequest payload.
    /// Only the hash lives on-chain; PII stays off-chain.
    pub rx_hash: BytesN<32>,
    /// Ledger timestamp at issuance.
    pub timestamp: u64,
    pub status: Status,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Address of the DoctorRegistry contract used to gate minting.
    Registry,
    /// Monotonic prescription id counter.
    Counter,
    /// Prescription(id) -> Prescription
    Prescription(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    DoctorNotAuthorized = 3,
    NotFound = 4,
    NotIssuer = 5,
    AlreadyFinalized = 6,
}

const TOPIC_MINTED: Symbol = symbol_short!("rx_mint");
const TOPIC_REVOKED: Symbol = symbol_short!("rx_rev");

#[contract]
pub struct PrescriptionSoulbound;

#[contractimpl]
impl PrescriptionSoulbound {
    /// Wire this contract to the DoctorRegistry that authorizes prescribers.
    pub fn init(env: Env, registry: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Registry) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage().instance().set(&DataKey::Counter, &0u64);
        Ok(())
    }

    /// Issue a prescription to a patient. Requires the doctor's signature and
    /// that the doctor is authorized in the DoctorRegistry. The record is
    /// written already `Active`. Returns the new prescription id.
    pub fn mint_prescription(
        env: Env,
        doctor_wallet: Address,
        patient_wallet: Address,
        rx_hash: BytesN<32>,
    ) -> Result<u64, Error> {
        doctor_wallet.require_auth();

        // Cross-contract: verify the doctor is currently authorized to prescribe.
        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .ok_or(Error::NotInitialized)?;
        let client = DoctorRegistryClient::new(&env, &registry);
        if !client.is_authorized(&doctor_wallet) {
            return Err(Error::DoctorNotAuthorized);
        }

        let mut id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .ok_or(Error::NotInitialized)?;
        id += 1;

        let rx = Prescription {
            id,
            doctor_wallet: doctor_wallet.clone(),
            patient_wallet: patient_wallet.clone(),
            rx_hash,
            timestamp: env.ledger().timestamp(),
            status: Status::Active,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Prescription(id), &rx);
        env.storage().instance().set(&DataKey::Counter, &id);
        env.events()
            .publish((TOPIC_MINTED, doctor_wallet, patient_wallet), id);
        Ok(id)
    }

    /// Revoke a prescription: `Active → Revoked`. Only the issuing doctor may
    /// revoke, and only while the prescription is still `Active`.
    pub fn revoke_prescription(env: Env, id: u64) -> Result<(), Error> {
        let key = DataKey::Prescription(id);
        let mut rx: Prescription = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;

        // Soulbound: only the doctor who issued it can revoke it.
        rx.doctor_wallet.require_auth();
        if rx.status != Status::Active {
            return Err(Error::AlreadyFinalized);
        }
        rx.status = Status::Revoked;
        env.storage().persistent().set(&key, &rx);
        env.events().publish((TOPIC_REVOKED, id), ());
        Ok(())
    }

    /// Read-only fetch of a prescription for verification (pharmacy scan).
    pub fn get_prescription(env: Env, id: u64) -> Result<Prescription, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Prescription(id))
            .ok_or(Error::NotFound)
    }
}
