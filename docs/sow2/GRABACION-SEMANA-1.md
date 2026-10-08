# Semana 1 · Recorrido para grabar

**Duración: 3–4 minutos.** El recorrido principal tiene cuatro bloques. Mostrar la página local y los seis pasos ya ejecutados; los comandos y el detalle técnico quedan como referencia opcional al final.

Se graba una revisión de evidencia existente, sin operaciones nuevas. La preparación del **7 de octubre a las 22:43 de Chile** fue de sólo lectura. El visor conserva las fechas y hashes de la ejecución que presenta: no es una consulta en vivo.

## Recorrido principal · cuatro bloques

Abrir el [informe visual local](http://127.0.0.1:3014/), ocultar notificaciones y dejar visibles sus cuatro bloques principales. Nunca abrir `.env.local`, journals ni `.trustleaf-local`. No ejecutar `--run`, `--deploy` ni `--restore` para este video.

### 1. Qué entrega la semana 1 · 0:00–0:40

Mostrar el bloque «Qué entregamos» y el enlace al contrato clínico.

> “En la primera semana del SOW 2 entregamos un contrato para una historia clínica privada con permisos del paciente y cambios verificables. Usa el registro médico existente y conserva las recetas del SOW 1. Hoy revisamos una ejecución ya completada en Testnet, con datos sintéticos.”

### 2. Los seis pasos · 0:40–2:00

Mostrar el recorrido y señalar cada paso, sin abrir todos sus detalles ni narrar hashes.

1. El paciente crea su historial.
2. El paciente concede al médico permisos de lectura y agregado.
3. El médico agrega un PDF.
4. El médico lo corrige, conservando la versión anterior.
5. El médico agrega una imagen.
6. El paciente retira los permisos.

> “El paciente crea su historial y decide qué puede hacer el médico. El médico agrega un PDF, lo corrige sin borrar la versión anterior y agrega una imagen. Finalmente, el paciente revoca los permisos. Leer y agregar son permisos independientes. Cada uno de estos seis pasos tiene un recibo confirmado que se puede revisar en Stellar Expert. Estamos mostrando esos recibos existentes: esta grabación no vuelve a firmar las operaciones.”

Dejar unos segundos para reconocer los seis pasos. Abrir un recibo sólo si ayuda a mostrar dónde se verifica; la auditoría completa está en la referencia opcional.

### 3. Dónde se guarda cada cosa · 2:00–2:50

Mostrar el bloque «Dónde quedan los archivos» después del recorrido.

> “Los PDF y las imágenes se guardan cifrados en Neon, fuera de la blockchain. Stellar guarda los permisos y los comprobantes que permiten verificar la integridad de las versiones. El archivo se entrega después de comprobar el acceso autorizado. Así podemos revisar quién tenía permiso y comprobar el archivo sin publicar el examen en Stellar.”

### 4. Resultados, tres contratos y límites · 2:50–3:50

Mostrar los resultados, las tres tarjetas de contratos y cerrar con los pendientes visibles.

> “Se recuperaron tres versiones cifradas y se comprobó su integridad. La ejecución presentada también demostró que el médico pierde acceso después de revocar. La comprobación de preparación del 7 de octubre a las 22:43 confirmó el permiso retirado y la recuperación del paciente; las 14 pruebas clínicas pasaron y no había intentos pendientes.
>
> Con esta entrega, el flujo de TrustLeaf cuenta con tres contratos: registro médico, recetas e historia clínica. Los dos primeros vienen del SOW 1; el tercero es nuevo y utiliza el registro médico. Vincular las recetas a la ficha corresponde a las semanas siguientes.
>
> Esta es una demostración de la base técnica. El portal clínico y su integración con Privy corresponden a las semanas siguientes. La autorización de este médico ya venció, por lo que no permite escrituras nuevas. La restauración real de estado archivado sigue pendiente.”

El mapa definitivo usará los tiempos del video final. No hace falta narrar la referencia siguiente para completar el recorrido.

## Referencia opcional · preparación y evidencia técnica

El video presenta la ejecución nueva **`ed9cf324-b9f1-400c-aae8-3323a66407ad`**, realizada el 7 de octubre en Testnet. Sus seis operaciones clínicas ya están confirmadas; no se vuelven a firmar mientras se graba la verificación. La primera prueba **`f1a575bc-0146-47e1-a192-f259876f3b82`** se conserva por separado.

### Comprobación previa del 7 de octubre

La lectura de las 22:43 de Chile confirmó los tres contratos, recuperó tres versiones cifradas desde Neon dev, auditó seis recibos y encontró cero intentos pendientes. Las 14 pruebas clínicas se ejecutaron nuevamente y pasaron; CI/Vercel del commit `63600b6` estaban aprobados. Se inspeccionaron 16 entradas del ledger sin ausencias, sin restauración ni transacciones nuevas.

El [registro de preparación](../evidence/sow2-week1-pre-recording-2026-10-07/README.md) conserva esta comprobación separada. El visor mantiene la instantánea original con sus fechas y hashes. El acceso médico anterior y su rechazo tras revocar se demostraron en la ejecución original; la lectura actual comprobó nuevamente el permiso retirado y la recuperación del paciente. La autorización médica ya venció: podemos grabar la revisión de los recibos existentes, pero una ejecución nueva requiere preparación y autorización vigente.

### Preparación y comandos

Estos comandos son referencia para el entorno técnico ya configurado; no forman parte de la narración principal.

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

### Recorrido técnico y auditoría de recibos

| Tramo | Qué mostrar | Qué explicar |
| --- | --- | --- |
| Objetivo y versión | [Informe de entrega](INFORME-SEMANA-1.md), commit de referencia y PR #135 | Base técnica de semana 1, sin nuevo portal clínico. Main permanece intacto. |
| Tres contratos | Tarjetas de registro médico, recetas e historia clínica | Un único contrato clínico nuevo. Los dos existentes se consultaron, sin recetas nuevas ni cambios de contrato. |
| Pruebas aisladas | Salida de las 14 pruebas clínicas y registro de validación | Las 14 están incluidas en las 25 contractuales; las pruebas no son transacciones. Aplicación, privadas, TypeScript y build tienen sus propios resultados. |
| Ejecución nueva | Tabla de seis pasos y sus actores | Paciente crea y concede; médico agrega y corrige; paciente revoca. Lectura y agregado son permisos independientes. |
| Paso 5: imagen | Enlace «Ver almacenamiento y límites» y bloque celeste de archivos | Neon aloja los archivos cifrados; Stellar registra permisos y comprobantes. PDF, PNG y JPEG tienen un límite de 3 MB originales. El procesamiento de esta prueba se ejecuta con herramientas locales. |
| Recibos reales | Enlaces del recorrido a Stellar Expert | Se verificaron método, contrato, firmante, argumentos, sobre y resultado. Los hashes corresponden a esta ejecución. |
| Privacidad y persistencia | Resultado de lectura posterior y comprobaciones | Tres versiones cifradas recuperadas; integridad correcta; médico rechazado después de revocar; cero intentos pendientes en esta ejecución. |
| Evidencia separada | Primera prueba, despliegue y Friendbot | Dos ejecuciones clínicas distintas. La financiación nueva es una operación adicional; los dos recibos de despliegue son anteriores. |
| Límites | Pendientes del informe | Sin restauración real acreditada, certificación de seguridad ni veracidad clínica. Pantallas y Privy corresponden a las semanas siguientes. |

El registro de receta existente #2 se consultó como **Registrada y vencida**, no como activa. No se abre contenido privado de recetas ni se modifica su estado.

En el paso 5 puedes narrar: «La imagen se guarda cifrada en Neon. Stellar registra quién la agregó, sus permisos y el comprobante de integridad. El archivo sólo se entrega tras comprobar el acceso autorizado, y el límite es de 3 MB».

El límite es **3.000.000 bytes por archivo original**, antes del cifrado. La clave de servicio está fuera de Neon, protegida localmente con DPAPI en esta demostración. La carga desde el portal y la compresión automática siguen pendientes de una etapa posterior; no se muestran como funciones terminadas.

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

### Narración técnica ampliada

Esta versión se conserva para consultas o una grabación técnica más larga; no se suma al recorrido de 3–4 minutos.

“¿Cómo comprobamos que el paciente decide quién puede leer y agregar a su historial, sin publicar un examen? Esta es la base técnica de TrustLeaf que entregamos en la primera semana del SOW 2.

Tenemos tres contratos: registro médico, recetas e historia clínica. El contrato clínico es nuevo; reutilizamos los otros dos. En esta ejecución técnica, un paciente sintético creó su historial y concedió permisos al médico. El médico agregó un PDF, lo corrigió conservando la versión anterior y agregó una imagen. Después el paciente retiró los permisos.

Aquí están los seis recibos de esa ejecución nueva. La financiación por Friendbot está separada. Las autorizaciones y comprobantes de versiones quedan en Stellar; los archivos permanecen cifrados en Neon. Leerlos y comprobarlos no crea otra transacción.

Otro proceso recuperó tres versiones, comprobó su integridad y rechazó el acceso médico después de revocar. Las pruebas aisladas revisan firmas, permisos, versiones y errores; no se presentan como una auditoría externa.

La página conserva la fecha de cada comprobación: no es una consulta en vivo. La restauración real de estado archivado sigue pendiente. Las pantallas clínicas y su integración con Privy son trabajo de las semanas siguientes. Estos enlaces permiten revisar qué se cumplió y qué falta.”

Aperturas alternativas: “Una ficha privada también puede tener evidencia verificable”; “¿Qué guarda Stellar si el examen permanece privado?”; “Seis recibos y dos permisos: la base clínica de semana 1”.

### Al terminar

Registrar los tiempos definitivos de cada recibo, sanear códigos y cuentas ajenas y contrastar todas las afirmaciones con el video final. La página por sí sola no sustituye el CI del commit final, la revisión de PR ni la aceptación del revisor.

No iniciar otra ejecución para eludir un intento incierto. La recuperación usa los intentos y sobres persistidos; si sólo existe un intento `prepared` sin firma conservada, detenerse y reconciliar manualmente. No se promete reanudación automática de todos los estados.
