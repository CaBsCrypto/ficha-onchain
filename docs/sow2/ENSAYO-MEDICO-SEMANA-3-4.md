# Ensayo médico: semanas 3 y 4

Este es el **guion histórico de preparación del 23 de octubre**, anterior a las tres transacciones confirmadas y al intento de nota vencido. Sus presupuestos pendientes y pasos sin ejecutar describen ese corte. Para el estado auditado posterior y la propuesta actual, ver [Semana 3](SEMANA-3-ESTADO.md) y [Continuación del ensayo médico](CONTINUACION-ENSAYO-MEDICO.md).

**Estado al 23 de octubre de 2026: preparado para revisar alcance y solicitar autorización específica. No ejecutado.** Este guion no habilita escrituras, no renueva médicos, no concede permisos y no acredita transacciones nuevas, grabación ni aceptación. El coordinador agregará los topes de gasto, recibos y resultados observados cuando corresponda; las casillas pendientes no equivalen a autorización.

## Fuentes y alcance

El guion se basa en [Semana 3: estado y límites](SEMANA-3-ESTADO.md), [QA de semanas 3 y 4](QA-SEMANA-3-4.md), [plan de aportes y recetas](PLAN-APORTES-Y-ADJUNTOS.md) y el mecanismo de recuperación descrito en el [ensayo API de semana 2](ENSAYO-API-TESTNET-SEMANA-2.md). El último documento acredita otro recorrido; no reutilizarlo como prueba de aportes médicos.

Se propone conservar paciente, médico, administrador, wallets, ficha y contratos existentes. El ensayo utiliza datos sintéticos de la misma pareja de prueba; los identificadores y asociaciones se verifican en privado antes de operar. Los correos sólo sirven para ingresar: el servidor deriva la identidad y wallet verificadas. No crear otra wallet ni otra ficha, modificar contratos, desplegar, migrar, financiar cuentas ni emitir, activar o revocar recetas.

Se prevén **ocho transacciones**: una renovación médica temporal, cuatro cambios de permisos clínicos y tres aportes/versiones del médico. Las consultas y capturas intermedias no cuentan como transacciones. Una restauración o incidencia que exija acciones adicionales requiere revisar su alcance aparte; este guion no las autoriza.

## Condiciones antes de solicitar ejecución

- Fijar la compilación local final, commit si existe y diferencia revisada. Identificar el puerto que realmente atiende esa compilación, fecha de Chile y ledger de la inspección. No usar el HEAD anterior como si contuviera los cambios nuevos.
- Confirmar Stellar Testnet, contratos y WASM fijados, Neon dev, identidades y wallets originales, saldo disponible y ausencia de intentos pendientes en clínica, recetas y administración. Comprobar que las entradas necesarias están activas; la lectura nunca restaura por sí sola.
- La inspección previa informó autorización médica v3 vencida, perfil activo y permisos retirados en revisión 3. **Volver a leerlos**; estos valores son un punto de partida, no un resultado actual garantizado. Una diferencia detiene la secuencia hasta revisar el plan.
- Preparar y verificar un control local acotado a esta pareja, ficha, métodos, duración, cupos y presupuesto agregado, manteniendo apagado el flag global. No ampliar las excepciones del paciente a otras historias o médicos.
- Preparar una renovación con duración exacta de 24 horas y el mismo médico. La ruta administrativa existente fija 30 días y `--once` no selecciona una petición: no utilizar esos caminos como si ya implementaran este alcance. La revisión debe mostrar el `validUntil` absoluto antes de firmar; 24 horas de autorización médica no implican 24 horas de escrituras abiertas.
- Completar las tarifas estimadas, máximos por transacción, presupuesto agregado, pagadores existentes y horario de la ventana local. El coordinador deberá agregar esa propuesta concreta; **presupuesto pendiente** significa que todavía no está listo para ejecutar.
- Revalidar las recetas existentes del mismo paciente y emisor: #3 vencida o #4 revocada. Usarlas sólo como antecedentes históricos. Su permiso de documento es independiente del clínico y debe funcionar desde la cuenta médica; no inventar una receta para completar la prueba.
- Verificar sesiones independientes o un cambio de cuenta completo entre roles, con borrado de los datos anteriores. Los códigos se ingresan sólo en Privy; no capturarlos, copiarlos al chat ni guardarlos en evidencia.

Autorización del ensayo: **pendiente**. Ventana local propuesta: seis horas, con inicio y vencimiento absolutos todavía pendientes. Pagadores y presupuesto: **pendientes de la propuesta del coordinador**. El consentimiento de este guion no se infiere de restauraciones anteriores.

## Recorrido y ocho transacciones propuestas

Los números de revisión y versión siguientes son expectativas condicionadas a la inspección inicial. Cada paso requiere su propio recibo confirmado antes de avanzar. No anunciar éxito por haber obtenido una firma o un estado `submitted`.

| TX | Actor que autoriza/firma | Acción concreta | Resultado que se comprobará |
|---|---|---|---|
| 1 | Administrador existente | Renovar al mismo médico durante 24 horas, con vencimiento absoluto revisado | Registro vigente, mismo médico/wallet, nueva versión de autorización; sin cambiar su perfil ni permisos de paciente |
| 2 | Paciente existente, Privy | Conceder sólo lectura: read=true, append=false | Revisión 3→4 si la base sigue en 3; médico ve notas/archivos y no puede preparar aportes |
| 3 | Paciente existente, Privy | Cambiar a sólo agregado: read=false, append=true | Revisión 4→5; cronología, notas, archivos y metadatos de corrección no se entregan al médico |
| 4 | Médico existente, Privy | Agregar una nota sintética nueva desde sólo agregado; vincular una receta histórica existente y accesible (#3 o #4) | Un aporte nuevo con autor médico y versión 1; vínculo privado conserva ID, consulta, estado y recibo original de receta, sin reemitirla |
| 5 | Paciente existente, Privy | Conceder ambos: read=true, append=true | Revisión 5→6; médico puede leer y agregar; aparece la nota recién creada y se distingue de aportes del paciente |
| 6 | Médico existente, Privy | Agregar el PDF sintético de este paquete | Un aporte nuevo, autor médico y versión 1; descarga idéntica al fixture, sin convertir ni reducir sus bytes |
| 7 | Médico existente, Privy | Corregir sólo su nota de TX4 mediante una nueva versión, conservando el mismo vínculo histórico accesible | Misma entrada, versión 2; versión 1 permanece; no se sobrescriben aportes del paciente u otro autor |
| 8 | Paciente existente, Privy | Retirar ambos permisos: read=false, append=false | Revisión 6→7; posterior consulta, descarga y preparación médica bloqueadas; contenido anterior desaparece al detectar pérdida de contexto |

La aplicación comprueba identidad, autorización, capacidades y revisión actual antes de preparar, firmar y reintentar. No sustituir una firma del paciente o del médico por la administrativa. El administrador sólo interviene en TX1 y no obtiene acceso general a la ficha.

## Guía de pantalla y narración

1. **Base sin permisos.** Paciente abre la ficha original y muestra sus aportes existentes, autor, fechas, versiones y código compartible. Médico intenta abrir ese código y obtiene un rechazo sin contenido. Repetir la comprobación después de TX1 y antes de TX2, ya con autorización médica vigente y aún sin permiso del paciente, para demostrar ambos controles por separado. Registrar la base real; el último estado observado tenía cuatro antecedentes y cinco versiones.
2. **Renovación y sólo lectura.** Tras TX1 y TX2 confirmadas, médico entra con su cuenta original, abre el código, consulta antecedentes y prepara la descarga privada de un archivo existente. Mostrar que no hay formulario de aporte y que la descarga requiere comprobación actual.
3. **Sólo agregado.** Tras TX3, actualizar: no mostrar cronología, notas, archivos, versiones previas ni controles de corrección. Preparar la nota nueva de TX4; elegir conscientemente una receta histórica. La opción debe mostrar **Revocada** para #4, aunque también haya vencido, o **Vencida** para #3. Revisar el contenido y confirmar una sola vez. La receta no se presenta como utilizable ni cambia de estado.
4. **Ambos permisos.** Tras TX5, médico ve la cronología y su nota con fuente médica, cuenta del autor, fecha y versión 1. Abrir la receta vinculada por el documento privado existente, con comprobación independiente. Mostrar ID de receta/consulta, estado histórico y su recibo original; el vínculo clínico tiene su recibo separado.
5. **PDF y corrección propia.** Revisar el PDF antes de TX6. Tras confirmar, descargarlo de nuevo y comparar bytes/hash con el fixture. En TX7 corregir la nota de TX4, conservar el vínculo accesible y mostrar versiones 1 y 2. No ensayar una corrección ajena enviando una transacción: comprobar ausencia de controles y conservar su rechazo como prueba aislada o HTTP autenticada sin firma cuando proceda.
6. **Revisión del paciente.** Cambiar a paciente y volver a abrir la ficha: ver los dos aportes médicos, autor/fecha/versiones, ambos textos de la nota, PDF íntegro y receta histórica con sus permisos propios. Si la base continúa en cuatro entradas/cinco versiones, el resultado esperado es seis entradas/ocho versiones; registrar el conteo real y detenerse si aparecen duplicados inesperados.
7. **Retiro y rechazo posterior.** Paciente firma TX8. Cambiar a médico, actualizar y demostrar que no ve la cronología ni puede descargar o preparar nuevos aportes. No considerar un documento ya descargado como acceso nuevo: retirar permisos bloquea accesos posteriores, no elimina copias externas. Regresar a paciente y confirmar que conserva su historial y los permisos retirados.

Texto sintético propuesto para TX4: título «Seguimiento técnico de demostración»; contenido «Aporte médico ficticio para comprobar permisos y versiones en Stellar Testnet. No representa una atención ni indicación clínica. La receta vinculada es un antecedente histórico y conserva su estado y permisos propios.» Para TX7 agregar «Corrección técnica: revisión de redacción; se mantiene el vínculo histórico y la versión anterior.» Usar fecha de antecedente vacía o una fecha sintética revisada; no convertir una fecha inventada en evidencia de atención real.

## Cuatro estados que deben quedar visibles

| Estado observado | Médico consulta notas/archivos | Médico agrega un aporte nuevo | Corrección de su aporte | Evidencia prevista |
|---|---|---|---|---|
| Ninguno: base y después de TX8 | No | No | No | Rechazo sin datos; paciente conserva su ficha |
| Sólo lectura: después de TX2 | Sí | No | No | Cronología y descarga autenticada, sin compositor |
| Sólo agregado: después de TX3/TX4 | No | Sí | No, porque no hay lectura de la versión previa | Pantalla sin cronología; preparación de nota nueva |
| Ambos: después de TX5/TX6/TX7 | Sí | Sí | Sólo autor y última versión | Nota/versiones, autor visible, PDF y recibos |

## Tabla de capturas y recibos

Todos los campos siguientes son **pendientes de ejecución**. Una captura futura debe registrar fecha/hora y la versión servida. En un video futuro, completar el minuto/segundo de cada fila; no hay grabación producida por este documento.

| Paso | Actor | Evidencia a capturar | TX/hash real | Tiempo del video | Resultado |
|---|---|---|---|---|---|
| Base | Paciente y médico | Ficha original/contador; acceso médico sin permiso rechazado | No aplica: lectura | Pendiente | Pendiente |
| TX1 | Administrador | Renovación, validez exacta 24h, mismo médico y recibo | Pendiente | Pendiente | Pendiente |
| TX2 | Paciente → médico | Permiso sólo lectura, recibo; cronología sin compositor | Pendiente | Pendiente | Pendiente |
| Descarga de lectura | Médico | Acceso actual y descarga de archivo existente | No aplica: lectura; referenciar recibo original comprobado | Pendiente | Pendiente |
| TX3 | Paciente → médico | Sólo agregado; cronología/archivos cerrados | Pendiente | Pendiente | Pendiente |
| TX4 | Médico | Nota nueva revisada, receta histórica elegida y recibo clínico; autor/versión visibles después de TX5 | Pendiente | Pendiente | Pendiente |
| TX5 | Paciente → médico | Ambos permisos y nuevo recibo; nota visible | Pendiente | Pendiente | Pendiente |
| Receta histórica | Médico | ID/consulta/estado/recibo original y documento autorizado | No hay nueva TX de receta; hash original pendiente de revalidación | Pendiente | Pendiente |
| TX6 | Médico | PDF revisado, autor/versión, recibo y descarga íntegra | Pendiente | Pendiente | Pendiente |
| TX7 | Médico | Corrección propia, mismo entryId, versiones 1 y 2, vínculo conservado | Pendiente | Pendiente | Pendiente |
| Revisión | Paciente | Aportes médicos diferenciados de los propios, versiones/PDF/receta | No aplica: lectura | Pendiente | Pendiente |
| TX8 | Paciente → médico | Retiro confirmado y posteriores lectura/descarga/preparación rechazadas | Pendiente | Pendiente | Pendiente |
| Persistencia | Paciente | Recarga y nueva sesión conservan datos; permisos finales retirados | No aplica: lectura | Pendiente | Pendiente |

Guardar el hash real de cada sobre enviado, red, ledger, método, firmantes, pagador, resultado y comprobante del contrato. Adjuntar enlaces a Stellar Expert Testnet sólo después de obtener y verificar esos hashes. Registrar comisión ofrecida y costo efectivo por separado. No insertar hashes de mocks, del fixture, de restauraciones anteriores ni del recibo original de una receta como si fueran recibos de TX4/TX6/TX7.

## Integridad, recuperación y límites

El [PDF sintético](../evidence/sow2-week3-fixtures/aporte-medico-sintetico-v1.pdf) tiene una página A4 y 964 bytes. Se reutiliza `syntheticClinicalPdf(1)` del generador existente. SHA-256 de los bytes originales: `[identificador en evidencia local]`. Su aviso visible dice NOT FOR CLINICAL USE. Ver [manifiesto y objetivo](../evidence/sow2-week3-fixtures/README.md).

Ese SHA-256 acredita el archivo local y la comparación de descarga; no es una transacción ni permite reconstruir el compromiso cegado sin su contexto privado. El servidor verifica el compromiso y recibo antes de entregar cada versión. Registrar ambas comprobaciones sin publicar claves, ciphertext, encabezados, tokens, códigos ni sobres privados completos.

Si el ensayo se detiene después de un permiso confirmado y no hay intentos inciertos, el retiro anticipado debe usar el mismo UUID final de TX8 y la revisión actual 4, 5 o 6; no crear una segunda operación de retiro. El servidor validará ese alcance y el presupuesto restante. Con permisos iniciales ya retirados no hace falta una nueva transacción de limpieza.

Si aparece una respuesta incierta, detener el paso y conservar UUID/payload/intent/hash persistidos. Consultar el mismo intento; no pedir otra firma, crear otro UUID, cambiar de paciente para esquivarlo ni ejecutar el siguiente paso hasta resolverlo. La interfaz bloquea cambiar de ficha mientras hay un intento pendiente o incierto. Si vence autorización, cambia identidad/revisión, se pierde acceso a receta o aparece TTL archivado, detenerse: no renovar, restaurar ni ampliar límites automáticamente.

Durante este ensayo no se provocan transacciones fallidas a propósito. Casos de archivo alterado, otro médico, recetas ajenas, doble clic, cancelación, proveedores caídos, cambio de cuenta, móvil/teclado/zoom y respuesta perdida deben referenciar su categoría real: pruebas aisladas aprobadas o observación autenticada todavía pendiente. Una suite verde no acredita una firma Testnet.

## Cierre técnico, revisión y aceptación

**Cierre técnico de este ensayo:** ocho recibos reales y auditados, cuatro estados de permisos observados, aportes/versiones e integridad comprobados desde ambos roles, misma identidad, ausencia de intentos inciertos/duplicados, persistencia y permisos finales retirados. Deshabilitar la ventana local de escrituras al terminar según el control acordado; conservar la autorización médica sólo hasta su vencimiento de 24 horas, sin prórroga implícita. Registrar versión, costos y cualquier caso no demostrado.

**Preparación de semana 4:** incorporar las capturas verificadas a la matriz de QA, grabar el recorrido narrado con correspondencia tiempo↔hash real y publicar sólo el paquete revisado cuando se autorice. Este guion conserva los aportes originales del paciente; no incluye una nueva creación o carga del paciente en la misma sesión. Si la revisión exige esa acción fresca en una única grabación integral, agregarla a una propuesta separada antes de firmar, sin llamarla parte de estas ocho transacciones.

**Revisión y aceptación:** entregar la versión efectivamente servida, paquete de evidencia, video real, guía de usuario/operación, resultados y límites a los revisores. Su revisión y aceptación se registran aparte y permanecen pendientes hasta obtenerlas. Haber preparado este guion, compilado la aplicación o ejecutado el ensayo no equivale a entrega aceptada.
