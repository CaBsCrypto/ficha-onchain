# TrustLeaf — Especificación Técnica de Smart Contracts

> **Proyecto:** TrustLeaf — Plataforma de salud soberana on-chain  
> **Red:** Stellar Testnet (en camino a Mainnet)  
> **Stack:** Soroban SDK 22.0.0 · Rust · `#![no_std]`  
> **Fecha:** Julio 2026  
> **Versión de contratos:** 0.1.0

---

## Índice

1. [Visión General](#1-visión-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Tabla Resumen de Contratos](#3-tabla-resumen-de-contratos)
4. [Modelo de Seguridad](#4-modelo-de-seguridad)
5. [Especificación de Contratos](#5-especificación-de-contratos)
   - 5.1 [DoctorRegistry](#51-doctorregistry)
   - 5.2 [PrescriptionSoulbound](#52-prescriptionsoulbound)
   - 5.3 [ClinicalRecord](#53-clinicalrecord)
   - 5.4 [DocumentSoulbound](#54-documentsoulbound)
   - 5.5 [DispensaryRegistry](#55-dispensaryregistry)
   - 5.6 [DispenseRecord](#56-dispenserecord)
6. [Flujos de Interacción Cross-Contract](#6-flujos-de-interacción-cross-contract)
7. [Consideraciones de Despliegue](#7-consideraciones-de-despliegue)

---

## 1. Visión General

TrustLeaf es una plataforma de salud construida sobre Stellar/Soroban que permite a los pacientes ser los propietarios soberanos de sus datos médicos. El modelo de datos sigue tres principios fundamentales:

**Soberanía del paciente.** Ningún médico, clínica o farmacia puede escribir en la ficha clínica de un paciente sin que éste haya otorgado un permiso explícito on-chain. El paciente puede revocar ese acceso en cualquier momento, con efecto inmediato y auditable.

**Privacidad por diseño.** Ningún dato clínico sensible (diagnósticos, medicamentos, notas de evolución) toca la cadena. Únicamente el hash SHA-256 del payload cifrado se ancla on-chain. La verificación de integridad es posible sin exponer información personal.

**Credenciales no transferibles (Soulbound).** Las recetas médicas y los documentos clínicos son tokens soulbound: están vinculados al emisor y al receptor, y no pueden ser transferidos, revendidos ni cedidos.

---

## 2. Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CAPAS DE AUTORIDAD                            │
│                                                                      │
│   ┌─────────────────────┐      ┌──────────────────────────┐          │
│   │   DoctorRegistry    │      │   DispensaryRegistry     │          │
│   │  (admin → médicos)  │      │  (admin → farmacias)     │          │
│   └──────────┬──────────┘      └────────────┬─────────────┘          │
│              │ is_authorized()               │ is_authorized()        │
│              ▼                               ▼                        │
│   ┌──────────────────────┐      ┌──────────────────────────┐          │
│   │ PrescriptionSoulbound│─────►│     DispenseRecord       │          │
│   │  (recetas médicas)   │rx_id │   (log de dispensación)  │          │
│   └──────────────────────┘      └──────────────────────────┘          │
│                                                                      │
│   ┌──────────────────────┐      ┌──────────────────────────┐          │
│   │   ClinicalRecord     │      │   DocumentSoulbound      │          │
│   │ (1 por paciente,     │      │  (certificados médicos,  │          │
│   │  paciente como owner)│      │   licencias, psicología) │          │
│   └──────────────────────┘      └──────────────────────────┘          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

El sistema está organizado en dos capas funcionales:

**Registros de autoridad** (`DoctorRegistry`, `DispensaryRegistry`): actúan como listas de acceso gestionadas por un administrador (la autoridad médica o sanitaria). Son consultados vía llamadas cross-contract antes de que se puedan crear registros sensibles.

**Registros de datos clínicos** (`PrescriptionSoulbound`, `ClinicalRecord`, `DocumentSoulbound`, `DispenseRecord`): almacenan los hashes de los eventos médicos. Cada uno define su propio modelo de autorización apropiado al tipo de dato.

---

## 3. Tabla Resumen de Contratos

| Contrato | Propósito | Storage | Calls Cross-Contract | Estado en Testnet |
|---|---|---|---|---|
| `DoctorRegistry` | Lista de médicos autorizados para prescribir | Instance + Persistent | Ninguna | ✅ Desplegado |
| `PrescriptionSoulbound` | Recetas médicas no transferibles | Instance + Persistent | `DoctorRegistry::is_authorized` | ✅ Desplegado |
| `ClinicalRecord` | Ficha clínica del paciente (1 contrato por paciente) | Instance + Persistent | Ninguna | ⏳ Pendiente |
| `DocumentSoulbound` | Certificados médicos y licencias profesionales | Instance + Persistent | Ninguna | ⏳ Pendiente |
| `DispensaryRegistry` | Lista de farmacias autorizadas para dispensar | Instance + Persistent | Ninguna | ⏳ Pendiente |
| `DispenseRecord` | Log inmutable de dispensaciones | Instance + Persistent | `DispensaryRegistry::is_authorized` | ⏳ Pendiente |

**Direcciones en Testnet:**
- `DoctorRegistry`: `CAQZWTOY5L7SN6IJIO5R23DAOIK7UQDM6YSRRXE3B5XQNXDM2Q4W4ICJ`
- `PrescriptionSoulbound`: `CCACCU7JGNRL3RQGMNNM5LK27PQEDUOLJQ73QSQR5NTNJGYKOJSQFNIA`

---

## 4. Modelo de Seguridad

### 4.1 Autorización (`require_auth`)

Todos los contratos usan el mecanismo nativo de Soroban `Address::require_auth()`. Esta llamada garantiza que la transacción fue firmada por el keypair asociado a la dirección indicada, o que el contrato invocante actúa con autorización delegada. No existe ningún mecanismo de bypass interno.

Las operaciones de escritura sensibles siguen este esquema de autorización:

| Operación | Firmante requerido |
|---|---|
| Registrar / revocar médico | Admin del `DoctorRegistry` |
| Emitir receta | Médico (doctor_wallet) |
| Revocar receta | Médico emisor original |
| Emitir documento soulbound | Emisor original (issuer_wallet) |
| Revocar documento soulbound | Emisor original |
| Grant / revoke acceso a ficha clínica | Paciente (owner) |
| Añadir entrada a ficha clínica | Paciente o escritor autorizado |
| Registrar dispensación | Farmacia (dispensary) |
| Registrar / revocar farmacia | Admin del `DispensaryRegistry` |

### 4.2 Protección contra front-running en inicialización

`DoctorRegistry`, `PrescriptionSoulbound`, `DispensaryRegistry` y `DispenseRecord` utilizan un patrón `init()` con guarda `AlreadyInitialized`: si el storage de instancia ya tiene la clave de admin/registry, cualquier llamada adicional a `init()` es rechazada con error.

`ClinicalRecord` adopta una solución más sólida: usa un **constructor** de Soroban (`__constructor`), que se ejecuta atómicamente en el mismo ledger del despliegue. Esto elimina completamente la ventana entre `deploy` e `init` que un atacante podría aprovechar para apropiarse del contrato.

### 4.3 Privacidad de datos (hash-only on-chain)

Ningún contrato almacena datos clínicos en texto plano. El campo estándar es `content_hash: BytesN<32>`, un hash SHA-256 del payload cifrado que reside off-chain (formato FHIR). Esta arquitectura garantiza:

- **Confidencialidad:** incluso con acceso RPC al ledger, solo se obtienen hashes opacos.
- **Integridad verificable:** cualquier tercero puede re-calcular el SHA-256 del payload y compararlo contra el hash on-chain para detectar tampering.
- **Cumplimiento normativo:** los datos sensibles bajo regulaciones como HIPAA o GDPR nunca se escriben en storage inmutable público.

### 4.4 Modelo de revocación auditablede

Los contratos no eliminan registros revocados del storage. En su lugar:

- `DoctorRegistry`: el campo `Doctor.authorized` pasa a `false`; el registro completo permanece.
- `ClinicalRecord`: `WriteAccess[grantee]` pasa a `false`; la entrada del mapa persiste.
- `DispensaryRegistry`: `Dispensary(wallet)` pasa a `false`; la clave persiste.
- `PrescriptionSoulbound` / `DocumentSoulbound`: el campo `status` pasa a `Revoked`; el token completo permanece.

Esto garantiza que toda la historia de autorizaciones y revocaciones es legible en el ledger, lo que es esencial para auditorías regulatorias.

### 4.5 TTL y storage persistente

Soroban diferencia entre storage de instancia (metadata del contrato, TTL vinculado al contrato mismo) y storage persistente (datos con TTL independiente). Todos los registros de datos clínicos usan `storage().persistent()`, lo que permite extender su TTL de forma independiente mediante `bump_persistent`. Los contratos actuales delegan la gestión de TTL a la capa de infraestructura (relayer / backend), un patrón estándar en producción con Soroban.

---

## 5. Especificación de Contratos

---

### 5.1 DoctorRegistry

**Propósito:** Registro centralizado de médicos autorizados para emitir recetas dentro del ecosistema TrustLeaf. Un administrador (la autoridad médica) gestiona el alta y baja de médicos tras verificación off-chain de su licencia profesional. El contrato también implementa un sistema de permisos extensible para capacidades especiales (e.g., prescripción de cannabis, documentos de salud mental).

**Estado en Testnet:** `CAQZWTOY5L7SN6IJIO5R23DAOIK7UQDM6YSRRXE3B5XQNXDM2Q4W4ICJ`

#### Storage Keys (`DataKey`)

| Clave | Storage | Tipo del valor | Descripción |
|---|---|---|---|
| `Admin` | Instance | `Address` | Wallet del administrador del registro. Único, set en `init`. |
| `Doctor(Address)` | Persistent | `Doctor` | Registro completo del médico indexado por su wallet. |
| `Permissions(Address)` | Persistent | `Vec<Symbol>` | Permisos especiales del médico indexados por su wallet. |

#### Struct `Doctor`

```rust
pub struct Doctor {
    pub wallet: Address,
    pub full_name: String,
    pub license_id: String,
    pub authorized: bool,
}
```

#### Permisos predefinidos

| Constante | Symbol | Significado |
|---|---|---|
| `PERM_CANNABIS` | `"CANNABIS"` | Autorización para prescribir cannabis medicinal |
| `PERM_MNT_HLTH` | `"MNT_HLTH"` | Autorización para emitir documentos de salud mental |

El sistema de permisos es abierto: cualquier `Symbol` puede ser otorgado, sin necesidad de redeploy.

#### Funciones Públicas

**`init(env, admin: Address) → Result<(), Error>`**
Inicialización única del contrato. Establece el admin. Rechaza una segunda llamada con `AlreadyInitialized`.
- Autorización requerida: ninguna (primera llamada post-deploy).
- Errores: `AlreadyInitialized`.

**`register_doctor(env, wallet, full_name, license_id) → Result<(), Error>`**
Registra un médico como autorizado. Crea o sobreescribe el registro con `authorized = true`. Emite evento `("doc_reg", wallet) → license_id`.
- Autorización requerida: Admin.
- Errores: `NotInitialized`.

**`revoke_doctor(env, wallet) → Result<(), Error>`**
Marca el médico como `authorized = false`. El registro permanece para auditoría. Los permisos especiales no se borran. Emite evento `("doc_rev", wallet) → ()`.
- Autorización requerida: Admin.
- Errores: `NotInitialized`, `DoctorNotFound`.

**`is_authorized(env, wallet) → bool`**
Retorna `true` si el médico existe y `authorized == true`. Retorna `false` para wallets desconocidas o revocadas. Función read-only usada por `PrescriptionSoulbound` en cross-contract call.
- Autorización requerida: ninguna.

**`get_doctor(env, wallet) → Result<Doctor, Error>`**
Retorna el registro completo del médico.
- Autorización requerida: ninguna.
- Errores: `DoctorNotFound`.

**`transfer_admin(env, new_admin) → Result<(), Error>`**
Transfiere el rol de admin a otra dirección.
- Autorización requerida: Admin actual.
- Errores: `NotInitialized`.

**`get_admin(env) → Result<Address, Error>`**
Retorna el admin actual.
- Autorización requerida: ninguna.
- Errores: `NotInitialized`.

**`grant_permission(env, doctor_wallet, permission) → Result<(), Error>`**
Añade un `Symbol` al conjunto de permisos del médico. Idempotente: si ya existe, no hace nada.
- Autorización requerida: Admin.
- Errores: `NotInitialized`.

**`revoke_permission(env, doctor_wallet, permission) → Result<(), Error>`**
Elimina un `Symbol` del conjunto de permisos del médico. Idempotente.
- Autorización requerida: Admin.
- Errores: `NotInitialized`.

**`has_permission(env, doctor_wallet, permission) → bool`**
Consulta si el médico posee el permiso dado. Retorna `false` para wallets desconocidas.
- Autorización requerida: ninguna.

**`get_permissions(env, doctor_wallet) → Vec<Symbol>`**
Retorna todos los permisos del médico. Retorna `Vec` vacío para wallets desconocidas.
- Autorización requerida: ninguna.

#### Enum de Errores

| Código | Variante | Descripción |
|---|---|---|
| 1 | `NotInitialized` | El contrato no ha sido inicializado (`init` no fue llamado) |
| 2 | `AlreadyInitialized` | Se intentó llamar `init` más de una vez |
| 3 | `NotAuthorized` | El caller no es el admin |
| 4 | `DoctorNotFound` | No existe registro para esa wallet |

#### Eventos

| Topics | Valor | Cuándo |
|---|---|---|
| `("doc_reg", wallet)` | `license_id` | Al registrar un médico |
| `("doc_rev", wallet)` | `()` | Al revocar un médico |

---

### 5.2 PrescriptionSoulbound

**Propósito:** Emitir y gestionar recetas médicas como tokens no transferibles (soulbound). Cada receta vincula un médico, un paciente y el hash SHA-256 de un payload FHIR `MedicationRequest` cifrado. Solo médicos autorizados en `DoctorRegistry` pueden emitir recetas. Una vez activa, solo puede ser revocada por el médico emisor.

**Estado en Testnet:** `CCACCU7JGNRL3RQGMNNM5LK27PQEDUOLJQ73QSQR5NTNJGYKOJSQFNIA`

#### Ciclo de Vida

```
[deploy + init] ──mint_prescription──► Active ──revoke_prescription──► Revoked
```

#### Storage Keys (`DataKey`)

| Clave | Storage | Tipo del valor | Descripción |
|---|---|---|---|
| `Registry` | Instance | `Address` | Dirección del contrato `DoctorRegistry`. |
| `Counter` | Instance | `u64` | Contador monotónico de IDs de recetas. |
| `Prescription(u64)` | Persistent | `Prescription` | Receta indexada por su ID numérico. |

#### Struct `Prescription`

```rust
pub struct Prescription {
    pub id: u64,
    pub doctor_wallet: Address,
    pub patient_wallet: Address,
    pub rx_hash: BytesN<32>,   // SHA-256 del payload FHIR cifrado
    pub timestamp: u64,         // ledger timestamp en la emisión
    pub status: Status,
}
```

#### Enum `Status`

| Variante | Valor | Descripción |
|---|---|---|
| `Registered` | 0 | Estado génesis pre-emisión (no se usa directamente) |
| `Active` | 1 | Receta válida y dispensable |
| `Revoked` | 2 | Cancelada por el médico emisor. Terminal |

#### Funciones Públicas

**`init(env, registry: Address) → Result<(), Error>`**
Vincula el contrato al `DoctorRegistry` e inicializa el contador en 0.
- Autorización requerida: ninguna (primera llamada post-deploy).
- Errores: `AlreadyInitialized`.

**`mint_prescription(env, doctor_wallet, patient_wallet, rx_hash) → Result<u64, Error>`**
Emite una nueva receta. Realiza una **llamada cross-contract** a `DoctorRegistry::is_authorized(doctor_wallet)` antes de escribir. Si el médico no está autorizado, rechaza la operación. La receta se crea directamente en estado `Active`. Retorna el nuevo `id`. Emite evento `("rx_mint", doctor_wallet, patient_wallet) → id`.
- Autorización requerida: `doctor_wallet` (firma de la transacción).
- Cross-contract: `DoctorRegistry::is_authorized`.
- Errores: `NotInitialized`, `DoctorNotAuthorized`.

**`revoke_prescription(env, id) → Result<(), Error>`**
Cancela una receta activa: `Active → Revoked`. Solo el médico emisor original puede revocar. Emite evento `("rx_rev", id) → ()`.
- Autorización requerida: `doctor_wallet` del registro (el emisor original).
- Errores: `NotFound`, `AlreadyFinalized`.

**`get_prescription(env, id) → Result<Prescription, Error>`**
Retorna la receta completa para verificación (e.g., escaneo en farmacia).
- Autorización requerida: ninguna.
- Errores: `NotFound`.

#### Enum de Errores

| Código | Variante | Descripción |
|---|---|---|
| 1 | `NotInitialized` | El contrato no ha sido inicializado |
| 2 | `AlreadyInitialized` | Se intentó llamar `init` más de una vez |
| 3 | `DoctorNotAuthorized` | El médico no está registrado o fue revocado |
| 4 | `NotFound` | No existe receta con ese ID |
| 5 | `NotIssuer` | Reservado (validación adicional de emisor) |
| 6 | `AlreadyFinalized` | La receta ya está en estado `Revoked` |

#### Eventos

| Topics | Valor | Cuándo |
|---|---|---|
| `("rx_mint", doctor_wallet, patient_wallet)` | `id` | Al emitir una receta |
| `("rx_rev", id)` | `()` | Al revocar una receta |

---

### 5.3 ClinicalRecord

**Propósito:** Ficha clínica personal del paciente. Cada instancia de este contrato pertenece a un único paciente (el `owner`). Los médicos, clínicas y laboratorios pueden agregar entradas si y solo si el paciente les ha otorgado acceso de escritura explícitamente. Cada entrada ancla el hash de un recurso FHIR cifrado (Observation, Condition, DiagnosticReport, etc.).

**Estado en Testnet:** Pendiente de despliegue.

> **Patrón de despliegue:** Se despliega **una instancia por paciente**. El `owner` se fija atómicamente en el constructor, eliminando la ventana de front-running de `init`.

#### Storage Keys (`DataKey`)

| Clave | Storage | Tipo del valor | Descripción |
|---|---|---|---|
| `Owner` | Instance | `Address` | Wallet del paciente propietario. Inmutable post-despliegue. |
| `WriteAccess` | Persistent | `Map<Address, bool>` | Mapa de wallets autorizadas para escribir. `true` = activo, `false` = revocado. |
| `Entries` | Persistent | `Vec<RecordEntry>` | Historial clínico append-only. |

#### Struct `RecordEntry`

```rust
pub struct RecordEntry {
    pub kind: String,           // tipo FHIR: "Observation", "Condition", etc.
    pub content_hash: BytesN<32>, // SHA-256 del payload FHIR cifrado
    pub author: Address,          // wallet del médico/paciente que escribe
    pub timestamp: u64,           // ledger timestamp
}
```

#### Funciones Públicas

**`__constructor(env, owner: Address)`**
Constructor de Soroban (ejecutado atómicamente en el despliegue). Fija el `owner` en storage de instancia e inicializa el mapa de `WriteAccess` vacío.
- Autorización requerida: implícita en el despliegue.

**`append_entry(env, author, kind, content_hash) → Result<(), Error>`**
Añade una entrada clínica al historial. El `author` debe firmar la transacción Y estar autorizado (ser el owner, o tener `WriteAccess[author] == true`). La operación es append-only: no existe función de modificación o eliminación.
- Autorización requerida: `author` (firma) + estar en `WriteAccess` o ser el owner.
- Errores: `NotInitialized`, `Unauthorized`.

**`grant_write_access(env, grantee) → Result<(), Error>`**
El paciente autoriza a una wallet (médico, clínica) para escribir entradas.
- Autorización requerida: Owner (paciente).
- Errores: `NotInitialized`.

**`revoke_write_access(env, grantee) → Result<(), Error>`**
El paciente revoca el acceso de una wallet. El flag pasa a `false` (no se elimina del mapa, manteniendo el trail de auditoría). Efecto inmediato: el siguiente `append_entry` del wallet revocado será rechazado.
- Autorización requerida: Owner (paciente).
- Errores: `NotInitialized`.

**`get_entries(env) → Vec<RecordEntry>`**
Retorna el historial completo. Read-only, sin restricciones de acceso (los datos on-chain son públicos en Soroban; la confidencialidad real proviene del cifrado off-chain).
- Autorización requerida: ninguna.

**`get_owner(env) → Result<Address, Error>`**
Retorna la wallet del paciente propietario.
- Autorización requerida: ninguna.
- Errores: `NotInitialized`.

**`has_write_access(env, who) → bool`**
Consulta si `who` puede actualmente escribir (owner o writer con `true` en el mapa).
- Autorización requerida: ninguna.

#### Enum de Errores

| Código | Variante | Descripción |
|---|---|---|
| 1 | `NotInitialized` | El owner no está seteado (no debería ocurrir post-constructor) |
| 2 | `Unauthorized` | El caller no es owner ni tiene acceso de escritura activo |

---

### 5.4 DocumentSoulbound

**Propósito:** Contrato de propósito general para emitir documentos médicos y profesionales como tokens soulbound. Cubre nueve tipos de documentos en tres categorías: certificados médicos laborales, licencias profesionales y certificados de salud mental. El diseño no requiere cross-contract con un registro de médicos, lo que lo hace utilizable también por universidades, colegios profesionales y juntas de licencias.

**Estado en Testnet:** Pendiente de despliegue.

#### Categorías y Tipos de Documento (`DocType`)

**Certificados Médicos Laborales:**

| Variante | Valor | Descripción |
|---|---|---|
| `LaborRest` | 0 | Reposo laboral: días de reposo y diagnóstico |
| `LaborFitness` | 1 | Aptitud laboral: apto / no apto, restricciones |
| `Disability` | 2 | Incapacidad temporal o permanente |

**Licencias Profesionales:**

| Variante | Valor | Descripción |
|---|---|---|
| `MedicalLicense` | 3 | Licencia médica con especialidad |
| `DegreeTitle` | 4 | Certificado de título (médico, psicólogo, enfermero) |
| `ProfCredential` | 5 | Credencial de habilitación profesional |

**Certificados de Salud Mental:**

| Variante | Valor | Descripción |
|---|---|---|
| `PsychCare` | 6 | Constancia de atención psicológica (sin diagnóstico) |
| `PsychEval` | 7 | Evaluación psicológica para trámites laborales/legales |
| `TreatmentDischarge` | 8 | Alta de tratamiento psicológico |

Los valores discriminantes son estables para garantizar compatibilidad de ABI entre versiones del contrato.

#### Storage Keys (`DataKey`)

| Clave | Storage | Tipo del valor | Descripción |
|---|---|---|---|
| `Counter` | Instance | `u64` | Contador monotónico de IDs de documentos. |
| `Document(u64)` | Persistent | `MedDocument` | Documento indexado por ID. |

#### Struct `MedDocument`

```rust
pub struct MedDocument {
    pub id: u64,
    pub doc_type: DocType,
    pub issuer_wallet: Address,
    pub recipient_wallet: Address,
    pub content_hash: BytesN<32>,  // SHA-256 del payload FHIR-like cifrado
    pub issued_at: u64,             // ledger timestamp en emisión
    pub expires_at: u64,            // 0 = no expira; timestamp unix si expira
    pub status: DocStatus,
}
```

#### Enum `DocStatus`

| Variante | Valor | Descripción |
|---|---|---|
| `Active` | 0 | Documento válido y verificable |
| `Revoked` | 1 | Cancelado por el emisor. Terminal |

#### Funciones Públicas

**`mint_document(env, issuer_wallet, recipient_wallet, doc_type, content_hash, expires_at) → Result<u64, Error>`**
Emite un nuevo documento soulbound. Si `expires_at != 0`, valida que sea mayor al timestamp actual del ledger. Retorna el nuevo `id`. Emite evento `("doc_mint", issuer_wallet, recipient_wallet) → id`.
- Autorización requerida: `issuer_wallet` (firma).
- Errores: `InvalidExpiry`.

**`revoke_document(env, id) → Result<(), Error>`**
Cancela un documento activo: `Active → Revoked`. Solo el emisor original puede revocar. Emite evento `("doc_rev", id) → ()`.
- Autorización requerida: `issuer_wallet` del registro (emisor original).
- Errores: `NotFound`, `AlreadyFinalized`.

**`get_document(env, id) → Result<MedDocument, Error>`**
Retorna el documento completo para verificación pública (e.g., escaneo QR).
- Autorización requerida: ninguna.
- Errores: `NotFound`.

#### Enum de Errores

| Código | Variante | Descripción |
|---|---|---|
| 1 | `NotFound` | No existe documento con ese ID |
| 2 | `NotIssuer` | El caller no es el emisor original |
| 3 | `AlreadyFinalized` | El documento ya está en estado `Revoked` |
| 4 | `InvalidExpiry` | `expires_at` está en el pasado |

#### Eventos

| Topics | Valor | Cuándo |
|---|---|---|
| `("doc_mint", issuer_wallet, recipient_wallet)` | `id` | Al emitir un documento |
| `("doc_rev", id)` | `()` | Al revocar un documento |

---

### 5.5 DispensaryRegistry

**Propósito:** Registro de farmacias y dispensarios autorizados para dispensar medicamentos contra recetas TrustLeaf. Sigue el mismo patrón de administración que `DoctorRegistry`: un admin central autoriza o revoca dispensarios tras verificación off-chain de su licencia sanitaria.

**Estado en Testnet:** Pendiente de despliegue.

#### Storage Keys (`DataKey`)

| Clave | Storage | Tipo del valor | Descripción |
|---|---|---|---|
| `Admin` | Instance | `Address` | Wallet del administrador del registro. |
| `Dispensary(Address)` | Persistent | `bool` | `true` = autorizado, `false` = revocado. |

#### Funciones Públicas

**`init(env, admin: Address) → Result<(), Error>`**
Inicialización única del contrato. Establece el admin.
- Autorización requerida: ninguna (primera llamada post-deploy).
- Errores: `AlreadyInitialized`.

**`register_dispensary(env, admin, dispensary) → Result<(), Error>`**
Autoriza un dispensario. El parámetro `admin` se valida contra el admin almacenado (doble verificación: identidad + firma). Emite evento `("disp_reg", dispensary) → ()`.
- Autorización requerida: `admin` (firma) que coincida con el admin almacenado.
- Errores: `NotInitialized`, `NotAdmin`.

**`revoke_dispensary(env, admin, dispensary) → Result<(), Error>`**
Revoca un dispensario: el flag pasa a `false`. Emite evento `("disp_rev", dispensary) → ()`.
- Autorización requerida: `admin` (firma) que coincida con el admin almacenado.
- Errores: `NotInitialized`, `NotAdmin`, `DispensaryNotFound`.

**`is_authorized(env, dispensary) → bool`**
Retorna `true` si el dispensario está actualmente autorizado. Función read-only usada por `DispenseRecord` en cross-contract call.
- Autorización requerida: ninguna.

**`transfer_admin(env, admin, new_admin) → Result<(), Error>`**
Transfiere el rol de admin.
- Autorización requerida: admin actual (pasado como parámetro + firma).
- Errores: `NotInitialized`, `NotAdmin`.

**`get_admin(env) → Result<Address, Error>`**
Retorna el admin actual.
- Autorización requerida: ninguna.
- Errores: `NotInitialized`.

#### Enum de Errores

| Código | Variante | Descripción |
|---|---|---|
| 1 | `NotInitialized` | El contrato no ha sido inicializado |
| 2 | `AlreadyInitialized` | Se intentó inicializar más de una vez |
| 3 | `NotAdmin` | La dirección pasada no coincide con el admin almacenado |
| 4 | `DispensaryNotFound` | No existe entrada para ese dispensario |

#### Eventos

| Topics | Valor | Cuándo |
|---|---|---|
| `("disp_reg", dispensary)` | `()` | Al registrar un dispensario |
| `("disp_rev", dispensary)` | `()` | Al revocar un dispensario |

---

### 5.6 DispenseRecord

**Propósito:** Log inmutable de todas las dispensaciones de medicamentos realizadas contra recetas TrustLeaf. Cada registro es append-only y nunca puede ser modificado ni eliminado. Solo dispensarios autorizados en `DispensaryRegistry` pueden escribir. El contrato mantiene además un índice secundario por `rx_id` para consultar el historial de dispensaciones de una receta específica.

**Estado en Testnet:** Pendiente de despliegue.

#### Storage Keys (`DataKey`)

| Clave | Storage | Tipo del valor | Descripción |
|---|---|---|---|
| `DispensaryRegistry` | Instance | `Address` | Dirección del contrato `DispensaryRegistry`. |
| `Counter` | Instance | `u64` | Contador monotónico de IDs de registros. |
| `Record(u64)` | Persistent | `DispenseRecord` | Registro de dispensación por ID. |
| `RxIndex(u64)` | Persistent | `Vec<u64>` | Índice secundario: `rx_id → [record_id, ...]`. |

#### Struct `DispenseRecord`

```rust
pub struct DispenseRecord {
    pub record_id: u64,
    pub dispensary: Address,
    pub rx_id: u64,          // ID de la receta dispensada
    pub patient: Address,
    pub amount: u32,          // cantidad dispensada (> 0)
    pub timestamp: u64,       // timestamp provisto por la farmacia
    pub tx_hash: BytesN<32>,  // huella determinista del registro (ver nota)
}
```

> **Nota sobre `tx_hash`:** Dado que el código de contrato Soroban no tiene acceso al hash de la transacción Stellar envolvente, se genera una huella determinista derivada de los campos del registro con el layout `[record_id(8) | rx_id(8) | amount(4) | timestamp(8) | zero(4)]`. El relayer off-chain correlaciona esta huella con el hash de transacción real para exploradores externos.

#### Funciones Públicas

**`init(env, dispensary_registry: Address) → Result<(), Error>`**
Vincula el contrato al `DispensaryRegistry` e inicializa el contador en 0.
- Autorización requerida: ninguna (primera llamada post-deploy).
- Errores: `AlreadyInitialized`.

**`record_dispense(env, dispensary, rx_id, patient, amount, timestamp) → Result<u64, Error>`**
Registra una dispensación. Valida que `amount > 0` y realiza una **llamada cross-contract** a `DispensaryRegistry::is_authorized(dispensary)`. Si pasa la validación, crea el registro inmutable, actualiza el índice `RxIndex(rx_id)` y emite el evento. Retorna el nuevo `record_id`. Emite evento `("disp_rec", dispensary, rx_id) → (record_id, amount)`.
- Autorización requerida: `dispensary` (firma).
- Cross-contract: `DispensaryRegistry::is_authorized`.
- Errores: `NotInitialized`, `InvalidAmount`, `DispensaryNotAuthorized`.

**`get_record(env, record_id) → Result<DispenseRecord, Error>`**
Retorna un registro de dispensación por su ID.
- Autorización requerida: ninguna.
- Errores: `NotFound`.

**`get_records_by_rx(env, rx_id) → Vec<DispenseRecord>`**
Retorna todos los registros de dispensación para una receta dada, en orden de inserción. Retorna `Vec` vacío si la receta nunca fue dispensada. Útil para detectar dispensaciones múltiples o verificar el historial de una receta.
- Autorización requerida: ninguna.

#### Enum de Errores

| Código | Variante | Descripción |
|---|---|---|
| 1 | `NotInitialized` | El contrato no ha sido inicializado |
| 2 | `AlreadyInitialized` | Se intentó inicializar más de una vez |
| 3 | `DispensaryNotAuthorized` | El dispensario no está registrado o fue revocado |
| 4 | `NotFound` | No existe registro con ese ID |
| 5 | `InvalidAmount` | La cantidad dispensada es 0 |

#### Eventos

| Topics | Valor | Cuándo |
|---|---|---|
| `("disp_rec", dispensary, rx_id)` | `(record_id, amount)` | Al registrar una dispensación |

---

## 6. Flujos de Interacción Cross-Contract

### 6.1 Emisión de Receta

```
[Médico firma tx]
      │
      ▼
PrescriptionSoulbound::mint_prescription(doctor_wallet, patient_wallet, rx_hash)
      │
      ├─ doctor_wallet.require_auth()  ← verifica firma
      │
      ├─ cross-contract call ──────────►  DoctorRegistry::is_authorized(doctor_wallet)
      │                                        │
      │                                   returns bool
      │
      ├─ [if false] → Error::DoctorNotAuthorized
      │
      └─ [if true] → crea Prescription{status: Active} → emite evento → retorna id
```

### 6.2 Dispensación de Medicamento

```
[Farmacia firma tx]
      │
      ▼
DispenseRecord::record_dispense(dispensary, rx_id, patient, amount, timestamp)
      │
      ├─ dispensary.require_auth()  ← verifica firma
      ├─ amount > 0 check
      │
      ├─ cross-contract call ──────────►  DispensaryRegistry::is_authorized(dispensary)
      │                                        │
      │                                   returns bool
      │
      ├─ [if false] → Error::DispensaryNotAuthorized
      │
      └─ [if true] → crea DispenseRecord inmutable
                   → actualiza RxIndex(rx_id)
                   → emite evento
                   → retorna record_id
```

### 6.3 Ciclo Completo de Atención Médica

```
1. Admin llama DoctorRegistry::register_doctor(médico_wallet, ...)
2. Admin llama DispensaryRegistry::register_dispensary(farmacia_wallet)
3. Paciente despliega ClinicalRecord(__constructor(paciente_wallet))
4. Paciente llama ClinicalRecord::grant_write_access(médico_wallet)
5. Médico llama ClinicalRecord::append_entry(médico_wallet, "Observation", hash)
6. Médico llama PrescriptionSoulbound::mint_prescription(...) → rx_id
7. Farmacia llama DispenseRecord::record_dispense(farmacia_wallet, rx_id, ...)
8. [Opcional] Médico llama DocumentSoulbound::mint_document(...) → doc_id
```

---

## 7. Consideraciones de Despliegue

### Orden de Despliegue Recomendado

Los contratos con dependencias cross-contract deben desplegarse e inicializarse en orden:

1. `DoctorRegistry` → `init(admin)`
2. `DispensaryRegistry` → `init(admin)`
3. `PrescriptionSoulbound` → `init(doctor_registry_address)`
4. `DispenseRecord` → `init(dispensary_registry_address)`
5. `ClinicalRecord` → despliegue por paciente con `__constructor(patient_wallet)` (no requiere contratos externos)
6. `DocumentSoulbound` → no requiere inicialización externa (el contador se inicializa lazy en `0`)

### Configuración del Workspace de Rust

El workspace Cargo centraliza el perfil de release para todos los contratos:

```toml
[profile.release]
opt-level = "z"         # tamaño mínimo de WASM
overflow-checks = true  # detección de overflow en producción
debug = 0
strip = "symbols"
codegen-units = 1
lto = true
panic = "abort"
```

Esta configuración produce WASMs de menor tamaño y con verificaciones de seguridad activas en producción.

### Tests Cross-Contract

El workspace incluye una crate `e2e` (`contracts/e2e`) exclusiva para tests de integración cross-contract. Los contratos individuales también exponen el feature flag `testutils` para habilitarse en el host de test de Soroban:

```toml
[features]
testutils = ["soroban-sdk/testutils"]
```

Esto permite registrar múltiples contratos en el mismo entorno de test y verificar los flujos completos de autorización cross-contract antes del despliegue.

---

*Documentación generada para aplicación de grant blockchain. TrustLeaf — Plataforma de Salud On-Chain sobre Stellar/Soroban.*
