#Requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$EnvFile)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).ProviderPath
$configPath = (Resolve-Path -LiteralPath $EnvFile).ProviderPath
$publicId = & node --input-type=module -e 'import {readFileSync} from "node:fs"; import {parseEnv} from "node:util"; const env = parseEnv(readFileSync(process.argv[1], "utf8")); if (env.TRUSTLEAF_ENV !== "local" || env.NEXT_PUBLIC_STELLAR_NETWORK !== "testnet" || !/^[a-z0-9]+$/.test(env.NEXT_PUBLIC_PRIVY_APP_ID ?? "") || env.NEXT_PUBLIC_PRIVY_APP_ID !== env.PRIVY_APP_ID || Object.hasOwn(env, "VERCEL") || Object.hasOwn(env, "VERCEL_ENV")) process.exit(1); console.log(env.NEXT_PUBLIC_PRIVY_APP_ID);' -- $configPath
if ($LASTEXITCODE -ne 0 -or !$publicId) { throw 'Se requiere la configuración local de TrustLeaf Testnet.' }

$buildSettings = @{
    NEXT_PUBLIC_PRIVY_APP_ID = $publicId
    NEXT_PUBLIC_STELLAR_NETWORK = 'testnet'
    TRUSTLEAF_PRIVATE_WRITES_ENABLED = 'false'
    TRUSTLEAF_SPONSORSHIP_ENABLED = 'false'
}
$previous = @{}
Push-Location -LiteralPath $repo
try {
    foreach ($name in $buildSettings.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $buildSettings[$name], 'Process')
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $build = (Get-Content -LiteralPath '.next/BUILD_ID' -Raw).Trim()
    Write-Output "BUILD_VERIFIED $build"
} finally {
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
    Pop-Location
}
