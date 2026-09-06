# TrustLeaf — paquete de aceptación SOW

> Estado vigente: [Semana 1 — validada en Testnet](WEEK_1.md). Nuevo contrato de recetas desplegado, reintentos adaptados, 36 pruebas Rust y 118 de aplicación pasan. Los bloqueos y resultados anteriores se conservan como historia, no como estado actual.

> Actualización 2026-09-06: el dueño confirmó el SOW oficial. Para el cierre vigente consultar [Semana 1](WEEK_1.md): exige dos contratos y relayer. La rama de validación ya fue creada; las referencias al bloqueo Git y a la ausencia de fuente primaria de abajo describen la auditoría previa.

Fecha: 2026-09-05 · Estado: validación local parcial; aceptación pendiente.
Base: db31fbad5355359a72ad09edea7d7134a8685fa2 + cambios sin commit.
Responsables abajo son roles propuestos, no asignaciones confirmadas.

## Entregables

| Entregable | Estado | Evidencia | Responsable |
| --- | --- | --- | --- |
| D1 | Tests locales OK; despliegue no revalidado | 44 tests Rust + cuatro WASM/hashes; auditoría | Responsable técnico |
| D2 | Typecheck y 112 tests OK; recorrido pendiente | results.json, checklist de video | QA / dueño de producto |
| D3 | Abierto | 5/6 referencias históricas; guion disponible | Dueño del proyecto / creador |

## Enlaces de trabajo

- Índice: docs/sow-delivery/INDEX.md
- Matriz completa: docs/SOW_AUDIT_2026-08-22.md
- Evidencia máquina: docs/evidence/sow-2026-09-05/results.json
- Changelog: docs/sow-delivery/CHANGELOG.md
- Grabación: docs/sow-delivery/VIDEO.md y CREATOR_VIEW.html
- Redes ES/EN: docs/sow-delivery/SOCIAL.md

Estas son rutas del repositorio, no URLs públicas. Al importar a Notion, subir los archivos o convertir las rutas a enlaces del commit final; no publicar docs/D3_EVIDENCE.md sin redacción de identidades.

## Cierre de hoy

- [ ] Dueño del proyecto coteja criterios con SOW firmado.
- [ ] Técnico resuelve acceso Git, crea rama y PR, registra SHA y URL.
- [ ] Técnico adjunta resultados de build y checks CI.
- [ ] QA prepara solo fixtures sintéticos y captura recorrido aislado.
- [ ] Creador graba, revisa subtítulos, exporta video y registra enlace + hash.
- [ ] Dueño decide alcance autorizado para evidencia faltante de red; mientras tanto hash #6 pendiente.
- [ ] Aceptante registra aprobado / rechazado / condicionado por D1, D2 y D3 con fecha.
- [ ] Dueño aprueba publicación de textos y página Notion.

## Registro de aceptación

D1: pendiente. D2: pendiente. D3: pendiente.
Aceptante: por designar. Fecha: pendiente. SHA final: pendiente. PR: pendiente. Video: pendiente.
No asumir cierre por silencio o por tests verdes.

Resultado técnico final: typecheck PASS, Vitest 112/112, Rust 44/44, build Turbopack PASS (31/31 páginas) y cuatro WASM construidos. Evidencia en results.json y wasm-hashes.json. Esto no cierra la aceptación D1/D2/D3.
