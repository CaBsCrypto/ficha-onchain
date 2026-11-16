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

### Fichas compartidas y notificaciones

1. Mantener abiertos los dos perfiles. Desde la ficha del Paciente, conceder lectura, agregado o ambos al Médico elegido. Comprobar que la ficha aparece en **Fichas compartidas** tras el recibo confirmado y que llega un aviso en la campana.
2. Abrir la ficha desde la lista o el aviso. Comprobar que una ficha con sólo agregado permite aportar y mantiene ocultos los antecedentes. Repetir con lectura sola y con ambos permisos. Cotejar cada derecho mostrado con el permiso vigente.
3. Cambiar un permiso y después retirar ambos. La campana debe distinguir concesión, cambio y retiro. Verificar que la ficha retirada desaparece de la lista y que al reabrir un enlace anterior se deniega el acceso. Probar con dos perfiles médicos distintos y con una operación aún pendiente de confirmar.
4. Abrir la campana y la lista en móvil y con teclado. Verificar que los avisos y la ficha seleccionada se limpian al cambiar de cuenta.

### Rediseño clínico

La referencia visual anterior es la revisión `7c628e4`. Para comparar el rediseño, usar la misma consulta, ficha sintética, rol, idioma, ventana y estado de la interfaz en ambas capturas. Registrar el SHA probado y guardar las capturas en la carpeta privada de evidencia de Semana 4.

[Comparación visual con datos sintéticos](../evidence/sow2-week4-redesign/) a 1440 × 960 y 320 × 844. Documenta los permisos del Paciente y el acceso a la ficha desde la consulta del Médico.

En Edge, Tab llevó el foco visible a **Gestionar acceso a mi ficha**, a ambos permisos y a **Revisar cambios** con una ventana de 320 × 568. La página deja esos controles por encima de la barra inferior. La comprobación usó los componentes del portal con una consulta sintética.

| Caso | Comprobación del rediseño |
| --- | --- |
| Paciente · consulta → ficha | Abrir una consulta iniciada como Paciente y elegir **Gestionar acceso a mi ficha**. Verificar que se enfoca al médico de esa consulta, con el inicio en hora de Chile. Comprobar que **Volver a esta consulta** conserva la cita y el idioma. Abrir también **Ficha clínica** sin cita y comprobar que el acceso general a la ficha, los aportes y los permisos funciona. |
| Médico · consulta → ficha | Abrir la consulta asignada. **Abrir ficha compartida** aparece cuando la consulta y el permiso vigente coinciden con la ficha del directorio. Comparar acceso de lectura, sólo agregado y ambos, en la consulta y en **Fichas compartidas**. Una consulta ajena o cancelada, o un permiso retirado, debe bloquear la apertura sin mostrar otra ficha. |
| Campana, recuperación y navegación | Comparar el tipo de aviso, fecha y hora de Chile, permisos y enlace. Verificar que un retiro deja el aviso sin enlace y que el fallo de verificación ofrece volver a consultar. Volver a una pestaña suspendida durante un retiro simulado. Mientras se revalida, ocultar ficha anterior, nombres y enlaces. Con un intento pendiente, conservar su consulta y bloquear el cambio a otra ficha. |
| Capturas antes y después · móvil | Guardar capturas equivalentes a 320 px de ancho CSS, en la ficha del Paciente y en la consulta o campana del Médico. Comprobar cinco destinos utilizables, selección visible, rótulos en español e inglés, panel de campana dentro de la pantalla y última acción visible por encima de la barra y la zona segura. Registrar también el resultado a un ancho móvil habitual y al 200 % de zoom. |
| Escritorio y teclado | Comparar la barra lateral y la jerarquía de consulta y ficha en escritorio. En el portal médico, confirmar que el estado de autorización vigente queda al final en un control plegable y que el aviso de una solicitud administrativa pendiente sigue arriba. Recorrer ambos portales con Tab y Mayús+Tab, abrir y cerrar la campana con teclado, y comprobar el foco cuando una actualización elimina el enlace enfocado. Verificar nombres de navegación, anuncio de carga o error y contraste de estados. |

Las 22 pruebas enfocadas de barras, acceso y campana pasaron con respuestas controladas. Cubren la suspensión, el rechazo del resultado anterior, la conservación del bloqueo de un intento pendiente, el vencimiento de la consulta a la bandeja y la hora de Chile. La comprobación visual en navegador se registra por separado. Para este pase usar datos sintéticos y respuestas controladas en las acciones que requieren firma. Cualquier firma real en Stellar Testnet requiere autorización específica del usuario y su confirmación en Privy.

### Pulido previo a la grabación

Usar la publicación del PR #158 (`d77a0a8`) como referencia visual. Comparar con el SHA candidato en la misma consulta, perfil, idioma y estado; guardar capturas equivalentes a 320 px CSS y en escritorio. Tratar esas capturas con datos sintéticos como evidencia de interfaz. Registrar aparte lo observado con las sesiones autenticadas en el dominio publicado.

[Capturas comparativas del pulido](../evidence/sow2-week4-polish/). En Edge se confirmó el foco visible por encima de la navegación inferior a 320 × 568, incluido **Revisar cambios** después de mostrar la selección pendiente.

| Responsable | Comprobación para autorizar el inicio de la grabación |
| --- | --- |
| Scrum Master | Revisar los bloqueos en consulta y permisos, y coordinar la revisión con ficha, documentos y campana. |
| Project Manager | Cotejar el alcance del PR, la evidencia visual, el SHA publicado y el resultado del ensayo con ambas sesiones. |
| QA de interfaz | En consulta, comprobar que se identifica a la otra persona, se reconoce el siguiente paso y se distingue la disponibilidad de la ficha de la acción de finalizar. En permisos, comprobar el médico enfocado, la fecha, la confirmación vigente y el regreso a la misma consulta. |
| QA de interfaz | En el portal médico, comparar campana y **Mi cuenta** en ambos anchos y en español e inglés. Leer tipo de aviso, hora de Chile en formato de 24 horas y permisos. Revisar avisos de retiro, enlaces antiguos, consulta temporalmente indisponible y retorno de foco por teclado. Confirmar el cierre de sesión desde **Mi cuenta** y que un intento que requiere conciliación mantiene bloqueado el cambio de ficha desde la campana. **Mi cuenta** sigue disponible para cerrar sesión. |
| Operación | Cotejar SHA, build y CI, sesiones separadas y consulta, ficha, permisos y recibos existentes en Stellar Testnet. Hacer primero un ensayo de lectura. Si falta un resultado verificable o la interfaz muestra un intento pendiente, comprobar el mismo intento y registrar su estado antes de continuar. |
| Responsable de captura | Validar encuadre e idioma antes de registrar el recorrido. Ante una operación nueva, dejar el alcance, importe y vencimiento revisados y pausar la captura antes de cualquier código o firma. El usuario confirma en Privy. Retomar en el resultado y anotar el minuto y la referencia privada al recibo. |

Registrar el pase sólo cuando el SHA candidato, el recorrido visual y las comprobaciones de lectura tengan evidencia. Dejar como pendiente el paso exacto que requiera una confirmación real, con su responsable y la próxima comprobación. Las mejoras ajenas al recorrido clínico se llevan a una revisión posterior.

## Regresión anterior al rediseño

- Node 22.23.5. Pasaron 2.277 pruebas de aplicación, 873 de servicios privados y 19 de captura y receta.
- Las 4 pruebas de PostgreSQL que Vitest omite en la ejecución general pasaron por separado en Neon dev con fixtures sintéticos. Pasaron las 25 pruebas Rust de contratos.
- En un entorno local pasaron la reserva con PostgreSQL en memoria y la integración de aporte, descarga del PDF sintético, versiones y permisos. La prueba de descarga comparó los bytes y el SHA-256 con el PDF de 964 bytes.
- Las regresiones de interfaz cubren el aviso de archivo, la falta de datos verificados y la comprobación del mismo intento. La revisión visual autenticada en móvil, teclado y zoom se registra al ejecutar el recorrido final.

## Registro de hallazgos y video

| Caso | Minuto del video | Actor y acción | Resultado observado | Evidencia privada o recibo |
| --- | --- | --- | --- | --- |
| QA-__ | `mm:ss–mm:ss` | Paciente o médico de prueba | Pendiente, aprobado, fallido o bloqueado y motivo | Referencia privada, fecha, estado y ledger cuando proceda |

En cada hallazgo registrar versión, pasos mínimos, resultado esperado, resultado observado y próxima comprobación. Vincular las transacciones a sus recibos de Stellar Testnet y registrar los pasos locales por su resultado en pantalla. Suprimir correos, identificadores personales, códigos y firmas del material compartido. Verificar el idioma español, la legibilidad y la narración del video final. La entrega y la aceptación del revisor se registran cuando ocurran.
