# Semana 2 · Recuperación de lectura · 15 de octubre de 2026

**Estado: corrección de código comprobada; lectura real bloqueada por estado archivado.** No declara semana 2 lista para grabar ni repite las ocho operaciones del [ensayo del 11 de octubre](../sow2-week2-testnet-2026-10-11/INFORME.md).

## Diagnóstico real y alcance

El portal recuperó la sesión del paciente, pero rechazó la lectura de Stellar. La red es Testnet y los hashes WASM coinciden. La instancia y el código de `DoctorRegistryPrivate` devolvieron `liveUntilLedgerSeq: 0`. Una simulación exitosa sin `restorePreamble` no bastaba para probar que estaban vivos: su extensión de recursos indicó **dos entradas archivadas**, índices `[0,1]` del footprint de lectura/escritura.

La comprobación posterior confirmó que son exactamente la instancia del registro `CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2` y su código WASM `b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02`. No se comprobó restauración ni carga del historial después de restaurar.

Esto corrige el diagnóstico preliminar de una mera anomalía de metadatos. RPC puede devolver cero por distintas causas; **en este caso se observó archivo real**. Referencias: [campo TTL de RPC](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries), [reporte de TTL cero](https://github.com/stellar/stellar-rpc/issues/990), [restauración automática CAP-66](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0066.md#automatic-entry-restoration).

## Corrección y pruebas

Código `daf18d6fb2ebdfdfc2f3071eac03d8bb7b9f9806`:

- Cero o ausencia de TTL significan vigencia desconocida; se mantienen los pins de red, contrato, WASM, configuración, identidad y autorización.
- Cada simulación de lectura debe seguir siendo válida y sin autorizaciones inesperadas. Además se rechaza `restorePreamble`, extensión de restauración automática no vacía y datos de transacción ausentes o malformados.
- TTL positivo vencido o inválido continúa rechazado. Una comprobación inicial correcta no permite eludir la revisión de archivo en las lecturas posteriores.
- No se firman ni transmiten operaciones desde el lector. No se cambian contratos, permisos, contenido cifrado ni esquema.

Resultados nuevos sobre esas fuentes: **950 pruebas de aplicación / 74 archivos, 263 privadas, TypeScript sin errores y build aprobado**. Pruebas aisladas, distintas de la inspección RPC real. No se volvieron a ejecutar las pruebas contractuales ni las ocho transacciones. Build local `KmOTlOgm1mC2RPG5ni5y3`, servidor en `127.0.0.1:3016` con escrituras apagadas.

## Mantenimiento propuesto, todavía sin ejecutar

[Inspección pública y estimación](registry-restoration-inspection.json): una operación `restoreFootprint`, únicamente para las dos claves anteriores. Fuente/pagador: relayer Testnet existente `GBMKFDNUAQWUPSU73SDLAHJLGYJ55B6OTATX5QRIHXYGVJXTZLF26PHB`. Estimación simulada **3,4518175 XLM de Testnet**; se solicita un máximo de **5 XLM de Testnet**. No es una cotización en dinero real ni comisión ya cobrada.

Se consultaron las tablas `private_operations`, `clinical_web_operations` y `clinical_transaction_attempts` de Neon dev para esa wallet: ninguna contenía operaciones suyas. Es una comprobación puntual, no un bloqueo exclusivo ni una auditoría de todas las colas de otras wallets.

La autorización de las ocho operaciones clínicas no cubre esta restauración: se solicitó autorización específica. Hasta recibirla, **cero firmas y cero transmisiones de mantenimiento**. Antes de ejecutar habrá que comprobar de nuevo saldo y exclusividad, preservar intento/sobre antes de transmitir y reconciliar el mismo hash si la respuesta es incierta. No crear otra firma para eludir un intento.

Después de una restauración autorizada: auditar su recibo y footprint; comprobar que las simulaciones ya no requieren restauración; recargar y verificar las tres entradas, cuatro versiones, recibos y permisos finales retirados. El vencimiento del médico no necesita renovarse para leer el historial propio.

## Pendientes para grabar

La carga autenticada actual permanece bloqueada hasta completar el mantenimiento. También siguen pendientes la firma desde el botón del producto, cambio real de cuenta, legibilidad del PDF, revisión completa a 430 px y zoom al 200 %. El usuario indicó que revisaría el zoom, sin confirmar aún su resultado.

El video puede revisar la ejecución existente sin nuevas operaciones clínicas. Una demostración manual de firma requiere acordar otra operación sintética concreta; no volver a crear el historial ni repetir el ensayo completo. Semana 1, sus datos y su grabación pendiente se conservan por separado. Sin publicación en main ni configuración de secretos de preview.
