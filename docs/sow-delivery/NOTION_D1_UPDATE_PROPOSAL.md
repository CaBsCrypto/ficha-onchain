# Propuesta de actualización — Entrega Semana 1 D1

Preparada localmente el 2026-09-07. **No publicada ni aplicada en Notion.** Mantiene el mismo entregable y alcance.

## Fuente y procedencia

Página objetivo: [Entrega Semana 1 D1](https://app.notion.com/p/Entrega-Semana-1-D1-3d27e0b6388481b087d6e80da0ca2d8b). Su contenido fue leído por la tarea coordinadora mediante navegador autenticado y resumido a esta tarea; no se realizó una lectura directa nueva aquí. La página informa cierre técnico, conserva límites SDK/Testnet y referencia PR95/96, WEEK_1.md y CI34016169392. No se revalidaron esas referencias remotas en este bloque documental.

Contraste local: DELIVERABLE_1_ACCEPTANCE.md, SECURITY_REVIEW_WEEK_1.md, PERMISSIONS_FIX_STATUS.md y SOW_WEEK_1_RECONCILIATION.md. Son revisiones posteriores y no deben confundirse con evidencia disponible cuando se redactó la página.

## Cambios propuestos

| Afirmación o sección | Tratamiento | Fundamento |
| --- | --- | --- |
| Técnico OK / técnico cerrado | Sustituir por: evidencia funcional histórica disponible; cierre final pendiente de remediación y validación de versión final | Hallazgos posteriores y borradores no integrados |
| Revisión founder pendiente | Conservar, pero aclarar que no es el único pendiente | Hay pendientes técnicos, de trazabilidad y de versión |
| 36 Rust, 118 Vitest, 11 checks | Conservar con fecha 2026-09-06 y versión histórica | No son resultados de los cambios locales posteriores |
| Índice de duplicados emisor/paciente/hash | Conservar como control concreto, no garantía general de seguridad | Cubre duplicación exacta, no todos los permisos/estados |
| Rx redesplegado / Registry conservado | Conservar como historial | No hubo despliegue de correcciones posteriores |
| Cinco txs y fee-bump | Conservar evidencia sintética, enlazando manifiesto original | No representa recorrido HTTP/portal |
| Rechazos RPC | Conservar explícitamente como simulación | No atribuir hashes de tx inexistentes |
| Registry hash distinto / sin equivalencia binaria | Destacar como pendiente de trazabilidad | Las pruebas del fuente local no certifican binario distinto |
| Activación por emisor, override de Vercel, legacy sin migración | Conservar | Límites reales ya documentados |
| Excluir UI/D2, video E2E/D3 y contratos extra | Conservar | No ampliar D1; un defecto que altera el contrato D1 sigue siendo relevante |

## Texto listo para sustituir el estado y resumen

> **Estado actual del Entregable 1:** evidencia funcional de Testnet disponible; cierre final pendiente.
>
> La entrega del 6 de septiembre documentó DoctorRegistry y PrescriptionSoulbound en Stellar Testnet, 36 pruebas Rust de semana 1, 118 pruebas de aplicación y 11 comprobaciones Testnet. Incluyó cinco transacciones sintéticas con fee-bump y simulaciones RPC de rechazo por emisor no autorizado y duplicados.
>
> Una revisión posterior identificó pendientes de permisos y coherencia de estado en el contrato de recetas. Existen borradores locales de corrección, todavía sin integración ni validación conjunta y sin nuevo despliegue. Por ello, los resultados anteriores no prueban que esos pendientes estén resueltos.
>
> Patient transfer significa entrega inicial a la cuenta del paciente, sin retransferencia. Revocar debe conservar el registro histórico y cambiar su estado. No se está concediendo un permiso adicional de dispensación por esta definición.
>
> El Registry existente conserva un hash histórico cuya equivalencia con el fuente auditado no está establecida. El relayer se comprobó mediante SDK y datos sintéticos; no se afirma recorrido autenticado del portal. La aceptación del responsable sigue pendiente después de resolver y evidenciar los pendientes técnicos.
>
> Este cierre no certifica privacidad clínica, cumplimiento jurídico ni operación con datos reales. El alcance sigue siendo Deliverable 1; UI, video E2E y contratos adicionales no se agregan a esta entrega.

## Matriz de faltantes para retomar este entregable

| Pendiente | Evidencia requerida para cerrarlo | Responsable funcional |
| --- | --- | --- |
| Corrección de permisos/estados del contrato | Fuente final, pruebas de rechazo sin mutación y ciclo válido, build correspondiente | Revisor/integrador habilitado; trabajo actual bloqueado por plataforma |
| Procedencia Registry | Fuente y build identificados o decisión explícita de versión verificable | Responsable de contratos |
| Borrador API y clientes | Compatibilidad de modos/identidad, verificación conjunta sintética si se usa ese flujo en entrega | Backend/QA |
| Correspondencia versión final ↔ Testnet | Hash/ID y evidencia de despliegue autorizado si cambia WASM | Operador, con autorización separada |
| Relayer de versión final | Evidencia vinculada a esa versión; no trasladar automáticamente tx históricas | Operación/QA |
| Aceptación formal | Matriz aprobada con límites explícitos por responsable | Founder/responsable SOW |

Matriz requisito por requisito e inventario completo: [DELIVERABLE_1_ACCEPTANCE.md](DELIVERABLE_1_ACCEPTANCE.md).

## Advertencia sobre el borrador local NOTION.md

Ese archivo además contiene afirmaciones absolutas de privacidad y cumplimiento que no deben copiarse a la página. El mapa de datos documenta medicamento/dosis públicos y límites de cifrado. Usar esta propuesta y la matriz vigente; conservar NOTION.md solo como antecedente hasta su revisión editorial. No se afirma que esas frases adicionales estén en la página remota: fueron observadas en el archivo local.
