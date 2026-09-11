#![no_std]

// DispenseRecord — Soroban Smart Contract
// Functions: init, record_dispense, get_record, get_records_by_rx
//
// An append-only, immutable audit log of every dispensation. Each record ties
// a dispensary, a prescription, the receiving patient, the amount and a
// timestamp together with a deterministic on-chain fingerprint. Records are
// never updated or deleted. Only dispensaries authorized in the
// DispensaryRegistry may write.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, symbol_short, Address,
    BytesN, Env, Symbol, Vec,
};

// --- external contract interface --------------------------------------------

#[contractclient(name = "DispensaryRegistryClient")]
pub trait DispensaryRegistryInterface {
    fn is_authorized(env: Env, dispensary: Address) -> bool;
}

// --- data model --------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct DispenseRecord {
    pub record_id: u64,
    pub dispensary: Address,
    pub rx_id: u64,
    pub patient: Address,
    pub amount: u32,
    pub timestamp: u64,
    /// Deterministic content fingerprint of this record. Because guest code has
    /// no access to the enclosing Stellar transaction hash, this is derived
    /// on-chain from the record fields; the relayer maps it to the real tx hash
    /// off-chain for external explorers.
    pub tx_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Address of the DispensaryRegistry contract used to gate writes.
    DispensaryRegistry,
    /// Monotonic record id counter.
    Counter,
    /// Record(record_id) -> DispenseRecord
    Record(u64),
    /// RxIndex(rx_id) -> Vec<u64>  (record ids for that prescription)
    RxIndex(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    DispensaryNotAuthorized = 3,
    NotFound = 4,
    InvalidAmount = 5,
}

const TOPIC_RECORDED: Symbol = symbol_short!("disp_rec");

#[contract]
pub struct DispenseRecordContract;

#[contractimpl]
impl DispenseRecordContract {
    /// Wire this contract to the DispensaryRegistry that authorizes writers.
    pub fn init(env: Env, dispensary_registry: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::DispensaryRegistry) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::DispensaryRegistry, &dispensary_registry);
        env.storage().instance().set(&DataKey::Counter, &0u64);
        Ok(())
    }

    /// Append an immutable dispensation record. Requires the dispensary's
    /// signature and authorization in the DispensaryRegistry. Returns the new
    /// `record_id`.
    pub fn record_dispense(
        env: Env,
        dispensary: Address,
        rx_id: u64,
        patient: Address,
        amount: u32,
        timestamp: u64,
    ) -> Result<u64, Error> {
        dispensary.require_auth();

        if amount == 0 {
            return Err(Error::InvalidAmount);
        }

        // Cross-contract: verify the dispensary is currently authorized.
        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::DispensaryRegistry)
            .ok_or(Error::NotInitialized)?;
        let client = DispensaryRegistryClient::new(&env, &registry);
        if !client.is_authorized(&dispensary) {
            return Err(Error::DispensaryNotAuthorized);
        }

        let mut record_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .ok_or(Error::NotInitialized)?;
        record_id += 1;

        let tx_hash = Self::fingerprint(&env, record_id, rx_id, amount, timestamp);
        let record = DispenseRecord {
            record_id,
            dispensary: dispensary.clone(),
            rx_id,
            patient: patient.clone(),
            amount,
            timestamp,
            tx_hash,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Record(record_id), &record);
        env.storage().instance().set(&DataKey::Counter, &record_id);

        // Maintain the per-prescription index for get_records_by_rx.
        let idx_key = DataKey::RxIndex(rx_id);
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&idx_key)
            .unwrap_or(Vec::new(&env));
        ids.push_back(record_id);
        env.storage().persistent().set(&idx_key, &ids);

        env.events()
            .publish((TOPIC_RECORDED, dispensary, rx_id), (record_id, amount));
        Ok(record_id)
    }

    /// Read-only fetch of a single record by id.
    pub fn get_record(env: Env, record_id: u64) -> Result<DispenseRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Record(record_id))
            .ok_or(Error::NotFound)
    }

    /// Read-only: all records for a given prescription, in insertion order.
    /// Returns an empty vec if the prescription has never been dispensed.
    pub fn get_records_by_rx(env: Env, rx_id: u64) -> Vec<DispenseRecord> {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::RxIndex(rx_id))
            .unwrap_or(Vec::new(&env));

        let mut out: Vec<DispenseRecord> = Vec::new(&env);
        for id in ids.iter() {
            if let Some(rec) = env
                .storage()
                .persistent()
                .get::<_, DispenseRecord>(&DataKey::Record(id))
            {
                out.push_back(rec);
            }
        }
        out
    }

    // --- internal ---------------------------------------------------------

    /// Deterministic 32-byte fingerprint of a record's identifying fields.
    /// Layout: [record_id(8) | rx_id(8) | amount(4) | timestamp(8) | zero(4)].
    fn fingerprint(
        env: &Env,
        record_id: u64,
        rx_id: u64,
        amount: u32,
        timestamp: u64,
    ) -> BytesN<32> {
        let mut buf = [0u8; 32];
        buf[0..8].copy_from_slice(&record_id.to_be_bytes());
        buf[8..16].copy_from_slice(&rx_id.to_be_bytes());
        buf[16..20].copy_from_slice(&amount.to_be_bytes());
        buf[20..28].copy_from_slice(&timestamp.to_be_bytes());
        BytesN::from_array(env, &buf)
    }
}
