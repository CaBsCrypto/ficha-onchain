# Criterios de aceptación: reserva y emisión

Trabajo asignado a coordinación técnica y agentes de IA. Este documento establece los criterios; no afirma que estén implementados o aprobados.

## Condición de emisión

La emisión debe exigir simultáneamente médico autorizado y firmante, paciente que autoriza la emisión y evidencia autoritativa de una reserva elegible que relacione esas mismas cuentas. El contrato no conoce por sí mismo la base de datos: debe verificar una atestación de una autoridad de reservas o un mecanismo equivalente. Un control solo en la UI no basta.

La autoridad confirma hechos operativos de la reserva, no certifica que se prestó una atención clínica. No usar la cuenta del relayer como autoridad implícita. Si se reutiliza temporalmente la cuenta de administración en Testnet, declararlo y mantener separados sus permisos lógicos.

## Matriz pendiente de ejecución final

| Caso | Resultado exigido |
|---|---|
| Reserva elegible, médico habilitado, firmas y consentimiento correctos | Una receta al paciente correcto |
| Llamada directa al contrato sin atestación de reserva | Rechazo |
| Reserva para otro médico o paciente | Rechazo |
| Médico no habilitado, revocado o vencido | Rechazo |
| Consentimiento ausente, retirado o vencido | Rechazo |
| Atestación vencida, retirada o falsificada | Rechazo |
| Firma solo de relayer o administrador en lugar del médico | Rechazo |
| Reserva cancelada antes de autorizar emisión | Rechazo |
| Reserva cancelada con autorización on-chain pendiente | Estado de conciliación explícito; no fingir revocación instantánea |
| Dos solicitudes concurrentes o reintento tras timeout | Sin segunda emisión; recuperar resultado o rechazar duplicado |
| API anónima o usuario ajeno a la reserva | Rechazo, aun en modo demo |
| Campos clínicos o identificadores internos en argumentos/eventos | Ausentes; registrar únicamente referencias opacas necesarias |

## Evidencia requerida

Versiones de fuente y WASM, pruebas locales específicas, tests de rutas y typecheck, y luego recibos Testnet con consultas de estado. Cada resultado debe indicar si es local, RPC simulado o transacción confirmada. Una simulación RPC de un rechazo no es una transacción fallida publicada.

Se preservan las pruebas de las generaciones anteriores. El informe final debe distinguir código entregado de panel conectado, cuenta de prueba de profesional real y firma Soroban de suscripción clínica.
