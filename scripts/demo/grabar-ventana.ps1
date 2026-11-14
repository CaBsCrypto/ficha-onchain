#Requires -Version 7.0
[CmdletBinding(DefaultParameterSetName = 'Grabar')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Listar')]
    [switch]$Listar,

    [Parameter(Mandatory, ParameterSetName = 'Grabar')]
    [ValidateScript({ $_ -gt 0 })]
    [long]$Ventana,

    [Parameter(Mandatory, ParameterSetName = 'Grabar')]
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')]
    [string]$Nombre,

    [Parameter(Mandatory, ParameterSetName = 'Grabar')]
    [string]$ArtifactsDir,

    [Parameter(ParameterSetName = 'Grabar')]
    [string]$FfmpegPath,

    [Parameter(ParameterSetName = 'Grabar')]
    [ValidateRange(1, 3600)]
    [int]$Segundos,

    [Parameter(ParameterSetName = 'Grabar')]
    [switch]$CPU
)

$ErrorActionPreference = 'Stop'

if (-not ('TrustLeafCapture.Windows' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace TrustLeafCapture {
    public static class Windows {
        private delegate bool Callback(IntPtr handle, IntPtr state);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(Callback callback, IntPtr state);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr handle);

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr handle);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr handle, StringBuilder title, int capacity);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);

        public static IntPtr[] List() {
            var windows = new List<IntPtr>();
            EnumWindows(delegate(IntPtr handle, IntPtr state) {
                windows.Add(handle);
                return true;
            }, IntPtr.Zero);
            return windows.ToArray();
        }

        public static string Title(IntPtr handle) {
            var title = new StringBuilder(1024);
            GetWindowText(handle, title, title.Capacity);
            return title.ToString();
        }

        public static uint Owner(IntPtr handle) {
            uint processId;
            GetWindowThreadProcessId(handle, out processId);
            return processId;
        }
    }
}
'@
}

function Get-TrustLeafWindow([IntPtr]$Handle) {
    if (-not [TrustLeafCapture.Windows]::IsWindowVisible($Handle) -or
        [TrustLeafCapture.Windows]::IsIconic($Handle)) { return }

    $title = [TrustLeafCapture.Windows]::Title($Handle)
    if ($title -notmatch '^TrustLeaf\b') { return }

    $ownerId = [TrustLeafCapture.Windows]::Owner($Handle)
    if ($ownerId -eq 0) { return }
    $browser = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
    if ($null -eq $browser -or $browser.ProcessName -notin 'brave', 'chrome', 'msedge') { return }

    [pscustomobject]@{
        Ventana  = $Handle.ToInt64()
        Programa = $browser.ProcessName
        Titulo   = $title
    }
}

if ($Listar) {
    foreach ($handle in [TrustLeafCapture.Windows]::List()) { Get-TrustLeafWindow $handle }
    return
}

if ($Nombre -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') {
    throw 'Elige otro nombre para la toma.'
}

$target = Get-TrustLeafWindow ([IntPtr]$Ventana)
if ($null -eq $target) {
    throw 'Abre TrustLeaf en Brave, Chrome o Edge, deja la ventana visible y ejecuta el script con -Listar.'
}

$artifacts = Get-Item -LiteralPath $ArtifactsDir
if (-not $artifacts.PSIsContainer -or $artifacts.PSProvider.Name -ne 'FileSystem') {
    throw 'ArtifactsDir debe ser un directorio de archivos existente.'
}

if ($FfmpegPath) {
    $executable = Get-Item -LiteralPath $FfmpegPath
    if ($executable.PSIsContainer -or $executable.PSProvider.Name -ne 'FileSystem' -or $executable.Extension -ne '.exe') {
        throw 'FfmpegPath debe apuntar a ffmpeg.exe.'
    }
    $ffmpeg = $executable.FullName
} else {
    $command = Get-Command ffmpeg.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) { throw 'Instala FFmpeg en PATH o indica su ruta con -FfmpegPath.' }
    $ffmpeg = $command.Source
}

$output = Join-Path $artifacts.FullName "$Nombre.mp4"
if (Test-Path -LiteralPath $output) { throw "Ya existe $Nombre.mp4. Elige un nombre nuevo." }

$arguments = @(
    '-hide_banner', '-n', '-filter_threads', '1',
    '-f', 'gdigrab', '-framerate', '15', '-i', "hwnd=$Ventana",
    '-map', '0:v:0', '-an',
    '-vf', 'scale=w=min(1280\,iw):h=min(720\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2:flags=fast_bilinear'
)
if ($CPU) {
    $arguments += @('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-threads', '2')
} else {
    $arguments += @('-c:v', 'h264_nvenc', '-preset', 'p1', '-rc', 'constqp', '-qp', '23')
}
if ($PSBoundParameters.ContainsKey('Segundos')) { $arguments += @('-t', $Segundos.ToString()) }
$arguments += @('-pix_fmt', 'yuv420p', '-movflags', '+faststart', $output)

Write-Host "Grabando $($target.Titulo). Mantén TrustLeaf en esa ventana. Pulsa q en esta consola para detener."
& $ffmpeg @arguments
if ($LASTEXITCODE -ne 0) { throw "FFmpeg se detuvo con error $LASTEXITCODE." }
Write-Output $output
