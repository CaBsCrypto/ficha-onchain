# TrustLeaf · Entrega de semana 2 (objetivo de cierre en `main`)

**Actualización documental: 11 de septiembre de 2026.** El objetivo de esta entrega es cerrar Semana 2 en `main` con recorrido de médico y paciente íntegramente en UI, en Stellar Testnet y con datos sintéticos. La evidencia de la rama funcional quedó acreditada en el entorno aislado de preview y sirve de base para el cierre final del entorno principal.

Abrir [la página para revisores](TrustLeaf-Entrega-semana-2.html). Resume los portales de médico y paciente, los dos contratos y el enlace de demostración. La revisión prevista es una demostración guiada con cuentas de prueba y cierre de grabación con evidencia de recibos.

## Aplicación y versión objetivo

- [Portal del médico](https://trustleaf-demo.vercel.app/login?role=doctor).
- [Portal del paciente](https://trustleaf-demo.vercel.app/login?role=patient).
- Estado base para cierre en `main`: commit de referencia de la rama funcional de preview [`dda4bf5cf9ee95cf21dc4e7d9248df162e755efe`](https://github.com/CaBsCrypto/ficha-onchain/commit/dda4bf5cf9ee95cf21dc4e7d9248df162e755efe).
- [Repositorio](https://github.com/CaBsCrypto/ficha-onchain), [PR 101: contratos y servicios](https://github.com/CaBsCrypto/ficha-onchain/pull/101), [PR 102: portales](https://github.com/CaBsCrypto/ficha-onchain/pull/102) y [PR 105: alta médica por invitación/postulación](https://github.com/CaBsCrypto/ficha-onchain/pull/105).

## Alcance del recorrido

El médico comprueba su autorización, inicia la consulta, emite con su firma Privy, activa mediante otra confirmación y puede revocar conservando historial. El paciente reserva, confirma asistencia, autoriza una emisión por separado y consulta sus recetas y documentos privados. Ambos usan una wallet Stellar propia; TrustLeaf paga las comisiones mediante el relayer.

Se mantienen `DoctorRegistryPrivate` y `PrescriptionPrivate v2`.

## Estado de la evidencia

El recorrido del preview quedó acreditado: **receta 5 activa**, **receta 6 revocada**, dos consultas completadas y apertura de ambos documentos por médico y paciente desde sus propias sesiones. El paciente autorizó por consulta, retiró y volvió a otorgar una autorización en una de ellas.

El [paquete de evidencia del preview](../../evidence/week2-preview-2026-09-10/README.md) conserva **12 recibos SUCCESS**: renovación médica, dos acreditaciones de reserva, cuatro operaciones de consentimiento (incluye retiro y reautorización), y cinco acciones de recetas. La auditoría verifica firmas, participantes, compromisos, cifrado previo a la preparación de la emisión, reservas consumidas y cero operaciones pendientes o duplicadas en el corte final. La lectura autorizada de documentos se registra como evidencia separada de navegador.

Consultar [los recibos](../../evidence/week2-preview-2026-09-10/preview-receipts.json), [las observaciones de navegador](../../evidence/week2-preview-2026-09-10/browser-observations.json) y [los resultados y límites de validación](../../evidence/week2-preview-2026-09-10/validation-results.json).

La [evidencia local del 9 de septiembre](../../evidence/week2-portals-local-2026-09-09/README.md) queda como antecedente separado (11 recibos) y no sustituye el cierre en remoto.

**Video:** pendiente de adjuntar sobre `trustleaf-demo.vercel.app` después del merge y validación en `main`.

## Checklist de grabación (main)

1. Admin: autoriza médico.
2. Médico: ingreso, estado confirmado y revisión de autorización.
3. Paciente: dos reservas.
4. Paciente: asistencia por consulta.
5. Médico: inicio de ambas consultas.
6. Worker: acreditación de ambas reservas.
7. Paciente: autoriza emisión por consulta, retira y vuelve a autorizar una consulta.
8. Médico: emite, activa ambas recetas y revoca una.
9. Paciente: abre receta activa y receta revocada.
10. Cierre de sesión y captura de recibos + captura de pantalla del estado público.

## Cierre de entrega

Para esta etapa, la grabación debe demostrar únicamente datos sintéticos y evidencia pública en Testnet (`Registered`, `Active`, `Revoked`), sin datos clínicos sensibles. La aceptación formal se activa con el cierre exitoso del recorrido y la revisión por el responsable.

- [Checklist de cierre para main](./CERRAR-SOW2-EN-MAIN.md)
