# TrustLeaf · Entrega de semana 2

**Actualización documental: 10 de septiembre de 2026.** Recorrido del preview documentado en Stellar Testnet y con datos sintéticos. El video y la aceptación formal permanecen pendientes.

Abrir [la página para revisores](TrustLeaf-Entrega-semana-2.html). Resume los portales de médico y paciente, los dos contratos, el enlace de la aplicación y el estado de la evidencia. La revisión prevista es una demostración guiada con cuentas de prueba.

## Aplicación y versión

- [Portal del médico](https://trustleaf-demo-git-cod-50a880-cabscryptocontacto-6028s-projects.vercel.app/login?role=doctor).
- [Portal del paciente](https://trustleaf-demo-git-cod-50a880-cabscryptocontacto-6028s-projects.vercel.app/login?role=patient).
- Versión del preview: [`dda4bf5cf9ee95cf21dc4e7d9248df162e755efe`](https://github.com/CaBsCrypto/ficha-onchain/commit/dda4bf5cf9ee95cf21dc4e7d9248df162e755efe), proyecto `trustleaf-demo`.
- [Repositorio](https://github.com/CaBsCrypto/ficha-onchain), [PR 101: contratos y servicios](https://github.com/CaBsCrypto/ficha-onchain/pull/101) y [PR 102: portales](https://github.com/CaBsCrypto/ficha-onchain/pull/102).

El enlace de rama puede recibir futuras versiones; el commit anterior identifica la versión descrita. Esta actualización de documentos no ejecuta un despliegue nuevo.

## Alcance del recorrido

El médico comprueba su autorización, inicia la consulta, emite con su firma Privy, activa mediante otra confirmación y puede revocar conservando el historial. El paciente reserva, confirma asistencia, autoriza una emisión por separado y consulta sus recetas y documentos privados. Ambos usan una wallet Stellar propia; TrustLeaf paga las comisiones mediante el relayer.

Se mantienen `DoctorRegistryPrivate` y `PrescriptionPrivate v2`. Los enlaces a contrato y código están en la página. El documento permanece cifrado fuera de cadena; direcciones, métodos, compromisos, identificadores, fechas y estados son públicos en Testnet.

## Estado de la evidencia

El recorrido del preview está acreditado: **receta 5 activa**, **receta 6 revocada**, dos consultas completadas y apertura de ambos documentos por médico y paciente desde sus propias sesiones. El paciente vio los estados correspondientes y no tuvo controles de activación o revocación.

El [paquete de evidencia del preview](../../evidence/week2-preview-2026-09-10/README.md) conserva **12 recibos SUCCESS**: renovación médica, dos acreditaciones de reserva, cuatro operaciones de consentimiento y cinco acciones de recetas. La auditoría verifica firmas, participantes, compromisos, cifrado previo a la preparación de la emisión, reservas consumidas y cero operaciones pendientes o duplicadas en el corte final. La lectura autorizada de documentos se registra como evidencia separada de navegador.

Consultar [los recibos](../../evidence/week2-preview-2026-09-10/preview-receipts.json), [las observaciones de navegador](../../evidence/week2-preview-2026-09-10/browser-observations.json) y [los resultados y límites de validación](../../evidence/week2-preview-2026-09-10/validation-results.json). Las nueve pruebas nuevas de cliente utilizan proveedores controlados; no se presentan como caídas reales de Privy/RPC ni como pruebas de concurrencia real de PostgreSQL.

El corte final de la rama aprobó **423 pruebas de aplicación en 35 suites**, TypeScript y el build de producción. El archivo ajeno y no versionado `week1-security-integration.test.ts` se excluyó de ese total para no inflar la evidencia de semana 2.

La [evidencia local del 9 de septiembre](../../evidence/week2-portals-local-2026-09-09/README.md) está disponible como antecedente separado: dos consultas, una receta activa y otra revocada, lectura de ambos documentos por médico y paciente, y 11 recibos. Sus [resultados por versión](../../evidence/week2-portals-local-2026-09-09/validation-results.json) registran 414 pruebas de aplicación, 43 privadas, 11 contractuales, TypeScript, build y comprobaciones de CI. No acreditan por sí solos el recorrido remoto ni una nueva ejecución del 10 de septiembre.

**Video: pendiente de adjuntar.** Se requiere una grabación nueva de ambos recorridos en la aplicación desplegada, incluida la apertura autorizada de documentos, la activación y la revocación. No hay una URL de video disponible en este paquete.

El video queda pendiente de adjuntar y la aceptación formal, a cargo de los revisores. Esta demostración técnica no habilita uso con pacientes reales.
