# Entrega de coordinación: reserva y prescripción privada

Estado actualizado: implementación local y ocho comprobaciones reales en Neon de desarrollo, con el nuevo paso de migración aplicado. Sin despliegue ni transacciones Stellar ejecutados por estos agentes. Una coordinación técnica de IA distribuyó contrato/worker y backend en dos especialistas con archivos separados; no se contrataron personas.

## Código entregado

| Parte | Implementación | Validación |
|---|---|---|
| Prescription privada | Interfaz v2 con autoridad explícita, atestación y revocación de reserva, participantes y vencimiento exactos, consumo atómico junto con consentimiento | 7 pruebas Rust locales y compilación Stellar |
| Vinculación de cuentas | POST/PUT en `/api/stellar-wallet-binding`: desafío de cinco minutos y firma Ed25519 verificada; identidad Privy obligatoria | Firma real con claves efímeras; persistencia SQL simulada |
| Solicitud del paciente | POST en `/api/prescription-bookings`: paciente autenticado confirma la reserva; cuentas verificadas y consulta elegible; nonce estable de emisión | Pruebas de ruta y SQL simulado |
| Recuperación/cancelación | GET recupera estado; DELETE conserva solicitud de cancelación pendiente | No se informa revocación on-chain por cambiar la base |
| Persistencia | Paso central `prescription booking preparation`: desafíos, vínculos verificados, solicitudes; claves de unicidad, leases, XDR/hash y trigger de protección de agenda | Migración nueva aplicada en dev; restricciones y carreras verificadas con fixtures sintéticas |
| Worker | Script ejecutable de un ciclo para atestar/revocar, firma con almacén seguro, fee-bump por relayer, lock global de autoridad y lease por fila | 9 pruebas locales con efectos SQL/RPC inyectados |

El backend tiene nueve pruebas aprobadas y typecheck sin errores. La coordinación volvió a ejecutar las nueve pruebas backend y las nueve del worker: todas aprobadas. Los tests no son evidencia de consultas Privy reales, Postgres real ni transacciones Testnet.

## Evidencia reproducible local

```powershell
cargo test --offline --locked --manifest-path contracts/Cargo.toml -p prescription-private --lib
npx vitest run src/__tests__/prescription-bookings.test.ts
node --test scripts/worker-prescription-bookings.test.mjs
npx tsc --noEmit
```

WASM v2 optimizado: 11.358 bytes. SHA-256: `4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c`.

## Fronteras de confianza

La autorización de reserva requiere la firma de la autoridad configurada aunque se invoque directamente el contrato. Esa autoridad confía en el backend para comprobar la solicitud autenticada, la reserva y las cuentas verificadas. El paciente firma su consentimiento independientemente; el médico firma la emisión y sigue sujeto a Registry. El relayer solo paga.

La base y Stellar no cambian atómicamente. El worker guarda XDR y hash antes de enviar, reutiliza el mismo sobre al recuperar y exige recibo exitoso más lectura coincidente. Una cancelación concurrente conserva su marcador y se concilia después del resultado de la transacción. Un sobre vencido de resultado incierto requiere recuperación manual; no se genera otra transacción con otra emisión.

## Configuración del worker

Ejecutar `node scripts/worker-prescription-bookings.mjs --once` únicamente con configuración explícita en el entorno, sin escribir secretos en documentación: `DATABASE_URL` del branch dev autorizado, `PRESCRIPTION_PRIVATE_CONTRACT_ID`, `BOOKING_AUTHORITY_PUBLIC_KEY`, `BOOKING_AUTHORITY_ALIAS`, `STELLAR_CONFIG_DIR` y `RELAYER_SECRET`.

El firmante de autoridad permanece en el almacén seguro del CLI. El worker rechaza otra base, red distinta de Testnet, interfaz de contrato distinta de v2 o autoridad discordante. Las variables no se incorporan por sí solas al script: el entorno de ejecución debe provisionarlas. No se ejecutó este comando con credenciales reales en esta entrega.

## Pendientes que impiden declarar el flujo completo

- Migración dev y ocho verificaciones SQL completadas. Mantener el requisito de migración previa para cualquier otro entorno; no se modificó producción.
- Configurar y ejecutar un nuevo contrato v2 y el worker con recibos Testnet y lecturas posteriores. La coordinación raíz controla esa evidencia separada.
- Conectar UI y adaptadores de firma del paciente/médico. Los endpoints no firman ni envían consentimiento o recetas. El vínculo inicial admite cuentas G Ed25519; cuentas contrato/passkeys requieren otro adaptador.
- Conectar emisión privada cifrada y entrega del documento. La ruta histórica de mint no se migró por esta entrega.
- Diseñar cierre terminal de consultas: el trigger protege toda modificación legacy de una reserva ligada, incluidas notas y estado completed. No relajar el guard sin preservar elegibilidad y conciliación.
- La primera versión admite una solicitud de prescripción por consulta. No permite borrar evidencia para reutilizar la consulta.
- Validar firma clínica avanzada, dispensación y casos de representantes antes del uso clínico. No hay ZK en esta versión.

Referencias: [arquitectura de atestación](ARQUITECTURA_ATESTACION_RESERVA.md), [criterios raíz](VALIDACION_RESERVA_EMISION.md), [privacidad de Prescription](PRESCRIPTION_PRIVACIDAD.md).

## Comprobación posterior en PostgreSQL real

Se ejecutó únicamente el paso `prescription booking preparation`, con validación previa del host de Neon dev. Después se ejecutó `node scripts/validate-prescription-bookings-db.mjs --dev-only`. Ocho comprobaciones aprobaron: existencia de tablas/trigger, consumo concurrente del desafío con un único ganador, unicidad wallet y rollback, preparación concurrente con identificador/vencimiento estables, rechazo de paciente ajeno, protección UPDATE/DELETE legacy, cancelación previa y mutación concurrente esperando el bloqueo de una reserva recién autorizada.

Los servicios TypeScript actuales se compilaron temporalmente y ejecutaron contra PostgreSQL real, sin duplicar su SQL en los tests. La firma del desafío se generó con claves efímeras. Todas las filas sintéticas se eliminaron por sus identificadores exactos y se verificó su ausencia; también se retiraron los archivos temporales de compilación. No se enviaron transacciones Stellar.

[Evidencia SQL real y hashes de fuentes](../../evidence/security-review-week1/booking-db-9b38716f-e60d-47fd-a260-555a90eb74d2.json). Esto complementa las pruebas anteriores con SQL/RPC simulados; todavía no es el flujo de la app con Privy real ni validación en Stellar.
