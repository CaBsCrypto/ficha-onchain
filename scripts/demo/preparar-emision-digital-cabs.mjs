import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readDemoInputsOrExit } from './demo-inputs.mjs';
import { databaseConnectionString } from '../lib/database-connection.mjs';
import { loadPrivateRxScope } from '../lib/digital-cabs-rx-scope.mjs';

const require = createRequire(import.meta.url);
const { args, configured, privateFile } = readDemoInputsOrExit();
const scopeFile = name => privateFile(`digital-cabs-rx-${name}.private.json`);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const digestPattern = /^[0-9a-f]{64}$/;
const maxTotalFeeStroops = '10000000';

function readScope(phase, sha) {
  const file = scopeFile(phase);
  const scope = loadPrivateRxScope({ requireApproval: false, env: {
    DATABASE_URL: databaseConnectionString(configured), TRUSTLEAF_DB_HOST: configured.TRUSTLEAF_DB_HOST,
    TRUSTLEAF_ENV: configured.TRUSTLEAF_ENV, NEXT_PUBLIC_STELLAR_NETWORK: configured.NEXT_PUBLIC_STELLAR_NETWORK,
    PRIVY_APP_ID: configured.PRIVY_APP_ID, NEXT_PUBLIC_PRIVY_APP_ID: configured.NEXT_PUBLIC_PRIVY_APP_ID,
    PRESCRIPTION_PRIVATE_CONTRACT_ID: configured.PRESCRIPTION_PRIVATE_CONTRACT_ID,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: configured.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: configured.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY,
    BOOKING_AUTHORITY_PUBLIC_KEY: configured.BOOKING_AUTHORITY_PUBLIC_KEY,
    TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false',
    TRUSTLEAF_DEMO_DB_HOST: configured.TRUSTLEAF_DEMO_DB_HOST,
    TRUSTLEAF_DEMO_PDF_SCOPE_SHA256: configured.TRUSTLEAF_DEMO_PDF_SCOPE_SHA256,
    TRUSTLEAF_DEMO_DOCTOR_ID: configured.TRUSTLEAF_DEMO_DOCTOR_ID,
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_FILE: file,
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_SHA256: sha,
  } });
  if (!scope || configured.VERCEL || configured.VERCEL_ENV) throw new Error('rx_scope_unverified');
  return scope;
}

function writeScope(phase, scope) {
  const bytes = Buffer.from(`${JSON.stringify(scope, null, 2)}\n`);
  writeFileSync(scopeFile(phase), bytes, { flag: 'wx', mode: 0o600 });
  return sha256(bytes);
}

async function readQueuedBooking(appointment) {
  const connectionString = databaseConnectionString(configured);
  const url = new URL(connectionString);
  if (configured.TRUSTLEAF_ENV !== 'local' || configured.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' ||
      configured.VERCEL || configured.VERCEL_ENV || url.hostname !== configured.TRUSTLEAF_DB_HOST ||
      url.hostname !== configured.TRUSTLEAF_DEMO_DB_HOST ||
      !/^ep-[a-z0-9-]+\.c-3\.us-east-1\.aws\.neon\.tech$/.test(url.hostname) ||
      configured.PRESCRIPTION_PRIVATE_CONTRACT_ID !== appointment.contractId ||
      configured.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID !== appointment.registryId ||
      configured.BOOKING_AUTHORITY_PUBLIC_KEY !== appointment.authority) throw new Error('rx_environment_unverified');

  const { Pool, neonConfig } = require('@neondatabase/serverless');
  neonConfig.webSocketConstructor = require('ws');
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 15_000, query_timeout: 20_000 });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await client.query(`SELECT a.id AS appointment_id,b.issuance_id,b.valid_until
      FROM appointments a
      JOIN prescription_booking_requests b ON b.appointment_id=a.id
      JOIN doctors d ON d.id=$1 AND lower(d.email)=a.doctor_email
      WHERE a.date=$2::date AND a.time_slot=$3 AND a.type=$4 AND a.status='in_progress'
        AND a.started_at<=NOW() AND a.started_by=$5 AND a.attendance_at<=NOW() AND a.attendance_user_id=$6
        AND a.doctor_user_id=$5 AND a.patient_user_id=$6 AND a.doctor_wallet_id=$7 AND a.patient_wallet_id=$8
        AND a.doctor_wallet=$9 AND a.patient_wallet=$10
        AND b.doctor_user_id=$5 AND b.patient_requested_by=$6 AND b.doctor_wallet_id=$7 AND b.patient_wallet_id=$8
        AND b.doctor_wallet=$9 AND b.patient_wallet=$10 AND b.contract_id=$11 AND b.network='testnet'
        AND b.doctor_email=a.doctor_email AND b.patient_email=a.patient_email AND b.state='prepared'
        AND b.cancellation_requested_at IS NULL AND b.valid_until>EXTRACT(EPOCH FROM NOW())
        AND b.attestation_hash IS NULL AND b.transaction_hash IS NULL AND b.prepared_xdr IS NULL AND b.attempts='[]'::jsonb
        AND NOT EXISTS(SELECT 1 FROM private_prescriptions p WHERE p.appointment_id=a.id)
        AND NOT EXISTS(SELECT 1 FROM private_operations o WHERE o.appointment_id=a.id)`, [
      appointment.doctorId, appointment.slot.date, appointment.slot.timeSlot, appointment.slot.type,
      appointment.doctor.userId, appointment.patient.userId, appointment.doctor.walletId, appointment.patient.walletId,
      appointment.doctor.address, appointment.patient.address, appointment.contractId,
    ]);
    const booking = rows[0];
    if (rows.length !== 1 || !Number.isSafeInteger(Number(booking.appointment_id)) ||
        Number(booking.appointment_id) < 1 || !/^(?!0{64})[0-9a-f]{64}$/.test(booking.issuance_id) ||
        !Number.isSafeInteger(Number(booking.valid_until))) throw new Error('rx_booking_unverified');
    return booking;
  } finally {
    try { if (client) await client.query('ROLLBACK'); }
    finally { client?.release(); await pool.end(); }
  }
}

async function preparePreview(appointmentSha) {
  const appointment = readScope('appointment', appointmentSha);
  if (appointment.phase !== 'appointment') throw new Error('rx_scope_unverified');
  const booking = await readQueuedBooking(appointment);
  const openedAt = Math.floor(Date.now() / 1000);
  const bookingValidUntil = Number(booking.valid_until);
  const until = Math.min(bookingValidUntil, openedAt + 1800);
  if (until <= openedAt) throw new Error('rx_booking_unverified');
  const step = () => ({ requestId: randomUUID(), maxFeeStroops: maxTotalFeeStroops });
  const preview = { ...appointment, phase: 'issuance', openedAt, until,
    appointmentId: Number(booking.appointment_id), issuanceId: booking.issuance_id,
    bookingValidUntil, prescriptionId: randomUUID(), maxTotalFeeStroops, attestationQuoteSha256: null,
    steps: { attest: step(), consent: step(), mint: step() } };
  return { status: 'issuance_preview_prepared_inactive', sha256: writeScope('issuance-preview', preview),
    until: new Date(until * 1000).toISOString(), signatures: 0, submissions: 0, sqlWrites: 0 };
}

function prepareReviewedScope(previewSha, quoteSha) {
  const preview = readScope('issuance-preview', previewSha);
  const bytes = readFileSync(scopeFile('attestation-quote'));
  if (bytes.length > 64_000 || sha256(bytes) !== quoteSha) throw new Error('rx_attestation_quote_unverified');
  const artifact = JSON.parse(bytes.toString('utf8'));
  const quote = artifact.quote;
  const now = Math.floor(Date.now() / 1000);
  const boundFields = ['network', 'runId', 'appointmentId', 'issuanceId', 'contractId', 'authority', 'relayer', 'bookingValidUntil'];
  if (preview.phase !== 'issuance' || preview.attestationQuoteSha256 !== null || artifact.schemaVersion !== 1 ||
      !boundFields.every(field => artifact[field] === preview[field]) ||
      artifact.requestId !== preview.steps.attest.requestId ||
      !Number.isSafeInteger(artifact.ledger) || artifact.ledger < 1 || typeof artifact.unsignedXdr !== 'string' ||
      !quote || !digestPattern.test(quote.quoteId) || sha256(artifact.unsignedXdr) !== quote.unsignedHash ||
      !Number.isSafeInteger(quote.preparedAt) || quote.preparedAt > now ||
      !Number.isSafeInteger(quote.validUntil) || now >= quote.validUntil || quote.validUntil > preview.until ||
      !/^[1-9][0-9]{0,7}$/.test(quote.offeredFeeStroops) ||
      BigInt(quote.offeredFeeStroops) > BigInt(preview.steps.attest.maxFeeStroops)) {
    throw new Error('rx_attestation_quote_unverified');
  }
  const scope = { ...preview, attestationQuoteSha256: quoteSha, steps: { ...preview.steps,
    attest: { ...preview.steps.attest, maxFeeStroops: quote.offeredFeeStroops } } };
  return { status: 'issuance_manifest_prepared_inactive', sha256: writeScope('issuance', scope),
    attestationMaximumStroops: quote.offeredFeeStroops, maxTotalFeeStroops: scope.maxTotalFeeStroops,
    quoteExpiresAt: new Date(quote.validUntil * 1000).toISOString(),
    until: new Date(scope.until * 1000).toISOString(), signatures: 0, submissions: 0, sqlWrites: 0 };
}

try {
  const [mode, manifestSha, quoteSha, ...rest] = args;
  if (rest.length || !digestPattern.test(manifestSha) ||
      !(mode === '--preview' && quoteSha === undefined || mode === '--review' && digestPattern.test(quoteSha))) {
    throw new Error('rx_arguments_unexpected');
  }
  console.log(JSON.stringify(mode === '--preview' ? await preparePreview(manifestSha) : prepareReviewedScope(manifestSha, quoteSha)));
} catch (error) {
  const known = new Set(['rx_scope_unverified', 'rx_booking_unverified', 'rx_environment_unverified', 'rx_attestation_quote_unverified',
    'private_rx_scope_expired', 'private_rx_scope_rejected', 'rx_arguments_unexpected', 'EEXIST']);
  const reason = error.code ?? error.message;
  console.log(JSON.stringify({ status: 'issuance_manifest_not_prepared', reason: known.has(reason) ? reason : 'rx_state_unavailable' }));
  process.exitCode = 1;
}
