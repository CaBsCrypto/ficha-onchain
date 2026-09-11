# Revisión asistida de seguridad — SOW Semana 1

Fecha de verificación RPC: 2026-09-07 UTC. Fuente auditada: `22d546e852d3a2f6dd6d0731512c8c0f6d542cf9` (main después de PR #99). Alcance contractual confirmado en el texto oficial aportado por el responsable y en `docs/sow-delivery/WEEK_1.md`: DoctorRegistry, PrescriptionSoulbound, ciclo Registered → Active → Revoked, autorización, duplicados, Testnet y relay.

## Veredicto

**No listo para declarar cierre de seguridad sin reservas.** Los controles funcionales de semana 1 pasan, pero hay una ruta pública en el contrato de recetas desplegado que permite a una wallet no registrada consumir una receta activa. La dispensación no es un entregable de semana 1, pero afecta directamente al estado y a la revocación del mismo contrato. El estado anterior de CI verde y entrega funcional no constituye una revisión de seguridad suficiente.

No se realizaron transacciones nuevas, despliegues, merges ni acceso a datos clínicos. Solo consultas RPC de código, recompilación local y pruebas locales sintéticas. Esta es una revisión asistida, no auditoría externa ni certificación clínica.

## Hallazgos priorizados

| ID | Prioridad / estado | Archivo y línea | Escenario, impacto y reproducción |
| --- | --- | --- | --- |
| S1 | Alta, confirmado, bloqueo | `contracts/prescription-soulbound/src/lib.rs:373` | `dispense` comprueba firma pero omite autorización de DispensaryRegistry. Wallet arbitraria firma dispense de todo el balance: estado Burned; luego médico no puede revoke. PoC `contracts/prescription-soulbound/tests/audit_security.rs:23`, con mock_auths específico del atacante, no firma global. Aplica al WASM de recetas desplegado: recompilación y hash RPC coinciden. |
| S2 | Alta condicionada a nuevo despliegue, confirmado local | `contracts/doctor-registry/src/lib.rs:97` | Primera llamada a init permite elegir admin sin autenticación. PoC `contracts/doctor-registry/tests/security_review.rs:6`, sin auth. No es takeover de instancia ya inicializada y no se atribuye automáticamente al WASM Registry histórico. Para un despliegue futuro usar constructor atómico; pedir firma del admin elegido por el caller no resuelve la carrera. |
| S3 | Media, confirmado | `contracts/prescription-soulbound/src/lib.rs:393` | dispense(0) cambia Active a PartiallyDispensed sin consumir saldo y is_valid devuelve false. PoC audit_security.rs:53. Exigir units > 0 y definir coherencia is_valid con estados dispensables. |
| S4 | Baja, confirmado | `contracts/prescription-soulbound/src/lib.rs:240`, `:333` | Mint permite units_total=0 o vencimiento pasado; activate acepta receta vencida. PoC audit_security.rs:66. Receta cero unidades puede aparecer válida; vencida queda Active aunque is_valid=false. Validar unidades, vigencia y límites de entradas antes de escribir. |
| S5 | Brecha de evidencia | `docs/sow-delivery/WEEK_1.md:25` | Registry desplegado cc832c... no tiene equivalencia establecida con el fuente auditado y su build histórico c22e97.... Sus pruebas locales no prueban ese binario. Identificar fuente exacta del Registry histórico o validar una versión nueva en un paso separado autorizado. |
| S6 | Baja / semántica, confirmado | `contracts/doctor-registry/src/lib.rs:191`, `:239` | Admin puede conceder permisos a wallet sin registrar; has_permission=true. También persisten tras revocación por diseño. PoC security_review.rs:20. No evade mint de Rx porque consulta is_authorized; futuros consumidores deben consultar ambas condiciones. |

Mitigación mínima propuesta para S1 dentro de semana 1: deshabilitar dispensación en el contrato hasta integrar una autorización real, o implementar comprobación fail-closed contra un registro real. El parámetro desplegado es una dirección placeholder, no un registro implementado (deployment.json). Ocultar un botón o corregir solo la API no bloquea invocaciones directas. No se implementó ni desplegó una corrección en esta revisión; el binario auditado permanece intacto.

## Observaciones y límites

- Campos medication/dosage y wallets son públicos (`Prescription`, líneas 107–116 y getters). No afirmar que solo hay hashes o cero datos clínicos. Grabación exclusivamente sintética.
- activate y block no emiten eventos propios, aunque su cambio existe en estado/transacción. No prometer un evento por cada transición.
- TTL: Registry no extiende TTL explícitamente; Rx usa threshold50/bump100. Esto requiere política y ensayo de restauración. No se confirmó bypass por TTL: entradas persistent/instance archivadas se restauran según protocolo y simulación, no se borran como temporary. Referencia: https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival
- Índices Vec sin paginación, sin límites explícitos de cadenas y transferencia admin de un paso: riesgos operativos/escala, no explotación reproducida adicional.
- Manifest histórico de inputs Rx no coincide byte a byte con checkout LF ni CRLF; no hay drift lógico en Git respecto del commit de corrección. No sobrescribir evidencia histórica para ocultarlo. La recompilación de esta revisión sí coincide exactamente con el binario desplegado.

## Evidencia nueva

- `docs/evidence/security-review-week1/tests.txt`: 36 pruebas funcionales previas + 7 pruebas de revisión = 43 pasando. Los PoCs pasan porque afirman el comportamiento vulnerable; **no son pruebas verdes de que S1–S4 estén corregidos**.
- `docs/evidence/security-review-week1/readonly-code-hashes.json`: consulta RPC sin firmas/tx. Ledger4544582. Rx y Registry disponibles.
- Rx recompilado con Stellar CLI desde fuente actual: `bd9d0b97d800b45909ccc13da1613c47d15aa75b8ae88389ab2c178db908343e`, igual a Testnet y al artefacto histórico. Archivo ignorado `contracts/target/security-review-wasm/prescription_soulbound.wasm`.
- Registry observado: `cc832c816bcb11286dcd0151328231700d5489a276692f0c0ece623a2c4437c8`. Disponibilidad no equivale a correspondencia de fuente.

Reproducir pruebas: `cargo test --offline --locked --manifest-path contracts/Cargo.toml -p doctor-registry -p prescription-soulbound -p trustleaf-e2e`.

## Matriz SOW

| Requisito | Resultado |
| --- | --- |
| Registry registro/check/revocación/admin transfer | Local pasa; fuente del WASM histórico pendiente de equivalencia; init futuro requiere mitigación. |
| Rx emisión/asignación/revocación/status | Flujo nominal pasa; S1 permite alterar estado y bloquear revocación. |
| Registered → Active → Revoked | Local y evidencia SDK sintética histórica; no portal autenticado. |
| No autorizado / duplicados | Mint y duplicado exacto antes/después de revocar pasan; no significa control de farmacia correcto. |
| Dos contratos Testnet verificables | IDs y hashes disponibles por RPC; Rx coincide con recompilación, Registry limitado como arriba. |
| Relay | Cinco fee-bumps sintéticos históricos; no nuevas transacciones en revisión. |
| GitHub / documentación | PR99 mergeada, CI/Vercel verdes en 22d546e; hallazgos de esta revisión todavía locales, no publicados. |

## Checklist antes de grabar

1. Resolver S1 en código, convertir PoC a prueba de rechazo, pasar suite y compilar; cualquier nuevo despliegue necesita autorización y nueva evidencia/ID. Resolver S3/S4 en el mismo ciclo si se cambia el contrato.
2. Aclarar procedencia Registry y manejo seguro de init; no afirmar equivalencia de ambos WASM mientras falte.
3. Grabar README/SOW, commit exacto, CI, IDs, hashes y txs sintéticos. Identificar rechazos RPC como simulación y distinguir fuente corregida de versión desplegada.
4. Si se requiere portal: verificar ID efectivo, modo real/simulado, aislamiento de base de datos y signers; ensayar login/emisión/reintento/estado exclusivamente con identidades sintéticas. No asumir éxito por pruebas SDK.
5. Solicitar aceptación formal del responsable con los límites y riesgos restantes explícitos.

