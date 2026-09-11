# Paquete de aceptación — Deliverable 1: Contracts Tested and Deployed

> Alcance padre: [SOW Fase 1](SOW_PHASE_1_SCOPE.md). Cierre activo: D1/Week 1; D2 y D3 posteriores. Las aspiraciones generales de consentimiento no sustituyen evidencia de implementación.

Preparado el 2026-09-07. Organización documental de evidencia existente; no nuevas auditorías, pruebas, correcciones ni despliegues. **Estado: paquete preparado para revisión, no aceptación técnica final sin reservas.**

## Versiones y lectura de resultados

Fuente contractual y decisión de entrega inicial: [SOW_WEEK_1_SOURCE.md](SOW_WEEK_1_SOURCE.md). Patient transfer significa asignación al paciente al emitir, sin retransferencia; revocación conserva historial.

V1: fuente base publicada 22d546e (PR99), con corrección de duplicados proveniente de 8619734. Los logs del 6 de septiembre acreditan 13 pruebas Registry, 20 Prescription y 3 E2E. Testnet de recetas fue desplegado el 6 de septiembre a las 05:11 UTC. Verificación sintética completada a las 05:13 UTC; dos comprobaciones de código se renovaron a las 08:42 UTC. Consulta y recompilación de revisión del 7 de septiembre están en evidencia separada.

V2: borradores locales en codex/week1-defensive-fixes. No cuentan como desplegados, integrados o validados conjuntamente. Los resultados V1 no se trasladan a V2. Las reproducciones de defectos no son pruebas de corrección.

## Matriz exacta de aceptación

| Requisito | Evidencia existente | Fecha/versión | Límite y pendiente de aceptación |
| --- | --- | --- | --- |
| DoctorRegistry — registration | Suite Registry en [contracts.txt](../evidence/week1-2026-09-06/contracts.txt), caso test_register_doctor_success | 2026-09-06, fuente V1 | Registro probado localmente; no nueva alta Testnet. Vincular fuente exacta al WASM Registry histórico. |
| DoctorRegistry — authorization check | test_mint_rejects_unregistered_doctor, test_mint_rejects_revoked_doctor; [verification.json](../evidence/week1-2026-09-06/verification.json), unauthorized_issuer_rejected_in_simulation | V1; RPC 2026-09-06 | Rechazo en simulación, no transacción fallida enviada. No cubre permisos de todas las demás funciones. |
| DoctorRegistry — revocation | test_revoke_doctor y test_e2e_registry_gates_issuance, contracts.txt | V1 local | No prueba revocación administrativa contra el Registry histórico de Testnet. Mantener límite de procedencia del binario. |
| DoctorRegistry — admin transfer | test_transfer_admin, contracts.txt | V1 local | Caso funcional existente; no equivalencia binaria establecida ni transferencia real de admin durante demo. Revisor debe aceptar cobertura de firmas anterior/nueva. |
| PrescriptionSoulbound — issuance | test_mint_sets_registered_status; tx mint y estado registered en verification.json | V1; 2026-09-06 | Evidencia sintética. V2 exige pruebas propias. |
| PrescriptionSoulbound — patient transfer | patient_receives_record; asignación inicial en mint y ausencia de retransferencia documentada | V1; decisión explícita usuario registrada 2026-09-07 | Semántica resuelta. Conservar paciente/historial en versión final y documentar su verificación. |
| PrescriptionSoulbound — revocation | test_doctor_revokes_prescription; tx revoke y check revoked | V1 local/SDK | Hallazgo de ruta de dispensación afecta la revocación; corrección definitiva pendiente, no ocultarlo por estar fuera del flujo nominal. |
| PrescriptionSoulbound — status query | test_is_valid; consultas registered/active/revoked en verification.json | V1 | Inconsistencias de estado/entradas documentadas en revisión; pendiente decisión y validación de versión final. |
| Complete lifecycle Registered → Active → Revoked | test_e2e_issue_activate_then_revoke; txs mint/activate/revoke | V1; 2026-09-06 | Activó médico emisor, no login/firma paciente en navegador. No es recorrido del portal. |
| Access control — unauthorized issuance | Casos de falta de firma y emisor desconocido/revocado; RPC unauthorized_issuer_rejected_in_simulation | V1 | Identidad HTTP del usuario y autorización contractual son controles distintos. Borrador API sin integración final. |
| Duplicate prevention | test_duplicate_issuance_is_rejected; test_revocation_does_not_allow_duplicate_issuance; test_duplicate_with_changed_metadata_cannot_bypass_document_identity; checks RPC | V1 | Identidad exacta por emisor/paciente/hash; no equivalencia clínica entre documentos. No extrapolar a V2 ni a reintentos entre dispositivos. |
| Both contracts deployed Stellar Testnet with verifiable IDs | [deployment.json](../evidence/week1-2026-09-06/deployment.json), IDs abajo; [hashes RPC de revisión](../evidence/security-review-week1/readonly-code-hashes.json) | Rx desplegado 2026-09-06; RPC 2026-09-07 | Rx recompilado V1 coincide; Registry solo hash observado, no fuente equivalente establecida. No nuevas consultas en este bloque. |

## Requisito adicional Week 1: relay infrastructure

Cinco transacciones sintéticas fee-bump confirmadas y check relayer_paid_confirmed_transactions en verification.json (2026-09-06). Demuestra relay SDK/Testnet; no acredita cola durable, recuperación del portal o signers de un profesional real. No se realizaron transacciones adicionales.

## Identificadores verificables de la evidencia existente

- [DoctorRegistry](https://stellar.expert/explorer/testnet/contract/CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O): CC246CYKOEAZVKWEJGOXTKW436LYYLR2EHKFD2WFGABXGSFX2UEX2X2O.
- [PrescriptionSoulbound V1](https://stellar.expert/explorer/testnet/contract/CBOJSLG2XQZNQ6G6Q4VGN2SOFOEUCRDMBDWS7HVOQTGWTOIWGWNQSLCU): CBOJSLG2XQZNQ6G6Q4VGN2SOFOEUCRDMBDWS7HVOQTGWTOIWGWNQSLCU.
- Rx SHA256: bd9d0b97d800b45909ccc13da1613c47d15aa75b8ae88389ab2c178db908343e.
- Registry observado: cc832c816bcb11286dcd0151328231700d5489a276692f0c0ece623a2c4437c8.

## Inventario del paquete

1. [Fuente y decisiones del SOW](SOW_WEEK_1_SOURCE.md).
2. [Informe de entrega histórica con transacciones](WEEK_1.md).
3. [Logs y hashes de inputs de validación local](../evidence/week1-2026-09-06/local-validation.json). El manifest de fuentes Rx tiene discrepancia de bytes documentada; no sustituirlo silenciosamente.
4. [Revisión asistida existente y límites](SECURITY_REVIEW_WEEK_1.md).
5. [Estado de borradores de corrección](PERMISSIONS_FIX_STATUS.md).
6. [Reconciliación de versiones y pendientes](SOW_WEEK_1_RECONCILIATION.md).

Arquitectura y normativa son material complementario, no nuevos requisitos retroactivos del Entregable 1. No usar datos reales en demos.

## Trabajo concreto para revisor autorizado

| Orden | Responsable funcional | Resultado que debe devolver |
| --- | --- | --- |
| 1 | Integrador | Inventario de V1/V2 y cambios parciales; preservar evidencia y fuente histórica. |
| 2 | Revisor de contratos habilitado | Resolución documentada de permisos/estados pendientes, pruebas de rechazo sin mutación y flujo válido de la misma versión. No repetir auditoría bloqueada en este encargo. |
| 3 | Responsable Registry | Fuente del binario desplegado o decisión de reemplazo verificable; no inferir garantías del código distinto. |
| 4 | Integrador API | Compatibilidad de clientes con modos explícitos y vínculo caller/rol/firmante; evidencia sintética de la versión integrada. |
| 5 | Operador, con autorización separada | Si cambia WASM: despliegue autorizado, IDs/config y comprobación de artefacto exacto; no existe evidencia de ese paso todavía. |
| 6 | Responsable de entrega | Revisar matriz, aceptar límites restantes y firmar aceptación; grabar solamente lo efectivamente demostrado. |

No hay agentes ejecutando trabajo para esta organización documental. Los bloqueos anteriores de plataforma siguen vigentes. Este paquete hace revisable lo existente; no declara mitigado un defecto ni permite iniciar operación clínica.

## Página Notion del mismo entregable

La [propuesta de actualización](NOTION_D1_UPDATE_PROPOSAL.md) contrasta el estado histórico de la página Entrega Semana 1 D1 con los pendientes posteriores. Solo preparada localmente; Notion no fue modificado.
