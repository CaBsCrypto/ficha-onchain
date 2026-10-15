# Semana 2 · Recuperación de lectura · 15 de octubre de 2026

**Estado: lectura autenticada recuperada y dos restauraciones autorizadas confirmadas.** El portal muestra las tres entradas y cuatro versiones existentes. No se repitieron las ocho operaciones del [ensayo del 11 de octubre](../sow2-week2-testnet-2026-10-11/INFORME.md). La revisión manual restante sigue separada de esta recuperación técnica.

## Diagnóstico real y alcance

El portal recuperó la sesión del paciente, pero rechazó la lectura de Stellar. La red es Testnet y los hashes WASM coinciden. La instancia y el código de `DoctorRegistryPrivate` devolvieron `liveUntilLedgerSeq: 0`. Una simulación exitosa sin `restorePreamble` no bastaba para probar que estaban vivos: su extensión de recursos indicó **dos entradas archivadas**, índices `[0,1]` del footprint de lectura/escritura.

La comprobación posterior confirmó que son exactamente la instancia del registro `CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2` y su código WASM `b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02`. La consulta individual del médico reveló después otra entrada archivada. Se restauraron mediante dos autorizaciones específicas, sin renovar la autorización médica ni modificar permisos del paciente.

Esto corrige el diagnóstico preliminar de una mera anomalía de metadatos. RPC puede devolver cero por distintas causas; **en este caso se observó archivo real**. Referencias: [campo TTL de RPC](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries), [reporte de TTL cero](https://github.com/stellar/stellar-rpc/issues/990), [restauración automática CAP-66](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0066.md#automatic-entry-restoration).

## Corrección y pruebas

Código `daf18d6fb2ebdfdfc2f3071eac03d8bb7b9f9806`:

- Cero o ausencia de TTL significan vigencia desconocida; se mantienen los pins de red, contrato, WASM, configuración, identidad y autorización.
- Cada simulación de lectura debe seguir siendo válida y sin autorizaciones inesperadas. Además se rechaza `restorePreamble`, extensión de restauración automática no vacía y datos de transacción ausentes o malformados.
- TTL positivo vencido o inválido continúa rechazado. Una comprobación inicial correcta no permite eludir la revisión de archivo en las lecturas posteriores.
- No se firman ni transmiten operaciones desde el lector. No se cambian contratos, permisos, contenido cifrado ni esquema.

Resultados nuevos sobre esas fuentes: **950 pruebas de aplicación / 74 archivos, 263 privadas, TypeScript sin errores y build aprobado**. Pruebas aisladas, distintas de la inspección RPC real. No se volvieron a ejecutar las pruebas contractuales ni las ocho transacciones. Build local `KmOTlOgm1mC2RPG5ni5y3`, servidor en `127.0.0.1:3016` con escrituras apagadas.

## Primera restauración autorizada y confirmada

[Inspección pública y estimación](registry-restoration-inspection.json): una operación `restoreFootprint`, únicamente para las dos claves anteriores. Fuente/pagador: relayer Testnet existente `GBMKFDNUAQWUPSU73SDLAHJLGYJ55B6OTATX5QRIHXYGVJXTZLF26PHB`. Estimación simulada **3,4518175 XLM de Testnet**; se solicita un máximo de **5 XLM de Testnet**. No es una cotización en dinero real ni comisión ya cobrada.

Se consultaron las tablas `private_operations`, `clinical_web_operations` y `clinical_transaction_attempts` de Neon dev para esa wallet: ninguna contenía operaciones suyas. Es una comprobación puntual, no un bloqueo exclusivo ni una auditoría de todas las colas de otras wallets.

El usuario autorizó específicamente una transacción para esas dos claves con máximo de 5 XLM de Testnet. Se comprobó saldo, ausencia de workers concurrentes, tres colas y bloqueo exclusivo mediante conexión directa a Neon dev. El intento, sobre y hash se conservaron antes de transmitir. Se utilizaron journals separados del ensayo clínico.

**Resultado: SUCCESS**, ledger `5204777`, [recibo `966fe5e7`](https://stellar.expert/explorer/testnet/tx/966fe5e7ceacf9195959729b9eccfff5bff412d5017967e8fe350a96a1cf0fe4). Comisión efectivamente cobrada: **2,9948101 XLM de Testnet**, menor que el máximo autorizado. [Resultado saneado](registry-restoration-result.json): sobre/firma/footprint exactos y una sola operación de mantenimiento; cero operaciones clínicas nuevas. Cuatro pruebas aisladas adicionales comprobaron la política del ejecutor; no se suman a las cifras de aplicación o servicios privados.

La [lectura posterior](registry-post-restore-readback.json) comprobó la instancia y el código con vigencia positiva, interfaz y administrador correctos, y el historial del paciente vivo. La consulta del médico reveló otra entrada archivada, fuera del alcance de la primera autorización. No se amplió silenciosamente el mantenimiento ni se renovó al médico.

## Segunda restauración autorizada: registro del médico

La [inspección completa de lecturas conocidas](remaining-state-inspection.json) simuló **24 consultas**: 23 sin restauración y una con restauración automática; todas respondieron sin autorización de contrato inesperada. La única clave archivada restante corresponde a `Doctor(GAK5N7RPGZMHGFOJ7ZJCC5YCD6WUHGMMJMFBMGM5JGMKTV3KPVROS4DX)` dentro del registro médico privado. Incluye el estado anterior del médico, sin renovar `valid_until` ni modificar permisos del paciente.

El usuario autorizó una segunda `restoreFootprint` para esa única clave: estimación **0,0246352 XLM de Testnet**, máximo **0,1 XLM de Testnet**. Tres pruebas aisladas adicionales del ejecutor comprueban clave única, red y límite; no se suman a las cifras de suites del producto. Se conservaron intento y sobre antes de transmitir, con bloqueo exclusivo y comprobación de las colas.

**Resultado: SUCCESS**, ledger `5204990`, [recibo `ae17e228`](https://stellar.expert/explorer/testnet/tx/ae17e228063d8a8c508dd835ee2006d7441142137aaceb7805601651f0ace156). Comisión cobrada **0,0211316 XLM de Testnet**, dentro del límite autorizado. [Resultado saneado](doctor-record-restoration-result.json): firma, sobre, única operación y footprint exacto verificados. El total real de los dos mantenimientos es **3,0159417 XLM de Testnet**. Son dos transacciones adicionales de mantenimiento, no operaciones clínicas nuevas.

## Comprobaciones finales

| Comprobación | Resultado y evidencia | Naturaleza |
| --- | --- | --- |
| Estado de Stellar | [24 consultas posteriores](post-restoration-required-reads.json) correctas, sin archivo ni autorizaciones inesperadas; cero firmas o transmisiones | Lectura RPC real |
| Registro y médico | [Lectura final](final-registry-readback.json): instancia y código vivos, configuración correcta y `is_authorized=false` | Lectura RPC real; no renueva al médico |
| Persistencia | [Neon dev](persistence-after-maintenance.json): ocho hashes originales sin cambios, tres entradas y cuatro versiones | SQL real de sólo lectura |
| Mantenimiento | Los dos intentos del relayer están confirmados; sin intentos suyos pendientes en las tres tablas inspeccionadas | Comprobación puntual, no de todas las wallets |
| Portal autenticado | Historial cargado, contenido y recibos comprobados; PDF v2 y v1, imagen y nota existentes; lectura/agregado retirados | Observación real con sesión de Privy |
| Archivos | PDF v1 y v2 descargados desde el portal y renderizados legibles; versiones anteriores conservadas | Descarga autenticada y revisión visual local |
| Móvil 430 px | Ancho medido y contenido completo revisados; controles del pie accesibles mediante desplazamiento | Observación real; [captura](historial-430-permisos.png) |

La [evidencia de interfaz](browser-validation.json) distingue la fecha de observación de la última comprobación de contenido. Los informes `registry-post-restore-readback.json` y `remaining-state-inspection.json` se conservan como estados **intermedios**, anteriores a la segunda restauración. Los informes guardados acreditan sus fechas; no garantizan disponibilidad futura.

El médico sigue sin autorización vigente y sus dos permisos están retirados. La aplicación bloquea conceder nuevos permisos en ese estado. Es el resultado esperado, no un fallo de la recuperación; no hace falta renovar al médico para que el paciente lea su propio historial.

## Pendientes para grabar

La lectura del historial está desbloqueada; PDF y revisión completa a 430 px comprobados. Siguen pendientes la firma desde el botón del producto, cambio real de cuenta y zoom al 200 %. El usuario indicó que revisaría el zoom, sin confirmar aún su resultado. El ensayo de ocho firmas por el acompañante de validación no sustituye la comprobación de firma desde el botón del producto.

El video puede revisar la ejecución existente sin nuevas operaciones clínicas. Una demostración manual de firma requiere acordar otra operación sintética concreta; no volver a crear el historial ni repetir el ensayo completo. Semana 1, sus datos y su grabación pendiente se conservan por separado. Sin publicación en main ni configuración de secretos de preview.
