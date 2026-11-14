import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StrKey } from '@stellar/stellar-sdk';
import { DIGITAL_CABS_RX_DOCUMENT, PRIVATE_RX_AUTHORITY,
  PRIVATE_RX_CONTRACT_ID, PRIVATE_RX_REGISTRY_ID, PRIVATE_RX_SCOPE_ENV, assertPrivateRxScopeOpen, loadPrivateRxScope,
  privateRxAppointmentEpoch, privateRxScopeConfigured, validatePrivateRxManifest } from './digital-cabs-rx-scope.mjs';

const start = Date.parse('2026-11-13T12:00:00Z') / 1000;
const wallet = n => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n));
const patient = { userId: 'did:privy:syntheticpatient', walletId: 'fixture-patient', address: wallet(1) };
const doctor = { userId: 'did:privy:syntheticdoctor', walletId: 'fixture-doctor', address: wallet(2) };
const base = { runId: randomUUID(), grantRequestId: randomUUID(), noteRequestId: randomUUID(), pdfRequestId: randomUUID(),
  patient, doctor, doctorId: 9, relayer: wallet(3), historyId: 'a'.repeat(64) };
const baseBytes = Buffer.from(JSON.stringify(base));
const basePdfScopeSha256 = createHash('sha256').update(baseBytes).digest('hex');
const fixtureSlot = { date: '2026-11-13', timeSlot: '09:00', type: 'Presencial' };
function appointment() {
  return { schemaVersion: 1, phase: 'appointment', runId: randomUUID(), openedAt: start - 20 * 3600, until: start + 1800,
    network: 'testnet', basePdfScopeSha256, contractId: PRIVATE_RX_CONTRACT_ID,
    registryId: PRIVATE_RX_REGISTRY_ID, authority: PRIVATE_RX_AUTHORITY, relayer: base.relayer,
    patient: { ...patient }, doctor: { ...doctor }, doctorId: base.doctorId, historyId: base.historyId,
    slot: { ...fixtureSlot }, document: { ...DIGITAL_CABS_RX_DOCUMENT } };
}
function issuance() {
  return { ...appointment(), phase: 'issuance', openedAt: start, until: start + 900,
    appointmentId: 73, issuanceId: 'b'.repeat(64), bookingValidUntil: start + 1000, prescriptionId: randomUUID(),
    maxTotalFeeStroops: '10000000', attestationQuoteSha256: 'c'.repeat(64),
    steps: Object.fromEntries(['attest', 'consent', 'mint'].map(step => [step, { requestId: randomUUID(), maxFeeStroops: '8000000' }])) };
}
const inspect = (plan, options = {}) => validatePrivateRxManifest(plan, base, { now: start, basePdfScopeSha256, ...options });
const denied = work => assert.throws(work, { message: 'private_rx_scope_rejected' });

test('the exact synthetic appointment can be prepared before its slot without any financial slots', () => {
  assert.doesNotThrow(() => inspect(appointment(), { now: start - 19 * 3600 }));
  denied(() => inspect({ ...appointment(), steps: issuance().steps }));
  denied(() => inspect({ ...appointment(), until: start + 1801 }));
  denied(() => inspect({ ...appointment(), openedAt: start - 37 * 3600 }));
});

test('a different explicitly reviewed real Santiago slot is accepted, but date, time and appointment type are exact', () => {
  const winter = Date.parse('2027-07-13T13:30:00Z') / 1000;
  const scope = { ...appointment(), openedAt: winter - 1800, until: winter + 1800,
    slot: { date: '2027-07-13', timeSlot: '09:30', type: 'Telemedicina' } };
  assert.doesNotThrow(() => inspect(scope, { now: winter }));
  for (const patch of [{ date: '2027-02-30' }, { timeSlot: '24:00' }, { type: 'Other' }, { offset: '-04:00' }]) {
    denied(() => inspect({ ...scope, slot: { ...scope.slot, ...patch } }, { now: winter }));
  }
  denied(() => inspect({ ...scope, until: winter + 1801 }, { now: winter }));
});

test('one extra slot must be an explicit 30-minute same-date choice, not a client-controlled duration', () => {
  const plan = appointment(), slot = { ...plan.slot, oneTime: true };
  assert.equal(privateRxAppointmentEpoch(slot), start);
  assert.doesNotThrow(() => inspect({ ...plan, slot }));
  for (const changed of [{ ...slot, oneTime: false }, { ...slot, duration: 60 }, { ...slot, timeSlot: '23:45' }]) {
    denied(() => privateRxAppointmentEpoch(changed));
  }
});

test('scope rejects altered pair, contract, relayer, synthetic text and existing clinical IDs', () => {
  const scope = appointment();
  for (const patch of [{ patient: doctor }, { doctor: { ...doctor, walletId: 'changed-wallet' } }, { doctorId: 10 },
    { contractId: PRIVATE_RX_REGISTRY_ID }, { relayer: wallet(4) }, { runId: base.noteRequestId },
    { document: { ...scope.document, instructions: 'Different content.' } }, { document: { ...scope.document, notes: '' } }]) {
    denied(() => inspect({ ...scope, ...patch }));
  }
});

test('issuance pins each fee ceiling, the exact booking window and three unique unused requests', () => {
  const scope = issuance();
  // The persistent lifetime encounter bucket enforces aggregate reservations; individual ceilings may overlap.
  assert.doesNotThrow(() => inspect(scope));
  for (const patch of [{ maxTotalFeeStroops: '10000001' }, { maxTotalFeeStroops: '7000000' },
    { until: start + 1001 }, { openedAt: start - 1801 }, { bookingValidUntil: start + 3601 },
    { issuanceId: '0'.repeat(64) }, { prescriptionId: scope.steps.mint.requestId },
    { steps: { ...scope.steps, mint: { ...scope.steps.mint, requestId: base.pdfRequestId } } },
    { steps: { ...scope.steps, attest: { ...scope.steps.attest, maxFeeStroops: '0' } } }]) {
    denied(() => inspect({ ...scope, ...patch }));
  }
});

test('only read-only preview accepts an unquoted or expired plan', () => {
  const scope = issuance(), unquoted = { ...scope, attestationQuoteSha256: null };
  denied(() => inspect(unquoted));
  assert.doesNotThrow(() => inspect(unquoted, { requireApproval: false }));
  assert.throws(() => inspect(scope, { now: scope.until }), { message: 'private_rx_scope_expired' });
  assert.throws(() => inspect(scope, { now: scope.openedAt - 1, requireApproval: false, allowExpired: true }), { message: 'private_rx_scope_expired' });
  assert.doesNotThrow(() => inspect(scope, { now: scope.until, requireApproval: false, allowExpired: true }));
  denied(() => assertPrivateRxScopeOpen({ ...scope, approved: true, policyHash: 'd'.repeat(64) }, { env: {} }));
});

test('loader has no implicit activation, rejects partial config, and rejects unpinned sibling bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trustleaf-rx-scope-'));
  const file = join(dir, 'candidate.private.json'), sibling = join(dir, 'digital-cabs-pdf-scope.private.json');
  const bytes = Buffer.from(JSON.stringify(appointment())), hash = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(file, bytes); writeFileSync(sibling, baseBytes);
  try {
    const env = { TRUSTLEAF_ENV: 'local', TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false', NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
      TRUSTLEAF_DB_HOST: 'ep-demo-fixture-pooler.c-3.us-east-1.aws.neon.tech',
      TRUSTLEAF_DEMO_DB_HOST: 'ep-demo-fixture-pooler.c-3.us-east-1.aws.neon.tech',
      TRUSTLEAF_DATABASE_URL: 'postgres://fixture:fixture@ep-demo-fixture-pooler.c-3.us-east-1.aws.neon.tech/demo?sslmode=require',
      TRUSTLEAF_DEMO_PDF_SCOPE_SHA256: basePdfScopeSha256, TRUSTLEAF_DEMO_DOCTOR_ID: String(base.doctorId),
      PRIVY_APP_ID: 'cmrix722m03d30clewd1fuffq', NEXT_PUBLIC_PRIVY_APP_ID: 'cmrix722m03d30clewd1fuffq',
      PRESCRIPTION_PRIVATE_CONTRACT_ID: PRIVATE_RX_CONTRACT_ID, DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: PRIVATE_RX_REGISTRY_ID,
      DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: PRIVATE_RX_AUTHORITY, BOOKING_AUTHORITY_PUBLIC_KEY: PRIVATE_RX_AUTHORITY,
      [PRIVATE_RX_SCOPE_ENV.file]: file, [PRIVATE_RX_SCOPE_ENV.hash]: hash };
    assert.equal(loadPrivateRxScope({ env: {} }), null);
    assert.equal(privateRxScopeConfigured({ [PRIVATE_RX_SCOPE_ENV.file]: '' }), true);
    denied(() => loadPrivateRxScope({ env, now: start }));
    assert.equal(loadPrivateRxScope({ env, now: start, requireApproval: false }).approved, false);
    const approved = { ...env, [PRIVATE_RX_SCOPE_ENV.approval]: hash };
    assert.equal(loadPrivateRxScope({ env: approved, now: start }).approved, true);
    denied(() => loadPrivateRxScope({ env: { ...approved, TRUSTLEAF_DEMO_PDF_SCOPE_SHA256: 'f'.repeat(64) }, now: start }));
    denied(() => loadPrivateRxScope({ env: { ...approved, TRUSTLEAF_DEMO_DB_HOST: 'ep-unreviewed.c-3.us-east-1.aws.neon.tech' }, now: start }));
    writeFileSync(sibling, Buffer.concat([baseBytes, Buffer.from('\n')]));
    denied(() => loadPrivateRxScope({ env: approved, now: start }));
    denied(() => loadPrivateRxScope({ env: { ...env, [PRIVATE_RX_SCOPE_ENV.approval]: hash }, now: start, allowExpired: true }));
  } finally { unlinkSync(file); unlinkSync(sibling); rmdirSync(dir); }
});
