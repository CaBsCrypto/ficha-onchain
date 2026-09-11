# Reserva autorizada antes de emitir: arquitectura de implementación

Coordinación técnica mediante agentes de IA, 7 de septiembre de 2026. Este documento distingue diseño, implementación local y operaciones pendientes; no acredita despliegue ni transacciones de esta generación.

## Tres autorizaciones independientes

La emisión requiere conjuntamente una cuenta médica firmante y habilitada en DoctorRegistry privado, consentimiento firmado por el paciente para esa emisión y una atestación de reserva emitida por la autoridad de reservas de TrustLeaf. El relayer paga comisiones; no sustituye ninguna autorización.

El contrato no consulta Neon. La autoridad transforma una comprobación privada de reserva en una autorización verificable por el contrato. Una llamada directa sin esa atestación debe rechazarse aunque el médico y el paciente firmen. La confianza en la autoridad sigue siendo explícita: el contrato verifica su firma, no certifica que tuvo lugar una consulta clínica.

La atestación vincula cuenta médica, cuenta paciente, identificador aleatorio de emisión y vencimiento. No contiene identificador interno de reserva, fecha/hora de consulta, nombre, email, RUT, diagnóstico ni tratamiento. Las cuentas relacionadas, el vencimiento de la autorización y la actividad siguen siendo públicos.

## Funciones de la interfaz de contrato v2

| Función | Autoridad requerida | Efecto |
|---|---|---|
| Constructor | Parámetros fijados en despliegue | Define administrador, DoctorRegistry y autoridad de reservas |
| attest_booking | Firma de autoridad de reservas | Crea atestación única para emisión y participantes |
| revoke_booking | Firma de autoridad de reservas | Retira atestación antes de consumirla |
| get_booking | Consulta pública | Lee participantes, vencimiento y estado |
| authorize_prescriber | Firma paciente | Autoriza esa emisión para ese médico |
| revoke_consent | Firma paciente | Retira consentimiento antes de emitir |
| mint_prescription | Firma médico, Registry habilitado, consentimiento y atestación vigentes | Consume autorización de reserva y consentimiento al emitir al paciente fijado |

Una atestación consumida o revocada no se reactiva. Nuevas emisiones usan otro identificador, con autorización nueva; un reintento técnico conserva su identificador original. Esta versión sigue sin dispensación parcial ni firma clínica avanzada.

## Origen privado de la reserva

Las rutas históricas de agenda permiten uso de demostración y creación por el médico. Una fila de agenda, por sí sola, no prueba que el paciente solicitó esa consulta. El nuevo flujo debe exigir sesión verificada del paciente y confirmación expresa de esa reserva antes de prepararla para atestación.

Las cuentas se resuelven desde vinculaciones de identidad y wallet verificadas. Un campo de perfil editable o una dirección enviada en el cuerpo de una solicitud no demuestra control de cuenta. La preparación debe fallar si no existe esa vinculación, sin inventarla ni copiar automáticamente datos de demostración.

La persistencia conserva el vínculo privado con la reserva y participantes, identificador de emisión estable y estados pendientes. No debe retornar emisión o autorización on-chain confirmada cuando solo preparó una intención en la base.

## Cancelación y consistencia

No existe transacción atómica entre Neon y Stellar. Cancelar en la base debe impedir nuevas preparaciones y solicitar la revocación en cadena. Mientras no se confirme, la interfaz debe mostrar conciliación pendiente: una atestación que sigue vigente en cadena podría consumirse antes de la revocación. El orden de confirmación en Stellar decide el resultado.

No borrar los vínculos de una reserva mientras haya autorizaciones pendientes, enviadas o confirmadas. Las rutas históricas de modificación y borrado también deben respetar este límite. El worker deberá volver a comprobar elegibilidad antes de firmar y volver a leer el contrato tras cada resultado o timeout. Un recibo incierto se recupera; no se crea un identificador nuevo para reintentar.

## Separación de roles y claves

Autoridad de reservas, administrador de contrato y relayer son permisos distintos. La autoridad solo atesta después de verificar la base y las identidades; nunca acepta los hechos completos desde un cliente sin contrastarlos. Sus claves deben quedar fuera del navegador y de la base de datos. En Testnet puede decidirse usar la misma cuenta física para dos roles, pero debe declararse y no convertirse en un supuesto implícito de producción.

El expediente y documento clínico permanecen cifrados con claves externas, y acceso por participantes autorizados. La autorización de emisión no concede acceso general a la ficha. Menores, representantes, firma avanzada y dispensación requieren políticas adicionales.

## Cierre verificable

La matriz raíz está en [criterios de aceptación](VALIDACION_RESERVA_EMISION.md). El cierre completo requiere pruebas locales de contrato y rutas, migración dev, vinculación comprobada de cuentas, adaptadores reales de firma y conciliación, nuevo despliegue y recibos Testnet con lectura posterior. Ningún resultado local sustituye esa evidencia.

Orden de despliegue de la aplicación: aplicar primero la migración central en el entorno elegido y verificar las tablas y el trigger; después desplegar rutas que las consultan. Sin migración las rutas deben fallar, nunca omitir controles por ausencia del esquema. Esta ejecución no modifica producción.
