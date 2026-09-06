# Semana 1 — validación y despliegue Testnet

Actualizado: 2026-09-06. Fuente oficial confirmada por el dueño: [Instawards SOW](https://docs.google.com/document/d/1XML0J7ujjBHb9gaNzfEtNjxV7qqzMnMoIZ_EbgMyocs/edit?tab=t.0), Deliverable 1 y Week 1.

## Resultado

PrescriptionSoulbound corregido y desplegado en Testnet. DoctorRegistry existente conservado. Validación local: 36 pruebas Rust de semana uno y 118 Vitest pasan; typecheck y build Turbopack pasan. Validación Testnet: 11 comprobaciones pasan. La aceptación del responsable sigue pendiente; esto no es un video ni una prueba de navegador de semana dos.

| Criterio SOW | Evidencia | Estado |
| --- | --- | --- |
| Registro, autorización, revocación y transferencia de admin | 13 tests DoctorRegistry; registro existente responde en Testnet y autoriza al médico demo | Validado localmente y disponibilidad verificada en red. No se modificó el registry existente. |
| Emisión, asignación al paciente, revocación, consulta | 20 tests PrescriptionSoulbound; consultas al nuevo contrato | PASS. Asignación al emitir: no transferencia posterior de un soulbound. |
| Registered → Active → Revoked | 3 E2E locales; transacciones y estados confirmados abajo | PASS. En la corrida Testnet activó el médico emisor, posibilidad admitida por el contrato; no se afirma login o firma del paciente en navegador. |
| Emisión no autorizada | Tests y simulación Testnet con emisor no registrado | Rechazada con error 2 |
| Prevención de duplicados | Prueba roja antes del fix, verde después; simulaciones del mismo documento antes y después de revocar | Rechazado con error 8; un documento distinto se emite |
| Ambos contratos en Testnet | IDs públicos y lectura del código desplegado | PASS. WASM de la nueva receta coincide exactamente con local; el registry existente conserva su hash histórico. |
| Relay configurado | Cinco transacciones confirmadas como fee-bump con feeSource del relayer | PASS en SDK/Testnet. No se ejecutó el endpoint HTTP ni el portal contra la base de datos. |

## Contratos y hashes

- [DoctorRegistry existente](https://stellar.expert/explorer/testnet/contract/CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O) — ID: CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O
- [PrescriptionSoulbound nuevo](https://stellar.expert/explorer/testnet/contract/CBOJSLG2XQZNQ6G6Q4VGN2SOFOEUCRDMBDWS7HVOQTGWTOIWGWNQSLCU) — ID: CBOJSLG2XQZNQ6G6Q4VGN2SOFOEUCRDMBDWS7HVOQTGWTOIWGWNQSLCU
- [PrescriptionSoulbound anterior](https://stellar.expert/explorer/testnet/contract/CA3I4NLBELODRXUUBVZDBVAU47W65KPZ6UFWEXCEEDUDQYZQ4E5YLXYL) — permanece sin cambios; no hay migración automática de registros.
- WASM nuevo SHA256: bd9d0b97d800b45909ccc13da1613c47d15aa75b8ae88389ab2c178db908343e
- Registry desplegado SHA256 observado: cc832c816bcb11286dcd0151328231700d5489a276692f0c0ece623a2c4437c8. No se afirma equivalencia binaria con la compilación local actual del registry.
- [Upload WASM](https://stellar.expert/explorer/testnet/tx/22592ed122c8913e65b5a693e9f7656f728c57568422dbe20821ed1e75306d73)
- [Deploy PrescriptionSoulbound](https://stellar.expert/explorer/testnet/tx/e1b4c55362a1f3612a4f4f4f6c419756b2efce467c5923766601bd9a9404e6dc)

## Transacciones sintéticas confirmadas

| Paso | Transacción |
| --- | --- |
| mint | [SUCCESS](https://stellar.expert/explorer/testnet/tx/8f7de9890298676e218f8a0d0139713bb030970d92e1f8c99062bd3c88f64cd2) |
| activate | [SUCCESS](https://stellar.expert/explorer/testnet/tx/b6afbeb6559f104beed0f26de5bd4f1eb5606faba882d7710b7a8100502ad39c) |
| revoke | [SUCCESS](https://stellar.expert/explorer/testnet/tx/407e069d0b502eae0fa24c1f8424b4660d2c1d2d40f6b116f61d13aa8a635f6c) |
| distinct_mint | [SUCCESS](https://stellar.expert/explorer/testnet/tx/670ef8e4fac5449dfd24e3524ba684e240cfc0bebcf079b6d2f1a072aac0ffff) |
| distinct_revoke | [SUCCESS](https://stellar.expert/explorer/testnet/tx/b31b4c23b8470497f4e752798b420ab2d7f3885e925b11e8710a2c95b136ab21) |

Los rechazos de duplicados y emisor no autorizado se verificaron por simulación RPC sobre el contrato real. No son transacciones fallidas enviadas a la red y no se les atribuye hash de transacción.

## Comportamiento corregido

El contrato guarda de forma atómica un índice persistente por emisor, destinatario y hash documental. No se elimina al revocar. Una receta distinta puede emitirse; el control no intenta decidir si dos tratamientos son clínicamente equivalentes.

La app crea una identidad única por emisión y la conserva con su fecha y un digest del formulario en sessionStorage. No guarda el contenido clínico ahí. El reintento conserva el mismo hash; cambiar el contenido mientras existe una emisión incierta queda bloqueado. Una nueva emisión explícita recibe identidad distinta. Este mecanismo no comparte el borrador entre dispositivos y borrar el almacenamiento del navegador pierde la identidad pendiente.

/api/mint requiere issuance.id (UUID v4) e issuance.issuedAt (ISO canónico). Los tres scripts internos fueron adaptados; clientes externos deben enviar y reutilizar estos campos. Rechazo duplicado: HTTP 409. Error o resultado incierto real: HTTP 502, sin éxito simulado ni notificación nueva. La simulación demo queda solo cuando no hay firmante o dirección válida antes de intentar una operación real.

La configuración local y el fallback Testnet apuntan al nuevo contrato. El ID anterior está conservado en LEGACY_PRESCRIPTION_CONTRACT_IDS y este manifiesto; no se implementó agregación automática de recetas antiguas y nuevas. No se cambiaron variables de Vercel ni producción.

## Evidencia reproducible

- [Deploy](../evidence/week1-2026-09-06/deployment.json)
- [Verificación Testnet](../evidence/week1-2026-09-06/verification.json)
- Auditoría de solo lectura del despliegue: node scripts/verify-week1-testnet.mjs
- Tests: cargo test --offline --locked --manifest-path contracts/Cargo.toml -p doctor-registry -p prescription-soulbound -p trustleaf-e2e
- App: npm test; node node_modules/typescript/bin/tsc --noEmit; node scripts/build-sow-local.mjs
- scripts/deploy-week1-testnet.mjs sin flags hace preflight de solo lectura. --deploy transmite; guarda hashes antes de enviar y no reintenta ciegamente un resultado incierto.
- scripts/verify-week1-testnet.mjs --run es una operación de escritura Testnet, limitada al contrato nuevo y documentos sintéticos. La corrida autorizada ya está completada; no necesita repetirse para revisar la evidencia.

## Fuera de este cierre

ClinicalRecord, DocumentSoulbound, video final, onboarding real y producción. Corrección guardada en commit 8619734e74ca654b0b6cc106693b16b55634344f. Integración completada en [PR #95](https://github.com/CaBsCrypto/ficha-onchain/pull/95); fechas actualizadas en [PR #98](https://github.com/CaBsCrypto/ficha-onchain/pull/98). GitHub CI y Vercel aprobaron el merge 3d0e923. La aceptación formal del responsable sigue pendiente. Las fechas y resultados de docs/evidence/sow-2026-09-05 son históricos y anteriores al fix de duplicados.

[Resultados locales y hashes de inputs](../evidence/week1-2026-09-06/local-validation.json). Repetir con node scripts/validate-week1-local.mjs.
