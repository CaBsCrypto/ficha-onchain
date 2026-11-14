#Requires -Version 7.0
[CmdletBinding(DefaultParameterSetName = 'Serve')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Inspect')]
    [switch]$InspectListener,

    [string]$EnvFile,

    [string]$ArtifactsDir,

    [Parameter(Mandatory, ParameterSetName = 'Serve')]
    [Parameter(Mandatory, ParameterSetName = 'ServeAdmin')]
    [Parameter(Mandatory, ParameterSetName = 'ServeDigitalCabs')]
    [Parameter(Mandatory, ParameterSetName = 'ServeDigitalCabsRx')]
    [ValidatePattern('^[A-Za-z0-9_-]+$')]
    [string]$ExpectedBuildId,

    [Parameter(ParameterSetName = 'Serve')]
    [switch]$EnableDigitalCreateOnce,

    [Parameter(Mandatory, ParameterSetName = 'ServeAdmin')]
    [switch]$ServeInitialDoctorAdmin,

    [Parameter(Mandatory, ParameterSetName = 'ServeDigitalCabs')]
    [ValidatePattern('^[0-9a-f]{64}$')]
    [string]$DigitalCabsScopeSha256,

    [Parameter(ParameterSetName = 'ServeDigitalCabs')]
    [switch]$DigitalCabsPdf,

    [Parameter(ParameterSetName = 'ServeDigitalCabs')]
    [switch]$DigitalCabsClose,

    [Parameter(Mandatory, ParameterSetName = 'ServeDigitalCabsRx')]
    [ValidateSet('Appointment', 'Issuance')]
    [string]$DigitalCabsRxPhase,

    [Parameter(Mandatory, ParameterSetName = 'ServeDigitalCabsRx')]
    [Parameter(Mandatory, ParameterSetName = 'RxWorker')]
    [ValidatePattern('^[0-9a-f]{64}$')]
    [string]$DigitalCabsRxScopeSha256,

    [Parameter(Mandatory, ParameterSetName = 'ServeDigitalCabsRx')]
    [Parameter(ParameterSetName = 'RxWorker')]
    [ValidatePattern('^[0-9a-f]{64}$')]
    [string]$DigitalCabsRxApprovedSha256,

    [Parameter(Mandatory, ParameterSetName = 'RxWorker')]
    [ValidateSet('Quote', 'Once', 'ReconcileRead')]
    [string]$RunDigitalCabsRxAttestation,

    [Parameter(Mandatory, ParameterSetName = 'InitialWorker')]
    [ValidateSet('Once', 'Reconcile')]
    [string]$RunInitialDoctorWorker,

    [Parameter(Mandatory, ParameterSetName = 'ServeAdmin')]
    [Parameter(Mandatory, ParameterSetName = 'InitialWorker')]
    [ValidatePattern('^[0-9a-f]{64}$')]
    [string]$InitialDoctorScopeSha256
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).ProviderPath
$nextBin = Join-Path $repo 'node_modules\next\dist\bin\next'
if (!$InspectListener) {
    if (!$EnvFile -or !$ArtifactsDir) { throw 'Indica -EnvFile y -ArtifactsDir.' }
    $EnvFile = (Resolve-Path -LiteralPath $EnvFile).ProviderPath
    $ArtifactsDir = (Resolve-Path -LiteralPath $ArtifactsDir).ProviderPath
    if (!(Test-Path -LiteralPath $EnvFile -PathType Leaf) -or !(Test-Path -LiteralPath $ArtifactsDir -PathType Container)) {
        throw 'Se requiere un archivo de configuración y un directorio de evidencias.'
    }
}
$initialWorkerMode = $PSCmdlet.ParameterSetName -eq 'InitialWorker'
$rxWorkerMode = $PSCmdlet.ParameterSetName -eq 'RxWorker'
$workerName = if ($rxWorkerMode) { 'run-private-rx-attestation.mjs' } else { 'run-initial-doctor-authorization.mjs' }
$worker = Join-Path $repo ('scripts\' + $workerName)
$initialScope = if (!$InspectListener) { Join-Path $ArtifactsDir 'initial-doctor-scope.private.json' }
if ($DigitalCabsPdf -and $DigitalCabsClose) { throw 'Selecciona un solo alcance de Digital y Cabs.' }
$captureScopeName = if ($rxWorkerMode) {
    if ($RunDigitalCabsRxAttestation -eq 'Quote') { 'digital-cabs-rx-issuance-preview.private.json' }
    else { 'digital-cabs-rx-issuance.private.json' }
} elseif ($DigitalCabsRxPhase) {
    'digital-cabs-rx-' + $DigitalCabsRxPhase.ToLowerInvariant() + '.private.json'
} elseif ($DigitalCabsClose) { 'digital-cabs-close-scope.private.json' } elseif ($DigitalCabsPdf) {
    'digital-cabs-pdf-scope.private.json'
} else { 'digital-cabs-scope.private.json' }
$captureScope = if (!$InspectListener) { Join-Path $ArtifactsDir $captureScopeName }
$workerMode = $initialWorkerMode -or $rxWorkerMode
if (!$workerMode) {
    $listeners = @(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 3016)
}

if ($InspectListener) {
    if ($listeners.Count -eq 0) { Write-Output 'El puerto 3016 está libre.' }
    foreach ($listener in $listeners) {
        $owner = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $listener.OwningProcess)
        $kind = 'unverified'
        if ($owner.Name -ieq 'node.exe' -and $listener.LocalAddress -eq '127.0.0.1' -and
            $owner.CommandLine -match '(?i)\sstart\s' -and $owner.CommandLine -match '\s-p\s+3016(?:\s|$)') {
            $normalizedCommand = $owner.CommandLine.Replace('/', '\')
            if ($normalizedCommand.IndexOf($nextBin, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                $kind = 'trustleaf-clone'
            }
        }
        [pscustomobject]@{
            Address = $listener.LocalAddress
            Port = $listener.LocalPort
            ProcessId = $listener.OwningProcess
            Started = $owner.CreationDate
            ProcessName = $owner.Name
            TrustLeafRuntime = $kind
        }
    }
    return
}

if ($rxWorkerMode) {
    if (!(Test-Path -LiteralPath $worker -PathType Leaf)) { throw 'Falta el worker de receta sintética en el clon.' }
    $mode = 'rx-worker-' + $RunDigitalCabsRxAttestation.ToLowerInvariant()
} elseif ($initialWorkerMode) {
    if (!(Test-Path -LiteralPath $worker -PathType Leaf)) { throw 'Falta el worker de alta inicial en el clon.' }
    $mode = 'initial-doctor-worker-' + $RunInitialDoctorWorker.ToLowerInvariant()
} else {
    if ($listeners.Count -gt 0) { throw 'El puerto 3016 está ocupado. Usa -InspectListener para identificar el proceso.' }
    $actualBuild = (Get-Content -LiteralPath (Join-Path $repo '.next\BUILD_ID') -Raw).Trim()
    if ($actualBuild -cne $ExpectedBuildId) { throw 'El build local no coincide con el build esperado.' }
    if (!(Test-Path -LiteralPath $nextBin -PathType Leaf)) { throw 'Falta el ejecutable de Next en el clon.' }
    $mode = if ($EnableDigitalCreateOnce) { 'digital-create-once' } elseif ($ServeInitialDoctorAdmin) {
        'initial-doctor-admin'
    } elseif ($DigitalCabsRxPhase) {
        'digital-cabs-rx-' + $DigitalCabsRxPhase.ToLowerInvariant()
    } elseif ($DigitalCabsClose) {
        'digital-cabs-close'
    } elseif ($DigitalCabsPdf) {
        'digital-cabs-pdf'
    } elseif ($DigitalCabsScopeSha256) {
        'digital-cabs'
    } else { 'read-only' }
}
$scopeDigest = if ($initialWorkerMode -or $ServeInitialDoctorAdmin) {
    $expectedScope = $InitialDoctorScopeSha256.ToLowerInvariant()
    if ((Get-FileHash -LiteralPath $initialScope -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedScope) {
        throw 'El manifiesto de alta inicial no coincide con el hash esperado.'
    }
    $expectedScope
} else { '-' }

if ($DigitalCabsScopeSha256 -and
    (Get-FileHash -LiteralPath $captureScope -Algorithm SHA256).Hash.ToLowerInvariant() -cne $DigitalCabsScopeSha256) {
    throw 'El manifiesto de Digital y Cabs no coincide con el hash esperado.'
}
if ($DigitalCabsRxScopeSha256) {
    if ((Get-FileHash -LiteralPath $captureScope -Algorithm SHA256).Hash.ToLowerInvariant() -cne $DigitalCabsRxScopeSha256) {
        throw 'El manifiesto de receta no coincide con el hash esperado.'
    }
    if ($RunDigitalCabsRxAttestation -ne 'Quote' -and $DigitalCabsRxScopeSha256 -cne $DigitalCabsRxApprovedSha256) {
        throw 'El manifiesto de receta no coincide con el hash aprobado.'
    }
    if ($RunDigitalCabsRxAttestation -eq 'Quote' -and $DigitalCabsRxApprovedSha256) {
        throw 'La simulación usa únicamente el manifiesto preliminar.'
    }
}

$bootstrap = @'
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { databaseConnectionString } from './scripts/lib/database-connection.mjs';
import { PRIVATE_REGISTRY_ID } from './scripts/lib/private-registry.mjs';

const [environmentFile, nextBin, mode, initialScope, scopeDigest, worker, captureScope, captureDigest, rxApprovalDigest] = process.argv.slice(2);
const clinical = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const prescription = 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE';
const authority = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const privyApp = 'cmrix722m03d30clewd1fuffq';
const maximumOperationFee = 10_000_000n;
const windowsKeys = [
  'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'TEMP', 'TMP',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'HOMEDRIVE', 'HOMEPATH',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'LANG',
];
const applicationKeys = [
  'NEXT_PUBLIC_STELLAR_NETWORK', 'NEXT_PUBLIC_SOROBAN_RPC_URL',
  'NEXT_PUBLIC_PRIVY_APP_ID', 'PRIVY_APP_ID', 'PRIVY_APP_SECRET',
  'DATABASE_URL', 'TRUSTLEAF_DATABASE_URL', 'TRUSTLEAF_DB_HOST', 'TRUSTLEAF_ENV',
  'TRUSTLEAF_PRIVATE_PORTAL_ENABLED', 'TRUSTLEAF_CLINICAL_WEB_ENABLED',
  'DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID', 'DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY',
  'BOOKING_AUTHORITY_PUBLIC_KEY', 'PRESCRIPTION_PRIVATE_CONTRACT_ID',
  'CLINICAL_HISTORY_PRIVATE_CONTRACT_ID', 'TRUSTLEAF_CLINICAL_KEYRING',
  'TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID', 'TRUSTLEAF_DATA_KEY', 'TRUSTLEAF_RUT_PEPPER',
  'ADMIN_EMAILS', 'NEXT_PUBLIC_PASSKEY_ENABLED', 'TRUSTLEAF_DEMO_DB_HOST',
  'TRUSTLEAF_DEMO_PDF_SCOPE_SHA256', 'TRUSTLEAF_DEMO_PDF_TX_SHA256', 'TRUSTLEAF_DEMO_DOCTOR_ID',
  'TRUSTLEAF_DEMO_DOCTOR_EMAIL', 'TRUSTLEAF_DEMO_REVIEWER_EMAIL',
];
const checked = (condition, code) => { if (!condition) throw new Error(code); };
const validEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validDigest = value => typeof value === 'string' && /^(?!0{64}$)[a-f0-9]{64}$/.test(value);

async function withReadOnlyDatabase(connectionString, read) {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { default: WebSocket } = await import('ws');
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 15_000, query_timeout: 20_000 });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return await read(client);
  } finally {
    try {
      if (client) await client.query('ROLLBACK');
    } finally {
      client?.release();
      await pool.end();
    }
  }
}

async function sponsorOccupied(client, relayer) {
  const result = await client.query(`SELECT COALESCE((SELECT spent_stroops+reserved_stroops FROM sponsorship_daily_buckets
    WHERE network='testnet' AND bucket_key=$1 AND utc_day=(NOW() AT TIME ZONE 'UTC')::date),0)::text AS occupied`,
    ['sponsor:' + relayer]);
  checked(result.rows.length === 1 && /^\d+$/.test(result.rows[0].occupied), 'sponsor_balance_unverified');
  return BigInt(result.rows[0].occupied);
}

function configureSponsorship(runtime, path, sponsorDailyLimit) {
  Object.assign(runtime, {
    TRUSTLEAF_SPONSORSHIP_ENABLED: 'true',
    TRUSTLEAF_SPONSORSHIP_PATHS: path,
    TRUSTLEAF_SPONSORSHIP_SPONSOR_DAILY_LIMIT_STROOPS: String(sponsorDailyLimit),
    TRUSTLEAF_SPONSORSHIP_PATIENT_DAILY_LIMIT_STROOPS: String(maximumOperationFee),
    TRUSTLEAF_SPONSORSHIP_MAX_FEE_STROOPS: String(maximumOperationFee),
    TRUSTLEAF_SPONSORSHIP_EMERGENCY_RESERVE_STROOPS: '0',
    TRUSTLEAF_SPONSORSHIP_ENTRY_LIMIT_STROOPS: String(maximumOperationFee),
  });
}

async function configureCreation(runtime, configured, connectionString) {
  const { PrivyClient } = await import('@privy-io/server-auth');
  const { Keypair, StrKey } = await import('@stellar/stellar-sdk');
  const { assertCurrentPrivyIdentity } = await import('./scripts/lib/private-worker-runtime.mjs');
  const provider = new PrivyClient(privyApp, configured.PRIVY_APP_SECRET);
  const approvedPatient = configured.TRUSTLEAF_DEMO_PATIENT_EMAIL;
  checked(validEmail(approvedPatient), 'patient_wallet_unverified');
  const user = await provider.getUserByEmail(approvedPatient);
  const wallets = user?.linkedAccounts.filter(value => value.type === 'wallet' && value.chainType === 'stellar');
  checked(user?.id && wallets?.length === 1 && wallets[0].id &&
    StrKey.isValidEd25519PublicKey(wallets[0].address), 'patient_wallet_unverified');
  const wallet = wallets[0];
  await assertCurrentPrivyIdentity(provider, {
    userId: user.id, email: approvedPatient, walletId: wallet.id, address: wallet.address,
  });
  const relayer = Keypair.fromSecret(configured.RELAYER_SECRET).publicKey();
  checked(relayer !== wallet.address, 'patient_relayer_mismatch');

  const occupied = await withReadOnlyDatabase(connectionString, async client => {
    const binding = await client.query(`SELECT user_id,wallet_id,address FROM privy_stellar_wallet_bindings
      WHERE app_id=$1 AND (user_id=$2 OR address=$3) LIMIT 2`, [privyApp, user.id, wallet.address]);
    checked(binding.rows.length === 1 && binding.rows[0].user_id === user.id &&
      binding.rows[0].wallet_id === wallet.id && binding.rows[0].address === wallet.address, 'patient_binding_unverified');
    const state = await client.query(`SELECT
      EXISTS(SELECT 1 FROM clinical_web_histories WHERE network='testnet' AND contract_id=$1
        AND (owner_user_id=$2 OR patient_wallet=$3)) AS history,
      EXISTS(SELECT 1 FROM clinical_web_operations WHERE network='testnet' AND contract_id=$1
        AND source_wallet=$3) AS attempt`, [clinical, user.id, wallet.address]);
    checked(state.rows.length === 1 && state.rows[0].history === false && state.rows[0].attempt === false,
      'patient_history_not_empty');
    return sponsorOccupied(client, relayer);
  });

  const until = Math.floor(Date.now() / 1000) + 600;
  Object.assign(runtime, {
    RELAYER_SECRET: configured.RELAYER_SECRET,
    TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET: wallet.address,
    TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER: relayer,
    TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL: String(until),
  });
  configureSponsorship(runtime, '/api/private-clinical-operations', occupied + maximumOperationFee);
  console.log('Creación habilitada para la cuenta paciente verificada hasta ' + new Date(until * 1000).toISOString());
}

async function configureInitialDoctor(runtime, configured, connectionString) {
  const { loadInitialDoctorScope } = await import('./scripts/lib/initial-doctor-scope.mjs');
  runtime.TRUSTLEAF_INITIAL_DOCTOR_SCOPE_FILE = initialScope;
  runtime.TRUSTLEAF_INITIAL_DOCTOR_SCOPE_SHA256 = scopeDigest;
  const reconcile = mode === 'initial-doctor-worker-reconcile';
  const plan = loadInitialDoctorScope({ env: runtime, allowExpired: reconcile });
  checked(plan, 'initial_doctor_scope_rejected');
  if (mode === 'initial-doctor-admin') return;

  const { Keypair } = await import('@stellar/stellar-sdk');
  const relayer = Keypair.fromSecret(configured.RELAYER_SECRET).publicKey();
  checked(relayer === plan.relayer && configured.DOCTOR_REGISTRY_ADMIN_ALIAS && configured.STELLAR_CONFIG_DIR,
    'initial_doctor_worker_configuration_mismatch');
  Object.assign(runtime, {
    RELAYER_SECRET: configured.RELAYER_SECRET,
    DOCTOR_REGISTRY_ADMIN_ALIAS: configured.DOCTOR_REGISTRY_ADMIN_ALIAS,
    STELLAR_CONFIG_DIR: resolve(dirname(environmentFile), configured.STELLAR_CONFIG_DIR),
  });
  const occupied = await withReadOnlyDatabase(connectionString, client => sponsorOccupied(client, relayer));
  configureSponsorship(runtime, '/api/admin/doctor-authorizations', occupied + maximumOperationFee);
}

async function configureDigitalCabs(runtime, configured, connectionString) {
  const { Keypair } = await import('@stellar/stellar-sdk');
  const source = readFileSync(captureScope);
  checked(createHash('sha256').update(source).digest('hex') === captureDigest, 'capture_manifest_mismatch');
  const scope = JSON.parse(source.toString('utf8'));
  const closing = mode === 'digital-cabs-close';
  let plan = scope;
  if (closing) {
    const previous = readFileSync(new URL('./digital-cabs-pdf-scope.private.json', pathToFileURL(captureScope)));
    checked(validDigest(configured.TRUSTLEAF_DEMO_PDF_SCOPE_SHA256) &&
      scope.basePdfScopeSha256 === configured.TRUSTLEAF_DEMO_PDF_SCOPE_SHA256 &&
      createHash('sha256').update(previous).digest('hex') === scope.basePdfScopeSha256,
      'capture_base_manifest_mismatch');
    plan = JSON.parse(previous.toString('utf8'));
  }
  const now = Math.floor(Date.now() / 1000);
  const relayer = Keypair.fromSecret(configured.RELAYER_SECRET).publicKey();
  checked(scope.schemaVersion === (closing ? 2 : 1) && Boolean(plan.pdf) === (closing || mode === 'digital-cabs-pdf') &&
    plan.network === 'testnet' && plan.contractId === clinical && plan.registryId === PRIVATE_REGISTRY_ID &&
    plan.relayer === relayer && Number.isSafeInteger(plan.doctorId) && plan.doctorId > 0 &&
    String(plan.doctorId) === configured.TRUSTLEAF_DEMO_DOCTOR_ID && Number.isSafeInteger(scope.openedAt) &&
    Number.isSafeInteger(scope.until) && scope.openedAt <= now && now < scope.until &&
    scope.until - scope.openedAt <= 3600, 'capture_manifest_mismatch');

  await verifyDigitalCabsActors(configured, connectionString, plan, relayer);

  Object.assign(runtime, {
    RELAYER_SECRET: configured.RELAYER_SECRET,
    TRUSTLEAF_CLINICAL_CAPTURE_FILE: captureScope,
    TRUSTLEAF_CLINICAL_CAPTURE_SHA256: captureDigest,
  });
  configureSponsorship(runtime, '/api/private-clinical-operations', maximumOperationFee);
  const purpose = closing ? 'Corrección y retiro' : plan.pdf ? 'PDF de prueba' : 'Permisos y primera nota';
  console.log(purpose + ' habilitado para Digital y Cabs hasta ' + new Date(scope.until * 1000).toISOString());
}

async function verifyDigitalCabsActors(configured, connectionString, plan, relayer) {
  const { PrivyClient } = await import('@privy-io/server-auth');
  const { assertCurrentPrivyIdentity } = await import('./scripts/lib/private-worker-runtime.mjs');
  const provider = new PrivyClient(privyApp, configured.PRIVY_APP_SECRET);
  const accounts = [[plan.patient, configured.TRUSTLEAF_DEMO_PATIENT_EMAIL], [plan.doctor, configured.TRUSTLEAF_DEMO_DOCTOR_EMAIL]];
  checked(accounts.every(([, email]) => validEmail(email)) && accounts[0][1] !== accounts[1][1], 'capture_manifest_mismatch');
  await Promise.all(accounts.map(([actor, email]) => assertCurrentPrivyIdentity(provider, { ...actor, email })));
  await withReadOnlyDatabase(connectionString, async client => {
    const bindings = await client.query(`SELECT user_id,wallet_id,address FROM privy_stellar_wallet_bindings
      WHERE app_id=$1 AND (user_id=ANY($2::text[]) OR address=ANY($3::text[]))`,
    [privyApp, accounts.map(([actor]) => actor.userId), accounts.map(([actor]) => actor.address)]);
    checked(bindings.rows.length === 2 && accounts.every(([actor]) => bindings.rows.some(row =>
      row.user_id === actor.userId && row.wallet_id === actor.walletId && row.address === actor.address)),
    'capture_manifest_mismatch');
    if (relayer) checked(await sponsorOccupied(client, relayer) < maximumOperationFee, 'sponsor_balance_unverified');
  });
}

async function configureDigitalCabsRx(runtime, configured, connectionString) {
  const { loadPrivateRxScope } = await import('./scripts/lib/digital-cabs-rx-scope.mjs');
  const { Keypair } = await import('@stellar/stellar-sdk');
  Object.assign(runtime, {
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_FILE: captureScope,
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_SHA256: captureDigest,
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_APPROVED_SHA256: rxApprovalDigest,
  });
  const plan = loadPrivateRxScope({ env: runtime });
  const relayer = Keypair.fromSecret(configured.RELAYER_SECRET).publicKey();
  checked(plan && mode === 'digital-cabs-rx-' + plan.phase && plan.network === 'testnet' &&
    plan.authority === authority && plan.contractId === prescription && plan.relayer === relayer,
    'rx_manifest_mismatch');
  const issuance = plan.phase === 'issuance';
  await verifyDigitalCabsActors(configured, connectionString, plan, issuance ? relayer : null);
  if (issuance) {
    runtime.RELAYER_SECRET = configured.RELAYER_SECRET;
    configureSponsorship(runtime, '/api/private-operations', maximumOperationFee);
  }
  const purpose = issuance ? 'Receta sintética' : 'Cita de prueba';
  console.log(purpose + ' habilitada para Digital y Cabs hasta ' + new Date(plan.until * 1000).toISOString());
}

const rxWorkerFlags = { 'rx-worker-quote': '--quote-only', 'rx-worker-once': '--once',
  'rx-worker-reconcileread': '--reconcile-read' };

async function configureRxAttestationWorker(runtime, configured, connectionString) {
  const { loadPrivateRxScope } = await import('./scripts/lib/digital-cabs-rx-scope.mjs');
  const { Keypair } = await import('@stellar/stellar-sdk');
  const send = mode === 'rx-worker-once';
  const quote = mode === 'rx-worker-quote';
  const relayer = Keypair.fromSecret(configured.RELAYER_SECRET).publicKey();
  Object.assign(runtime, {
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_FILE: captureScope,
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_SHA256: captureDigest,
    ...(quote ? {} : { TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_APPROVED_SHA256: rxApprovalDigest }),
    TRUSTLEAF_PRIVATE_RX_ATTESTATION_QUOTE_FILE:
      fileURLToPath(new URL('./digital-cabs-rx-attestation-quote.private.json', pathToFileURL(captureScope))),
  });
  const plan = loadPrivateRxScope({ env: runtime, requireApproval: send, allowExpired: !send && !quote });
  checked(plan?.phase === 'issuance' && plan.authority === authority && plan.contractId === prescription &&
    plan.relayer === relayer, 'rx_manifest_mismatch');
  if (send || quote) await verifyDigitalCabsActors(configured, connectionString, plan, send ? relayer : null);
  if (send) {
    checked(configured.DOCTOR_REGISTRY_ADMIN_ALIAS && configured.STELLAR_CONFIG_DIR, 'rx_signer_unavailable');
    Object.assign(runtime, { RELAYER_SECRET: configured.RELAYER_SECRET,
      DOCTOR_REGISTRY_ADMIN_ALIAS: configured.DOCTOR_REGISTRY_ADMIN_ALIAS,
      STELLAR_CONFIG_DIR: resolve(dirname(environmentFile), configured.STELLAR_CONFIG_DIR) });
    configureSponsorship(runtime, '/api/prescription-bookings', maximumOperationFee);
  }
}

try {
  const configured = parseEnv(readFileSync(environmentFile, 'utf8'));
  const connectionString = databaseConnectionString(configured);
  const database = new URL(connectionString);
  checked(configured.TRUSTLEAF_ENV === 'local' && !Object.hasOwn(configured, 'VERCEL') && !Object.hasOwn(configured, 'VERCEL_ENV') &&
    ['postgres:', 'postgresql:'].includes(database.protocol) && database.hostname === configured.TRUSTLEAF_DB_HOST &&
    configured.TRUSTLEAF_DEMO_DB_HOST === database.hostname &&
    /^ep-[a-z0-9-]+\.c-3\.us-east-1\.aws\.neon\.tech$/.test(database.hostname) &&
    configured.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet' &&
    ['https://soroban-testnet.stellar.org', 'https://soroban-testnet.stellar.org/'].includes(configured.NEXT_PUBLIC_SOROBAN_RPC_URL) &&
    configured.NEXT_PUBLIC_PRIVY_APP_ID === privyApp && configured.PRIVY_APP_ID === privyApp && configured.PRIVY_APP_SECRET &&
    configured.TRUSTLEAF_PRIVATE_PORTAL_ENABLED === 'true' && configured.TRUSTLEAF_CLINICAL_WEB_ENABLED === 'true' &&
    configured.CLINICAL_HISTORY_PRIVATE_CONTRACT_ID === clinical && configured.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID === PRIVATE_REGISTRY_ID &&
    configured.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY === authority && configured.BOOKING_AUTHORITY_PUBLIC_KEY === authority &&
    configured.PRESCRIPTION_PRIVATE_CONTRACT_ID === prescription, 'operational_environment_mismatch');

  const runtime = Object.fromEntries(Object.entries(process.env).filter(([name]) => windowsKeys.includes(name.toUpperCase())));
  for (const name of applicationKeys) if (configured[name] !== undefined) runtime[name] = configured[name];
  Object.assign(runtime, {
    NODE_ENV: 'production',
    MCP_LIVE_ENABLED: 'false',
    TRUSTLEAF_REQUIRE_AUTH: 'true',
    TRUSTLEAF_CLINICAL_RPC_PROVIDER: 'gateway',
    TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false',
    TRUSTLEAF_SPONSORSHIP_ENABLED: 'false',
    TRUSTLEAF_SPONSORSHIP_PATHS: '/api/private-clinical-operations',
  });
  const initialWorker = ['initial-doctor-worker-once', 'initial-doctor-worker-reconcile'].includes(mode);
  if (mode === 'digital-create-once') {
    await configureCreation(runtime, configured, connectionString);
  } else if (mode === 'digital-cabs' || mode === 'digital-cabs-pdf' || mode === 'digital-cabs-close') {
    await configureDigitalCabs(runtime, configured, connectionString);
  } else if (mode === 'digital-cabs-rx-appointment' || mode === 'digital-cabs-rx-issuance') {
    await configureDigitalCabsRx(runtime, configured, connectionString);
  } else if (Object.hasOwn(rxWorkerFlags, mode)) {
    await configureRxAttestationWorker(runtime, configured, connectionString);
  } else if (initialWorker || mode === 'initial-doctor-admin') {
    await configureInitialDoctor(runtime, configured, connectionString);
  } else {
    checked(mode === 'read-only', 'unsupported_mode');
  }
  const args = initialWorker ? [worker, mode === 'initial-doctor-worker-once' ? '--once' : '--reconcile']
    : Object.hasOwn(rxWorkerFlags, mode) ? [worker, rxWorkerFlags[mode]] : [nextBin, 'start', '-H', '127.0.0.1', '-p', '3016'];
  const child = spawnSync(process.execPath, args, {
    env: runtime, stdio: 'inherit', windowsHide: true,
  });
  checked(!child.error && child.status !== null, 'capture_process_start_failed');
  process.exitCode = child.status;
} catch (error) {
  const recognized = new Set(['operational_environment_mismatch', 'patient_wallet_unverified',
    'patient_binding_unverified', 'patient_history_not_empty', 'patient_relayer_mismatch',
    'sponsor_balance_unverified', 'initial_doctor_scope_rejected', 'initial_doctor_worker_configuration_mismatch',
    'unsupported_mode', 'capture_process_start_failed', 'capture_manifest_mismatch', 'capture_base_manifest_mismatch',
    'rx_manifest_mismatch', 'rx_signer_unavailable']);
  console.error(recognized.has(error?.message) ? error.message : 'capture_runtime_preflight_unavailable');
  process.exitCode = 1;
}
'@

Push-Location -LiteralPath $repo
try {
    $captureDigest = if ($DigitalCabsRxScopeSha256) { $DigitalCabsRxScopeSha256 } elseif ($DigitalCabsScopeSha256) { $DigitalCabsScopeSha256 } else { '-' }
    $rxApproval = if ($DigitalCabsRxApprovedSha256) { $DigitalCabsRxApprovedSha256 } else { '-' }
    $bootstrap | & node --input-type=module - $EnvFile $nextBin $mode $initialScope $scopeDigest $worker $captureScope $captureDigest $rxApproval
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
