# Semana 3 · Guía junto a la grabación

## Antes de iniciar

El responsable maneja tres perfiles independientes. A: administrador habitual. B: médico nuevo, correo pendiente del responsable; verificar antecedentes antes del alta. C: paciente habitual. No compartir sesiones en pestañas del mismo perfil. Códigos de Privy fuera del video.

- Verificar versión canónica, base de pruebas exclusiva, red, contratos y autoridades.
- Verificar y arrancar un único worker con configuración segura de main; comprobar colas antes de transmitir. No cargar .env.local como configuración de main ni iniciar un segundo runner.
- Completar controles con sesiones auténticas: administrador y usuario ajeno no leen documentos del ensayo; paciente no ejecuta una acción médica. Conservar status y referencia saneados, sin token o documento.
- Ensayar con cuentas existentes y consultas distintas a las de grabación. Preservar el alta del nuevo médico para el video.
- Preparar dos documentos sintéticos y horarios futuros en America/Santiago. No iniciar consultas hasta tener las tres sesiones listas.

## Secuencia

| Orden | Perfil | Acción | Evidencia |
|---|---|---|---|
| 1 | B | Presentar perfil | En revisión; sin transacción |
| 2 | A | Revisar y aprobar | Pendiente → authorize_doctor confirmado; abrir Stellar Expert |
| 3 | B | Comprobar autorización, agregar bloque y guardar agenda | Interfaz |
| 4 | C | Reservar dos consultas y confirmar asistencia | No concede consentimiento |
| 5 | B | Iniciar ambas consultas | Worker acredita; abrir attest_booking |
| 6 | C | Revisar alcance y autorizar una emisión por consulta | authorize_prescriber confirmado |
| 7 | B | Redactar, revisar destinatario y emitir ambas | mint_prescription; mostrar Registered y destinatario en cadena |
| 8 | B | Activar ambas por separado | activate confirmado |
| 9 | C | Abrir receta activa y documento | Recepción y lectura autorizada |
| 10 | B | Revocar segunda y finalizar consultas | revoke confirmado |
| 11 | C | Actualizar y mostrar activa + revocada; abrir historial | Estado persistente y lectura histórica |

Abrir el recibo desde la aplicación o el hash comprobado, confirmar SUCCESS, contrato, método y participantes, y volver al portal. No divulgar documentos en primer plano. Las 10 transacciones mínimas son una autorización, dos reservas, dos consentimientos, dos emisiones, dos activaciones y una revocación; cualquier acción adicional también debe inventariarse.

Emitir dentro de los 30 minutos de vigencia de las reservas acreditadas. Si vencen, usar consultas nuevas. Ante timeout, recuperar el mismo intento; no repetir firma ni generar otra emisión hasta reconciliar.

## Después

Auditar todos los recibos, destinatarios, compromisos, firmas, pagador, reservas consumidas y ausencia de duplicados o pendientes al corte. Llenar TIMESTAMPS.md con tiempos del video ya editado. Añadir versión, fecha, enlace y manifiesto; comprobar enlaces sin permisos internos innecesarios. El usuario facilita el video final.
