# DoctorRegistry privado — validación realizada

**Estado:** nueva instancia desplegada en Testnet; tres expedientes sintéticos guardados cifrados en Neon dev y vinculados al contrato mediante su huella. Verificación realizada por scripts, no mediante el panel de la app. No se implementó ZK.

[Contrato nuevo](https://stellar.expert/explorer/testnet/contract/CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2) · [Despliegue](https://stellar.expert/explorer/testnet/tx/6d49372a261c59736ea1219d10148afb54d3c828b691e4441622bc591ef756f4)

## Evidencia

| Registro | Recibo SUCCESS | Ledger | Base ↔ contrato | Autorización consultada |
|---|---|---|---|---|
| Médico de prueba 1 | [Transacción](https://stellar.expert/explorer/testnet/tx/cfc6b6fe99bacd9dacaad475a298fe4546b69e26f442e6d30c4d2e15ca1e10dd) | 4546857 | Coincide | Activo |
| Médico de prueba 2 | [Transacción](https://stellar.expert/explorer/testnet/tx/8929a359f28d4382a719d70d2b11df59f3b5f542b83f8b91e9b20a3e529db0d9) | 4546858 | Coincide | Activo |
| Médico de prueba 3 | [Transacción](https://stellar.expert/explorer/testnet/tx/0480c1e1f9c876039853da2dd03fad57059fe2a9f4884c2dfa5c3de0123ca57a) | 4546859 | Coincide | Activo |

[Manifiesto de despliegue](../../evidence/testnet-generation-2026-09-07/private-registry.json) · [Recibos y verificaciones](../../evidence/testnet-generation-2026-09-07/private-dossier-validation.json)

## Qué se guardó

- En la nueva tabla doctor_private_dossiers: expediente estructurado cifrado mediante AES-256-GCM. La clave de cifrado configurada se usa solo en memoria; no está en la tabla ni en la evidencia. El cifrado se autentica también contra el identificador de la fila para rechazar intercambios de contenido cifrado entre filas.
- En el expediente cifrado: nombre, licencia y especialidad de prueba, origen de revisión, responsable, fecha, dominio/red/contrato/cuenta, versión, vencimiento y secreto aleatorio de 32 bytes.
- En cadena: cuenta como clave, compromiso SHA-256, versión de esquema, versión de autorización, vencimiento y revocación. Las altas no envían nombres ni licencias.
- En la tabla, metadatos operativos públicos para conciliar: contrato, cuenta, versiones, vencimiento, compromiso, estado de envío y transacción. Los documentos privados no se copian a los recibos.

El compromiso v1 usa una serialización de orden fijo y todos los campos declarados; rechaza campos adicionales. Incorpora un secreto aleatorio para dificultar búsquedas por valores candidatos. Esta estructura no es una prueba ZK ni garantiza anonimato: cuenta, fechas y operaciones permanecen visibles. El formato futuro ZK requerirá evaluación/migración de esquema y revisión criptográfica.

## Qué se comprobó

Se recuperó cada fila desde Neon, se descifró, se recalculó el compromiso y se comparó con el registro on-chain, incluyendo cuenta, contrato, esquema, versión y vencimiento. Se comprobó autorización vigente y el recibo RPC SUCCESS. Cambiar la licencia en memoria produjo una huella distinta. Las consultas no envían transacciones.

Pruebas locales: cuatro escenarios del contrato cubren firmas ausentes, administración en dos pasos, vigencia, duplicados, renovación, revocación, reautorización y pausa. Dos pruebas de criptografía cubren cambios de campos, clave ausente/incorrecta, contenido alterado y cambio de contexto. Una integración local con Prescription confirma que cuenta no autorizada, pausa, revocación y vencimiento impiden emitir. Es evidencia funcional, no auditoría independiente.

## Reproducción

Desde la raíz del proyecto:

```powershell
cargo test --offline --locked --manifest-path contracts/Cargo.toml -p doctor-registry-private --lib
node --test scripts/lib/private-doctor-dossier.test.mjs
cargo test --offline --locked --manifest-path contracts/Cargo.toml -p trustleaf-e2e --test private_registry
node scripts/validate-private-registry-testnet.mjs verify
```

El último comando necesita conectividad, la base de desarrollo y la clave de cifrado configurada. Relee y concilia datos, sin nuevas transacciones. Preparación y envío son modos separados; no repetir submit tras un resultado incierto sin conciliar la red. Las tres autorizaciones caducan treinta días después de su preparación: la evidencia describe el estado a la hora guardada, no una autorización perpetua.

## Pendientes concretos

- Integrar expediente y confirmación on-chain en panel administrativo; la app conserva sus IDs y flujos históricos.
- Custodia de claves mediante KMS, rotación y recuperación: esta prueba usa la clave de cifrado ya configurada; no afirmar que KMS está instalado.
- Almacenamiento privado de documentos adjuntos, permisos por expediente y auditoría de accesos: no implementados por esta prueba de datos estructurados.
- El helper clínico anterior que permite texto claro sin clave no fue sustituido: el nuevo módulo de expedientes falla de forma cerrada. No se migraron datos históricos de la app.
- Flujos de renovación/revocación de base y red, reintentos automáticos, concurrencia y trazabilidad completa del revisor deben integrarse en la aplicación antes de uso real.
- Validación on-chain de revocación, renovación, pausa y traspaso de administrador de esta versión: sus pruebas actuales son locales. Las transacciones de revocación anteriores pertenecen al Registry anterior.
- Despliegue e integración de Prescription preservando privacidad: la compatibilidad se probó localmente, no se emitieron recetas en red con esta versión.

Los registros anteriores con nombre/licencia de prueba permanecen históricos. No introducir datos reales hasta resolver la integración, los controles operativos y la revisión correspondiente.
