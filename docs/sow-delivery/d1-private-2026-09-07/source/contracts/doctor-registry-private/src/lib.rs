#![no_std]
//! Private dossiers stay off-chain. Public commitments bind exact approved versions.
//! No ZK verifier or upgrade bypass is enabled. Interface and commitment schema v1.
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, symbol_short, Address, BytesN, Env};

#[contracttype]
#[derive(Clone)]
enum Key { Admin, PendingAdmin, Paused, Doctor(Address) }

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Authorization {
    pub commitment: BytesN<32>,
    pub schema_version: u32,
    pub version: u32,
    pub valid_until: u64,
    pub revoked: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error { Missing = 1, Exists = 2, Invalid = 3, Revoked = 4, Paused = 5, NotRevoked = 6, NoPendingAdmin = 7 }

#[contract]
pub struct DoctorRegistryPrivate;

fn admin(e: &Env) -> Address {
    let a: Address = e.storage().instance().get(&Key::Admin).unwrap();
    a.require_auth();
    a
}
fn live(e: &Env) {
    // Instance expiry must not reset administration: constructor cannot be rerun.
    e.storage().instance().extend_ttl(17280, 518400);
}
fn write(e: &Env, wallet: &Address, a: &Authorization) {
    let key = Key::Doctor(wallet.clone());
    e.storage().persistent().set(&key, a);
    e.storage().persistent().extend_ttl(&key, 17280, 518400);
    live(e);
    e.events().publish((symbol_short!("doc_auth"), wallet.clone()), a.clone());
}
fn validate(e: &Env, commitment: &BytesN<32>, valid_until: u64) -> Result<(), Error> {
    if e.storage().instance().get(&Key::Paused).unwrap_or(false) { return Err(Error::Paused); }
    if valid_until <= e.ledger().timestamp() || *commitment == BytesN::from_array(e, &[0;32]) { return Err(Error::Invalid); }
    Ok(())
}

#[contractimpl]
impl DoctorRegistryPrivate {
    pub fn __constructor(e: Env, admin: Address) {
        e.storage().instance().set(&Key::Admin, &admin);
        e.storage().instance().set(&Key::Paused, &false);
        live(&e);
    }
    pub fn interface_version(_e: Env) -> u32 { 1 }
    pub fn get_admin(e: Env) -> Address { e.storage().instance().get(&Key::Admin).unwrap() }
    pub fn authorize_doctor(e: Env, wallet: Address, commitment: BytesN<32>, valid_until: u64) -> Result<(), Error> {
        admin(&e); validate(&e, &commitment, valid_until)?;
        if e.storage().persistent().has(&Key::Doctor(wallet.clone())) { return Err(Error::Exists); }
        write(&e, &wallet, &Authorization { commitment, schema_version:1, version:1, valid_until, revoked:false });
        Ok(())
    }
    pub fn get_authorization(e: Env, wallet: Address) -> Result<Authorization, Error> {
        e.storage().persistent().get(&Key::Doctor(wallet)).ok_or(Error::Missing)
    }
    pub fn is_authorized(e: Env, wallet: Address) -> bool {
        if e.storage().instance().get(&Key::Paused).unwrap_or(false) { return false; }
        Self::get_authorization(e.clone(), wallet).map(|a| !a.revoked && a.valid_until > e.ledger().timestamp()).unwrap_or(false)
    }
    pub fn renew_authorization(e: Env, wallet: Address, commitment: BytesN<32>, valid_until: u64) -> Result<(), Error> {
        admin(&e); validate(&e, &commitment, valid_until)?;
        let mut a = Self::get_authorization(e.clone(), wallet.clone())?;
        if a.revoked { return Err(Error::Revoked); }
        if a.valid_until <= e.ledger().timestamp() { return Err(Error::Invalid); }
        a.commitment = commitment; a.valid_until = valid_until;
        a.version = a.version.checked_add(1).ok_or(Error::Invalid)?;
        write(&e, &wallet, &a); Ok(())
    }
    pub fn revoke_doctor(e: Env, wallet: Address) -> Result<(), Error> {
        admin(&e);
        let mut a = Self::get_authorization(e.clone(), wallet.clone())?;
        a.revoked = true; write(&e, &wallet, &a); Ok(())
    }
    pub fn reauthorize_doctor(e: Env, wallet: Address, commitment: BytesN<32>, valid_until: u64) -> Result<(), Error> {
        admin(&e); validate(&e, &commitment, valid_until)?;
        let mut a = Self::get_authorization(e.clone(), wallet.clone())?;
        if !a.revoked && a.valid_until > e.ledger().timestamp() { return Err(Error::NotRevoked); }
        a.commitment = commitment; a.valid_until = valid_until; a.revoked = false;
        a.version = a.version.checked_add(1).ok_or(Error::Invalid)?;
        write(&e, &wallet, &a); Ok(())
    }
    pub fn propose_admin(e: Env, new_admin: Address) {
        admin(&e); e.storage().instance().set(&Key::PendingAdmin, &new_admin); live(&e);
    }
    pub fn accept_admin(e: Env) -> Result<(), Error> {
        let a: Address = e.storage().instance().get(&Key::PendingAdmin).ok_or(Error::NoPendingAdmin)?;
        a.require_auth(); e.storage().instance().set(&Key::Admin, &a);
        e.storage().instance().remove(&Key::PendingAdmin); live(&e); Ok(())
    }
    pub fn pause(e: Env) { admin(&e); e.storage().instance().set(&Key::Paused, &true); live(&e); }
    pub fn unpause(e: Env) { admin(&e); e.storage().instance().set(&Key::Paused, &false); live(&e); }
}

#[cfg(test)]
mod test;
