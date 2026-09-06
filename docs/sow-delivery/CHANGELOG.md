# Changelog de validación SOW — 2026-09-05

> Estado vigente: [Semana 1 — validada en Testnet](WEEK_1.md). Nuevo contrato de recetas desplegado, reintentos adaptados, 36 pruebas Rust y 118 de aplicación pasan. Los bloqueos y resultados anteriores se conservan como historia, no como estado actual.

> Actualización 2026-09-06: el dueño confirmó el SOW oficial. Para el cierre vigente consultar [Semana 1](WEEK_1.md): exige dos contratos y relayer. La rama de validación ya fue creada; las referencias al bloqueo Git y a la ausencia de fuente primaria de abajo describen la auditoría previa.

Base Git: db31fbad5355359a72ad09edea7d7134a8685fa2. Cambios locales pendientes de commit por restricción ACL. No se atribuyen al commit base los fixes nuevos.

| Cambio | Motivo | Prueba / evidencia | Brecha |
| --- | --- | --- | --- |
| Tests document-soulbound: fixture con Env prestado, cliente normal para éxito, try_* para error | 11 errores E0599 bloqueaban la suite excluida de CI | 6 tests de esa suite pasan; 44 Rust totales | No cambia contrato desplegado |
| contracts.yml: cuatro contratos + E2E; Stellar CLI, wasm32v1-none, SHA256SUMS | Corregir cobertura y build obsoleto | Ejecución local Rust; revisión de workflow | Run CI pendiente |
| ci.yml: npm test | Evitar merge sin tests de aplicación | 112/112 Vitest | Run remoto pendiente |
| audit-sow + build-sow-local | Exit codes fiables, logs y build sin .env | results.json y logs enlazados en índice | Build local aislado; no certifica Vercel |
| Auditoría y guías | Retirar claims de bloqueo WDAC y distinguir evidencia histórica | Matriz D1/D2/D3 | SOW original y aceptación pendientes |
| Video, redes y Notion | Preparar entrega revisable con claims acotados | Archivos en este directorio | No publicados; video sin grabar |

Para ligar a commit final: crear codex/validate-sow en terminal con acceso Git; revisar git diff; separar CI/docs compartidas en commit deliberado; no incluir .env. Ejecutar npx tsc --noEmit; git fetch y git rebase origin/main antes de PR; repetir checks si cambia código. Registrar SHA y URL de PR en Notion y adjuntar logs correspondientes a ese SHA.

## Build local de contratos y aplicación

Los cuatro WASM se construyeron localmente con Stellar CLI 27.0.0, sin red (CARGO_NET_OFFLINE=true). Los hashes SHA256 están en ../evidence/sow-2026-09-05/wasm-hashes.json. Artefactos locales en contracts/target/sow-wasm; no se desplegaron. Reproducir desde contracts: stellar contract build --locked --package <nombre> --out-dir target/sow-wasm para los cuatro contratos.

La instalación previa de node_modules estaba incompleta. npm ci --offline la reconstruyó sin cambiar package-lock.json. El build final usa Turbopack, igual que npm run build. El experimento con Webpack no es equivalente porque la importación diferida de passkey-kit usa turbopackIgnore; no se cambió la configuración ni la lógica de wallets. Consultar el log final Next.js para el resultado.

Resultado técnico final: typecheck PASS, Vitest 112/112, Rust 44/44, build Turbopack PASS (31/31 páginas) y cuatro WASM construidos. Evidencia en results.json y wasm-hashes.json. Esto no cierra la aceptación D1/D2/D3.

## Corrección desplegada — 2026-09-06

Commit 8619734e74ca654b0b6cc106693b16b55634344f: índice persistente de duplicados en PrescriptionSoulbound, identidad estable en reintentos, errores reales sin fallback de éxito y configuración local del nuevo contrato. 118 tests de app y 36 Rust de semana uno pasan; build y typecheck PASS. Cinco transacciones sintéticas fee-bump confirmadas en Testnet. Véase WEEK_1.md para IDs, hashes y límites.
