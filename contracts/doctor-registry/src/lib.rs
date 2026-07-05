#![no_std]

// DoctorRegistry — Soroban Smart Contract
// Functions: register_doctor, revoke_doctor, is_authorized, transfer_admin
//
// Governs which wallets are allowed to issue prescriptions. An admin
// (the clinic / medical authority) authorizes doctors after verifying their
// national medical license off-chain. Authorization is a prerequisite checked
// by the PrescriptionSoulbound contract before any mint.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    // Doctor(wallet) -> Doctor
    Doctor(Address),
}

#[contracttype]
#[derive(Clone)]
pub struct Doctor {
    pub wallet: Address,
    pub full_name: String,
    pub license_id: String,
    pub authorized: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    DoctorNotFound = 4,
}

#[contract]
pub struct DoctorRegistry;

#[contractimpl]
impl DoctorRegistry {
    /// One-time setup: sets the governing admin address.
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Authorize a doctor after off-chain license verification. Admin only.
    pub fn register_doctor(
        env: Env,
        wallet: Address,
        full_name: String,
        license_id: String,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;
        let doctor = Doctor {
            wallet: wallet.clone(),
            full_name,
            license_id,
            authorized: true,
        };
        env.storage().persistent().set(&DataKey::Doctor(wallet), &doctor);
        // TODO: emit `doctor_registered` event
        Ok(())
    }

    /// Revoke a doctor's prescribing rights. Admin only.
    pub fn revoke_doctor(env: Env, wallet: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        let key = DataKey::Doctor(wallet);
        let mut doctor: Doctor = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::DoctorNotFound)?;
        doctor.authorized = false;
        env.storage().persistent().set(&key, &doctor);
        // TODO: emit `doctor_revoked` event
        Ok(())
    }

    /// Read-only: is this wallet currently allowed to prescribe?
    pub fn is_authorized(env: Env, wallet: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, Doctor>(&DataKey::Doctor(wallet))
            .map(|d| d.authorized)
            .unwrap_or(false)
    }

    /// Hand the admin role to a new address. Current admin only.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }

    // --- internal ---------------------------------------------------------

    fn require_admin(env: &Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }
}
