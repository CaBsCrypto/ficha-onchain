#![no_std]

// DoctorRegistry — Soroban Smart Contract
// Functions: init, register_doctor, revoke_doctor, is_authorized, get_doctor,
//            transfer_admin, get_admin,
//            grant_permission, revoke_permission, has_permission, get_permissions
//
// Governs which wallets are allowed to issue prescriptions and which specialised
// permissions they hold (e.g. cannabis prescribing, mental-health documents).
// An admin (the clinic / medical authority) authorizes doctors after verifying
// their national medical license off-chain.
//
// Permission model
// ─────────────────
// Permissions are stored as Vec<Symbol> keyed by doctor wallet, independently
// of the Doctor record. Any Symbol string can be granted, making the set
// extensible without a redeploy. Two well-known constants are pre-declared for
// documentation purposes: PERM_CANNABIS and PERM_MNT_HLTH.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String,
    Symbol, Vec,
};

#[cfg(test)]
mod test;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    /// Doctor(wallet) -> Doctor struct
    Doctor(Address),
    /// Permissions(wallet) -> Vec<Symbol>
    Permissions(Address),
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct Doctor {
    pub wallet: Address,
    pub full_name: String,
    pub license_id: String,
    pub authorized: bool,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    DoctorNotFound = 4,
}

// ---------------------------------------------------------------------------
// Well-known permission constants (extensible: grant_permission accepts any Symbol)
// ---------------------------------------------------------------------------

/// Cannabis prescribing clearance.
pub const PERM_CANNABIS: Symbol = symbol_short!("CANNABIS");
/// Mental-health document issuance clearance.
pub const PERM_MNT_HLTH: Symbol = symbol_short!("MNT_HLTH");

// ---------------------------------------------------------------------------
// Event topics
// ---------------------------------------------------------------------------

const TOPIC_REGISTERED: Symbol = symbol_short!("doc_reg");
const TOPIC_REVOKED: Symbol = symbol_short!("doc_rev");

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct DoctorRegistry;

#[contractimpl]
impl DoctorRegistry {
    // == Lifecycle ============================================================

    /// One-time setup: sets the governing admin address.
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    // == Doctor management ====================================================

    /// Authorize a doctor after off-chain license verification. Admin only.
    /// Permissions are managed separately via grant_permission / revoke_permission.
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
        env.storage()
            .persistent()
            .set(&DataKey::Doctor(wallet.clone()), &doctor);
        env.events()
            .publish((TOPIC_REGISTERED, wallet), doctor.license_id);
        Ok(())
    }

    /// Revoke a doctor's prescribing rights. Admin only.
    ///
    /// The record is kept (not deleted) with `authorized = false` so that the
    /// revocation is auditable on-chain. Permissions are NOT automatically
    /// cleared -- they can be inspected post-revocation for audit purposes.
    pub fn revoke_doctor(env: Env, wallet: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        let key = DataKey::Doctor(wallet.clone());
        let mut doctor: Doctor = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::DoctorNotFound)?;
        doctor.authorized = false;
        env.storage().persistent().set(&key, &doctor);
        env.events().publish((TOPIC_REVOKED, wallet), ());
        Ok(())
    }

    /// Read-only: is this wallet currently allowed to prescribe?
    /// Returns `false` for unknown wallets and for revoked doctors.
    pub fn is_authorized(env: Env, wallet: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, Doctor>(&DataKey::Doctor(wallet))
            .map(|d| d.authorized)
            .unwrap_or(false)
    }

    /// Read-only fetch of the full doctor record.
    pub fn get_doctor(env: Env, wallet: Address) -> Result<Doctor, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Doctor(wallet))
            .ok_or(Error::DoctorNotFound)
    }

    // == Admin management =====================================================

    /// Hand the admin role to a new address. Current admin only.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
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

    // == Permission system ====================================================

    /// Grant a named permission to a registered doctor. Admin only.
    ///
    /// Idempotent: granting a permission already held is a no-op.
    /// Any Symbol may be used; PERM_CANNABIS and PERM_MNT_HLTH are the
    /// pre-declared well-known values.
    pub fn grant_permission(
        env: Env,
        doctor_wallet: Address,
        permission: Symbol,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;
        let key = DataKey::Permissions(doctor_wallet);
        let mut perms: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        if !Self::sym_vec_contains(&perms, &permission) {
            perms.push_back(permission);
            env.storage().persistent().set(&key, &perms);
        }
        Ok(())
    }

    /// Remove a specific permission from a doctor's permission set. Admin only.
    ///
    /// Idempotent: revoking a permission not held is a no-op.
    pub fn revoke_permission(
        env: Env,
        doctor_wallet: Address,
        permission: Symbol,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;
        let key = DataKey::Permissions(doctor_wallet);
        let perms: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        let mut new_perms: Vec<Symbol> = Vec::new(&env);
        for i in 0..perms.len() {
            if let Some(p) = perms.get(i) {
                if p != permission {
                    new_perms.push_back(p);
                }
            }
        }
        env.storage().persistent().set(&key, &new_perms);
        Ok(())
    }

    /// Read-only: does this doctor hold the given permission?
    /// Returns `false` for unknown wallets or ungranted permissions.
    pub fn has_permission(env: Env, doctor_wallet: Address, permission: Symbol) -> bool {
        let key = DataKey::Permissions(doctor_wallet);
        let perms: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        Self::sym_vec_contains(&perms, &permission)
    }

    /// Read-only: full list of permissions held by this doctor.
    /// Returns an empty Vec for unknown wallets.
    pub fn get_permissions(env: Env, doctor_wallet: Address) -> Vec<Symbol> {
        let key = DataKey::Permissions(doctor_wallet);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    // == Internal helpers =====================================================

    fn require_admin(env: &Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }

    /// Linear membership test for Vec<Symbol> (no_std compatible).
    fn sym_vec_contains(vec: &Vec<Symbol>, target: &Symbol) -> bool {
        for i in 0..vec.len() {
            if let Some(item) = vec.get(i) {
                if item == *target {
                    return true;
                }
            }
        }
        false
    }
}
