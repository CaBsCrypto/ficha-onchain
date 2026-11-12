# SOW 2 · Semana 3 · QA

Corte UTC: 2026-11-09T21:36:44.525Z. **PARCIAL: código y pruebas locales aprobados; cierre del ensayo real pendiente.**

Rama codex/sow2-semana-3-aportes-medicos; base f24908c3bddf07e46773c1e2db096303ba4e3e21; árbol con cambios existentes y nuevos. Build 9Korj6MbIuM14GNaYK8N-. 649 archivos de código/configuración, SHA-256 conjunto [identificador en evidencia local]. El manifiesto identifica los bytes reales; no atribuir estas pruebas al commit limpio.

| Comando | Resultado | Pruebas | Omitidas | Log conservado en D |
|---|---|---:|---:|---|
| npm test -- --maxWorkers=2 | PASS, exit0 | 2158 | 4 | implementacion-aplicacion-completa.log |
| npm run test:private | PASS, exit0 | 865 | 0 | implementacion-privadas-completas.log |
| npx tsc --noEmit | PASS, exit0 | — | 0 | implementacion-typescript.log |
| npm run build | PASS, exit0 | — | 0 | implementacion-build.log |
| cargo test --locked --workspace | PASS, exit0 | 25 | 0 | implementacion-contratos.log |
| stellar27 contract build --locked --package clinical-history-private --out-dir <local> | PASS, exit0 | — | 0 | implementacion-wasm.log |

Las cuatro pruebas PostgreSQL son opt-in y no se ejecutaron. No hubo escrituras de fixtures en Neon, migraciones, nuevas firmas de cuentas reales ni transmisiones durante esta implementación. La integración P1/P2/D1/D2/D3 usa handlers/cripto/XDR reales con adaptadores SQL, Privy y RPC simulados: LOCAL_INTEGRATION_MOCK.

Los rechazos estructurales se probaron antes de cifrar/guardar un borrador o reservar/publicar una operación. Se comprobaron archivos PDF/PNG/JPEG válidos bajo y exactamente en3.000.000bytes; un byte adicional, corrupción, tipo/extensión falsos, timeout y concurrencia. El original aprobado de964bytes sigue intacto. Schema19 vencido sólo concilia el mismo intento y continúa requiriendo el verificador original de aprobación/manifiesto.

WASM optimizado reproducido:[identificador en evidencia local],15.533bytes, idéntico al desplegado. Cero despliegues. CLI27 descargado desde publicación oficial y comprobado con su digest; SDK permanece14.6.1.

Build:126trazas, cero archivos privados de runtime; worker, PDF.js y Sharp incluidos en las rutas de entrada. Se conserva una advertencia opcional de Privy sobre @farcaster/mini-app-solana, ya presente antes de estos cambios. No se añadió esa integración.

## Evidencia real conservada

Lecturas 2026-11-09T21:27:46.796Z: seis antecedentes/siete versiones, médico v7 vigente, grant6 true/true, RX#3 histórica/vencida, C4 confirmada y reserva liquidada; C5/C6 ausentes. El getter canónico posterior comprobó las seis cabeceras y siete comprobantes de agregado.

| Paso | Hash Testnet | Ledger | Comisión real XLM |
|---|---|---:|---:|
| restauracion | [identificador en evidencia local] (evidencia local) | 5645859 | 1.3885863 |
| renew | [identificador en evidencia local] (evidencia local) | 5645990 | 0.0004726 |
| append_pdf | [identificador en evidencia local] (evidencia local) | 5646333 | 4.8748461 |

Los SDK originales completos se conservan en D con hashes en el manifiesto; no se copian secretos, sesiones ni manifiestos privados al repositorio. C2/C3 y permisos independientes conservan evidencias históricas del 23–25 de octubre, no se presentan como nuevas ejecuciones.

## Pendientes y límites

PDF descargado por paciente y comparación de bytes/SHA; C5 con v1/v2 y RX#3; seis antecedentes/ocho versiones; C6 false/false revisión7 y rechazo posterior con médico vigente. También quedan NOT_RUN la revisión visual final móvil/escritorio/teclado/200% y el reinicio observado desde sesiones reales. P2/D2/D3 reales BLOCKED por disponibilidad, sin sustituirlos por mocks.

Máximo40XLM, seis protegidos para retiro y margen conservador actual de corrección13,7633337 antes de recotizar. Aprobación19 hasta 2026-11-09T23:32:43.000Z; no se reinicia el plazo. Si venció, preparar continuación concreta para aprobación, sin sustituir IDs, repetir confirmados, restaurar, renovar ni fondear.

Semana4: grabación narrada, mapa integral, publicación final, guía completa, QA global y aceptación externa. Sin push, PR, despliegue ni aceptación formal en este trabajo.
