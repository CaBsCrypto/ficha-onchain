# Semana 1 · Matriz de aceptación

Esta matriz separa pruebas aisladas de operaciones reales. La PR es [#135](https://github.com/CaBsCrypto/ficha-onchain/pull/135); no está fusionada. `db9bc2f` aprobó todos sus checks, incluida la reproducción Windows del WASM. Revisión pendiente.

**Actualización del 7 de octubre:** una ejecución independiente `ed9cf324-b9f1-400c-aae8-3323a66407ad` acreditó seis operaciones clínicas, tres versiones cifradas y lectura desde otro proceso, con cero intentos pendientes. Se auditaron por lectura los tres contratos y, aparte, la financiación Testnet. Las herramientas `2565f97` aprobaron 151 pruebas privadas; aplicación 634, contratos 25 (14 clínicos incluidos), TypeScript y build también pasaron en esta preparación. CI/Vercel de `e72024f` aprobados; los checks de cada HEAD posterior se consultan en [#135](https://github.com/CaBsCrypto/ficha-onchain/pull/135/checks). Ver [informe actual](INFORME-SEMANA-1.md) y [evidencia nueva](../evidence/sow2-week1-runs/ed9cf324-b9f1-400c-aae8-3323a66407ad/report.md). Las cifras de la tabla original corresponden a `db9bc2f`.

| Requisito | Evidencia inspeccionada | Resultado |
| --- | --- | --- |
| Contrato nuevo, Testnet y registro médico existente | `deployment.json`, contrato y ABI; dos recibos de despliegue; lectura posterior del código y del registro configurado | Comprobado en Testnet; no modifica los contratos del SOW 1. |
| Sin actualización de código ni sustitución administrativa del propietario | Métodos del contrato, exports WASM y pruebas de firma exacta/propietario | Comprobado por código y pruebas. |
| Sólo el paciente concede y revoca | Pruebas `permissions_require_owner_exact_args_and_are_scoped_to_patient_and_doctor` y revocación; recibos reales de concesión/retiro | Prueba aislada y recorrido real. |
| Leer y agregar independientes; médico autorizado | Cuatro combinaciones en contrato; registry revocado/vencido/pausado/inaccesible; lectura append-only rechazada en servicio | Comprobado mediante pruebas aisladas. El recorrido real usa ambos permisos. |
| Revocación impide acceso posterior y escrituras | Servicio vuelve a comprobar permiso antes de entregar bytes; rechaza revocación/reconcesión durante IO; demo y readback rechazan acceso médico posterior | Lectura real rechazada; escritura rechazada por consulta real `can_append=false` y tests del contrato. No se envió una transacción médica deliberadamente inválida. |
| Correcciones propias, versiones previas e idempotencia | Tests de autor, cabeza esperada, IDs por actor y reintento; PDF v1/v2 recuperados tras reinicio | Comprobado mediante pruebas y persistencia real. |
| Datos privados cifrados fuera de cadena | AES-GCM, contexto autenticado, DEK por versión y KEK externa; SQL guarda sobres; Neon dev devuelve tres versiones verificadas | Comprobado en Neon dev. Custodia DPAPI local, sin servicio de claves de producción. |
| PDF e imágenes hasta 3 MB | PDF/PNG/JPEG en tests; PDF y PNG del recorrido; smoke SQL con exactamente 3.000.000 bytes y rollback | Límite acreditado en Neon real; JPEG mediante prueba aislada. |
| Detectar alteración sin entregar contenido | Tests de bytes, claves, paciente, red, contrato, autor, versión y compromiso alterados; rechazo de sobre alterado en harness | Comprobado; integridad no certifica veracidad clínica. |
| Fallos recuperables, sin confirmaciones falsas ni datos anteriores | Tests de storage/RPC, cambio de identidad, sesión vencida, respuestas tardías; journal persiste antes de enviar y reconcilia el mismo sobre | Comprobado con fallos simulados; no se atribuyen fallos reales a Privy. |
| Exclusividad frente al flujo de recetas | Lock por origen; reserva de journal clínico y guardia en preparación de recetas; tests y dos conexiones directas Neon | Comprobado; un intento reservado sin sobre exige revisión, no se descarta automáticamente. |
| Demostración técnica mínima | Seis recibos de `demonstration.json` y segunda ejecución de lectura `readback.json` | Comprobado con cuentas sintéticas; sin interfaz clínica ni integración Privy nueva. |
| Pruebas/build/CI por commit | 634 app, 109 privadas y 25 contratos locales; aplicación y build del código de producto aprobados; nuevas regresiones privadas ejecutadas | CI/Vercel aprobados para `db9bc2f`. |
| WASM reproducible | CLI 27.0.0 y Rust 1.96.0 fijados; SHA desplegado `29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0` | Compilación limpia local y [CI Windows](https://github.com/CaBsCrypto/ficha-onchain/actions/runs/37354464333) reproducen ese SHA. Linux produce otro hash; no se afirma reproducibilidad entre sistemas ni equivalencia semántica sólo por comparar la interfaz. |
| Preservación del trabajo anterior | Rama desde main; documentos pendientes excluidos de commits y respaldo local registrado | Conservado; sin fusión ni configuración clínica de main. |

## Comprobación operativa adicional pendiente

El diseño también requiere conservar permisos y revisiones después de restaurar estado archivado. Los tests actuales acreditan extensión TTL y rechazo seguro ante archivo; no prueban una transacción real RestoreFootprint. Ese resultado permanece pendiente y no se presume demostrado por el recorrido reciente.

La herramienta de mantenimiento valida el footprint, impide restaurar claves ajenas, limita la comisión y usa el journal de sobres exactos. Sus fallos y reintentos están probados aisladamente. La inspección real del 5 de octubre encontró 16 claves presentes. Ejecutar `--restore` exige autorización específica pendiente tras el rechazo de revisión automática; no hay recibo real de restauración.

## Límites acreditados

Revocar bloquea entregas posteriores, no copias descargadas. El servidor puede descifrar para personas autorizadas. Claves y respaldo se recuperaron bajo la misma cuenta Windows; no se acredita recuperación portable. Wallets, tiempos y metadatos del contrato son públicos. No hay certificación de seguridad ni atención clínica real.
