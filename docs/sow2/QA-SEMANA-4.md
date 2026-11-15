# SOW 2 · Semana 4 · QA y evidencia de entrega

Corte de preparación del 15 de noviembre de 2026. [La matriz de aceptación](QA-SEMANA-3-4.md#matriz-de-qa-obligatoria) cubre el recorrido clínico, su recuperación y la demostración final en Stellar Testnet. Cada control cita la prueba, la observación autenticada o el recibo que lo respalda.

## Evidencia disponible

| Evidencia | Estado |
| --- | --- |
| PR #155 (`459262a`) | Versión base observada en el dominio principal, con Vercel Ready, CI y preview aprobados. Integra el acceso a permisos desde una consulta iniciada y enfoca al médico verificado de la cita. La concesión requiere la firma del paciente y el agregado exige al médico autorizado con permiso vigente. |
| Regresión de lectura | Las suites locales de lectura comprobadas cubren rechazo de estado archivado y recuperación del proveedor. Usan respuestas controladas. |
| Recorrido verificado | En Neon se verificó una consulta con asistencia del Paciente e inicio por el Médico asignado, todavía en curso. En Stellar Testnet se verificaron tres recibos `SUCCESS` correspondientes a la concesión de ambos permisos, el primer aporte del Médico (versión 1) y el retiro de ambos (revisión 2). El Médico sigue autorizado. El registro privado es `semana4-linea-base-20261115-202217.private.json`. |
| Grabación en edición | El responsable informó que grabó el recorrido y que funcionó. Falta recibir el archivo para cotejar los tramos, la pantalla de acceso denegado y los recibos. La ficha tiene una sola versión y la pareja carece de una receta en la consulta de solo lectura. |
| Cierre de Semana 3 | Conservar las tomas y recibos reales comprobados. El corte anterior y el [guion alojado](GRABACION-SEMANA-3-ALOJADA.md) documentan alcances distintos. Cotejar el recorrido exacto del material antes de reconocer un resultado de extremo a extremo. |

## Historial archivado y recuperación observada

Con la ficha de Semana 2, `GET /api/private-clinical-history` devolvió HTTP 503 sin contenido y el portal mostró «No pudimos comprobar el registro en Stellar». La simulación de `get_history` con SDF resultó exitosa e incluyó dos entradas archivadas, `History` y `Patient`, en `transactionData.ext=1`. La restauración aprobada de esa huella exacta confirmó `RestoreFootprint` en Testnet, ledger `5747237`, con cargo de `0,0054598 XLM`. El recibo se conserva en `restaurar-ficha-semana2-20261115-132214-1h.receipt.private.json`. Las lecturas del SDK pasaron tras la restauración y el responsable confirmó que la ficha volvió a mostrarse.

1. Para repetir la prueba, usar un caso controlado que reproduzca esas dos entradas archivadas y abrir `/patient?tab=historial`. Registrar hora de Chile, SHA, estado HTTP y código de respuesta. Comprobar que la ficha permanece oculta, la interfaz ofrece volver a consultar y la lectura no habilita firmas ni emite transacciones.
2. Ante un nuevo aviso real, cotejar en una transacción de solo lectura la ficha con la sesión y la billetera autenticadas. Con el mismo proveedor, revisar despliegue, `get_history`, `get_entry`, `get_version` y `get_operation` del agregado. Registrar qué lectura falla y si el RPC devuelve `restorePreamble`, entradas archivadas o un fallo del proveedor. Mantener los identificadores y recibos vinculados a la cuenta en el registro privado.
3. Si hay un intento incierto, consultar el mismo hash y conservar su sobre y reserva. Ante archivo comprobado, simular `RestoreFootprint` en Stellar Testnet con el relayer configurado y sólo con las claves persistentes verificadas. [El constructor de mantenimiento](../../scripts/lib/clinical-restoration-plan.mjs) valida contrato, huella y tarifa. Guardar la cotización privada con red, huella, importe máximo, vencimiento y hash para revisión.
4. Tras la autorización de la cotización vigente, guardar el sobre firmado antes de transmitir. Confirmar el mismo hash y sobre con recibo `SUCCESS`, ledger y cargo. Volver a leer las claves activas de la ficha y cotejar las versiones y permisos antes de pedir al Paciente que pulse **Actualizar**.

## Controles de salida

| Área | Comprobación pendiente en la versión entregada |
| --- | --- |
| Consulta y roles | Con sesiones separadas, el Paciente reserva y confirma asistencia. El Médico asignado y autorizado inicia. El Paciente abre **Gestionar acceso a mi ficha** y comprueba Médico y hora de Chile. Probar que un enlace ajeno no muestra datos de la cita y que el Médico no puede concederse permisos. La cita, asistencia e inicio se cotejaron en Neon. Falta la revisión visual de la versión entregada. |
| Ficha y permisos | Comprobar la ficha existente, autoría y ambos permisos por separado. Con lectura sola se bloquea el agregado. Con agregado solo, el médico puede aportar y la cronología y archivos quedan ocultos. Contrastar los cambios con sus recibos. |
| Receta | En la toma de emisión, cotejar alcance, cotización y vencimiento antes de la atestación. Auditar su recibo y las firmas independientes de consentimiento del paciente y emisión del médico. Confirmar el estado final de la receta del mismo paciente. |
| PDF y corrección | Cotejar tamaño y SHA-256 del PDF descargado con el original. Mostrar versión inicial y corregida, autoría y enlace a la receta. Auditar el recibo de corrección. Probar rechazo de archivos alterados o mayores a 3 MB y de vínculos a recetas ajenas. |
| Retiro | El recibo del retiro, ambos permisos apagados y la autorización del Médico se cotejaron en Testnet. Falta observar la denegación en su sesión al abrir la ficha y probar el bloqueo de descarga y preparación. |
| Recuperación | Reproducir con pruebas controladas pérdida de respuesta, doble clic, firma cancelada, cambio de cuenta, autorización vencida, TTL y fallo de RPC. Confirmar que la conciliación conserva el intento y que una recarga no devuelve datos de una sesión anterior. Distinguir las pruebas de estado persistido de las simulaciones. |
| Publicación y accesibilidad | Registrar SHA, build, fecha, comandos y resultados de CI y pruebas, incluidas omisiones. Cotejar red, base aislada y escrituras generales apagadas. Comprobar lectura autenticada antes y después del despliegue y documentar la reversión. Revisar móvil, escritorio, teclado y zoom al 200 %. |

## Regresión de la candidata

- Node 22.23.5. Pasaron 2.277 pruebas de aplicación, 873 de servicios privados y 19 de captura y receta.
- Las 4 pruebas de PostgreSQL que Vitest omite en la ejecución general pasaron por separado en Neon dev con fixtures sintéticos. Pasaron las 25 pruebas Rust de contratos.
- En un entorno local pasaron la reserva con PostgreSQL en memoria y la integración de aporte, descarga del PDF sintético, versiones y permisos. La prueba de descarga comparó los bytes y el SHA-256 con el PDF de 964 bytes.
- Las regresiones de interfaz cubren el aviso de archivo, la falta de datos verificados y la comprobación del mismo intento. La revisión visual autenticada en móvil, teclado y zoom se registra al ejecutar el recorrido final.

## Registro de hallazgos y video

| Caso | Minuto del video | Actor y acción | Resultado observado | Evidencia privada o recibo |
| --- | --- | --- | --- | --- |
| QA-__ | `mm:ss–mm:ss` | Paciente o médico de prueba | Pendiente, aprobado, fallido o bloqueado y motivo | Referencia privada, fecha, estado y ledger cuando proceda |

En cada hallazgo registrar versión, pasos mínimos, resultado esperado, resultado observado y próxima comprobación. Vincular las transacciones a sus recibos de Stellar Testnet y registrar los pasos locales por su resultado en pantalla. Suprimir correos, identificadores personales, códigos y firmas del material compartido. Verificar el idioma español, la legibilidad y la narración del video final. La entrega y la aceptación del revisor se registran cuando ocurran.
