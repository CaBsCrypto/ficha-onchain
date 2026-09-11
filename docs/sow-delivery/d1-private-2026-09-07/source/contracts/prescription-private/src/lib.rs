#![no_std]
//! Private-content prescription issuance. Wallet relationships and lifecycle are public.
//! No clinical strings, quantities, URLs or document contents enter this ABI.
//! Dispensing is intentionally absent until its private authorization design is implemented.
use soroban_sdk::{contract, contractclient, contractimpl, contracttype, contracterror, symbol_short, Address, BytesN, Env};

#[contractclient(name="RegistryClient")]
pub trait Registry { fn is_authorized(e: Env, wallet: Address) -> bool; }

#[contracttype]
#[derive(Clone)]
enum Key { Admin, Registry, BookingAuthority, Booking(BytesN<32>), Counter, Rx(u64), Consent(Address, Address, BytesN<32>), Issuance(Address, BytesN<32>), Document(Address, Address, BytesN<32>) }
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BookingStatus { Active, Revoked, Consumed }
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Booking {
    pub doctor: Address,
    pub patient: Address,
    pub valid_until: u64,
    pub status: BookingStatus,
}
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status { Registered, Active, Revoked, Blocked }
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Prescription {
    pub id: u64,
    pub doctor: Address,
    pub patient: Address,
    pub commitment: BytesN<32>,
    pub schema_version: u32,
    pub issued_at: u64,
    pub expires_at: u64,
    pub status: Status,
}
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error { Unauthorized=1, Invalid=2, Missing=3, Duplicate=4, InvalidStatus=5, Expired=6, ConsentRequired=7, BookingRequired=8 }
#[contract]
pub struct PrescriptionPrivate;

fn persist(e: &Env, rx: &Prescription) {
    let key=Key::Rx(rx.id);
    e.storage().persistent().set(&key, rx);
    e.storage().persistent().extend_ttl(&key,17280,518400);
    e.storage().instance().extend_ttl(17280,518400);
}

#[contractimpl]
impl PrescriptionPrivate {
    pub fn __constructor(e: Env, admin: Address, doctor_registry: Address, booking_authority: Address) {
        e.storage().instance().set(&Key::Admin,&admin);
        e.storage().instance().set(&Key::Registry,&doctor_registry);
        e.storage().instance().set(&Key::BookingAuthority,&booking_authority);
        e.storage().instance().set(&Key::Counter,&0u64);
        e.storage().instance().extend_ttl(17280,518400);
    }
    pub fn interface_version(_e: Env) -> u32 { 2 }
    pub fn get_registry(e: Env) -> Address { e.storage().instance().get(&Key::Registry).unwrap() }
    pub fn get_admin(e: Env) -> Address { e.storage().instance().get(&Key::Admin).unwrap() }
    pub fn get_booking_authority(e: Env) -> Address { e.storage().instance().get(&Key::BookingAuthority).unwrap() }
    /// TrustLeaf attests an off-chain booking. The chain trusts this authority's
    /// validation of the booking; it cannot independently inspect the database.
    /// IDs must be random, contain no appointment/clinical data, and never be reused.
    pub fn attest_booking(e: Env, doctor: Address, patient: Address, issuance_id: BytesN<32>, valid_until: u64) -> Result<(),Error> {
        Self::get_booking_authority(e.clone()).require_auth();
        if valid_until<=e.ledger().timestamp() || issuance_id==BytesN::from_array(&e,&[0;32]) { return Err(Error::Invalid); }
        let key=Key::Booking(issuance_id.clone());
        if e.storage().persistent().has(&key) { return Err(Error::Duplicate); }
        let booking=Booking{doctor,patient,valid_until,status:BookingStatus::Active};
        e.storage().persistent().set(&key,&booking);
        e.storage().persistent().extend_ttl(&key,17280,518400);
        e.storage().instance().extend_ttl(17280,518400);
        e.events().publish((symbol_short!("booking"),),issuance_id);
        Ok(())
    }
    pub fn get_booking(e: Env, issuance_id: BytesN<32>) -> Result<Booking,Error> {
        e.storage().persistent().get(&Key::Booking(issuance_id)).ok_or(Error::Missing)
    }
    /// A confirmed cancellation prevents later minting. If mint confirms first,
    /// cancellation cannot undo that prescription: use its explicit revoke flow.
    pub fn revoke_booking(e: Env, issuance_id: BytesN<32>) -> Result<(),Error> {
        Self::get_booking_authority(e.clone()).require_auth();
        let mut booking=Self::get_booking(e.clone(),issuance_id.clone())?;
        if booking.status!=BookingStatus::Active { return Err(Error::InvalidStatus); }
        booking.status=BookingStatus::Revoked;
        let key=Key::Booking(issuance_id.clone());
        e.storage().persistent().set(&key,&booking);
        e.storage().persistent().extend_ttl(&key,17280,518400);
        e.storage().instance().extend_ttl(17280,518400);
        e.events().publish((symbol_short!("book_rev"),),issuance_id);
        Ok(())
    }
    /// Patient grants one issuance during an agreed consultation, identified by a random ID.
    /// This proves wallet authorization, not that a clinical consultation actually occurred.
    pub fn authorize_prescriber(e: Env, patient: Address, doctor: Address, issuance_id: BytesN<32>, valid_until: u64) -> Result<(),Error> {
        patient.require_auth();
        if valid_until<=e.ledger().timestamp() || issuance_id==BytesN::from_array(&e,&[0;32]) { return Err(Error::Invalid); }
        if e.storage().persistent().has(&Key::Issuance(doctor.clone(),issuance_id.clone())) { return Err(Error::Duplicate); }
        let key=Key::Consent(patient,doctor,issuance_id);
        e.storage().persistent().set(&key,&valid_until);
        e.storage().persistent().extend_ttl(&key,17280,518400);
        e.storage().instance().extend_ttl(17280,518400);
        Ok(())
    }
    pub fn revoke_consent(e: Env, patient: Address, doctor: Address, issuance_id: BytesN<32>) {
        patient.require_auth();
        e.storage().persistent().remove(&Key::Consent(patient,doctor,issuance_id));
    }
    pub fn mint_prescription(e: Env, doctor: Address, patient: Address, issuance_id: BytesN<32>, commitment: BytesN<32>, expires_at: u64) -> Result<u64,Error> {
        doctor.require_auth();
        if !matches!(RegistryClient::new(&e,&Self::get_registry(e.clone())).try_is_authorized(&doctor),Ok(Ok(true))) { return Err(Error::Unauthorized); }
        if expires_at<=e.ledger().timestamp() { return Err(Error::Expired); }
        let zero=BytesN::from_array(&e,&[0;32]);
        if commitment==zero || issuance_id==zero { return Err(Error::Invalid); }
        let consent=Key::Consent(patient.clone(),doctor.clone(),issuance_id.clone());
        let issuance=Key::Issuance(doctor.clone(),issuance_id.clone());
        let doc=Key::Document(doctor.clone(),patient.clone(),commitment.clone());
        if e.storage().persistent().has(&issuance)||e.storage().persistent().has(&doc) { return Err(Error::Duplicate); }
        let consent_until: u64=e.storage().persistent().get(&consent).unwrap_or(0);
        if consent_until<=e.ledger().timestamp() { return Err(Error::ConsentRequired); }
        let booking_key=Key::Booking(issuance_id);
        let mut booking: Booking=e.storage().persistent().get(&booking_key).ok_or(Error::BookingRequired)?;
        if booking.status!=BookingStatus::Active || booking.valid_until<=e.ledger().timestamp() || booking.doctor!=doctor || booking.patient!=patient { return Err(Error::BookingRequired); }
        let counter: u64=e.storage().instance().get(&Key::Counter).unwrap();
        let id=counter.checked_add(1).ok_or(Error::Invalid)?;
        let rx=Prescription{id,doctor,patient,commitment,schema_version:1,issued_at:e.ledger().timestamp(),expires_at,status:Status::Registered};
        persist(&e,&rx);
        e.storage().persistent().remove(&consent);
        booking.status=BookingStatus::Consumed;
        e.storage().persistent().set(&booking_key,&booking);
        e.storage().persistent().extend_ttl(&booking_key,17280,518400);
        for key in [issuance,doc] {
            e.storage().persistent().set(&key,&id);
            e.storage().persistent().extend_ttl(&key,17280,518400);
        }
        e.storage().instance().set(&Key::Counter,&id);
        e.events().publish((symbol_short!("rx_mint"),),id);
        Ok(id)
    }
    pub fn get_prescription(e: Env, id: u64) -> Result<Prescription,Error> { e.storage().persistent().get(&Key::Rx(id)).ok_or(Error::Missing) }
    pub fn activate(e: Env, caller: Address, id: u64) -> Result<(),Error> {
        caller.require_auth();let mut rx=Self::get_prescription(e.clone(),id)?;
        if caller!=rx.patient && caller!=rx.doctor { return Err(Error::Unauthorized); }
        if rx.expires_at<=e.ledger().timestamp() { return Err(Error::Expired); }
        if rx.status!=Status::Registered { return Err(Error::InvalidStatus); }
        rx.status=Status::Active;persist(&e,&rx);e.events().publish((symbol_short!("rx_active"),),id);Ok(())
    }
    pub fn revoke(e: Env, id: u64) -> Result<(),Error> {
        let mut rx=Self::get_prescription(e.clone(),id)?;rx.doctor.require_auth();
        if rx.status==Status::Revoked || rx.status==Status::Blocked { return Err(Error::InvalidStatus); }
        rx.status=Status::Revoked;persist(&e,&rx);e.events().publish((symbol_short!("rx_revoke"),),id);Ok(())
    }
    pub fn block(e: Env, id: u64) -> Result<(),Error> {
        Self::get_admin(e.clone()).require_auth();let mut rx=Self::get_prescription(e.clone(),id)?;
        if rx.status==Status::Revoked || rx.status==Status::Blocked { return Err(Error::InvalidStatus); }
        rx.status=Status::Blocked;persist(&e,&rx);e.events().publish((symbol_short!("rx_block"),),id);Ok(())
    }
    pub fn is_valid(e: Env, id: u64) -> bool {
        Self::get_prescription(e.clone(),id).map(|rx|rx.status==Status::Active&&rx.expires_at>e.ledger().timestamp()).unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
