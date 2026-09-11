# Alcance padre — SOW Instawards, Fase 1

Registro documental: 2026-09-07. Fuente: lectura de navegador comunicada por la tarea coordinadora de la página [SOW — Instawards (Fase 1)](https://app.notion.com/p/SOW-Instawards-Fase-1-3d27e0b63884814382a1ec4c6584c165). No se realizó nueva lectura directa en esta tarea ni se modificó Notion. La página enlaza el [Google Doc oficial](https://docs.google.com/document/d/1XML0J7ujjBHb9gaNzfEtNjxV7qqzMnMoIZ_EbgMyocs/edit?tab=t.0).

## Alcance y prioridad

| Nivel | Contenido comunicado | Tratamiento en este paquete |
| --- | --- | --- |
| D1 / Week 1, activo | Dos contratos probados y desplegados; evidencia de permisos, duplicados, ciclo y IDs Testnet. Relay como requisito Week 1 | Único cierre activo. Ver DELIVERABLE_1_ACCEPTANCE.md para requisito, evidencia y pendiente |
| D2 | Interfaz doctor/paciente y Privy | Posterior. No presentar pruebas SDK como prueba de esta interfaz |
| D3 | Integración E2E y demostración | Posterior. No convertir escenas/guion en requisito adicional D1 |
| Aspiración general | Paciente dueño del record; médico escribe con consentimiento on-chain | No demuestra que consentimiento esté implementado ni que cualquier médico tenga acceso a cualquier dato clínico |
| Fuera de Fase 1 según página | MCP de centros, diario de dolor, FEA, FHIR completo, Mainnet y rebrand | No añadirlos al cierre D1 por existir módulos o documentos en el repositorio |

La existencia de un Bundle FHIR en código no acredita FHIR completo. El consentimiento automático de un sandbox no prueba consentimiento on-chain del paciente. El registro de un profesional tampoco implica relación asistencial universal.

## Estado histórico frente a estado vigente

La tabla padre indica D1 en curso / técnico OK después de PR95/96. Se conserva como estado histórico de la entrega funcional. La revisión posterior y los borradores locales impiden trasladar esa etiqueta a cierre actual sin reservas.

No se descartaron los resultados históricos: 36 Rust, 118 Vitest, 11 checks Testnet y transacciones sintéticas siguen siendo evidencia de su versión. No acreditan los cambios parciales posteriores. La página no se marca aceptada ni actualizada por este archivo.

## Criterio de cierre del mismo D1

1. Requisitos exactos y semántica confirmados: entrega inicial al paciente sin retransferencia, historial conservado al revocar.
2. Versión final identificada y controles pendientes resueltos con evidencia permitida; resultados ligados a esa versión, no solo un CI histórico verde.
3. Artefactos/IDs Testnet trazables, con límite de fuente Registry resuelto o explícitamente sometido a aceptación; relay vinculado a versión demostrada.
4. Matriz de aceptación revisada por responsable, sin afirmaciones de privacidad clínica o cumplimiento no demostrados.

Estos criterios no agregan D2/D3 ni autorizaron nuevas pruebas, auditorías, cambios de código, publicaciones o despliegues en este bloque.

## Ruta documental

- [Texto exacto aportado por usuario](SOW_WEEK_1_SOURCE.md).
- [Matriz D1 e inventario de evidencia](DELIVERABLE_1_ACCEPTANCE.md).
- [Estado de versiones y remediación pendiente](SOW_WEEK_1_RECONCILIATION.md).
- [Propuesta local para la página hija D1](NOTION_D1_UPDATE_PROPOSAL.md), referencia secundaria; no guía de escenas ni cambio aplicado a Notion.
