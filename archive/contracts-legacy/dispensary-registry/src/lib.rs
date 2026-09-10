#![no_std]

// DispensaryRegistry — Soroban Smart Contract
// Functions: init, register_dispensary, revoke_dispensary, is_authorized,
//            transfer_admin
//
// Governs which wallets are allowed to *dispense* against a prescription
// (pharmacies / clinics). An admin authorizes dispensaries after off-chain
// license verification. Authorization is a prerequisite checked by the
// PrescriptionSoulbound and DispenseRecord contracts before any dispense.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    /// Dispensary(wallet) -> bool  (true = authorized, false = revoked)
    Dispensary(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAdmin = 3,
    DispensaryNotFound = 4,
}

const TOPIC_REGISTERED: Symbol = symbol_short!("disp_reg");
const TOPIC_REVOKED: Symbol = symbol_short!("disp_rev");

#[contract]
pub struct DispensaryRegistry;

#[contractimpl]
impl DispensaryRegistry {
    /// One-time setup: sets the governing admin address.
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Authorize a dispensary. Admin only.
    ///
    /// `admin` is passed explicitly and must sign; it is validated against the
    /// stored admin address to prevent a non-admin caller from self-authorizing.
    pub fn register_dispensary(
        env: Env,
        admin: Address,
        dispensary: Address,
    ) -> Result<(), Error> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .persistent()
            .set(&DataKey::Dispensary(dispensary.clone()), &true);
        env.events().publish((TOPIC_REGISTERED, dispensary), ());
        Ok(())
    }

    /// Revoke a dispensary's dispensing rights. Admin only.
    ///
    /// The key is kept with value `false` (not removed) so the revocation is
    /// auditable and `is_authorized` reports `false`.
    pub fn revoke_dispensary(
        env: Env,
        admin: Address,
        dispensary: Address,
    ) -> Result<(), Error> {
        Self::require_admin(&env, &admin)?;
        let key = DataKey::Dispensary(dispensary.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::DispensaryNotFound);
        }
        env.storage().persistent().set(&key, &false);
        env.events().publish((TOPIC_REVOKED, dispensary), ());
        Ok(())
    }

    /// Read-only: is this wallet currently allowed to dispense?
    /// Returns `false` for unknown wallets and for revoked dispensaries.
    pub fn is_authorized(env: Env, dispensary: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&DataKey::Dispensary(dispensary))
            .unwrap_or(false)
    }

    /// Hand the admin role to a new address. Current admin only.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) -> Result<(), Error> {
        Self::require_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }

    /// Read-only: current governing admin.
    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    // --- internal ---------------------------------------------------------

    /// Assert the passed `admin` matches the stored admin and has signed.
    fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        if stored != *admin {
            return Err(Error::NotAdmin);
        }
        admin.require_auth();
        Ok(())
    }
}
