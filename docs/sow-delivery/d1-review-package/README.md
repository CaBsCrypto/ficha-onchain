# TrustLeaf — paquete documental y visual D1

Preparado el 7 de septiembre de 2026 dentro de `ficha-onchain`.

Actualización posterior autorizada: se creó y fondeó la cuenta técnica de Testnet y se reorganizó Notion. Ver [registro de cambios y páginas vigentes](NOTION_REORGANIZACION.md) y [manifiesto público de cuenta](TESTNET_ADMIN_ACCOUNT.json). Las descripciones de trabajo solo local más abajo corresponden a la recuperación documental inicial.

**Estado: listo para revisión documental. D1 continúa pendiente de aceptación técnica.** Los hallazgos de autorización no tienen corrección final confirmada; la equivalencia de fuente y binario del DoctorRegistry desplegado sigue pendiente. El diseño no resuelve ninguno de estos puntos.

## Nuevo Registry con expediente privado

Se validó una nueva instancia que publica solo el compromiso y la autorización: tres expedientes cifrados en Neon dev coinciden con Testnet. Ver [resultados y límites de la integración](REGISTRY_PRIVADO_RESULTADOS.md). La app no ha migrado aún.

## Estado técnico actualizado

El nuevo DoctorRegistry está desplegado en Testnet y su administrador está verificado. Pasaron 14 pruebas unitarias del Registry, 20 de Prescription y 3 de integración local. La app y los otros contratos todavía no migraron a esta generación. Las afirmaciones posteriores sobre ausencia de nuevas ejecuciones corresponden a la recuperación documental inicial, no al estado actual.

- [DoctorRegistry: despliegue, funciones, seguridad y validación](DOCTOR_REGISTRY_DESPLIEGUE_Y_VALIDACION.md).
- [Evidencia pública del despliegue](../../evidence/testnet-generation-2026-09-07/doctor-registry-preparation.json).

## Archivos para revisar

- [Plan de cuatro contratos en Testnet](PLAN_CUATRO_CONTRATOS_TESTNET.md): nueva planificación solicitada para un origen de despliegue común, DoctorRegistry prioritario y uso delimitado del MCP OpenZeppelin. No implica implementación ni despliegue realizados.
- [Matriz consolidada D1](MATRIZ_D1.md): requisitos, evidencia histórica, versión, límites y responsables funcionales pendientes. Copia de la [matriz del proyecto](../DELIVERABLE_1_ACCEPTANCE.md), con enlaces adaptados; esta última sigue siendo la referencia mantenida por la tarea SOW.
- [Certificado de demostración](certificado-demo.html): vista local autónoma, sin dependencias externas, datos reales, firma, QR funcional ni conexión a contratos. Abrir en un navegador. Su estado `Active` es simulado; la verificación permanece pendiente. La advertencia de demostración también se conserva al imprimir.
- [Original documental recuperado](recuperados/TrustLeaf-D1-plan-y-matriz.md) y [original visual recuperado](recuperados/TrustLeaf-D1-certificado-demo.html): preservados sin cambios para trazabilidad. La matriz preliminar fue escrita sin acceso a los documentos del proyecto; sus afirmaciones de evidencia no aportada y lifecycle por acordar han sido superadas por la matriz consolidada. No usarla como estado actual.

## Alcance y decisiones

D1 comprende DoctorRegistry (registro, autorización, revocación y transferencia administrativa) y PrescriptionSoulbound (emisión, entrega inicial al paciente sin retransferencia, revocación, consulta, lifecycle Registered → Active → Revoked, controles de emisión y duplicados, pruebas e IDs Testnet). Revocar conserva el historial. Estas decisiones proceden de la [fuente local del SOW](../SOW_WEEK_1_SOURCE.md).

El relayer conserva su apartado Week 1. La UI de D2 y el recorrido E2E de D3 quedan fuera de esta entrega. El certificado es un anexo de diseño y no acredita implementación de la UI, autenticación, acceso privado ni validez clínica. Sus placeholders indican ausencia de vínculo de esta receta ficticia; los IDs históricos reales se encuentran en la matriz, sin atribuirles el registro inventado.

Los resultados de septiembre 6 corresponden a la versión histórica V1. Los cambios locales posteriores no se consideran integrados, validados ni desplegados. Consultar el [estado de correcciones](../PERMISSIONS_FIX_STATUS.md). Los archivos de evidencia enlazados se consultaron como documentos; no se ejecutaron pruebas ni consultas de red nuevas.

## Recuperación y coordinación

Origen: `C:\Users\MGC\Documents\Codex\2026-09-07\organizar-una-propuesta-documental-y-visual\outputs`.

Tarea de origen: `01a079f2-b29c-72d1-934f-67918b2d7d6e`; confirmó la detención y comunicó ambos archivos. Los originales permanecen en esa ubicación. Esta entrega usa el checkout local autorizado, sin cambiar de rama ni sobrescribir los cambios existentes.

Se comunicó a la tarea SOW `01a07363-755e-79c3-ac77-2478b53bb73c` que esta entrega escribe exclusivamente en `docs/sow-delivery/d1-review-package/`. No se editaron sus documentos concurrentes.

SHA-256 de las copias recuperadas (comparados con sus originales):

| Archivo | SHA-256 |
| --- | --- |
| TrustLeaf-D1-plan-y-matriz.md | `2dcbdb74ade057347e399abbb810a42d76e119cc12e91d9001828380c09aef11` |
| TrustLeaf-D1-certificado-demo.html | `5011266a3a143a305c735a42a973bec35c83161a1878c182e72c989b417943c7` |

La matriz consolidada deriva del documento local del proyecto al momento de esta recuperación; revisar su fuente si hay cambios posteriores. No se editó Notion, no se abrió PR ni se publicó o desplegó contenido. La revisión de seguridad anteriormente bloqueada queda fuera de este encargo documental y no fue reintentada.

## Comprobación de esta entrega

Se compararon los hashes SHA-256 de ambas copias con sus originales y se comprobaron los destinos de los enlaces locales de los documentos principales. Se leyó el HTML y se verificaron sus advertencias y ausencia de scripts o recursos externos. No se ejecutaron tests de la aplicación ni de contratos porque esta entrega solo recupera documentación y diseño.

La política de URL del navegador bloqueó la apertura del archivo local `file:///…/certificado-demo.html`. No se reintentó por otra vía. Por ello la apariencia renderizada, el comportamiento responsive y la impresión quedan pendientes de revisión visual manual; no se presentan como comprobados.
