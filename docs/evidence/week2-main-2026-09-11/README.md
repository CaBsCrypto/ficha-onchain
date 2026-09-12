# Evidencia de main · Semana 2

Recorrido sintético ejecutado el 11 de septiembre de 2026, hora de Chile, en https://trustleaf-demo.vercel.app. Versión del recorrido: `6392e18cfe86ae665c82757917709221c0b02cd5`.

- [Auditoría independiente](independent-chain-audit.json): 12 recibos SUCCESS, firmas y fee payer verificados, argumentos exactos, documentos descifrados sólo en memoria para recomputar compromisos, dos reservas consumidas y ninguna operación pendiente ni hash duplicado en el corte.
- [Reservas e inicio](booking-ui-validation.json).
- [Consentimiento, retirada y nueva autorización](consent-ui-validation.json).
- [Emisión, activación, revocación y lectura](prescription-ui-validation.json): #7 activa, #8 revocada; médico y paciente abren ambos documentos; consultas finalizadas.
- [Rechazo sin sesión](anonymous-access-audit.json): HTTP 401 en ambos documentos, sólo error, sin contenido.

## Límites pendientes

La ausencia de botones médicos en el paciente no acredita por sí sola la autorización del endpoint. Falta probar en main las solicitudes autenticadas de un administrador y un usuario ajeno a los documentos, y una acción médica desde el paciente. Las pruebas automatizadas de esos límites se identifican por separado.

La retirada se observó, pero no se intentó emitir durante ese intervalo. No hubo prueba de doble clic real en este recorrido: la ausencia de duplicados se auditó y la recuperación se prueba de forma aislada.

La PR #118 corrige avisos transitorios durante la reconciliación de mint. 536 pruebas de aplicación, 45 privadas, 11 contractuales, TypeScript y build local pasaron con esa corrección. Su validación remota y versión de despliegue se registrarán al promoverla.

Video pendiente. El ensayo todavía no se declara aprobado para entrega. El worker depende del equipo local; las claves administrativas no se publican en Vercel. Sólo Testnet y datos sintéticos.
