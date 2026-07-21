# D3 — Mapa de evidencia (Integración E2E on-chain)

> Entregable **D3** del SOW de Instawards: la secuencia completa médico↔paciente
> corrida **logueada, de punta a punta**, con cada paso anclado en **Stellar
> Testnet** y verificable en Stellar Expert.
>
> Corrida: **2026-07-21**, red **Testnet (protocolo 27)**. Todos los pasos
> devolvieron `mode: "onchain"` (no simulado).

## Actores (cuentas reales, login Privy)

| Rol | Identidad | Wallet |
| --- | --- | --- |
| 🛡️ Admin | `brownsstudiocontact@gmail.com` (allowlist Privy) | — |
| 🩺 Médico | `cabscryptocontacto@gmail.com` (Dr. Cristian Brown) | registrado y autorizado en DoctorRegistry |
| 🧑 Paciente | `dgtlmoney8@gmail.com` (Valentina Rojas Fuentes) | `GAK5N7RPGZMHGFOJ7ZJCC5YCD6WUHGMMJMFBMGM5JGMKTV3KPVROS4DX` |

## Contratos (Stellar Testnet)

| Contrato | ID | Explorer |
| --- | --- | --- |
| DoctorRegistry | `CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O` | [ver](https://stellar.expert/explorer/testnet/contract/CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O) |
| PrescriptionSoulbound | `CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL` | [ver](https://stellar.expert/explorer/testnet/contract/CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL) |
| DocumentSoulbound | `CBNX6WYTQUWTKKJSDLKARXQHONUW6H435CSZ4VA6O4U7TGI5E2IVCMON` | [ver](https://stellar.expert/explorer/testnet/contract/CBNX6WYTQUWTKKJSDLKARXQHONUW6H435CSZ4VA6O4U7TGI5E2IVCMON) |
| ClinicalRecord (demo) | `CCATYIFOHLLRS6CMONJQZ66A6QN3Z7EQFU3O4HD4RMTNS67F2U422GY5` | [ver](https://stellar.expert/explorer/testnet/contract/CCATYIFOHLLRS6CMONJQZ66A6QN3Z7EQFU3O4HD4RMTNS67F2U422GY5) |

## Timestamp map — cada paso ↔ su transacción

El modelo es **anclar el hash, no el dato**: la PII y el texto clínico quedan
off-chain (Neon); la cadena guarda solo el SHA-256 (32 bytes) y los tokens
soulbound. Cada `tx` de abajo es un `require_auth` firmado por el actor y
fee-bumped por el relayer (gasless).

| # | Paso (UI) | Actor | Contrato · método | Modo | Transacción |
| --- | --- | --- | --- | --- | --- |
| 1 | Paciente reserva y **otorga consentimiento** | 🧑 Paciente | ClinicalRecord · `grant_write_access` | onchain | [`4cf9e91b…e1fb9`](https://stellar.expert/explorer/testnet/tx/4cf9e91b577cd5886d4a26e606cb534c255ecdd1e669cb0bece1ab867e3e1fb9) |
| 2 | Médico agrega a la **ficha** (Condición: Dolor neuropático crónico, CIE-10 M79.7) | 🩺 Médico | ClinicalRecord · `append_entry` | onchain | [`793f21cd…585f1`](https://stellar.expert/explorer/testnet/tx/793f21cd2f68b7b8f253b17524776eae35a28245bb7f2f978501bdd8696585f1) |
| 3 | Médico adjunta **examen** de laboratorio (perfil dolor crónico) | 🩺 Médico | DocumentSoulbound · `mint_document` | onchain | [`0eeb45bf…613f1a`](https://stellar.expert/explorer/testnet/tx/0eeb45bff6b85b36ca7963b90d8330e732e7fb23bfc40615350008ab6b613f1a) |
| 4 | Médico guarda **antecedentes** (grupo sang., IMC, alergias, condiciones) | 🩺 Médico | ClinicalRecord · `append_entry` (Antecedentes) | onchain | [`e556f045…6403`](https://stellar.expert/explorer/testnet/tx/e556f045547edc8a25f53107ec1eac64940eecf5711bd9ab7fa0360c84bb6403) |
| 5 | Médico emite **receta** (Pregabalina 75 mg, Decreto 41) → soulbound `rx-17` | 🩺 Médico | PrescriptionSoulbound · `mint_prescription` | onchain | [`c832af93…b48f2`](https://stellar.expert/explorer/testnet/tx/c832af93fe6e8b79709a2d22f9d692202c4e033bdb4fa05cae0a97b102fb48f2) |
| 6 | Paciente **activa** la receta → estado Activa + QR para la farmacia | 🧑 Paciente | PrescriptionSoulbound · `activate` | onchain | *(activación validada en UI; estado on-chain: Activa)* |

## Cómo re-verificar

1. Abrir cualquier link de la columna **Transacción** → Stellar Expert muestra el
   `invokeHostFunction`, el contrato invocado y el resultado `SUCCESS`.
2. En el panel de admin, **Historial global** (`/admin/historial`) lista los
   mismos eventos con su badge `on-chain` y link al explorer.
3. Los IDs de contrato viven en `src/lib/stellar/config.ts`.

## Estado del SOW

| Entregable | Estado |
| --- | --- |
| **D1 — Contratos testeados + desplegados** | ✅ Cerrado (contratos desplegados; suite vitest + `cargo test` en CI) |
| **D2 — Interfaz doctor + paciente** | ✅ Cerrado (flujo verificado **logueado en navegador** con 3 actores Privy reales) |
| **D3 — Integración E2E + demo grabado** | 🟡 Integración **cerrada** (esta evidencia). Falta: **grabar el video** siguiendo `docs/DEMO_SCRIPT.md` |
