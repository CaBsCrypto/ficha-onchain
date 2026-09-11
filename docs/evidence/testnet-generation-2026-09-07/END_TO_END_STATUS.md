# Objetivo: receta privada con consentimiento y reserva

Revisión directa del checkout, 2026-09-07. Demostración del flujo de servicios completada y auditada. Las secciones posteriores conservan la evolución histórica.

## Resultado final: flujo privado de inicio a fin verificado

`node scripts/validate-private-flow-testnet.mjs --run` completó con salida 0 y 13 comprobaciones aprobadas. `node scripts/audit-private-flow-testnet.mjs` realizó después una auditoría independiente de solo lectura y aprobó 12 comprobaciones adicionales.

| Requisito del objetivo | Evidencia autoritativa |
| --- | --- |
| Médico validado por TrustLeaf | Expediente sintético cifrado en Neon dev; compromiso coincidente con DoctorRegistryPrivate; autorización administrativa firmada y confirmada; consulta vigente `is_authorized=true`. |
| Paciente correcto | Desafíos de posesión Ed25519 de médico y paciente verificados por el servicio de bindings. Auditoría vuelve a verificar ambas firmas desde DB. Misma identidad/wallet en reserva, documento cifrado y receta emitida. |
| Reserva autorizada | Reserva sintética `in_progress` en Neon dev, preparada por `preparePrescriptionBooking`; worker real produce attestation firmada por autoridad. Recibo SUCCESS y estado final Consumed. |
| Consentimiento | Firma del paciente y recibo SUCCESS para el mismo médico, paciente e issuance ID; emisión sin consentimiento rechazada previamente por RPC. |
| Receta privada emitida | Documento sintético AES-GCM almacenado en `private_prescriptions`; compromiso con blinding; emisión firmada por médico y recibo SUCCESS. Auditoría descifra DB y vuelve a calcular el compromiso, comparándolo con cadena. |
| Entrega privada | Prueba de posesión nueva, de un solo uso, permite al paciente recuperar su documento mediante el servicio de lectura privada. Identidad ajena y repetición de prueba rechazadas. |
| Publicación mínima | Auditoría verifica argumentos exactos de las cuatro transacciones confirmadas: wallets, compromisos, IDs y vencimientos; sin medicamento, dosis o contenido documental. Wallets y relaciones siguen siendo públicas. |
| Rechazos | Repetición de emisión, médico no autorizado y paciente sin consentimiento rechazados por simulación RPC; reserva revocada y ausencia de reserva verificadas en el ensayo previo del mismo contrato. |

Archivos de evidencia:

- `private-flow-verification.json`: ejecución, hashes, comprobaciones y referencia al documento privado; no contiene el contenido clínico ni blinding ni claves.
- `private-flow-completion-audit.json`: auditoría independiente con ledger, firma y argumentos públicos de cada recibo.
- `prescription-booking-verification.json`: prueba previa de reserva ausente, duplicado y cancelación.

Emisión: `0e7102c770d100ea6b5f9aa375992dbbc76534535f48822fb066afca2cd672c8`.
Consentimiento: `b0289a388c5196e0458a19a0885641f525a38733bc0ddda438bf26771132cfb7`.
Aprobación del médico: `114abb0d7daa9672b8bdacabdf95b925abdb152e20157dfbbe187145f4eb3650`.

Alcance: demostración CLI de servicios con enrollment sintético explícito y firmas reales, Neon dev y Stellar testnet. No se afirma login Privy ni recorrido visual del portal, validación de credenciales médicas reales, custodia de producción, cifrado extremo a extremo ni ocultamiento de relaciones entre wallets. El servidor autorizado descifra. Se conservan los fixtures cifrados en dev para inspección; no se modificó producción. Los cambios de código permanecen locales, sin PR/merge en esta demostración.

Validación local final: 137 pruebas de app aprobadas y `npx tsc --noEmit` con salida 0. Los contratos privados compilados y probados corresponden al hash desplegado documentado.

## Estado más reciente: despliegue autorizado y validación de contrato completada

El usuario autorizó explícitamente continuar con el despliegue pendiente y las validaciones usando solo cuentas y datos de prueba. El bloqueo de autorización descrito más abajo es histórico y quedó resuelto.

- PrescriptionPrivate v2 desplegado: `CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE`. Recibos de upload y deployment comprobados por RPC con `SUCCESS`, en `prescription-booking-deployment.json`.
- `node scripts/validate-booking-contract-testnet.mjs --run` completó con salida 0. Evidencia en `prescription-booking-verification.json`: consentimiento, attestation, emisión y cancelación con transacciones confirmadas; comprobaciones de destinatario, compromiso y reserva consumida; rechazos de ausencia de reserva, duplicado y reserva revocada por simulación RPC.
- La cuenta sintética del médico no existía como cuenta financiada. Se activó con Friendbot exclusivamente en testnet. La ejecución posterior reutilizó los hashes guardados de consentimiento y attestation.
- Esta prueba sigue siendo de contrato: el compromiso es aleatorio y no acredita documento privado recuperable ni reserva creada mediante API/servicio de aplicación.
- Se sincronizaron en código las cuatro tablas y el trigger de protección con la ruta administrativa de migración. No se ejecutó la migración de producción.
- La prueba histórica de emisión por no-médico ahora verifica rechazo 403 en el control de rol de DB con modo demo habilitado; no se alcanza el firmante.
- `npm test -- --reporter=dot`: 137/137 aprobadas. `npx tsc --noEmit`: salida 0 después de los cambios.

Siguiente trabajo: conectar almacenamiento cifrado, identidad verificada y reserva del servicio con la emisión y lectura privada, y ejecutar ese mismo recorrido con fixtures de prueba. El objetivo completo sigue pendiente.

## Evidencia nueva

- `stellar contract build`: completado. PrescriptionPrivate v2: SHA-256 `4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c`, 11358 bytes.
- `cargo test -p prescription-private -p doctor-registry-private`: 11 pruebas aprobadas.
- `node --test scripts/lib/private-prescription.test.mjs scripts/lib/private-doctor-dossier.test.mjs scripts/worker-prescription-bookings.test.mjs`: 12 pruebas aprobadas.
- `npx tsc --noEmit`: salida 0.
- `npm test -- --reporter=dot`: 135 aprobadas, 2 fallidas. `schema-parity` detecta cuatro tablas ausentes en la migración de producción. `week1-security-integration` espera 200 para un paciente que intenta emitir; la ruta devuelve 403. Hay que revisar y actualizar la prueba de reproducción a una prueba de rechazo, sin debilitar la autorización.
- `npm run test:onchain`, con acceso de red: 7 PASS / 3 FAIL. El médico demo está autorizado; el paciente configurado tiene cero recetas en el contrato legacy. Este script no verifica el contrato privado nuevo.

## Requisitos para aceptar el objetivo

| Requisito | Estado y evidencia aún requerida |
| --- | --- |
| Médico validado por TrustLeaf | Registro privado implementado; existen recibos anteriores para tres fixtures sintéticos. Revalidar autorización vigente y vínculo al expediente cifrado en el recorrido nuevo. No representan credenciales médicas reales. |
| Paciente correcto | Servicios de desafío firmado y binding implementados. Falta enlazar ese binding con el mismo paciente de la reserva, consentimiento, emisión y lectura privada en una ejecución. |
| Reserva autorizada | Contrato v2 y worker implementados y probados localmente. Falta despliegue confirmado y recorrido desde reserva elegible en Neon dev a attestation confirmada. |
| Consentimiento | Contrato exige firma del paciente y consentimiento vigente de un solo uso. Falta firma y recibo reales para la misma issuance de la reserva. |
| Receta privada | Hay cifrado AES-GCM y compromiso con blinding. El script de contrato usa bytes aleatorios como compromiso: eso no demuestra una receta privada recuperable. Falta almacenamiento, autorización de lectura y recuperación del documento sintético ligado al compromiso emitido. |
| Emisión completa | Falta transacción firmada por médico, recibo SUCCESS, destinatario y compromiso coincidentes, reserva consumida y rechazo de repetición. |
| Rechazos | Las pruebas locales cubren varios casos. Agregar evidencia integrada de paciente ajeno, médico no autorizado, ausencia/revocación de consentimiento y reserva inválida. Diferenciar simulación de transacción enviada. |

## Despliegue preparado, no ejecutado

La revisión automática rechazó crear el proceso de despliegue por requerir autorización del usuario para este despliegue exacto. No se envió esa operación; no hay un proceso pendiente que reconciliar.

- Red: Stellar testnet.
- Artefacto: `contracts/target/wasm32v1-none/release/prescription_private.wasm`, hash arriba.
- Firmante local: alias `trustleaf-testnet-admin-20260907` en el almacén de Stellar.
- Admin y booking authority: `GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO`.
- Registro: `CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2`.
- Salt: `8b20da01f2a7a7a82eec1b13d58388db237b3376ba3e54b11a6dc932ff905ed1`.
- Efecto: nuevo contrato persistente en testnet, sin modificar el contrato legacy ni configurar producción. Las wallets, relaciones y estados son públicos; el contenido clínico debe permanecer fuera de la cadena.

Tras la autorización: desplegar, guardar ID y recibo confirmado, verificar ABI/registro/autoridad/hash; completar la integración con documento cifrado y reserva real de prueba. No declarar E2E a partir de la prueba aislada de contrato.

## Avance local posterior a la solicitud de autorización

Se añadió `scripts/lib/read-private-prescription.mjs`, una frontera de lectura privada para integrar en el runner sintético. Verifica actor autenticado, binding vigente del paciente, registro confirmado, correspondencia con la receta on-chain y compromiso del documento descifrado. Reutiliza AES-GCM existente con contexto de fila/red/contrato; no devuelve blinding ni ciphertext. La lectura histórica del paciente se permite aunque la receta haya expirado o sido revocada: recuperar el documento no equivale a declarar que se pueda usar.

`node --test scripts/lib/read-private-prescription.test.mjs scripts/lib/private-prescription.test.mjs`: cuatro pruebas aprobadas. Cubren lectura propia y rechazo de identidad ajena/revocada, otro destinatario, contexto o ciphertext alterados y emisión no confirmada. Son pruebas de servicio con adaptadores simulados y cifrado real; todavía faltan adaptadores de almacenamiento/RPC/autenticación y la ejecución completa. No se reintentó el despliegue pendiente de autorización.
