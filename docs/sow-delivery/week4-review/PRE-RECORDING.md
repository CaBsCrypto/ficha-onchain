# Preparación D4 — 23 de septiembre de 2026

Versión: `6e8dfb450f0a4451544ea01c87e368d84814ff8e`. Sin cambios de producto, reservas, firmas ni emisiones en esta revisión. #130 no bloquea el cierre.

## Observado en main

- Sesión médica: #10 activa y #11 revocada conservan sus estados y enlaces de emisión, activación y revocación después de recargar.
- #10 abre con Enter y muestra su contenido sintético y recibo correcto. #11 carga sin mostrar el documento anterior y presenta el aviso histórico de revocación.
- Escape cierra ambos y devuelve el foco al botón de apertura. Tab alcanza el enlace de emisión; el ciclo completo no queda acreditado porque el navegador interno devuelve foco transitorio a BODY/contenedor. No se declara auditoría exhaustiva de teclado ni fallo funcional demostrado.
- 04:06:48 UTC: 3 autorizaciones confirmadas, 6 reservas consumidas, 24 operaciones confirmadas; un bloqueo de autoridad.
- 04:08:11 UTC: cierre ordenado mediante Ctrl+C al worker identificado; proceso terminado, cero bloqueos de autoridad y archivo de bloqueo ausente. Conteos sin cambios.

**Worker detenido intencionalmente.** Volver a iniciarlo y comprobarlo antes de grabar.

## Evidencia reutilizada

644 pruebas de aplicación, 45 privadas, 11 contractuales, TypeScript y build sobre árbol idéntico al publicado; no se repitieron por cambios documentales. Matriz previa de Inicio/Consultas/Recetas/Cuenta a 360/390/430/1280 sin desbordamiento horizontal. El usuario confirmó 200%. Esta sesión médica no acredita una nueva revisión autenticada móvil del paciente. El ciclo de foco completo queda como comprobación puntual pendiente.

## Preparación del complemento

1. Confirmar versión canónica; iniciar un worker, verificar exclusividad, relayer y colas sin intentos inciertos.
2. Alternar cuentas existentes en un navegador. Códigos sólo en Privy y fuera de captura; comprobar identidad tras cada cambio.
3. Con grabación preparada: consulta nueva, reserva, asistencia, inicio y acreditación, consentimiento, emisión, activación, lectura del paciente y finalización.
4. Emitir dentro de 30 minutos de acreditación. Si vence, registrar otra consulta explícitamente.
5. Auditar recibos reales, destinatarios, comisiones, estados y ausencia de duplicados/pendientes. No modificar #12.

## Mapa de tiempos por completar tras editar

| Ejecución | Tiempo final | Actor | Acción / método | ID | Hash y enlace Testnet | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| A, original | Pendiente edición | Autoridad | authorize_doctor | Según auditoría A | Recibo auditado A pendiente de incorporar | Según auditoría A |
| A | Pendiente edición | Worker | attest_booking | Consulta 7 | Recibo auditado A pendiente de incorporar | Según auditoría A |
| A | Pendiente edición | Paciente | authorize_prescriber | Consulta 7 | Recibo auditado A pendiente de incorporar | Según auditoría A |
| A | Pendiente edición | Médico | mint_prescription | Receta 12 | Recibo auditado A pendiente de incorporar | Según auditoría A |
| A | Pendiente edición | Médico | revoke | Receta 12 | Recibo auditado A pendiente de incorporar | Revocada; sin activación |
| B, complemento | Pendiente grabación | Worker | attest_booking | Pendiente | Pendiente | Pendiente |
| B | Pendiente grabación | Paciente | authorize_prescriber | Pendiente | Pendiente | Pendiente |
| B | Pendiente grabación | Médico | mint_prescription | Pendiente | Pendiente | Pendiente |
| B | Pendiente grabación | Médico | activate | Pendiente | Pendiente | Pendiente |
| B | Pendiente grabación | Paciente | Lectura | Pendiente | Sin transacción; interfaz | Pendiente |
| B | Pendiente grabación | Médico | Finalización | Pendiente | Sin transacción; interfaz | Pendiente |

Añadir reserva, asistencia y otras acciones visibles como interfaz cuando corresponda; añadir cualquier transacción adicional real. Incorporar contrato real desde la auditoría. No inventar tiempos ni hashes ni simular continuidad entre A y B. Sanear códigos y cuentas ajenas y generar el manifiesto definitivo después de editar.

## Preparación del 24 de septiembre de 2026

- Comprobación de lectura a las 20:46 UTC: Testnet, autoridad existente y firmante coincidente; relayer con 9979.4768892 XLM de prueba. Colas: 3 autorizaciones confirmadas, 6 reservas consumidas y 24 operaciones confirmadas; ningún bloqueo de autoridad. Worker todavía detenido; repetir antes de grabar.
- #131, commit 6479ee0: CI y Vercel aprobados; aprobación visual del usuario pendiente. Preview correcto abierto. No fusionada.
- #132, commit 8c9891a: corrige la afirmación de verificación después de una actualización fallida. Regresión reproducida antes del arreglo y aprobada después; 645 pruebas de aplicación, TypeScript y build aprobados. CI/Vercel e integración pendientes. Estos resultados no acreditan una versión integrada con #131.
- Foco nativo del documento en Chrome/Edge pendiente: sólo está conectado el navegador interno.
- Respaldo local de 32 archivos pendientes con manifiesto SHA256: .trustleaf-local/d4-close-backup-20260924-174633/. No se incorporaron documentos ajenos en #132.
- No se crearon consultas ni transacciones. El complemento continúa pendiente y separado del video original de #12.

## Publicación gradual — 24 de septiembre

Aprobación visual del usuario recibida. #131 fusionada como 1a9f7787c736cffa4b919f15d735fa8e26cc5525; Vercel aprobado. Dominio canónico comprobado en navegador: bloque waitlist claro y cero enlaces href="#".

#132 actualizada sin conflictos sobre ese main: candidata 7b4f399. Validación nueva: 629 pruebas de aplicación (60 archivos), 45 privadas, 11 contractuales, TypeScript y build. La diferencia respecto de 645 procede de las pruebas de enlaces sustituidas en #131. CI y fusión de #132 pendientes en este momento; no confundir con la candidata ya publicada.

#131 y #132 fusionadas. Main definitivo de esta integración: 9d0e5124af7d2b4fe56d25c119cb7da59056c3ed. Árbol idéntico al candidato probado: 433ef576c1dbfbdb1e6270bb901839089aac340a. CI/Vercel de ambas PR aprobados antes del merge. Comprobación del despliegue final en curso; worker detenido y foco nativo pendiente. Sin consultas ni transacciones nuevas.

Despliegue final 9d0e512: Vercel SUCCESS (8r1QqaJKZc7nrkpGNJH4ycVjnqtc), CI typecheck + build aprobado. Dominio principal recargado en navegador. Lectura autenticada posterior y foco nativo siguen pendientes; worker detenido.

24-09-2026 21:52 UTC: worker main Testnet iniciado por autorización del usuario, PID 46328. Proceso activo, bloqueo de archivo coincidente y un bloqueo de autoridad en DB. Colas sin pendientes: 3 autorizaciones confirmadas, 6 reservas consumidas, 24 operaciones confirmadas. Log de errores vacío. Ninguna consulta ni transacción creada durante preparación. Revalidar si se reinicia/suspende el equipo.
