# Entrega TrustLeaf SOW — 2026-09-05

> Estado vigente: [Semana 1 — validada en Testnet](WEEK_1.md). Nuevo contrato de recetas desplegado, reintentos adaptados, 36 pruebas Rust y 118 de aplicación pasan. Los bloqueos y resultados anteriores se conservan como historia, no como estado actual.

> Actualización 2026-09-06: el dueño confirmó el SOW oficial. Para el cierre vigente consultar [Semana 1](WEEK_1.md): exige dos contratos y relayer. La rama de validación ya fue creada; las referencias al bloqueo Git y a la ausencia de fuente primaria de abajo describen la auditoría previa.

Paquete preparado para revisión. No constituye aceptación contractual ni publicación.

1. [Auditoría y matriz D1/D2/D3](../SOW_AUDIT_2026-08-22.md)
2. [Resultados de máquina](../evidence/sow-2026-09-05/results.json)
3. [Changelog ligado a base Git y pruebas](CHANGELOG.md)
4. [Plan, guion y checklist de grabación](VIDEO.md)
5. [Vista del creador](CREATOR_VIEW.html)
6. [Borradores X y LinkedIn ES/EN](SOCIAL.md)
7. [Página para importar a Notion](NOTION.md)

Reproducir: node scripts/audit-sow.mjs --verify --contracts --build.

Bloqueos de cierre: SOW original, rama/PR por ACL Git, CI remoto, recorrido autenticado con evidencia, video final y hash #6. La evidencia histórica de Testnet no fue revalidada. Nada publicado en X, LinkedIn o Notion.

Evidencia adicional: [toolchain](../evidence/sow-2026-09-05/toolchain.json), [hashes de cuatro WASM](../evidence/sow-2026-09-05/wasm-hashes.json).

[Manifiesto SHA256 de los inputs locales](../evidence/sow-2026-09-05/source-manifest.json): permite identificar el árbol validado mientras no haya commit final.

Resultado técnico final: typecheck PASS, Vitest 112/112, Rust 44/44, build Turbopack PASS (31/31 páginas) y cuatro WASM construidos. Evidencia en results.json y wasm-hashes.json. Esto no cierra la aceptación D1/D2/D3.
