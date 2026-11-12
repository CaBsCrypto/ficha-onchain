import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readDemoInputsOrExit, requiredDemoDigest } from './demo-inputs.mjs';
import {
  DIGITAL_CABS_RX_DOCUMENT,
  PRIVATE_RX_AUTHORITY,
  PRIVATE_RX_CONTRACT_ID,
  privateRxAppointmentEpoch,
  validatePrivateRxManifest,
} from '../lib/digital-cabs-rx-scope.mjs';

const { args, configured, privateFile } = readDemoInputsOrExit();

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function prepareAppointmentManifest(slot) {
  const basePdfScopeSha256 = requiredDemoDigest(configured, 'TRUSTLEAF_DEMO_PDF_SCOPE_SHA256');
  const source = readFileSync(privateFile('digital-cabs-pdf-scope.private.json'));
  if (digest(source) !== basePdfScopeSha256) throw new Error('rx_capture_baseline_mismatch');
  const baseline = JSON.parse(source.toString('utf8'));
  const openedAt = Math.floor(Date.now() / 1000);
  const until = privateRxAppointmentEpoch(slot) + 30 * 60;
  if (until <= openedAt || until - openedAt > 36 * 60 * 60) throw new Error('rx_appointment_window_invalid');

  const scope = {
    schemaVersion: 1,
    phase: 'appointment',
    runId: randomUUID(),
    openedAt,
    until,
    network: 'testnet',
    basePdfScopeSha256,
    contractId: PRIVATE_RX_CONTRACT_ID,
    registryId: baseline.registryId,
    authority: PRIVATE_RX_AUTHORITY,
    relayer: baseline.relayer,
    patient: baseline.patient,
    doctor: baseline.doctor,
    historyId: baseline.historyId,
    doctorId: baseline.doctorId,
    slot,
    document: DIGITAL_CABS_RX_DOCUMENT,
  };
  validatePrivateRxManifest(scope, baseline, { now: openedAt, requireApproval: false, basePdfScopeSha256 });
  const bytes = Buffer.from(`${JSON.stringify(scope, null, 2)}\n`);
  writeFileSync(privateFile('digital-cabs-rx-appointment.private.json'), bytes, { flag: 'wx', mode: 0o600 });
  return { status: 'appointment_manifest_prepared_inactive', sha256: digest(bytes), slot: scope.slot,
    until: new Date(until * 1000).toISOString(), signatures: 0, submissions: 0, sqlWrites: 0 };
}

try {
  const [mode, date, timeSlot, ...rest] = args;
  if (mode !== '--single-slot' || rest.length || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(timeSlot)) {
    throw new Error('rx_arguments_unexpected');
  }
  console.log(JSON.stringify(prepareAppointmentManifest({ date, timeSlot, type: 'Presencial', oneTime: true })));
} catch (error) {
  const known = new Set(['rx_capture_baseline_mismatch', 'demo_digest_required', 'rx_appointment_window_invalid', 'rx_arguments_unexpected', 'private_rx_scope_rejected', 'EEXIST']);
  console.log(JSON.stringify({ status: 'appointment_manifest_not_prepared',
    reason: known.has(error.code ?? error.message) ? error.code ?? error.message : 'rx_file_unavailable' }));
  process.exitCode = 1;
}
