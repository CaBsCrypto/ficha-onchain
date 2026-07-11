#![no_std]
//! prescription-soulbound — TrustLeaf
//!
//! Recetas soulbound (no transferibles) sobre Stellar/Soroban.
//! Zero PHI on-chain: solo hashes, wallets y metadatos clínicos mínimos
//! necesarios para que la farmacia dispense correctamente.
//!
//! ## Ciclo de vida
//!
//! ```text
//!                     ┌─ dispense (parcial) ─► PartiallyDispensed ─► Burned
//! Registered ─ activate ─► Active ─┤
//!                     └─ dispense (total) ──► Burned
//!                     └─ revoke ────────────► Revoked
//! (cualquier estado no-terminal) ─ block ──► Blocked
//! ```
//!
//! ## Soulbound
//! No existe función de transferencia. La receta queda vinculada al
//! `patient_wallet` en el momento del mint y no puede cambiar de titular.
//!
//! ## Privacy
//! Los datos del paciente y el detalle clínico completo se almacenan
//! off-chain (FHIR MedicationRequest cifrado). On-chain solo vive el
//! SHA-256 (`rx_hash`) que permite verificar integridad sin revelar PII.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short,
    Address, BytesN, Env, String, Vec,
};

#[cfg(test)]
mod test;

// --- constants ---------------------------------------------------------------

/// Umbral de TTL (en ledgers) por debajo del cual se aplica el bump.
const LEDGER_THRESHOLD: u32 = 50;
/// Ledgers a los que se extiende el TTL en cada escritura.
const LEDGER_BUMP: u32 = 100;

// --- storage keys ------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Dirección del admin (futuro: DAO multisig).
    Admin,
    /// Contract address del DoctorRegistry hermano.
    DoctorRegistry,
    /// Contract address del DispensaryRegistry hermano.
    DispensaryRegistry,
    /// Contador auto-incrementado de IDs de receta.
    Counter,
    /// id → Prescription struct.
    Prescription(u64),
    /// patient_wallet → Vec<u64> de IDs de recetas del paciente.
    PrescriptionsByPatient(Address),
    /// doctor_wallet → Vec<u64> de IDs de recetas emitidas por el médico.
    PrescriptionsByDoctor(Address),
}

// --- status ------------------------------------------------------------------

/// Estado de una receta dentro del ciclo de vida (Decreto 41, MINSAL Chile).
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Status {
    /// Emitida, pendiente de activación por paciente o médico.
    Registered = 0,
    /// Activa: puede dispensarse en farmacias autorizadas.
    Active = 1,
    /// Bloqueada por el admin (ej: sospecha de fraude o error administrativo).
    Blocked = 2,
    /// Dispensación parcial: quedan unidades pendientes (retiros múltiples).
    PartiallyDispensed = 3,
    /// Completamente dispensada: `balance == 0`. Estado terminal.
    Burned = 4,
    /// Revocada por el médico emisor. Estado terminal.
    Revoked = 5,
}

// --- prescription struct -----------------------------------------------------

/// Registro mínimo on-chain requerido por la farmacia para dispensar.
/// Sin PII: el `rx_hash` es la única referencia al documento off-chain.
#[contracttype]
#[derive(Clone)]
pub struct Prescription {
    /// Identificador único auto-incrementado de la receta.
    pub id: u64,
    /// Wallet del médico emisor (debe estar en doctor-registry).
    pub doctor_wallet: Address,
    /// Wallet del paciente receptor. Soulbound: no transferible.
    pub patient_wallet: Address,
    /// SHA-256 del documento FHIR MedicationRequest completo (almacenado off-chain).
    /// Permite verificar integridad sin exponer datos del paciente.
    pub rx_hash: BytesN<32>,
    /// Nombre genérico del medicamento (DCI). Ej: "Amoxicilina".
    pub medication: String,
    /// Concentración y forma farmacéutica. Ej: "500mg cápsulas".
    pub dosage: String,
    /// Total de unidades autorizadas al momento de emisión.
    pub units_total: u32,
    /// Unidades restantes por dispensar. Decrece en cada llamada a `dispense`.
    pub balance: u32,
    /// Ledger timestamp de emisión.
    pub timestamp: u64,
    /// Ledger timestamp de expiración.
    /// Decreto 41: 30 días para fórmulas magistrales, 90 días para crónicos.
    pub expires_at: u64,
    /// Estado actual en el ciclo de vida.
    pub status: Status,
}

// --- errors ------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    /// El contrato no fue inicializado (constructor no ejecutado).
    NotInitialized = 1,
    /// El caller no tiene permisos para ejecutar esta acción.
    Unauthorized = 2,
    /// No existe una receta con el ID proporcionado.
    PrescriptionNotFound = 3,
    /// La acción no está permitida en el estado actual de la receta.
    InvalidStatus = 4,
    /// La receta ha superado su fecha de expiración.
    Expired = 5,
    /// Unidades solicitadas superan el balance disponible.
    InsufficientBalance = 6,
    /// La receta ya estaba revocada.
    AlreadyRevoked = 7,
}

// --- contract ----------------------------------------------------------------

#[contract]
pub struct PrescriptionSoulbound;

#[contractimpl]
impl PrescriptionSoulbound {
    // -------------------------------------------------------------------------
    // Constructor (Soroban SDK 22)
    // -------------------------------------------------------------------------

    /// Inicializa el contrato. Se ejecuta una única vez en el despliegue.
    /// Fija el admin y los contratos hermanos de registros.
    pub fn __constructor(
        env: Env,
        admin: Address,
        doctor_registry: Address,
        dispensary_registry: Address,
    ) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::DoctorRegistry, &doctor_registry);
        env.storage()
            .instance()
            .set(&DataKey::DispensaryRegistry, &dispensary_registry);
        env.storage().instance().set(&DataKey::Counter, &0u64);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -------------------------------------------------------------------------
    // Helpers privados
    // -------------------------------------------------------------------------

    fn load_admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn load_prescription(env: &Env, id: u64) -> Result<Prescription, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Prescription(id))
            .ok_or(Error::PrescriptionNotFound)
    }

    fn store_prescription(env: &Env, rx: &Prescription) {
        let key = DataKey::Prescription(rx.id);
        env.storage().persistent().set(&key, rx);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    /// Agrega `id` al Vec<u64> indexado por `key` en persistent storage.
    fn append_to_index(env: &Env, key: DataKey, id: u64) {
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));
        ids.push_back(id);
        env.storage().persistent().set(&key, &ids);
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    // -------------------------------------------------------------------------
    // Emisión — mint_prescription
    // -------------------------------------------------------------------------

    /// Emite una receta soulbound. Solo el médico firmante puede llamar.
    ///
    /// El médico debe tener firma válida (`require_auth`). La validación contra
    /// el DoctorRegistry se implementará via cross-contract en una versión futura.
    ///
    /// Status inicial: `Registered` (requiere activación explícita).
    ///
    /// Returns: ID único de la receta creada.
    pub fn mint_prescription(
        env: Env,
        doctor_wallet: Address,
        patient_wallet: Address,
        rx_hash: BytesN<32>,
        medication: String,
        dosage: String,
        units_total: u32,
        expires_at: u64,
    ) -> Result<u64, Error> {
        doctor_wallet.require_auth();

        // TODO: validate doctor_wallet via doctor-registry (cross-contract call)
        // let registry: Address = env.storage().instance()
        //     .get(&DataKey::DoctorRegistry).ok_or(Error::NotInitialized)?;
        // let client = DoctorRegistryClient::new(&env, &registry);
        // if !client.is_authorized(&doctor_wallet) {
        //     return Err(Error::Unauthorized);
        // }

        let mut counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .ok_or(Error::NotInitialized)?;
        counter += 1;

        let rx = Prescription {
            id: counter,
            doctor_wallet: doctor_wallet.clone(),
            patient_wallet: patient_wallet.clone(),
            rx_hash,
            medication,
            dosage,
            units_total,
            balance: units_total,
            timestamp: env.ledger().timestamp(),
            expires_at,
            status: Status::Registered,
        };

        Self::store_prescription(&env, &rx);

        Self::append_to_index(
            &env,
            DataKey::PrescriptionsByPatient(patient_wallet.clone()),
            counter,
        );
        Self::append_to_index(
            &env,
            DataKey::PrescriptionsByDoctor(doctor_wallet.clone()),
            counter,
        );

        env.storage().instance().set(&DataKey::Counter, &counter);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            (
                symbol_short!("rx_mint"),
                doctor_wallet,
                patient_wallet,
            ),
            counter,
        );

        Ok(counter)
    }

    // -------------------------------------------------------------------------
    // Activación — activate
    // -------------------------------------------------------------------------

    /// Activa una receta: `Registered → Active`.
    ///
    /// Solo el `patient_wallet` o el `doctor_wallet` emisor pueden activar.
    /// Requiere firma del `caller`.
    pub fn activate(env: Env, caller: Address, prescription_id: u64) -> Result<(), Error> {
        caller.require_auth();

        let mut rx = Self::load_prescription(&env, prescription_id)?;

        if caller != rx.patient_wallet && caller != rx.doctor_wallet {
            return Err(Error::Unauthorized);
        }

        if rx.status != Status::Registered {
            return Err(Error::InvalidStatus);
        }

        rx.status = Status::Active;
        Self::store_prescription(&env, &rx);

        Ok(())
    }

    // -------------------------------------------------------------------------
    // Dispensación — dispense
    // -------------------------------------------------------------------------

    /// Dispensa unidades de una receta activa.
    ///
    /// Solo farmacias autorizadas en `dispensary-registry` pueden llamar.
    /// La validación contra el DispensaryRegistry se implementará via
    /// cross-contract en una versión futura.
    ///
    /// Transiciones:
    /// - `Active | PartiallyDispensed → PartiallyDispensed` (si quedan unidades)
    /// - `Active | PartiallyDispensed → Burned` (si `balance` llega a 0)
    pub fn dispense(
        env: Env,
        dispensary: Address,
        prescription_id: u64,
        units: u32,
    ) -> Result<(), Error> {
        dispensary.require_auth();

        // TODO: validate dispensary via dispensary-registry (cross-contract call)
        // let registry: Address = env.storage().instance()
        //     .get(&DataKey::DispensaryRegistry).ok_or(Error::NotInitialized)?;
        // let client = DispensaryRegistryClient::new(&env, &registry);
        // if !client.is_authorized(&dispensary) {
        //     return Err(Error::Unauthorized);
        // }

        let mut rx = Self::load_prescription(&env, prescription_id)?;

        // Solo se puede dispensar si la receta está activa (con o sin retiros previos)
        if rx.status != Status::Active && rx.status != Status::PartiallyDispensed {
            return Err(Error::InvalidStatus);
        }

        // Verificar vigencia (Decreto 41)
        if env.ledger().timestamp() >= rx.expires_at {
            return Err(Error::Expired);
        }

        if rx.balance < units {
            return Err(Error::InsufficientBalance);
        }

        rx.balance -= units;
        rx.status = if rx.balance == 0 {
            Status::Burned
        } else {
            Status::PartiallyDispensed
        };

        Self::store_prescription(&env, &rx);

        env.events().publish(
            (symbol_short!("rx_disp"), dispensary),
            (prescription_id, units),
        );

        Ok(())
    }

    // -------------------------------------------------------------------------
    // Revocación — revoke
    // -------------------------------------------------------------------------

    /// Revoca una receta. Solo el médico emisor puede revocar.
    ///
    /// No se puede revocar una receta en estado `Burned` (ya dispensada
    /// completamente). Cualquier otro estado no-terminal puede revocarse.
    pub fn revoke(env: Env, doctor_wallet: Address, prescription_id: u64) -> Result<(), Error> {
        doctor_wallet.require_auth();

        let mut rx = Self::load_prescription(&env, prescription_id)?;

        if doctor_wallet != rx.doctor_wallet {
            return Err(Error::Unauthorized);
        }

        if rx.status == Status::Revoked {
            return Err(Error::AlreadyRevoked);
        }

        if rx.status == Status::Burned {
            return Err(Error::InvalidStatus);
        }

        rx.status = Status::Revoked;
        Self::store_prescription(&env, &rx);

        env.events().publish(
            (symbol_short!("rx_rev"), doctor_wallet),
            prescription_id,
        );

        Ok(())
    }

    // -------------------------------------------------------------------------
    // Bloqueo — block
    // -------------------------------------------------------------------------

    /// Bloquea una receta. Solo el admin puede ejecutar esta acción.
    ///
    /// Útil para situaciones de sospecha de fraude o errores administrativos.
    /// No se pueden bloquear estados terminales (`Burned`, `Revoked`) ni
    /// recetas ya bloqueadas.
    pub fn block(env: Env, prescription_id: u64) -> Result<(), Error> {
        let admin = Self::load_admin(&env)?;
        admin.require_auth();

        let mut rx = Self::load_prescription(&env, prescription_id)?;

        if matches!(rx.status, Status::Burned | Status::Revoked | Status::Blocked) {
            return Err(Error::InvalidStatus);
        }

        rx.status = Status::Blocked;
        Self::store_prescription(&env, &rx);

        Ok(())
    }

    // -------------------------------------------------------------------------
    // Getters (sin auth, públicos)
    // -------------------------------------------------------------------------

    /// Retorna la receta con el ID dado.
    pub fn get_prescription(env: Env, id: u64) -> Result<Prescription, Error> {
        Self::load_prescription(&env, id)
    }

    /// Retorna todas las recetas del paciente dado (lookup por índice).
    pub fn get_prescriptions_by_patient(env: Env, patient: Address) -> Vec<Prescription> {
        let key = DataKey::PrescriptionsByPatient(patient);
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        let mut result: Vec<Prescription> = Vec::new(&env);
        for id in ids.iter() {
            let rx_opt: Option<Prescription> =
                env.storage().persistent().get(&DataKey::Prescription(id));
            if let Some(rx) = rx_opt {
                result.push_back(rx);
            }
        }
        result
    }

    /// Retorna todas las recetas emitidas por el médico dado (lookup por índice).
    pub fn get_prescriptions_by_doctor(env: Env, doctor: Address) -> Vec<Prescription> {
        let key = DataKey::PrescriptionsByDoctor(doctor);
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        let mut result: Vec<Prescription> = Vec::new(&env);
        for id in ids.iter() {
            let rx_opt: Option<Prescription> =
                env.storage().persistent().get(&DataKey::Prescription(id));
            if let Some(rx) = rx_opt {
                result.push_back(rx);
            }
        }
        result
    }

    /// Retorna `true` si la receta existe, está `Active` y no ha expirado.
    /// Función de conveniencia para la farmacia (scan rápido).
    pub fn is_valid(env: Env, id: u64) -> bool {
        match Self::load_prescription(&env, id) {
            Ok(rx) => {
                rx.status == Status::Active && env.ledger().timestamp() < rx.expires_at
            }
            Err(_) => false,
        }
    }
}
