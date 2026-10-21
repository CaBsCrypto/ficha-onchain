#![no_std]
//! Public authorization and version proofs for private clinical histories.
//! Content, keys, file locations and commitment blinding remain off-chain.
//! No upgrade, pause, owner replacement or privileged consent override exists.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, symbol_short, xdr::ToXdr,
    Address, BytesN, Env, IntoVal, Val,
};

const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 518_400;

#[contractclient(name = "RegistryClient")]
pub trait Registry {
    fn is_authorized(e: Env, wallet: Address) -> bool;
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Registry,
    History(BytesN<32>),
    Patient(Address),
    Grant(BytesN<32>, Address),
    Entry(BytesN<32>, BytesN<32>),
    Version(BytesN<32>, BytesN<32>, u32),
    Operation(Address, BytesN<32>),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct History {
    pub history_id: BytesN<32>,
    pub patient: Address,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Grant {
    pub can_read: bool,
    pub can_append: bool,
    pub revision: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PermissionChange {
    pub history_id: BytesN<32>,
    pub doctor: Address,
    pub can_read: bool,
    pub can_append: bool,
    pub expected_revision: u64,
    pub operation_id: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RecordInput {
    pub history_id: BytesN<32>,
    pub entry_id: BytesN<32>,
    pub author: Address,
    pub commitment: BytesN<32>,
    /// Zero creates an entry; otherwise must equal the entry's current head.
    pub expected_version: u32,
    /// Zero for patient-authored records; exact current revision for doctors.
    pub expected_grant_revision: u64,
    pub operation_id: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub author: Address,
    pub head_version: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RecordVersion {
    pub author: Address,
    pub commitment: BytesN<32>,
    pub previous_commitment: Option<BytesN<32>>,
    pub version: u32,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    History(History),
    Permissions(Grant),
    Version(RecordVersion),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Operation {
    pub digest: BytesN<32>,
    /// A historical receipt, not a statement that its permission is still valid.
    pub outcome: Outcome,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    Missing = 1,
    Exists = 2,
    Invalid = 3,
    Unauthorized = 4,
    PermissionRequired = 5,
    RevisionConflict = 6,
    VersionConflict = 7,
    OperationConflict = 8,
    CorruptState = 9,
}

#[contract]
pub struct ClinicalHistoryPrivate;

fn live(e: &Env) {
    e.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn touch(e: &Env, key: &Key) {
    e.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    live(e);
}

fn put<T: IntoVal<Env, Val>>(e: &Env, key: &Key, value: &T) {
    e.storage().persistent().set(key, value);
    touch(e, key);
}

fn nonzero(e: &Env, value: &BytesN<32>) -> Result<(), Error> {
    if *value == BytesN::from_array(e, &[0; 32]) {
        return Err(Error::Invalid);
    }
    Ok(())
}

fn authorized(e: &Env, doctor: &Address) -> bool {
    let registry: Address = match e.storage().instance().get(&Key::Registry) {
        Some(value) => value,
        None => return false,
    };
    matches!(
        RegistryClient::new(e, &registry).try_is_authorized(doctor),
        Ok(Ok(true))
    )
}

fn replay(
    e: &Env,
    actor: &Address,
    id: &BytesN<32>,
    digest: &BytesN<32>,
) -> Result<Option<Outcome>, Error> {
    nonzero(e, id)?;
    let key = Key::Operation(actor.clone(), id.clone());
    let op: Option<Operation> = e.storage().persistent().get(&key);
    match op {
        Some(op) => {
            if op.digest != *digest {
                return Err(Error::OperationConflict);
            }
            touch(e, &key);
            Ok(Some(op.outcome))
        }
        None => Ok(None),
    }
}

fn remember(e: &Env, actor: &Address, id: &BytesN<32>, digest: BytesN<32>, outcome: Outcome) {
    put(
        e,
        &Key::Operation(actor.clone(), id.clone()),
        &Operation { digest, outcome },
    );
}

#[contractimpl]
impl ClinicalHistoryPrivate {
    pub fn __constructor(e: Env, doctor_registry: Address) {
        e.storage().instance().set(&Key::Registry, &doctor_registry);
        live(&e);
    }

    pub fn interface_version(_e: Env) -> u32 {
        1
    }

    /// Wallets are already public. This opaque reference is bound to its owner,
    /// network and contract so another signer cannot reserve a pending ID.
    pub fn derive_history_id(e: Env, patient: Address) -> BytesN<32> {
        let payload = (
            symbol_short!("hist_id"),
            e.ledger().network_id(),
            e.current_contract_address(),
            patient,
        )
            .to_xdr(&e);
        e.crypto().sha256(&payload).into()
    }

    /// The random first operation ID supplies entropy. Subsequent corrections
    /// keep this ID but use fresh operation IDs and the expected version head.
    pub fn derive_entry_id(
        e: Env,
        history_id: BytesN<32>,
        author: Address,
        operation_id: BytesN<32>,
    ) -> BytesN<32> {
        let payload = (
            symbol_short!("entry_id"),
            e.ledger().network_id(),
            e.current_contract_address(),
            history_id,
            author,
            operation_id,
        )
            .to_xdr(&e);
        e.crypto().sha256(&payload).into()
    }

    pub fn get_registry(e: Env) -> Result<Address, Error> {
        e.storage()
            .instance()
            .get(&Key::Registry)
            .ok_or(Error::Missing)
    }

    pub fn create_history(
        e: Env,
        patient: Address,
        history_id: BytesN<32>,
        operation_id: BytesN<32>,
    ) -> Result<History, Error> {
        patient.require_auth();
        nonzero(&e, &history_id)?;
        let payload = (
            symbol_short!("create"),
            e.current_contract_address(),
            patient.clone(),
            history_id.clone(),
            operation_id.clone(),
        )
            .to_xdr(&e);
        let digest = e.crypto().sha256(&payload).into();
        if let Some(outcome) = replay(&e, &patient, &operation_id, &digest)? {
            return match outcome {
                Outcome::History(h) => Ok(h),
                _ => Err(Error::CorruptState),
            };
        }
        if history_id != Self::derive_history_id(e.clone(), patient.clone()) {
            return Err(Error::Invalid);
        }
        let history_key = Key::History(history_id.clone());
        let patient_key = Key::Patient(patient.clone());
        // Persistent archived keys cause a host restoration failure, not absence.
        // Never remove these indexes: expiry must not permit a second history.
        if e.storage().persistent().has(&history_key) || e.storage().persistent().has(&patient_key)
        {
            return Err(Error::Exists);
        }
        let history = History {
            history_id: history_id.clone(),
            patient,
            created_at: e.ledger().timestamp(),
        };
        put(&e, &history_key, &history);
        put(&e, &patient_key, &history_id);
        remember(
            &e,
            &history.patient,
            &operation_id,
            digest,
            Outcome::History(history.clone()),
        );
        e.events().publish(
            (symbol_short!("history"), history_id),
            history.patient.clone(),
        );
        Ok(history)
    }

    pub fn get_history(e: Env, history_id: BytesN<32>) -> Result<History, Error> {
        let key = Key::History(history_id);
        let history: History = e.storage().persistent().get(&key).ok_or(Error::Missing)?;
        touch(&e, &key);
        // Confirm the durable reverse index, failing closed on inconsistent state.
        let patient_key = Key::Patient(history.patient.clone());
        let indexed: BytesN<32> = e
            .storage()
            .persistent()
            .get(&patient_key)
            .ok_or(Error::CorruptState)?;
        if indexed != history.history_id {
            return Err(Error::CorruptState);
        }
        touch(&e, &patient_key);
        Ok(history)
    }

    pub fn get_history_for_patient(e: Env, patient: Address) -> Result<History, Error> {
        let id: BytesN<32> = e
            .storage()
            .persistent()
            .get(&Key::Patient(patient))
            .ok_or(Error::Missing)?;
        Self::get_history(e, id)
    }

    pub fn set_permissions(e: Env, change: PermissionChange) -> Result<Grant, Error> {
        let history = Self::get_history(e.clone(), change.history_id.clone())?;
        history.patient.require_auth();
        if history.patient == change.doctor {
            return Err(Error::Invalid);
        }
        let payload = (
            symbol_short!("grant"),
            e.current_contract_address(),
            change.clone(),
        )
            .to_xdr(&e);
        let digest = e.crypto().sha256(&payload).into();
        if let Some(outcome) = replay(&e, &history.patient, &change.operation_id, &digest)? {
            return match outcome {
                Outcome::Permissions(g) => Ok(g),
                _ => Err(Error::CorruptState),
            };
        }
        let key = Key::Grant(change.history_id.clone(), change.doctor.clone());
        let previous: Option<Grant> = e.storage().persistent().get(&key);
        let revision = previous.map(|g| g.revision).unwrap_or(0);
        if revision != change.expected_revision {
            return Err(Error::RevisionConflict);
        }
        let grant = Grant {
            can_read: change.can_read,
            can_append: change.can_append,
            revision: revision.checked_add(1).ok_or(Error::Invalid)?,
        };
        // false/false is a durable tombstone, never a deletion or revision reset.
        put(&e, &key, &grant);
        remember(
            &e,
            &history.patient,
            &change.operation_id,
            digest,
            Outcome::Permissions(grant.clone()),
        );
        e.events().publish(
            (symbol_short!("grant"), change.history_id, change.doctor),
            grant.clone(),
        );
        Ok(grant)
    }

    pub fn get_grant(e: Env, history_id: BytesN<32>, doctor: Address) -> Result<Grant, Error> {
        Self::get_history(e.clone(), history_id.clone())?;
        let key = Key::Grant(history_id, doctor);
        let grant = e.storage().persistent().get(&key).ok_or(Error::Missing)?;
        touch(&e, &key);
        Ok(grant)
    }

    /// Metadata is public. The service must call this before serving private data.
    pub fn can_read(e: Env, history_id: BytesN<32>, reader: Address) -> bool {
        let history = match Self::get_history(e.clone(), history_id.clone()) {
            Ok(h) => h,
            Err(_) => return false,
        };
        if history.patient == reader {
            return true;
        }
        authorized(&e, &reader)
            && Self::get_grant(e, history_id, reader)
                .map(|g| g.can_read)
                .unwrap_or(false)
    }

    pub fn can_append(e: Env, history_id: BytesN<32>, author: Address) -> bool {
        let history = match Self::get_history(e.clone(), history_id.clone()) {
            Ok(h) => h,
            Err(_) => return false,
        };
        if history.patient == author {
            return true;
        }
        authorized(&e, &author)
            && Self::get_grant(e, history_id, author)
                .map(|g| g.can_append)
                .unwrap_or(false)
    }

    pub fn append_version(e: Env, input: RecordInput) -> Result<RecordVersion, Error> {
        input.author.require_auth();
        nonzero(&e, &input.entry_id)?;
        nonzero(&e, &input.commitment)?;
        let history = Self::get_history(e.clone(), input.history_id.clone())?;
        let payload = (
            symbol_short!("append"),
            e.current_contract_address(),
            input.clone(),
        )
            .to_xdr(&e);
        let digest = e.crypto().sha256(&payload).into();
        if let Some(outcome) = replay(&e, &input.author, &input.operation_id, &digest)? {
            return match outcome {
                Outcome::Version(v) => Ok(v),
                _ => Err(Error::CorruptState),
            };
        }
        if input.expected_version == 0
            && input.entry_id
                != Self::derive_entry_id(
                    e.clone(),
                    input.history_id.clone(),
                    input.author.clone(),
                    input.operation_id.clone(),
                )
        {
            return Err(Error::Invalid);
        }
        if input.author == history.patient {
            if input.expected_grant_revision != 0 {
                return Err(Error::Invalid);
            }
        } else {
            if !authorized(&e, &input.author) {
                return Err(Error::Unauthorized);
            }
            let grant = Self::get_grant(e.clone(), input.history_id.clone(), input.author.clone())
                .map_err(|_| Error::PermissionRequired)?;
            if !grant.can_append {
                return Err(Error::PermissionRequired);
            }
            if grant.revision != input.expected_grant_revision {
                return Err(Error::RevisionConflict);
            }
        }
        let entry_key = Key::Entry(input.history_id.clone(), input.entry_id.clone());
        let old: Option<Entry> = e.storage().persistent().get(&entry_key);
        let previous_commitment = match old {
            Some(entry) => {
                if entry.author != input.author {
                    return Err(Error::Unauthorized);
                }
                if entry.head_version != input.expected_version {
                    return Err(Error::VersionConflict);
                }
                let previous = Self::get_version(
                    e.clone(),
                    input.history_id.clone(),
                    input.entry_id.clone(),
                    entry.head_version,
                )?;
                Some(previous.commitment)
            }
            None => {
                if input.expected_version != 0 {
                    return Err(Error::VersionConflict);
                }
                None
            }
        };
        let version = input
            .expected_version
            .checked_add(1)
            .ok_or(Error::Invalid)?;
        let version_key = Key::Version(input.history_id.clone(), input.entry_id.clone(), version);
        if e.storage().persistent().has(&version_key) {
            return Err(Error::CorruptState);
        }
        let record = RecordVersion {
            author: input.author.clone(),
            commitment: input.commitment,
            previous_commitment,
            version,
            created_at: e.ledger().timestamp(),
        };
        put(&e, &version_key, &record);
        put(
            &e,
            &entry_key,
            &Entry {
                author: input.author.clone(),
                head_version: version,
            },
        );
        remember(
            &e,
            &input.author,
            &input.operation_id,
            digest,
            Outcome::Version(record.clone()),
        );
        e.events().publish(
            (symbol_short!("version"), input.history_id, input.entry_id),
            record.clone(),
        );
        Ok(record)
    }

    pub fn get_entry(e: Env, history_id: BytesN<32>, entry_id: BytesN<32>) -> Result<Entry, Error> {
        Self::get_history(e.clone(), history_id.clone())?;
        let key = Key::Entry(history_id, entry_id);
        let entry = e.storage().persistent().get(&key).ok_or(Error::Missing)?;
        touch(&e, &key);
        Ok(entry)
    }

    pub fn get_version(
        e: Env,
        history_id: BytesN<32>,
        entry_id: BytesN<32>,
        version: u32,
    ) -> Result<RecordVersion, Error> {
        Self::get_history(e.clone(), history_id.clone())?;
        let key = Key::Version(history_id, entry_id, version);
        let record = e.storage().persistent().get(&key).ok_or(Error::Missing)?;
        touch(&e, &key);
        Ok(record)
    }

    pub fn get_operation(
        e: Env,
        actor: Address,
        operation_id: BytesN<32>,
    ) -> Result<Operation, Error> {
        let key = Key::Operation(actor, operation_id);
        let operation = e.storage().persistent().get(&key).ok_or(Error::Missing)?;
        touch(&e, &key);
        Ok(operation)
    }
}

#[cfg(test)]
mod test;
