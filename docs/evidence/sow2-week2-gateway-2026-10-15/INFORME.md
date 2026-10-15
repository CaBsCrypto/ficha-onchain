# Semana 2 · Opción Gateway y reapertura local

**Estado: revisión local lista para grabar sobre ejecuciones ya realizadas.** El usuario aprobó el texto al 200 % y se observó el cambio real de cuenta sin datos anteriores, incluida recarga y retorno. El paciente confirmó una única nota sintética mediante el botón del producto y Privy; su recibo, firmas, contenido e integridad pasaron auditoría independiente. Tras reiniciar con escrituras apagadas y recargar, el historial muestra cuatro entradas y cinco versiones. Los ocho recibos originales se conservan. Preview, publicación, grabación terminada y aceptación del revisor siguen separados.

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
| Historial autenticado | Cuatro entradas y cinco versiones; comprobadas a las 23:55:25 UTC tras reiniciar con escrituras apagadas y recargar | Aplicación real y sesión existente de Privy |
| Cambio de cuenta | Segunda cuenta vacía tras recargar; retorno a los datos y recibos propios de la cuenta principal | Observado en interfaz; no se creó otro historial |
| Firma desde el producto | Una nota sintética, confirmada por el usuario mediante Privy; firmas del paciente y relayer, argumentos, resultado y comprobante verificados | [Auditoría independiente](product-signature-audit.json), SQL de sólo lectura y RPC real |

El médico sigue vencido y sus permisos de lectura/agregado retirados. Las escrituras clínicas se habilitaron temporalmente sólo para la nota acordada y se apagaron tras confirmar. Una contribución propia del paciente no necesita renovar al médico. No se repitieron el ensayo anterior ni sus ocho operaciones.

## Nota adicional firmada desde la aplicación

[Recibo `b991c3e6…`](https://stellar.expert/explorer/testnet/tx/b991c3e6cc4bbfc077656e9543ca612fb80f04ec16f25dfe86ff3fa7a8471c6f), ledger `5216962`, método `append_version`. Comisión realmente cobrada: **0,0828838 XLM de Testnet**; el máximo ofrecido de 50 XLM no fue el costo cobrado.

La auditoría verificó las firmas del paciente y relayer, red, contrato, método, argumentos, resultado, comprobante contractual y coincidencia con el sobre guardado. La versión cifrada confirmada en Neon dev conserva el mismo recibo y comprobante; su descifrado e integridad coinciden con la nota sintética revisada. No se publican texto, claves, tokens ni sobres firmados en la evidencia. Las tres colas inspeccionadas del paciente y relayer tienen cero intentos pendientes. El auditor sólo leyó datos; no firmó ni transmitió.

La lectura posterior se realizó desde el servidor reiniciado con escrituras apagadas. A las 23:55:25 UTC la interfaz volvió a mostrar la nota y los registros anteriores, cuatro entradas y cinco versiones. La consulta no fue instantánea: conservar la indicación de carga en la demostración. Esta comprobación no acredita una mejora de rendimiento.

La primera inspección fue bloqueada por revisión automática al interpretar los identificadores como contenido sensible. Antes del reintento se comprobó que el repositorio es público y que el [alcance de las consultas](rpc-payload-scope.json) contiene sólo direcciones, IDs opacos y versiones de la ejecución sintética ya publicada. No se envían correos, tokens, claves, documentos cifrados ni contenido clínico. El reintento aprobado pasó sin firmas ni transmisiones.

La primera ejecución de pruebas no llegó a ejecutar casos debido a un bloqueo de caché temporal de Windows. La ejecución posterior fuera de ese bloqueo produjo los resultados aprobados anteriores; no se contabiliza el fallo de arranque como un fallo de producto ni como pruebas aprobadas.

## Pendientes y límites

1. Zoom al 200 %: **aprobado por el usuario**, con textos y controles del historial y permisos legibles y accesibles. No se presenta como zoom automatizado por la herramienta.
2. Cambio de cuenta: **aprobado por observación de interfaz**. La segunda cuenta muestra «Comienza tu historial», cero entradas anteriores y cero enlaces a recibos, también tras recargar. No se creó otro historial. Al volver a la principal reaparecen sus tres entradas, cuatro versiones y recibos. Códigos sólo en Privy; no se guardan en la evidencia.
3. Firma desde el producto: **aprobada**, con una nota sintética nueva, auditoría independiente, recarga y persistencia. Escrituras apagadas de nuevo y cero pendientes. [Guía de grabación local](../../sow2/GRABACION-SEMANA-2.md).

La luz verde corresponde a grabar una **revisión local de ejecuciones ya realizadas**. Concesiones y revocación se explican mediante sus recibos históricos y el estado actual; no se simulan nuevas firmas ni se renueva al médico para grabar. Una nueva ejecución de esos pasos requeriría preparación y autorización aparte.

Los portales anteriores, workers, herramientas de semana 1 y el auditor independiente de recibos conservan su proveedor SDF; la guía explica la inyección explícita de Gateway al auditor. No se modifican main, contratos, APIs, esquema, claves ni variables de preview. El estado de CI se consulta en la PR; el estado Vercel omitido por las reglas de build no acredita un preview ejecutado o configurado. La aceptación del revisor sigue separada.
