# TrustLeaf · Entrega de semana 1

**Dos contratos privados desplegados en Stellar Testnet y validación técnica documentada.**

Evidencia técnica al **7 de septiembre de 2026**. Material de entrega actualizado el **8 de septiembre de 2026**. Demostración con datos sintéticos.

**Estado:** paquete preparado para entrega y revisión; aceptación formal pendiente del responsable. Esta página está preparada para importar en Notion y todavía no ha sido publicada.

## Resumen de la entrega

La semana 1 acredita el registro y la autorización de un médico, una reserva vinculada a una emisión, el consentimiento firmado por el paciente y la emisión de una receta privada para ese paciente. La demostración se ejecutó mediante servicios y herramientas de línea de comandos.

Se entregan dos contratos, sus fuentes capturadas, los binarios desplegados, un manifiesto de integridad, reportes de pruebas y recibos de Testnet. El documento de receta se almacenó cifrado fuera de cadena y su recuperación por el paciente autorizado se comprobó contra el compromiso registrado en cadena.

**Video:** grabado, confirmado por el responsable el 8 de septiembre; enlace pendiente.

**Paquete descargable:** preparado localmente; enlace de descarga pendiente.

## Los dos smart contracts

| Contrato | Función en esta entrega | Explorador |
| --- | --- | --- |
| **DoctorRegistryPrivate** | Autorizar, consultar, renovar y revocar médicos; transferencia administrativa con aceptación. | [Ver registro en Testnet](https://stellar.expert/explorer/testnet/contract/CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2) |
| **PrescriptionPrivate v2** | Acreditar la reserva, gestionar el consentimiento y emitir la receta; consulta y ciclo de estados. Comprueba la autorización del médico en el registro. | [Ver recetas en Testnet](https://stellar.expert/explorer/testnet/contract/CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE) |

**ID del registro:** `CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2`

**ID de recetas:** `CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE`

Los dos binarios recompilados coinciden con los hashes leídos de Testnet en la verificación del 7 de septiembre. La fuente de esta entrega queda identificada por `source-manifest.json`; su captura local no implica que esos cambios estén publicados o integrados en `main`.

## Cuatro transacciones: una en el registro y tres en recetas

Cada enlace corresponde a un recibo con estado `SUCCESS` en la evidencia del corte. Las cuatro acciones forman un mismo recorrido; son transacciones separadas.

1. **El administrador autoriza al médico.** `authorize_doctor`, en **DoctorRegistryPrivate**. [Ver recibo de autorización](https://stellar.expert/explorer/testnet/tx/114abb0d7daa9672b8bdacabdf95b925abdb152e20157dfbbe187145f4eb3650).
2. **La autoridad de reservas acredita la reserva.** `attest_booking`, en **PrescriptionPrivate v2**. Vincula médico, paciente y emisión. [Ver recibo de reserva](https://stellar.expert/explorer/testnet/tx/1930f88b1b04515c21c8f84cc221b2f7417932f38a635345fb492392587cbb21).
3. **El paciente autoriza a ese médico para esa emisión.** `authorize_prescriber`, en **PrescriptionPrivate v2**, con la firma de la wallet de prueba del paciente. [Ver recibo de consentimiento](https://stellar.expert/explorer/testnet/tx/b0289a388c5196e0458a19a0885641f525a38733bc0ddda438bf26771132cfb7).
4. **El médico emite la receta para el paciente.** `mint_prescription`, en **PrescriptionPrivate v2**, con la firma de la wallet de prueba del médico. El contrato verifica y consume la reserva y el consentimiento. [Ver recibo de emisión](https://stellar.expert/explorer/testnet/tx/0e7102c770d100ea6b5f9aa375992dbbc76534535f48822fb066afca2cd672c8).

En esta demostración, una misma cuenta administrativa cumple los roles de administrador y autoridad de reservas. El paciente y el médico firman con sus propias cuentas de prueba. Estas firmas se realizaron mediante herramientas de prueba, no desde el portal con Privy.

**Resultado demostrado:** receta asignada inicialmente al paciente correcto, documento cifrado almacenado y lectura privada autorizada comprobada. La emisión deja la receta en estado **`Registered`**. El ciclo **`Registered → Active → Revoked`** está respaldado por pruebas locales de la fuente entregada; las cuatro transacciones anteriores no incluyen activación ni revocación.

El consentimiento autoriza una emisión para ese médico y paciente, con vencimiento y uso único. No equivale a la firma del paciente sobre el contenido final de la receta.

## Pruebas y evidencia

**Corte del 7 de septiembre: 11 pruebas contractuales aprobadas · 137 pruebas de aplicación aprobadas · TypeScript sin errores.**

### Las 11 pruebas contractuales

Los nombres siguientes aparecen en el reporte histórico `evidence/closure-contract-tests.txt`.

**DoctorRegistryPrivate — 4 pruebas**

- `administrative_writes_require_signature`: exige la firma administrativa para las escrituras protegidas.
- `admin_transfer_requires_acceptance`: el cambio de administrador requiere propuesta y aceptación de la nueva cuenta.
- `pause_does_not_prevent_revocation`: durante una pausa sigue siendo posible revocar al médico.
- `lifecycle_and_expiry`: comprueba autorización, renovación, vencimiento, revocación y reautorización.

**PrescriptionPrivate v2 — 7 pruebas**

- `only_patient_can_authorize_or_revoke_consent`: exige la firma del paciente para autorizar o retirar su consentimiento.
- `booking_requires_authority_signature_and_exact_arguments`: valida la autoridad de reservas y los argumentos autorizados.
- `signatures_expiry_and_blocking`: comprueba firmas, vencimiento y bloqueo de la receta.
- `only_the_authorized_doctors_signature_can_issue_to_the_signed_recipient`: exige la firma del médico autorizado y el destinatario exacto.
- `authorized_private_issuance_lifecycle_and_duplicates`: verifica el ciclo de estados y la prevención de duplicados.
- `patient_consent_is_scoped_revocable_expiring_and_single_use`: comprueba alcance, revocación, vencimiento y consumo del consentimiento.
- `direct_mint_requires_matching_live_booking_and_consumes_it_atomically`: exige una reserva coincidente y vigente; la consume al emitir.

### Las 137 pruebas de aplicación

`evidence/app-tests.txt` registra **137 aprobadas en 23 archivos**. Es el resultado histórico de aplicación del 7 de septiembre, no una afirmación sobre una ejecución nueva o sobre 137 pruebas exclusivas de los contratos privados.

El listado consultable de nombres en la lámina se reconstruyó el 8 de septiembre a partir de las fuentes disponibles, excluyendo las 9 pruebas posteriores de firma Privy. El reporte histórico no guarda nombres individuales: el inventario ayuda a consultar los casos, pero no acredita la identidad exacta de cada caso ejecutado el día 7.

La suite contiene módulos anteriores, regresiones y reproducción de hallazgos conocidos. Incluye un caso deliberado del cifrado anterior que, sin clave configurada, guarda texto claro y genera una advertencia. La aprobación de esa prueba documenta ese comportamiento; no acredita su seguridad ni convierte los módulos anteriores en entregables. El flujo privado tiene evidencia separada de almacenamiento cifrado y acceso restringido.

### Verificaciones complementarias

- **TypeScript:** salida sin errores y código de salida 0, según `evidence/typecheck.json` del 7 de septiembre.
- **Servicios y lectura privada:** 13 comprobaciones del recorrido y 12 controles de auditoría, incluidos correspondencia de identidades, integridad entre ciphertext y cadena, lectura del paciente y rechazo de otra identidad.
- **Rechazos por simulación:** reserva ausente, reserva revocada y emisión duplicada, entre otros. Una simulación rechazada no genera un recibo de transacción publicada.
- **Relay:** seis envolturas adicionales de pago de comisiones (*fee-bump*) verificadas con estado `SUCCESS` y pagador esperado, registradas en `evidence/closure-live-verification.json`. Son evidencia complementaria distinta de los cuatro recibos del recorrido; no representan seis pasos extra para el usuario ni sustituyen las firmas del médico o paciente.

## Privacidad y límites de esta entrega

- El expediente y el documento de receta se guardan cifrados fuera de cadena. En Stellar son públicos las direcciones, relaciones entre participantes, compromisos, fechas y estados; no se afirma anonimato.
- El servidor autorizado realiza el descifrado. La demo comprobó lectura del paciente autorizado y rechazo de identidades ajenas mediante servicios y herramientas de prueba.
- El registro acredita una autorización administrativa. La revisión profesional ocurre fuera del contrato; los expedientes utilizados son sintéticos.
- La asignación al paciente ocurre al emitir. No se entrega una función de retransferencia de recetas entre pacientes; revocar conserva el historial.
- El portal con login y firma integrada de **Privy, exclusivamente en Stellar**, pertenece al siguiente hito y está pendiente de validación del recorrido completo en navegador. La evidencia de esta entrega no acredita ese recorrido.
- Ficha clínica, licencias, dispensación y otros módulos anteriores quedan fuera de este cierre. Que existan en fuentes o pruebas históricas no implica su aceptación ni su retirada del código activo.
- Este paquete acredita la validación técnica documentada en Testnet. No declara auditoría integral, aptitud clínica de producción, un build o merge actuales ni aceptación contractual firmada.

## Changelog resumido

### 7 de septiembre de 2026 · Cierre técnico

- Consolidación de **DoctorRegistryPrivate** y **PrescriptionPrivate v2** como los dos contratos de esta entrega.
- Despliegues identificados en Testnet y comparación de hashes con las recompilaciones locales.
- Recorrido privado con autorización médica, reserva, consentimiento y emisión: cuatro recibos confirmados.
- Evidencia de documento cifrado, compromiso coincidente, lectura autorizada y rechazo de accesos ajenos.
- Once pruebas contractuales, 137 de aplicación y comprobación TypeScript sin errores; evidencia adicional del relay.
- Captura de fuentes, binarios y reportes con sus manifiestos de integridad.

### 8 de septiembre de 2026 · Preparación del entregable final

- Mejora de la lámina principal y explicación de las cuatro transacciones repartidas entre los dos contratos.
- Listados consultables de pruebas con buscador y aclaración de su procedencia.
- Guía del presentador y material de preguntas para acompañar la entrega.
- Video grabado, según confirmación del responsable; enlace pendiente.
- Changelog consolidado y esta página preparada para importar a Notion. Publicación y aceptación aún pendientes.

## Material para adjuntar y cierre

- [x] Contratos identificados en Testnet y recibos enlazados en esta página.
- [x] Fuentes, WASM, manifiestos y reportes reunidos en el paquete local.
- [x] Lámina principal: `TrustLeaf-transacciones-de-prueba.html`, con listados consultables de pruebas.
- [x] Apoyo a la presentación: `TrustLeaf-dos-contratos.html`, `TrustLeaf-preguntas.html` y `TrustLeaf-guia-presentador.html`.
- [x] Video grabado, confirmado por el responsable el 8 de septiembre.
- [ ] Adjuntar el video o incorporar su enlace accesible para el receptor.
- [ ] Adjuntar el paquete actualizado `TrustLeaf-Semana-1-Entrega-2026-09-08.zip` o incorporar su enlace de descarga.
- [ ] Importar esta página en Notion y compartirla con el responsable de revisión.
- [ ] Registrar la revisión y aceptación formal del entregable.

**Para consultar el detalle:** dentro del paquete, abrir `LEER-PRIMERO.md`, revisar los reportes en `evidence/` y comprobar `MANIFEST-SHA256.json`. Las páginas HTML deben abrirse desde el paquete descomprimido para conservar sus enlaces locales. El changelog completo se encuentra en `CHANGELOG-SEMANA-1.md` del paquete.

**Cierre propuesto:** validación técnica de semana 1 documentada; paquete y video preparados para entrega y revisión. La aceptación formal corresponde al responsable.
