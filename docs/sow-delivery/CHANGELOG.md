# TrustLeaf — Changelog de semana 1

**Entrega vigente: DoctorRegistryPrivate y PrescriptionPrivate v2, en Stellar Testnet y con datos sintéticos.** Evidencia técnica al 7 de septiembre de 2026; preparación del entregable actualizada el 8 de septiembre.

El [changelog completo del paquete](d1-private-2026-09-07/CHANGELOG-SEMANA-1.md) identifica los dos contratos, sus hashes, las cuatro transacciones y las pruebas que respaldan esta versión.

## 8 de septiembre de 2026 — Preparación del entregable final

- Consolidada la documentación alrededor de los dos contratos privados y del recorrido demostrado mediante servicios/CLI.
- Lámina principal reorganizada para explicar las cuatro transacciones: una en el registro y tres en recetas, con enlaces a contratos, código y recibos.
- Incorporados listados consultables de las 11 pruebas contractuales y las 137 de aplicación; el inventario de nombres de aplicación distingue su reconstrucción posterior del resultado histórico.
- Preparados la guía del presentador, las preguntas frecuentes y el respaldo Markdown para Notion. Actualizada y comprobada la [página de entrega y changelog en Notion](https://app.notion.com/p/TrustLeaf-Entrega-semana-1-y-changelog-3d47e0b63884807d8116c436ce9d47c7), sin cambiar sus permisos.
- **Video grabado**, según confirmación del responsable el 8 de septiembre; enlace pendiente de incorporar.
- Actualizados índice, manifiesto y paquete documental. Se conserva el paquete anterior del 7 de septiembre.
- Subida del ZIP a Notion pendiente de autorización explícita: la revisión automática rechazó el envío de fuentes, WASM, logs, manifiestos y evidencias sin esa autorización. No se subió un archivo nuevo; la actualización de Notion conserva intactos el paquete local, su manifiesto y el ZIP.

Estos cambios son documentales: no representan una nueva ejecución de pruebas, transacción o despliegue.

## 7 de septiembre de 2026 — Validación técnica de los contratos privados

- **DoctorRegistryPrivate:** autorización médica con firma administrativa, vigencia, renovación, revocación y transferencia administrativa con aceptación.
- **PrescriptionPrivate v2:** reserva acreditada, consentimiento del paciente para una emisión, firma del médico y verificación de su autorización contra el registro.
- Cuatro recibos `SUCCESS`: `authorize_doctor`, `attest_booking`, `authorize_prescriber` y `mint_prescription`. La receta emitida queda en `Registered`; activación y revocación se respaldan con pruebas locales.
- Documento cifrado fuera de cadena, compromiso coincidente y recuperación autorizada comprobados mediante servicios/CLI.
- **11 pruebas contractuales, 137 de aplicación y TypeScript sin errores** en el corte documentado. Seis envolturas de relay adicionales verifican el pago de comisiones por el pagador esperado.
- Capturadas las fuentes, los dos WASM, reportes y recibos con sus manifiestos de integridad. Los hashes de los binarios coinciden con la lectura Testnet guardada.

## Material vigente

- [Paquete y alcance de revisión](d1-private-2026-09-07/LEER-PRIMERO.md).
- [Lámina principal](d1-private-2026-09-07/TrustLeaf-transacciones-de-prueba.html) y [preguntas frecuentes](d1-private-2026-09-07/TrustLeaf-preguntas.html).
- [Página de entrega en Notion](https://app.notion.com/p/TrustLeaf-Entrega-semana-1-y-changelog-3d47e0b63884807d8116c436ce9d47c7) y [estado de los adjuntos y pendientes](NOTION.md).
- [Plantilla de Notion del paquete](d1-private-2026-09-07/NOTION-ENTREGA-SEMANA-1.md), preparada antes de actualizar la página online.
- [Paquete actualizado del 8 de septiembre](TrustLeaf-Semana-1-Entrega-2026-09-08.zip).

El portal con Privy y firma integrada exclusivamente Stellar pertenece al siguiente hito. La aceptación formal corresponde al responsable. El snapshot de fuentes identifica lo entregado; este changelog no acredita su publicación en `main` ni un CI remoto actual.

## Antecedentes

El [changelog del 5–6 de septiembre](CHANGELOG-HISTORICO-2026-09-05-06.md) conserva el trabajo de versiones anteriores, incluidos sus contratos, cifras y referencias a PR #95 y #96. Esos merges no acreditan el código privado nuevo. El [borrador anterior de Notion](NOTION-HISTORICO-2026-09-06.md) queda archivado; sus afirmaciones de cierre total, privacidad y cumplimiento no se trasladan a esta entrega.
