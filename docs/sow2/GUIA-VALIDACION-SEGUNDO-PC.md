# TrustLeaf · Validación de semana 3 en otro Windows

La prueba usa las dos cuentas sintéticas existentes, la ficha ya creada y Stellar Testnet. Guarda los resultados y las grabaciones en el directorio privado de evidencias. La narración se graba después del montaje.

## 1. Recuperar el entorno y cotejar el commit

Instala Git, PowerShell 7, Node.js 22, Python 3 y FFmpeg para Windows con `gdigrab`, `ffprobe` y codificación H.264. La atestación requiere Stellar CLI y el alias de firma ya autorizado. Usa dos perfiles separados de Brave, Chrome o Edge para paciente y médico.

En el Windows de origen, el mismo usuario que preparó el paquete exporta la clave con `node .\export-transfer-key.cjs <ruta-privada-para-la-clave>`. Transfiere ese archivo por separado del paquete cifrado y sus utilidades de recuperación.

En el Windows de destino, abre PowerShell 7 en el directorio del paquete. Coteja el inventario SHA-256, verifica el cifrado y extrae a un directorio nuevo dentro de tu perfil.

```powershell
$privateRoot = Join-Path $env:LOCALAPPDATA 'TrustLeaf/SOW2-S3'
$sums = @(Get-Content -LiteralPath '.\SHA256SUMS.txt')
if (!$sums.Count) { throw 'Falta el inventario SHA-256' }
foreach ($line in $sums) {
    if ($line -notmatch '^(?<digest>[a-f0-9]{64})\s+\*?(?<name>[a-z0-9][a-z0-9_.-]*)$') {
        throw 'Entrada inválida en SHA256SUMS.txt'
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Matches.name).Hash -ne $Matches.digest) {
        throw "No coincide el SHA-256 de $($Matches.name)"
    }
}
$archive = (Resolve-Path -LiteralPath '.\TRUSTLEAF-SEMANA3-SEGUNDO-PC.aes256gcm.json').Path
$keyFile = Read-Host 'Ruta al archivo de clave recibido por separado'
node .\restore-private-transfer.cjs $archive $keyFile --verify-only
if ($LASTEXITCODE -ne 0) { throw 'La verificación del paquete falló' }
node .\restore-private-transfer.cjs $archive $keyFile --extract $privateRoot
if ($LASTEXITCODE -ne 0) { throw 'La extracción del paquete falló' }
```

Comprueba el inventario SHA-256 de `RECOVERY-MANIFEST.private.json` después de la extracción. Ajusta únicamente las rutas de máquina de `config/operational.env.local`, incluida `STELLAR_CONFIG_DIR`, para que apunten a la configuración extraída. Coteja la dirección pública del alias de autoridad con el alcance antes de usarlo. Conserva la configuración, los keyrings, los manifiestos y los recibos dentro de tu perfil. `evidence/digital-cabs-pdf-scope.private.json` debe conservar el nombre y los bytes originales.

Clona la rama y coteja el SHA con el que figura en la entrega. Si la rama avanzó, selecciona el commit entregado antes de registrar la prueba.

```powershell
git clone --single-branch --branch codex/sow2-semana-3-validacion-otro-pc https://github.com/CaBsCrypto/ficha-onchain.git
Set-Location .\ficha-onchain
$expectedSha = Read-Host 'SHA publicado para validar'
if ($expectedSha -notmatch '^[a-f0-9]{40}$') { throw 'Usa el SHA completo' }
if ((git rev-parse HEAD) -ne $expectedSha) { git switch --detach $expectedSha }
if ((git rev-parse HEAD) -ne $expectedSha) { throw 'El commit no coincide con la entrega' }

$envFile = Join-Path $privateRoot 'config/operational.env.local'
$artifacts = Join-Path $privateRoot 'evidence'
$privateArgs = @('--env-file', $envFile, '--artifacts-dir', $artifacts)
$access = @{ EnvFile = $envFile; ArtifactsDir = $artifacts }
```

## 2. Validar código, portal y captura

Ejecuta las comprobaciones desde la raíz en PowerShell 7. Registra en evidencias el SHA, las versiones de herramientas, la fecha, el código de salida y el resultado de cada comando. Pasa al siguiente si termina correctamente. El último comando ejecuta `npm run build` con la configuración necesaria y deja `.next/BUILD_ID`.

```powershell
npm ci
npx tsc --noEmit
npm test
npm run test:private
node --test scripts/lib/digital-cabs-rx-scope.test.mjs scripts/lib/private-rx-sponsorship.test.mjs
& .\scripts\demo\compilar-toma-en.ps1 -EnvFile $envFile
$buildId = (Get-Content -LiteralPath '.next/BUILD_ID' -Raw).Trim()
$portal = $access + @{ ExpectedBuildId = $buildId }
& .\scripts\demo\servir-toma-en.ps1 @portal
```

Este modo sirve el portal en `127.0.0.1:3016` con escrituras y patrocinio apagados. Abre `http://127.0.0.1:3016/patient?tab=historial&lang=en` y `http://127.0.0.1:3016/doctor?tab=historial&lang=en` en los perfiles correspondientes. Comprueba que ambos ven la interfaz en inglés, que la ficha es la del ensayo, que el médico está autorizado y que figuran los permisos y recibos de los pasos previos. Si ya hay una operación preparada, enviada o confirmada, comprueba su estado y conserva ese intento. Las cotizaciones y permisos vigentes se comprueban de nuevo en Testnet.

Para la captura, deja TrustLeaf visible en una ventana de navegador. `-Listar` identifica la ventana. En una segunda consola, usa su número real con `-Ventana`. Haz un desplazamiento corto durante la prueba para comprobar que la imagen cambia.

```powershell
& .\scripts\demo\grabar-ventana.ps1 -Listar
$windowId = [long](Read-Host 'Número de ventana de TrustLeaf')
$capture = @{ Ventana = $windowId; ArtifactsDir = $artifacts }
& .\scripts\demo\grabar-ventana.ps1 @capture -Nombre prueba-ventana -Segundos 5
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration -of json (Join-Path $artifacts 'prueba-ventana.mp4')
```

Si FFmpeg está fuera de `PATH`, añade `FfmpegPath` a `$capture` con la ruta al ejecutable y llama a `ffprobe.exe` desde su directorio. Si NVENC falla, repite con `-CPU` y otro nombre. Abre el MP4 y verifica que dura unos cinco segundos, muestra el movimiento, se lee y sólo encuadra la ventana elegida. `ffprobe` debe mostrar una pista de video y ninguna de audio. Actualiza `-Ventana` al cambiar de ventana o perfil. Durante las tomas completas omite `-Segundos` y pulsa `q` en la consola de FFmpeg para cortar antes de introducir códigos o firmar en Privy. Retoma la grabación al volver a la vista con el resultado.

## 3. Completar consulta, receta, corrección y retiro

Para cambiar de fase, detén el lanzador activo con `Ctrl+C` y ejecuta el siguiente comando de arranque. Conserva los argumentos de acceso y el mismo build. Usa las huellas SHA-256 que devuelve cada preparador y guarda la salida en evidencias.

1. Si todavía falta la consulta, prepara una franja futura disponible en hora de Chile. Revisa la pareja y el vencimiento del alcance. Arranca la fase de reserva con la huella del alcance revisado. Reserva desde el portal del paciente. Desde treinta minutos antes de la franja, registra la asistencia del paciente e inicia la consulta como médico.

   ```powershell
   $date = Read-Host 'Fecha de la franja AAAA-MM-DD'
   $slot = Read-Host 'Hora de Chile HH:mm'
   node .\scripts\demo\preparar-cita-digital-cabs.mjs @privateArgs --single-slot $date $slot
   $appointmentSha = Read-Host 'SHA-256 de la franja revisada'
   & .\scripts\demo\servir-toma-en.ps1 @portal -DigitalCabsRxPhase Appointment -DigitalCabsRxScopeSha256 $appointmentSha -DigitalCabsRxApprovedSha256 $appointmentSha
   ```

2. Cuando la solicitud de consulta esté en cola, genera la vista previa de emisión y cotiza la atestación. Revisa importe, pareja, franja, red y vencimiento. Guarda la huella del alcance de emisión sólo después de revisar la cotización.

   ```powershell
   node .\scripts\demo\preparar-emision-digital-cabs.mjs @privateArgs --preview $appointmentSha
   $previewSha = Read-Host 'SHA-256 de la vista previa'
   & .\scripts\demo\servir-toma-en.ps1 @access -RunDigitalCabsRxAttestation Quote -DigitalCabsRxScopeSha256 $previewSha
   $quoteSha = Read-Host 'SHA-256 de la cotización'
   node .\scripts\demo\preparar-emision-digital-cabs.mjs @privateArgs --review $previewSha $quoteSha
   ```

3. Con el alcance Testnet y sus límites autorizados, atestigua una vez y comprueba el recibo antes de habilitar la emisión. Si el resultado es incierto, usa `ReconcileRead` con la misma huella y la misma evidencia. Ante un vencimiento, concilia los intentos existentes antes de preparar otro alcance.

   ```powershell
   $issuanceSha = Read-Host 'SHA-256 del alcance de emisión aprobado'
   $issuance = @{ DigitalCabsRxScopeSha256 = $issuanceSha; DigitalCabsRxApprovedSha256 = $issuanceSha }
   & .\scripts\demo\servir-toma-en.ps1 @access @issuance -RunDigitalCabsRxAttestation Once
   & .\scripts\demo\servir-toma-en.ps1 @access @issuance -RunDigitalCabsRxAttestation ReconcileRead
   ```

   Coteja el `transactionHash` de la atestación, `receiptStatus` igual a `SUCCESS`, el ledger y el estado `confirmed` de la cola. Si el recibo ya confirma el hash guardado y la cola sigue pendiente, vuelve a ejecutar `Once` con el mismo alcance mientras esté vigente. Con el sobre guardado, el worker concilia ese intento. Si el alcance venció, conserva el resultado de `ReconcileRead` y resuelve el estado pendiente antes de reanudar. Cuando el recibo y la cola coincidan, detén el servidor de reserva y arranca la fase de emisión.

   ```powershell
   & .\scripts\demo\servir-toma-en.ps1 @portal @issuance -DigitalCabsRxPhase Issuance
   ```

   Avisa al usuario cuando toque firmar el consentimiento del paciente en Privy. Verifica el recibo y avísale para la firma de emisión del médico. Comprueba la receta confirmada en los portales y guarda el ID y el recibo en el directorio privado.

4. Con la receta confirmada, prepara el alcance de cierre. Tras revisar su contenido y vigencia, activa la fase de cierre. El médico corrige la nota y vincula la receta. El paciente comprueba las dos versiones, el enlace y la autoría. Después el paciente retira lectura y agregado. Verifica el recibo y graba al médico intentando volver a abrir la ficha, con la autorización médica aún vigente y el acceso rechazado. Avisa al usuario para cada firma en Privy y concilia cualquier resultado incierto antes de avanzar.

   ```powershell
   node .\scripts\demo\preparar-scope-digital-cabs-cierre.mjs @privateArgs --issuance-sha256 $issuanceSha
   $closeSha = Read-Host 'SHA-256 del alcance de cierre revisado'
   & .\scripts\demo\servir-toma-en.ps1 @portal -DigitalCabsClose -DigitalCabsScopeSha256 $closeSha
   ```

## 4. Exportar y cerrar la validación

La base recuperada contiene las tomas 01 a 05. Guarda las nuevas tomas con estos nombres en `evidence`.

| Toma | Archivo | Evidencia en pantalla |
| --- | --- | --- |
| 06 | `TrustLeaf-06-Receta-EN-limpia.mp4` | Consulta, consentimiento, emisión y receta confirmada |
| 07 | `TrustLeaf-07-Correccion-Nota-EN-limpia.mp4` | Nota original, corrección y vínculo con la receta |
| 08 | `TrustLeaf-08-Retiro-Acceso-Denegado-EN-limpia.mp4` | Retiro de permisos y acceso rechazado al médico |

Al cortar una toma para firmar, usa fragmentos numerados desde `-01` antes de `.mp4`, por ejemplo `TrustLeaf-06-Receta-EN-limpia-01.mp4` y `TrustLeaf-06-Receta-EN-limpia-02.mp4`. Usa el archivo completo o sus fragmentos para cada toma. El montaje agrupa los fragmentos en el capítulo que corresponde.

```powershell
python .\scripts\demo\montar-base-muda.py --artifacts-dir $artifacts --final
ffprobe -v error -show_streams -show_chapters -of json (Join-Path $artifacts 'TrustLeaf-SOW2-Semana3-Completa-Muda-EN.mp4')
```

Si hace falta, pasa `--ffmpeg-path` con la ruta al ejecutable y `--cpu` para codificar con CPU. Revisa las transiciones, ocho capítulos, idioma y ausencia de pista de audio. La validación termina al cotejar el SHA en el segundo equipo, aprobar las comprobaciones y el build, verificar la prueba de captura y todos los recibos, y abrir el MP4 completo para narración. Registra el SHA-256 del MP4 junto con los resultados.
