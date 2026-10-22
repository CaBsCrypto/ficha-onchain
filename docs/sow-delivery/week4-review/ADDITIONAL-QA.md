# D4 — QA adicional sin transacciones, 23 septiembre 2026

Actualización posterior: el recibo de consentimiento en main paciente se comprobó al recargar/reabrir la consulta #5 durante la [auditoría intensiva](INTENSIVE-AUDIT.md). El pendiente indicado más abajo refleja el cierre de esta primera pasada, no el estado vigente.

Producto: main `6e8dfb450f0a4451544ea01c87e368d84814ff8e`. Pruebas locales sobre `1c694ba`, árbol idéntico `a0d73050980791c3a709d4223cf1db7c76e12025`. Sólo cambios documentales; worker detenido. No se ejecutaron firmas, reservas ni emisiones.

| Área | Resultado | Evidencia y límite |
| --- | --- | --- |
| Filtro y navegación con teclado | Aprobado observado | Home/flechas seleccionan Activas: #10/#7; Enter abre documento y consulta histórica |
| Foco del documento | Parcial; pendiente ciclo completo | Shift+Tab desde cierre llega a imprimir; Tab regresa; Escape cierra y devuelve foco al botón. La salida del último enlace sigue sin contraste en navegador local nativo |
| Carga, cierre y respuestas tardías | Aprobado automatizado | private-document-loading y prescription-document-view: cancelación, respuesta antigua descartada, carga/error ocultan documento y reintento |
| Firma cancelada y doble clic | Aprobado automatizado | private-signing-component: rechazo de Privy no confirma; doble clic firma una sola vez; cerrar revisión no prepara ni firma |
| Respuesta incierta y recuperación | Aprobado automatizado | private-operation-recovery y worker-prescription-bookings: mismo intento/hash, sin nueva firma, rechazo de recibos fallidos o sustituidos |
| Integridad y permisos | Aprobado automatizado | private-operations-security y read-private-prescription: identidad/destinatario/contexto incorrectos, emisión no confirmada y cifrado alterado fallan cerrados |
| Sesión y cambio de identidad | Automatizado + inspección; no nuevo login real | patient-direct-login cubre sesión vencida; wallet-bootstrap rechaza identidad sustituida. WalletBoundary desmonta al perder sesión y cambia key por user.id. No equivale a nueva prueba visual de dos cuentas hoy |
| Reserva tras emisión/recarga | Aprobado observado y contrastado | Consulta #5 finalizada, reserva consumida; f94f2cd5348179a6af720dbec0cff21aa81ad8000acd10da8e560054fdc448a9 coincide con attest_booking/SUCCESS en auditoría del 14 septiembre |
| Emisión y activación | Aprobado observado | Consulta #5 conserva receta #10 activa, emisión eb83cd678fa04601b7a1821809c86d8c4aa047444ce7eb49923d35330ade4ff7 y activación 2c3e23a2b1d0e958b33a7e577c2f487f6c49ac18ee10b88673e68d5cd1b57eff |
| Consentimiento después de emitir | Pendiente navegador main paciente | Médico ve permiso consumido, sin recibo del paciente. readPrivateConsultation filtra operaciones por actor_user_id. No se amplían permisos; evidencia previa del preview paciente no se presenta como comprobación main |

## Ejecuciones nuevas

- Vitest: 8 archivos, 124 casos aprobados (private-document-loading, prescription-document-view, private-portal-state, private-operations-security, private-operation-recovery, private-signing-component, private-access-recovery, patient-direct-login).
- Vitest adicional: private-wallet-bootstrap, 7 casos aprobados. Total seleccionado de aplicación: **131**.
- Node test: read-private-prescription, worker-private-portal y worker-prescription-bookings, **22 casos aprobados**.
- No se repitió build/TypeScript: no cambió código de producto. Se conservan las verificaciones de la candidata integrada, sin atribuirles una ejecución nueva.
- Los tests de DocumentView usan jsdom y sustituyen showModal: no pueden validar el confinamiento nativo del foco. El comportamiento del navegador interno se mantiene pendiente, sin clasificarlo como bug confirmado.

## Continuación

No se demostró un bloqueo nuevo que justifique una PR de producto. Quedan dos verificaciones puntuales: ciclo completo de teclado en navegador compatible y recibo de consentimiento en main con paciente. Aprovechar el próximo cambio de cuenta; no emitir para comprobarlo. Preservar la evidencia móvil/200% anterior.

El video original #12 mantiene cinco recibos y no demuestra activación. El complemento y sus tiempos/hash siguen pendientes; no reutilizar los recibos históricos #10/#11 como si fueran del nuevo video. Worker, relayer y colas deben verificarse de nuevo antes de grabar. #130 no bloquea D4.
