# Semana 2 · Opción Gateway y reapertura local

**Estado: historial recuperado con Gateway; revisión manual en curso.** El zoom al 200 % fue aplicado según el usuario; falta confirmar legibilidad y controles en el historial cargado. Cambio real de cuenta y firma desde el botón del producto continúan pendientes. No se declara semana 2 lista para grabar.

## Cambio comprobado

Código `f98f0e7e931f445245443a4460dab63845d69770`, rama `codex/sow2-testnet-rpc-provider`, [PR #143](https://github.com/CaBsCrypto/ficha-onchain/pull/143) en borrador, basada en #142. Build local `w84CZMnfdwQQlIQaThwRX`.

El RPC de SDF devolvió HTTP 503 (`no available server`) en las comprobaciones de las 19:19–19:22 UTC del 15 de octubre. Gateway respondió salud correcta y la misma passphrase de Testnet. Ambos destinos figuran en la [documentación de Stellar](https://developers.stellar.org/docs/data/apis/rpc/providers).

La nueva selección de servidor `TRUSTLEAF_CLINICAL_RPC_PROVIDER=gateway` se aplica tanto al adaptador web como al lector privado de documentos. SDF sigue siendo el valor por defecto. Se rechazan valores vacíos, nombres desconocidos y URLs arbitrarias; no hay cambio automático de proveedor ni retransmisión automática. Se mantienen las comprobaciones de red, contrato, WASM, archivo, autoridad, identidad, permisos e integridad. El guard de escrituras y la configuración histórica no cambian. [Guía operativa](../../sow2/RPC-CLINICO-TESTNET.md).

## Evidencia

| Comprobación | Resultado | Alcance |
| --- | --- | --- |
| Pruebas afectadas | 130 aprobadas | Aisladas; selección de ambos lectores y controles existentes |
| Aplicación | 965 pruebas / 75 archivos aprobados | Aisladas |
| Servicios privados | 263 aprobadas | Aisladas |
| TypeScript y build | Aprobados | Código de esta opción; contratos sin cambios ni nueva ejecución Rust |
| Gateway | [24 lecturas correctas](contract-readback.json), sin archivo ni auth inesperada | Simulaciones RPC reales sin firmas ni transmisiones |
| Neon dev | [Ocho hashes clínicos originales conservados](database-preflight.json), sin estados inciertos en las colas inspeccionadas del paciente y relayer | Transacción SQL de sólo lectura |
| Historial autenticado | Tres entradas y cuatro versiones; contenido y recibos comprobados a las 19:49:56 UTC | Aplicación real y sesión existente de Privy |

El médico sigue vencido y sus permisos de lectura/agregado retirados. Las escrituras clínicas continúan apagadas. No se repite el ensayo anterior ni se crea una nueva transacción clínica. Una contribución propia del paciente no necesita renovar al médico, pero su firma manual todavía no se ha realizado.

La primera inspección fue bloqueada por revisión automática al interpretar los identificadores como contenido sensible. Antes del reintento se comprobó que el repositorio es público y que el [alcance de las consultas](rpc-payload-scope.json) contiene sólo direcciones, IDs opacos y versiones de la ejecución sintética ya publicada. No se envían correos, tokens, claves, documentos cifrados ni contenido clínico. El reintento aprobado pasó sin firmas ni transmisiones.

La primera ejecución de pruebas no llegó a ejecutar casos debido a un bloqueo de caché temporal de Windows. La ejecución posterior fuera de ese bloqueo produjo los resultados aprobados anteriores; no se contabiliza el fallo de arranque como un fallo de producto ni como pruebas aprobadas.

## Pendientes y límites

1. Confirmar que el historial y los permisos siguen legibles y accesibles al 200 % aplicado por el usuario.
2. Cambiar a una segunda cuenta existente, comprobar que no aparecen datos anteriores y volver a la cuenta original. Códigos sólo en Privy.
3. Preparar una única nota sintética desde el producto, revisar y firmar expresamente, auditar recibo y persistencia y volver a apagar escrituras. No sustituir intentos inciertos ni repetir las ocho operaciones.

Los portales anteriores, workers, herramientas de semana 1 y el auditor independiente de recibos conservan su proveedor SDF; la guía explica la inyección explícita de Gateway al auditor. No se modifican main, contratos, APIs, esquema, claves ni variables de preview. El estado de CI se consulta en la PR; el estado Vercel omitido por las reglas de build no acredita un preview ejecutado o configurado. La aceptación del revisor sigue separada.
