# 🌿 TrustLeaf — Sprint 1 Delivery & SOW Week 1 Verification

> **Estado del Entregable:** ✅ **100% Completado y Validado en Stellar Testnet**  
> **Fecha de Validación:** 2026-09-06  
> **Repositorio Oficial:** [github.com/CaBsCrypto/ficha-onchain](https://github.com/CaBsCrypto/ficha-onchain)  
> **Rama Principal:** `main` (Merge commits: [#95](https://github.com/CaBsCrypto/ficha-onchain/pull/95), [#96](https://github.com/CaBsCrypto/ficha-onchain/pull/96))

---

## 🎯 Resumen Ejecutivo del Sprint 1

En este primer sprint y entregable oficial del SOW, implementamos y desplegamos en **Stellar Testnet** la infraestructura core de **Recetas Médicas Inteligentes (TrustLeaf Rx)** basada en smart contracts Soroban (Rust / WASM) con experiencia de usuario **gasless** y cumplimiento normativo del **Decreto 41 del MINSAL (Chile)**.

### 🛡️ Garantías Clave Implementadas
1. **Identidad Médica Acreditada:** Validación on-chain contra `DoctorRegistry` antes de permitir cualquier emisión.
2. **Tokens Soulbound (No Transferibles):** Las recetas quedan ligadas irreversiblemente a la wallet del paciente.
3. **Control Atómico Anti-Duplicados:** Algoritmo en Rust con índice persistente `(médico, paciente, hash)` que rechaza re-emisiones de la misma receta (`Error #8: DuplicatePrescription`).
4. **Privacidad Total (Zero PHI on-chain):** Los datos personales y notas clínicas viven encriptados off-chain; solo la huella digital criptográfica (hash SHA-256) toca la blockchain.

---

## 📜 Smart Contracts Desplegados en Stellar Testnet

| Contrato | Dirección / Contract ID en Testnet | WASM SHA-256 | Estado |
| :--- | :--- | :--- | :---: |
| **`DoctorRegistry`** | [`CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O`](https://stellar.expert/explorer/testnet/contract/CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O) | `cc832c81...` | ✅ Activo / Live |
| **`PrescriptionSoulbound`** | [`CBOJSLG2XQZNQ6G6Q4VGN2SOFOEUCRDMBDWS7HVOQTGWTOIWGWNQSLCU`](https://stellar.expert/explorer/testnet/contract/CBOJSLG2XQZNQ6G6Q4VGN2SOFOEUCRDMBDWS7HVOQTGWTOIWGWNQSLCU) | `bd9d0b97...` | ✅ Activo / Live |

---

## 🧪 Pruebas Reales Ejecutadas en Stellar Testnet

Se emitieron y activaron recetas clínicas reales con medicamentos, posologías y tiempos de vigencia reglamentarios:

### 1. Amoxicilina + Ácido Clavulánico 875/125mg (Antibiótico)
- **ID On-Chain:** `#4`
- **Posología:** 1 comprimido cada 12 horas por 7 días (14 unidades)
- **Estado On-Chain:** `Active`
- 🔗 **Tx Emisión (Mint):** [`0d1c94b5df3d6b98b5a09cecd0f3d9a064ce1ddce7f36a983d6909c7dcbaab47`](https://stellar.expert/explorer/testnet/tx/0d1c94b5df3d6b98b5a09cecd0f3d9a064ce1ddce7f36a983d6909c7dcbaab47)
- 🔗 **Tx Activación:** [`84e2ab76d8f74d1fec3d8c7eb1663b6e63b9b993ff1e645fe2f03b12a897d2ad`](https://stellar.expert/explorer/testnet/tx/84e2ab76d8f74d1fec3d8c7eb1663b6e63b9b993ff1e645fe2f03b12a897d2ad)

### 2. Ketoprofeno 200mg LP (Antiinflamatorio)
- **ID On-Chain:** `#5`
- **Posología:** 1 cápsula diaria con el almuerzo por 5 días (5 unidades)
- **Estado On-Chain:** `Active`
- 🔗 **Tx Emisión (Mint):** [`fe818655187962a3af5e5af8818254f72e66238a56922dfe888666ebacad1ca6`](https://stellar.expert/explorer/testnet/tx/fe818655187962a3af5e5af8818254f72e66238a56922dfe888666ebacad1ca6)
- 🔗 **Tx Activación:** [`accebae17f9f3c6fd2f53f6a202c0491166234aaf7fb66807ad36aa005c45dd3`](https://stellar.expert/explorer/testnet/tx/accebae17f9f3c6fd2f53f6a202c0491166234aaf7fb66807ad36aa005c45dd3)

### 3. Losartán Potásico 50mg (Tratamiento Crónico)
- **ID On-Chain:** `#6`
- **Posología:** 1 comprimido cada 24 horas continuo en la mañana (30 unidades)
- **Estado On-Chain:** `Registered`
- 🔗 **Tx Emisión (Mint):** [`b26009777c355b875bfb62e5c09594f07980fa6ac97cf021520a0610a59eb85c`](https://stellar.expert/explorer/testnet/tx/b26009777c355b875bfb62e5c09594f07980fa6ac97cf021520a0610a59eb85c)

---

## 📊 Matriz de Validación y Cobertura

| Métrica | Resultado | Notas |
| :--- | :---: | :--- |
| **Tests Unitarios e Integración App** | **118 / 118 PASS** | Vitest en rutas de API, autenticación Privy, Decreto 41 y UI |
| **Tests Smart Contracts en Rust** | **36 / 36 PASS** | `cargo test` en `doctor-registry`, `prescription-soulbound` y E2E |
| **Chequeo Estricto de Tipos (TypeScript)** | **0 Errores** | `npx tsc --noEmit` verificado en CI |
| **Build de Producción** | **PASS** | Compilación exitosa en Next.js 16 Turbopack y Vercel |
| **CI / GitHub Actions** | **Verde ✅** | Flujo automatizado de typecheck + build + contract tests |

---

## 🔗 Enlaces Oficiales y Documentación

- 📄 **Reporte Técnico de Entrega Semana 1:** [`docs/sow-delivery/WEEK_1.md`](./docs/sow-delivery/WEEK_1.md)
- 🎬 **Guion del Video Pitch (TrustLeaf Rx):** [`docs/sow-delivery/VIDEO.md`](./docs/sow-delivery/VIDEO.md)
- 🏗️ **Arquitectura del Sistema:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- 📝 **Especificación de Contratos:** [`docs/CONTRACTS.md`](./docs/CONTRACTS.md)
- 🚀 **Pull Request de Validación:** [#95 (Merged)](https://github.com/CaBsCrypto/ficha-onchain/pull/95)
- 🎨 **Pull Request de Documentación:** [#96 (Merged)](https://github.com/CaBsCrypto/ficha-onchain/pull/96)
