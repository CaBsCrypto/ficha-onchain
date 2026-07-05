#![no_std]

// PrescriptionSoulbound — Soroban Smart Contract
// Stores: doctor_wallet, patient_wallet, rx_hash, timestamp, status
// Functions: mint_prescription, revoke_prescription, get_prescription
//
// Each prescription is a *soulbound* record: bound to the patient wallet and
// non-transferable. It can only be issued (mint), dispensed or revoked.
// Only doctors authorized in the DoctorRegistry may mint.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, BytesN, Env,
};

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Active = 0,
    Dispensed = 1,
    Revoked = 2,
    Expired = 3,
}

#[contracttype]
#[derive(Clone)]
pub struct Prescription {
    pub id: u64,
    pub doctor_wallet: Address,
    pub patient_wallet: Address,
    /// SHA-256 hash of the encrypted FHIR MedicationRequest payload.
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
    /// that the doctor is authorized in the DoctorRegistry.
    pub fn mint_prescription(
        env: Env,
        doctor_wallet: Address,
        patient_wallet: Address,
        rx_hash: BytesN<32>,
    ) -> Result<u64, Error> {
        doctor_wallet.require_auth();

        // TODO: cross-contract call into DoctorRegistry::is_authorized(doctor)
        // let registry: Address = env.storage().instance()
        //     .get(&DataKey::Registry).ok_or(Error::NotInitialized)?;
        // let ok: bool = env.invoke_contract(&registry, &symbol_short!("is_auth"),
        //     vec![&env, doctor_wallet.to_val()]);
        // if !ok { return Err(Error::DoctorNotAuthorized); }

        let mut id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .ok_or(Error::NotInitialized)?;
        id += 1;

        let rx = Prescription {
            id,
            doctor_wallet,
            patient_wallet,
            rx_hash,
            timestamp: env.ledger().timestamp(),
            status: Status::Active,
        };
        env.storage().persistent().set(&DataKey::Prescription(id), &rx);
        env.storage().instance().set(&DataKey::Counter, &id);
        // TODO: emit `prescription_minted` event (id, doctor, patient)
        Ok(id)
    }

    /// Revoke a prescription. Only the issuing doctor may revoke.
    pub fn revoke_prescription(env: Env, id: u64) -> Result<(), Error> {
        let key = DataKey::Prescription(id);
        let mut rx: Prescription = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;

        rx.doctor_wallet.require_auth();
        if rx.status != Status::Active {
            return Err(Error::AlreadyFinalized);
        }
        rx.status = Status::Revoked;
        env.storage().persistent().set(&key, &rx);
        // TODO: emit `prescription_revoked` event
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
