# Semana 1 · Recorrido para grabar

El video presenta la ejecución nueva **`ed9cf324-b9f1-400c-aae8-3323a66407ad`**, realizada el 7 de octubre en Testnet. Sus seis operaciones clínicas ya están confirmadas; no se vuelven a firmar mientras se graba la verificación. La primera prueba `f1a575bc-0146-47e1-a192-f259876f3b82` se conserva por separado. Duración sugerida: 4–6 minutos; el mapa definitivo usará los tiempos del video final.

## Preparación

Abrir la página local, una terminal en la raíz del repositorio y Stellar Expert. Ocultar notificaciones y otros terminales. Nunca abrir `.env.local`, journals ni `.trustleaf-local`. No ejecutar `--run`, `--deploy` ni `--restore` para preparar este video.

Para comprobar otra vez los registros de esta ejecución:

```powershell
node scripts/check-clinical-recording.mjs --run-id ed9cf324-b9f1-400c-aae8-3323a66407ad
```

El comando desactiva las escrituras clínicas en los procesos hijos, revisa los tres contratos, ejecuta las pruebas clínicas y comprueba lectura, recibos y estado disponible. No crea transacciones; actualiza los informes públicos locales. Requiere el entorno técnico ya configurado. Si falla, detener la afirmación de aprobación y revisar ese paso.

Después se genera el informe visual y se inicia el visor:

```powershell
node scripts/build-clinical-report.mjs --run-id ed9cf324-b9f1-400c-aae8-3323a66407ad
node scripts/serve-clinical-report.mjs --run-id ed9cf324-b9f1-400c-aae8-3323a66407ad
```

Abrir el [informe visual local](http://127.0.0.1:3014/). Es una página estática, sin claves, documentos médicos ni botones de firma. Recargarla no consulta Stellar. Si se regenera el archivo, reiniciar el servidor para mostrar su versión nueva.

La autorización del médico usada en la ejecución vencía el **7 de octubre a las 02:10:40 de Chile (05:10:40 UTC)**. El recorrido terminó antes. Una auditoría posterior puede mostrar autorización vencida: no invalida los recibos anteriores ni habilita nuevas firmas. Otra ejecución exigiría preparación explícita y comprobación de margen antes de firmar.

## Recorrido técnico

| Tramo | Qué mostrar | Qué explicar |
| --- | --- | --- |
| Objetivo y versión | [Informe de entrega](INFORME-SEMANA-1.md), commit de referencia y PR #135 | Base técnica de semana 1, sin nuevo portal clínico. Main permanece intacto. |
| Tres contratos | Tarjetas de registro médico, recetas e historia clínica | Un único contrato clínico nuevo. Los dos existentes se consultaron, sin recetas nuevas ni cambios de contrato. |
| Pruebas aisladas | Salida de las 14 pruebas clínicas y registro de validación | Las 14 están incluidas en las 25 contractuales; las pruebas no son transacciones. Aplicación, privadas, TypeScript y build tienen sus propios resultados. |
| Ejecución nueva | Tabla de seis pasos y sus actores | Paciente crea y concede; médico agrega y corrige; paciente revoca. Lectura y agregado son permisos independientes. |
| Recibos reales | Enlaces del recorrido a Stellar Expert | Se verificaron método, contrato, firmante, argumentos, sobre y resultado. Los hashes corresponden a esta ejecución. |
| Privacidad y persistencia | Resultado de lectura posterior y comprobaciones | Tres versiones cifradas recuperadas; integridad correcta; médico rechazado después de revocar; cero intentos pendientes en esta ejecución. |
| Evidencia separada | Primera prueba, despliegue y Friendbot | Dos ejecuciones clínicas distintas. La financiación nueva es una operación adicional; los dos recibos de despliegue son anteriores. |
| Límites | Pendientes del informe | Sin restauración real acreditada, certificación de seguridad ni veracidad clínica. Pantallas y Privy corresponden a las semanas siguientes. |

El registro de receta existente #2 se consultó como **Registrada y vencida**, no como activa. No se abre contenido privado de recetas ni se modifica su estado.

Si conviene mostrar sólo la prueba del contrato:

```powershell
cargo test --locked --manifest-path contracts/Cargo.toml -p clinical-history-private
```

Para mostrar la lectura posterior individualmente:

```powershell
node --env-file=.env.local scripts/validate-clinical-testnet.mjs --readback --run-id ed9cf324-b9f1-400c-aae8-3323a66407ad
```

Para inspeccionar entradas disponibles, sin restaurar:

```powershell
node --env-file=.env.local scripts/restore-clinical-testnet.mjs --inspect --run-id ed9cf324-b9f1-400c-aae8-3323a66407ad
```

Las entradas del ledger no son claves de cifrado. Si están presentes, la inspección no prueba restauración; si faltan, registrar el resultado y detenerse, sin ejecutar `--restore`.

## Narración breve de apertura y cierre

“¿Cómo comprobamos que el paciente decide quién puede leer y agregar a su historial, sin publicar un examen? Esta es la base técnica de TrustLeaf que entregamos en la primera semana del SOW 2.

Tenemos tres contratos: registro médico, recetas e historia clínica. El contrato clínico es nuevo; reutilizamos los otros dos. En esta ejecución técnica, un paciente sintético creó su historial y concedió permisos al médico. El médico agregó un PDF, lo corrigió conservando la versión anterior y agregó una imagen. Después el paciente retiró los permisos.

Aquí están los seis recibos de esa ejecución nueva. La financiación por Friendbot está separada. Las autorizaciones y comprobantes de versiones quedan en Stellar; los archivos permanecen cifrados en Neon. Leerlos y comprobarlos no crea otra transacción.

Otro proceso recuperó tres versiones, comprobó su integridad y rechazó el acceso médico después de revocar. Las pruebas aisladas revisan firmas, permisos, versiones y errores; no se presentan como una auditoría externa.

La página conserva la fecha de cada comprobación: no es una consulta en vivo. La restauración real de estado archivado sigue pendiente. Las pantallas clínicas y su integración con Privy son trabajo de las semanas siguientes. Estos enlaces permiten revisar qué se cumplió y qué falta.”

Aperturas alternativas: “Una ficha privada también puede tener evidencia verificable”; “¿Qué guarda Stellar si el examen permanece privado?”; “Seis recibos y dos permisos: la base clínica de semana 1”.

## Al terminar

Registrar los tiempos definitivos de cada recibo, sanear códigos y cuentas ajenas y contrastar todas las afirmaciones con el video final. La página por sí sola no sustituye el CI del commit final, la revisión de PR ni la aceptación del revisor.

No iniciar otra ejecución para eludir un intento incierto. La recuperación usa los intentos y sobres persistidos; si sólo existe un intento `prepared` sin firma conservada, detenerse y reconciliar manualmente. No se promete reanudación automática de todos los estados.
