# Diseño de operación API, colas y relayer

Documento de diseño, 2026-09-07 UTC. Contraste estático con el checkout compartido: no implementado, sin pruebas, transacciones ni cambios de configuración. Las referencias por símbolo prevalecen sobre números de línea si hay ediciones concurrentes. Complementa [flujo de datos](MEDICAL_DATA_FLOW.md), no amplía retroactivamente las evidencias SOW 1.

## Qué existe y qué falta demostrar

| Área | Implementación observada | Diseño pendiente |
| --- | --- | --- |
| Identidad de emisión | `src/lib/prescription-issuance.ts:24`: UUID, fecha y digest en sessionStorage; conserva identidad mientras no cambie formulario. | Registro durable del servidor; recuperación entre dispositivos y tras pérdida del navegador. |
| Envío y consulta | `src/lib/stellar/server.ts:83`, sendAndConfirm: envía, consulta hasta 30 veces con esperas y devuelve SUCCESS/FAILED/PENDING. | Separar aceptación HTTP de confirmación ledger; reconciliación persistente aunque termine proceso/request. |
| Serialización | `src/lib/stellar/serialize.ts:35`, withSignerLock: cola de promesas por wallet en memoria. | Coordinación entre instancias; recuperación de trabajos y límites de cola. No asumir exclusión distribuida en serverless. |
| Reintento mint | `src/app/api/mint/route.ts`, realMint: usa misma identidad documental, lock local y hasta tres intentos; rechaza éxito simulado después de fallo real. | Conciliar hash/envelope previo antes de preparar otro intento; estado desconocido explícito y durable. |
| Scripts SOW | `scripts/verify-week1-testnet.mjs:60` y `scripts/deploy-week1-testnet.mjs:47`: guardan hash antes de enviar y consultan checkpoint. | Ese mecanismo de archivos no equivale a cola transaccional de API; no extrapolar garantías a portal. |
| Endpoint relay | `src/app/api/relay/route.ts:20`: guard de Origin que permite cabecera ausente y fee-bump de XDR recibido. | Autenticación, autorización de patrocinio, validación de operación/red/contrato/método y presupuesto antes de firmar. Origin no es identidad de cliente. |
| Cuotas | `src/lib/auth/rate-limit.ts:43`: MCP por organización/entorno/bucket, Postgres atómico; permite al fallar almacenamiento de cuota. | No es protección acreditada de mint/relay. Definir cuotas y degradación segura específicas para patrocinio. |

## Flujo recomendado

API autenticada → autorización del actor y operación → registro durable único → cola acotada → worker por fuente → preparar/simular → firmar y guardar envelope/hash → transmitir → conciliador → estado consultable. Cada flecha es propuesta; ninguna supone infraestructura ya desplegada.

La clave de idempotencia debe quedar ligada a organización, actor, red, contrato/version y digest inmutable de solicitud. Mismo identificador con contenido distinto produce conflicto; mismo identificador con contenido idéntico devuelve el mismo trabajo/resultado. Conservar la misma identidad de negocio aunque cambie un intento técnico. Aplicar unicidad en almacenamiento y una outbox transaccional o mecanismo equivalente para evitar guardar el trabajo sin encolarlo. La entrega de cola puede ser repetida: el consumidor y la protección del contrato deben tolerarla; no prometer entrega exactamente una vez del sistema entero.

## Estados y reintentos

| Estado | Significado | Acción permitida |
| --- | --- | --- |
| Pendiente | Solicitud admitida/en cola, o transmisión conocida esperando resultado. | Consultar trabajo/hash, mostrar espera; conservar identidad. |
| Confirmado | Ledger confirma éxito y resultado corresponde a red/contrato/operación esperados. | Registrar ID/tx; disparar efectos posteriores idempotentes. |
| Fallido | Rechazo definitivo demostrado para ese intento. | Clasificar causa; corregir permisos/entrada cuando corresponda. El fallo de un intento no borra otros intentos inciertos. |
| Desconocido | Timeout, conexión interrumpida o proceso caído tras posible envío. | Bloquear nueva emisión equivalente; reconciliar. No convertir timeout en fracaso definitivo ni en éxito. |

Persistir hash calculado, envelope firmado, time bounds, fuente/secuencia y estado **antes** del envío. El envelope puede contener datos sensibles: almacenamiento restringido y cifrado; no logs generales. Consulta RPC fallida/NOT_FOUND aislada no acredita ausencia de ejecución. Mantener política de reconciliación con historia disponible y operador para ambigüedades; considerar ventana de retención RPC.

Reintentar lecturas con backoff exponencial, jitter, techo y presupuesto total. Retransmitir el mismo envelope solo tras comprobar red, vigencia y política de API/RPC; nunca generar un UUID clínico nuevo para resolver un timeout. Preparar una transacción nueva requiere resolver el intento anterior, volver a obtener secuencia/recursos y mantener identidad de negocio. Errores de autorización, duplicado o entrada inválida no merecen retry ciego. Una notificación/email posterior debe usar outbox propia y no provocar otro mint al fallar.

## Fuente/secuencia, cuotas y capacidad

Coordinar por cuenta fuente de la transacción interna, no solo por cuenta que paga fee-bump. Opciones: worker único por partición o lock/lease distribuido con fencing, persistencia y recuperación. Revalidar secuencia al adquirir trabajo; no liberar una dependencia incierta como si se hubiera confirmado. El relayer necesita límites de tarifas/saldo y control de quién puede consumir presupuesto; el patrocinio no otorga permiso contractual.

Cuotas por actor/organización, operación y entorno, tamaño máximo de body/XDR, profundidad máxima de cola, timeout y presupuesto diario. En caída del control de cuotas, detener patrocinio o usar un cupo degradado explícito y acotado; no emitir sin límite. Autorización siempre cerrada ante fallo. Backpressure mediante respuesta reintentable y Retry-After cuando proceda, sin perder trabajo admitido.

Medir latencias p50/p95/p99 desde admisión hasta confirmación, espera de cola, TPS sostenido, rechazos, conflictos de secuencia, edad de desconocidos, costo por confirmación, memoria y tasa de crecimiento. Ensayos de carga futuros con datos sintéticos y límites de gasto autorizados. La capacidad depende de cuentas fuente, RPC, ledger, DB, concurrencia y presupuesto: no existe evidencia de capacidad infinita ni cifras de producción en este documento.

## Observabilidad y recuperación

Logs operativos mínimos: ID aleatorio de trabajo, entorno, etapa, código de error sanitizado, duración e intento. Evitar nombres, RUT, emails, diagnóstico, medicamento/dosis, body, secretos y XDR. Wallet/hash públicos siguen siendo correlacionables; reservarlos para evidencia con acceso controlado y retención justificada. No volcar excepciones RPC completas sin filtrar.

Respaldar registro de trabajos, outbox, correlaciones y configuración con cifrado, control de acceso y prueba de restauración. Claves de firma mediante mecanismo separado de custodia/recuperación, nunca repositorio o backup indiscriminado. Definir RPO/RTO y responsable; están pendientes de acuerdo, no medidos. Recuperar primero trabajos pendientes/desconocidos, reconciliar con ledger, luego reanudar consumo. Restaurar una DB antigua no autoriza replay de operaciones ya ejecutadas. La cadena no reemplaza backup de documento clínico ni de autorización off-chain.

## Responsables y aceptación

| Responsable funcional por asignar | Evidencia requerida |
| --- | --- |
| Backend | Unicidad durable, API de estado, autorización de patrocinio, recuperación de request interrumpida. |
| Operación relayer | Custodia, saldo/costos, coordinación fuentes, alarmas, procedimiento de pausa y conciliación. |
| QA | Casos sintéticos: doble envío, caída tras broadcast, dos instancias, RPC lento, reinicio y efectos posteriores repetidos. |
| Responsable de datos | Minimización, acceso a envelopes/evidencia, retención y restauración conforme al tipo de registro. |
| Dueño del entregable | Aprobar escenario, evidencia y límites demostrados. |

**Demo SOW 1:** evidencia existente de cinco transacciones sintéticas fee-bump con feeSource verificado, ciclo contractual y rechazos por simulación RPC; mostrar esos límites y las versiones exactas. Eso demuestra relayer SDK/Testnet configurado, no la cola propuesta ni operación productiva. Ver [WEEK_1.md](WEEK_1.md).

**Después / portal:** ensayo autenticado sintético que vincule solicitud→trabajo→hash→registro confirmado; reconcilie timeout sin segunda emisión; compruebe reanudación y cuotas. Necesita aceptación separada de diseño e implementación y ejecución autorizada. No se ejecutó en este encargo.
