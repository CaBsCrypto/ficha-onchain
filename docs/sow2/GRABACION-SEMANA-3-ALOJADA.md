# TrustLeaf · Semana 3 en el dominio principal

Las ocho escenas se graban desde cero con la pareja sintética aprobada, en dos perfiles de Brave. La captura usa FFmpeg sin audio. [Portal del paciente](https://www.trustleaf.org/patient?tab=historial&lang=en) · [Portal del médico](https://www.trustleaf.org/doctor?tab=historial&lang=en)

## Publicación y preparación privada

1. Publica el PR mediante `main` protegido. Mantén el ensayo desactivado en el preview. Coteja el commit de producción, el proyecto `trustleaf-demo` y el alias canónico `www.trustleaf.org`. Guarda el despliegue anterior para reversión.
2. Configura producción con Stellar Testnet, entorno interno `test`, el Neon aislado autorizado y `TRUSTLEAF_PRIVATE_WRITES_ENABLED=false`. El patrocinio de la demo necesita `TRUSTLEAF_SPONSORSHIP_ENABLED=true`, las rutas `/api/private-clinical-operations,/api/private-operations` y los topes autorizados. Conserva cualquier otra ruta ya aprobada. Las cotizaciones usan topes en stroops. Coteja relayer, saldo y cupo diario antes de abrir el ensayo. El keyring clínico y la clave de recetas permanecen en el servidor.
3. Usa un archivo privado Windows con `TRUSTLEAF_HOSTED_CAPTURE_OPERATOR=true`, el host/DSN exactos de Neon, entorno `test`, la app Privy, los contratos fijados, el correo del paciente de prueba y la dirección pública del relayer. Las dos variables específicas del preparador son `TRUSTLEAF_HOSTED_CAPTURE_PATIENT_EMAIL` y `TRUSTLEAF_HOSTED_CAPTURE_RELAYER`. Conserva la clave del firmante de atestación en su almacén Windows. Usa configuración sin secretos de firma para cotizar y leer recibos.
4. Ejecuta la migración limitada en el Neon aislado con `node scripts/hosted-capture.mjs --env-file $operator migrate`. Verifica `status` sin fase activa. Habilita `TRUSTLEAF_HOSTED_CAPTURE_ENABLED=true` solo en producción. Comprueba de nuevo el SHA en el dominio y los estados existentes de la demo. El interruptor de escrituras generales sigue en `false`.
5. Entra en ambos perfiles y verifica el vínculo de cada wallet. El médico necesita perfil activo alojado y autorización contractual vigente. El preparador en modo `preflight` verifica el paciente sin ficha ni intentos, cuenta Testnet y autorización médica. Si falta fondeo o perfil, resuelve ese paso fuera de cámara. Usa la nota sintética y el PDF de 964 bytes fijados por el PR. El nombre del PDF en evidencias debe ser `synthetic-clinical-demo.pdf`.
6. Haz una prueba de cinco segundos en cada perfil y deja visible un desplazamiento corto. Usa el ayudante FFmpeg por ventana. Reproduce cada prueba y exige una pista de video y cero de audio.

## Alcances y secuencia

Las reservas ordinarias usan la agenda semanal y el interruptor de servidor `TRUSTLEAF_REGULAR_APPOINTMENTS_ENABLED=true` en Production. Antes de activarlo en `trustleaf-demo`, aplica `node scripts/hosted-capture.mjs --env-file $operator migrate-appointments` al Neon aislado. Conserva `TRUSTLEAF_PRIVATE_WRITES_ENABLED=false`. La asistencia habilita `Iniciar ahora` (`Start now`) para el médico asignado. Una cita ordinaria registra su estado en Neon. Para la toma 06 se usa la franja excepcional y las fases de atestación y emisión que se describen abajo.

### Continuación con la ficha de Semana 2

Configura `TRUSTLEAF_REGULAR_CLINICAL_ENABLED=true` sólo en Production de `trustleaf-demo`, con el patrocinio clínico y el Neon Testnet del paso 2. El paciente reserva una cita nueva y confirma asistencia. Después de `Start now`, abre `Manage record access`, verifica el médico y la fecha de la consulta, elige lectura y agregado y firma en Privy. Coteja el recibo y los estados verificados. El médico abre la ficha existente y agrega la nota. Verifica su recibo y la nota visible desde el portal del paciente.

En PowerShell 7 con Node 22, `$operator` es el archivo privado de configuración y `$evidence` el directorio privado de la grabación. Ambos son rutas absolutas. Ejecuta desde la raíz del clon con el SHA publicado.

```powershell
$private = @('--env-file', $operator, '--artifacts-dir', $evidence)
node scripts/demo/preparar-captura-alojada.mjs @private preflight
node scripts/demo/preparar-captura-alojada.mjs @private create
node scripts/hosted-capture.mjs --env-file $operator stage $phase $manifest $sha256
node scripts/hosted-capture.mjs --env-file $operator activate $phase $sha256
```

- **01–02 · `create`.** Activa la creación cuando esté lista la captura. Muestra ficha vacía y revisión. Pulsa `q` antes de la confirmación Privy. Graba ficha creada y recibo confirmado.
- **03–04 · `grant-note`.** Genera el manifiesto con el preparador, revisa y activa la huella. Paciente concede lectura y agregado. Cabs graba la primera nota con el texto exacto del alcance.
- **05 · `pdf`.** Genera y registra la huella en estado preparado mediante `stage`. Verifica esa huella en el panel administrativo del dominio y activa la misma huella. Cabs adjunta el PDF. El paciente muestra el resultado y verifica los bytes descargados. Guarda una copia exacta del manifiesto aprobado con el nombre `digital-cabs-pdf-scope.private.json`. Anota su huella en `TRUSTLEAF_DEMO_PDF_SCOPE_SHA256` y el ID médico verificado en `TRUSTLEAF_DEMO_DOCTOR_ID`. [Verificación administrativa](https://www.trustleaf.org/admin/hosted-capture)
- **06 · `appointment`, `attest`, `issuance`.** Elige la primera franja libre de hoy entre 15 y 25 minutos por delante, en hora de Chile. Usa la franja excepcional presencial verificada, hasta las 23:30. Registra y verifica la huella en el panel admin antes de activarla. En el portal, paciente reserva y confirma asistencia. Cabs inicia. Prepara la emisión y cotiza usando la misma reserva. Revisa operación, red, importe y vencimiento para aprobar antes de transmitir. Registra y activa la huella revisada como `attest`. En Windows, ejecuta una vez, coteja recibo `SUCCESS`, ledger y cola `confirmed`, y activa `issuance` con la misma huella. Luego el paciente firma el consentimiento y Cabs la emisión. Graba `Registered` y comprueba su recibo.
- **07–08 · `close`.** Tras confirmar emisión y vencer el alcance PDF, genera el cierre. Registra la huella, verifícala en el panel admin y activa esa misma huella. Cabs corrige con el texto original y vincula la receta. Muestra las dos versiones y su autoría desde el paciente. Luego el paciente retira lectura y agregado. Comprueba el recibo y ambos permisos apagados. Cabs intenta volver a abrir la ficha y recibe acceso denegado con autorización médica vigente.

```powershell
node scripts/demo/preparar-cita-digital-cabs.mjs @private --single-slot $fecha $hora
node scripts/demo/preparar-emision-digital-cabs.mjs @private --preview $appointmentSha
node scripts/run-private-rx-attestation.mjs @private --quote-only $previewSha
node scripts/demo/preparar-emision-digital-cabs.mjs @private --review $previewSha $quoteSha
node scripts/run-private-rx-attestation.mjs @private --once $issuanceSha
node scripts/run-private-rx-attestation.mjs @private --reconcile-read $issuanceSha
# Si un recibo terminal ya existe pero falta liquidarlo, usa el mismo intento.
node scripts/run-private-rx-attestation.mjs @private --settle-receipt $issuanceSha
node scripts/hosted-capture.mjs --env-file $operator close $closeSha
```

El modo `--once` necesita el alias seguro Windows y la configuración del patrocinador para `/api/prescription-bookings`. Los modos web y operador comparten los topes autorizados. Si vence una cotización o un intento queda incierto, consulta el mismo UUID y hash antes de continuar. Corta FFmpeg con `q` antes de introducir cualquier código o abrir la confirmación de Privy. Reanuda en el resultado.

## Exportación

Usa las tomas nuevas de este ensayo. Mantén los nombres y capítulos del montador. Corta las esperas y deja legibles el resultado, las versiones y los permisos. Las tomas 01–05 se entregan al montador como archivos completos. Las 06–08 admiten fragmentos consecutivos desde `-01`.

```powershell
python scripts/demo/montar-base-muda.py --artifacts-dir $evidence --final --cpu --max-seconds 180
$video = Join-Path $evidence 'TrustLeaf-SOW2-Semana3-Completa-Muda-EN.mp4'
ffprobe -v error -show_streams -show_chapters -show_format -of json $video
ffmpeg -v error -xerror -i $video -map 0:v:0 -f null -
Get-FileHash -Algorithm SHA256 -LiteralPath $video
```

Reproduce el MP4, verifica los ocho capítulos en inglés, una pista de video y cero de audio, y guarda la huella, SHA del despliegue, build y registro privado de recibos.
