# TrustLeaf · Semana 2 en main

Aplicación: https://trustleaf-demo.vercel.app · Stellar Testnet · Datos sintéticos.

El recorrido del 11 de septiembre de 2026 se ejecutó en main, versión `6392e18cfe86ae665c82757917709221c0b02cd5`. La receta **#7 está activa** y la **#8 revocada**. Médico y paciente abrieron ambos documentos desde sus sesiones. Las consultas finalizaron.

La [auditoría independiente](../../evidence/week2-main-2026-09-11/independent-chain-audit.json) verificó **12 recibos**, firmas, argumentos, comisiones del relayer, compromisos de documentos y reservas consumidas. No encontró operaciones pendientes ni hashes duplicados en el corte. [Paquete y límites](../../evidence/week2-main-2026-09-11/README.md).

## Antes de grabar

- [x] Reserva, asistencia separada de consentimiento, inicio y acreditación.
- [x] Consentimiento, retirada y nueva autorización.
- [x] Emisión, activación, revocación, lectura de ambos participantes y estados persistentes.
- [x] Auditoría de recibos y rechazo de documentos sin sesión.
- [ ] Solicitudes autenticadas de administrador y usuario ajeno contra documentos en main.
- [ ] Solicitud médica desde paciente rechazada por el servidor en main.
- [ ] Promoción y comprobación remota de la corrección del aviso durante confirmación (PR #118).
- [ ] Grabación nueva y enlace de video.

La corrección aprobó localmente 536 pruebas de aplicación, 45 privadas, 11 contractuales, TypeScript y build. Los fallos simulados de proveedores y recuperación no se presentan como observaciones de navegador. El ensayo aún no se declara aprobado para entrega.

## Grabación

El usuario operará administrador, médico y paciente con cuentas separadas. Se crearán consultas sintéticas nuevas; no se reutilizarán las reservas consumidas de #7 y #8. Secuencia: alta/aprobación médica, agenda, reserva, asistencia, inicio, acreditación, consentimiento separado, emisión, activación, lectura y revocación. OTP fuera del video. La reserva contractual dura 30 minutos desde su acreditación.

La autoridad administrativa permanece en el equipo local. Si el worker está apagado, las solicitudes esperan; no representan éxito. El video y la aceptación formal siguen pendientes. No habilita atención clínica real.
