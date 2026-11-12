import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGISTRY_PRIVATE } from '@/lib/private-config';
import { CLINICAL_ID } from '@/lib/clinical/config';
import { deriveClinicalHistoryId } from '@/lib/clinical/chain';
import {
  assertClinicalCaptureExpected, assertClinicalCaptureInput, captureOperationId, clinicalCaptureView, loadClinicalCapture,
} from '@/lib/clinical/capture';
import type { ClinicalPrepareRequest } from '@/types/clinical';

const payer = Keypair.random();
const patient = { userId: 'did:privy:patientexample', walletId: 'patient-wallet', address: Keypair.random().publicKey() };
const doctor = { userId: 'did:privy:doctorexample', walletId: 'doctor-wallet', address: Keypair.random().publicKey() };
let directory: string;
let file: string;
let plan: ReturnType<typeof fixture>;

function fixture() {
  const openedAt = Math.floor(Date.now() / 1000) - 1;
  return {
    schemaVersion: 1, runId: randomUUID(), openedAt, until: openedAt + 1200, network: 'testnet',
    contractId: CLINICAL_ID, registryId: REGISTRY_PRIVATE, relayer: payer.publicKey(),
    patient, doctor, historyId: deriveClinicalHistoryId(patient.address), doctorId: 9,
    doctorValidUntil: openedAt + 86_400, grantRequestId: randomUUID(), noteRequestId: randomUUID(),
    note: { title: 'Synthetic appointment', text: 'Test record for the clinical history walkthrough.', eventDate: null },
  };
}

function pin(value: object) {
  const bytes = Buffer.from(JSON.stringify(value));
  writeFileSync(file, bytes);
  vi.stubEnv('TRUSTLEAF_CLINICAL_CAPTURE_FILE', file);
  vi.stubEnv('TRUSTLEAF_CLINICAL_CAPTURE_SHA256', createHash('sha256').update(bytes).digest('hex'));
}

beforeEach(() => {
  directory = mkdtempSync(resolve(realpathSync(tmpdir()), 'trustleaf-capture-test-'));
  file = resolve(directory, 'scope.json');
  plan = fixture();
  vi.stubEnv('TRUSTLEAF_ENV', 'local');
  vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'false');
  vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
  vi.stubEnv('TRUSTLEAF_DEMO_DOCTOR_ID', String(plan.doctorId));
  vi.stubEnv('RELAYER_SECRET', payer.secret());
  pin(plan);
});

afterEach(() => {
  vi.unstubAllEnvs();
  unlinkSync(file);
  rmdirSync(directory);
});

describe('Digital and Cabs capture scope', () => {
  it('pins one permission grant and one first note to the exact actors, request IDs and history', () => {
    const scope = loadClinicalCapture()!;
    const grant: ClinicalPrepareRequest = { requestId: plan.grantRequestId, action: 'set_permissions',
      doctorId: 9, canRead: true, canAppend: true, expectedRevision: 0 };
    const note: ClinicalPrepareRequest = { requestId: plan.noteRequestId, action: 'append_version',
      historyId: plan.historyId, expectedVersion: 0, note: plan.note };
    expect(assertClinicalCaptureInput(scope, patient, grant)).toBeUndefined();
    expect(assertClinicalCaptureInput(scope, doctor, note)).toBeUndefined();
    expect(clinicalCaptureView(patient, plan.historyId)?.steps).toEqual([{
      requestId: grant.requestId, action: grant.action, expectedRevision: 0, canRead: true, canAppend: true,
    }]);
    expect(clinicalCaptureView(doctor, plan.historyId)?.steps).toEqual([{
      requestId: note.requestId, action: note.action, expectedVersion: 0, kind: 'note',
    }]);
    const deny = 'clinical_rehearsal_scope_rejected';
    expect(() => assertClinicalCaptureInput(scope, { ...patient, walletId: doctor.walletId }, grant)).toThrow(deny);
    expect(() => assertClinicalCaptureInput(scope, patient, { ...grant, requestId: randomUUID() })).toThrow(deny);
    expect(() => assertClinicalCaptureInput(scope, patient, { ...grant, doctorId: 10 })).toThrow(deny);
    expect(() => assertClinicalCaptureInput(scope, patient, { ...grant, canAppend: false })).toThrow(deny);
    expect(() => assertClinicalCaptureInput(scope, doctor, { ...note, note: { ...plan.note, text: 'Changed' } })).toThrow(deny);
    expect(() => assertClinicalCaptureInput(scope, doctor, { ...note, historyId: '1'.repeat(64) })).toThrow(deny);
    expect(() => assertClinicalCaptureInput(scope, doctor, { ...note, expectedVersion: 1 })).toThrow(deny);
  });

  it('requires the confirmed grant revision and first note version in the persisted intent', () => {
    const scope = loadClinicalCapture()!;
    const saved = { historyId: plan.historyId, patient: patient.address, author: doctor.address,
      expectedGrantRevision: 1, expectedVersion: 0, previousCommitment: null, operationId: '1'.repeat(64) };
    expect(assertClinicalCaptureExpected(scope, doctor, 'append_version', saved)).toBeUndefined();
    expect(() => assertClinicalCaptureExpected(scope, doctor, 'append_version', { ...saved, expectedGrantRevision: 0 }))
      .toThrow('clinical_rehearsal_scope_rejected');
    expect(() => assertClinicalCaptureExpected(scope, doctor, 'append_version', { ...saved, patient: doctor.address }))
      .toThrow('clinical_rehearsal_scope_rejected');
  });

  it('enables only the exact first PDF append in a continuation', () => {
    const bytes = Buffer.from('%PDF-1.4\nSynthetic fixture\n%%EOF\n');
    const pdf = { fileName: 'synthetic-clinical-attachment.pdf', mediaType: 'application/pdf' as const,
      byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const pdfRequestId = randomUUID();
    const continuation = { ...plan, pdfRequestId, grantTransactionHash: '1'.repeat(64), noteTransactionHash: '2'.repeat(64), pdf };
    pin(continuation);
    const scope = loadClinicalCapture()!;
    const attachment: ClinicalPrepareRequest = { requestId: pdfRequestId, action: 'append_version',
      historyId: plan.historyId, expectedVersion: 0,
      file: { fileName: pdf.fileName, mediaType: pdf.mediaType, base64: bytes.toString('base64') } };
    expect(assertClinicalCaptureInput(scope, doctor, attachment)).toBeUndefined();
    expect(clinicalCaptureView(patient, plan.historyId)).toBeUndefined();
    expect(clinicalCaptureView(doctor, plan.historyId)?.steps).toEqual([{
      requestId: pdfRequestId, action: 'append_version', expectedVersion: 0, kind: 'file',
    }]);
    const deny = 'clinical_rehearsal_scope_rejected';
    expect(() => assertClinicalCaptureInput(scope, doctor, { ...attachment, file: undefined, note: plan.note })).toThrow(deny);
    expect(() => assertClinicalCaptureInput(scope, doctor, { ...attachment, requestId: plan.noteRequestId })).toThrow(deny);
    expect(() => assertClinicalCaptureInput(scope, doctor, { ...attachment, file: { ...attachment.file!, fileName: 'renamed.pdf' } })).toThrow(deny);
    const changed = Buffer.from(bytes);
    changed[10] ^= 1;
    expect(() => assertClinicalCaptureInput(scope, doctor, { ...attachment,
      file: { ...attachment.file!, base64: changed.toString('base64') } })).toThrow(deny);
    pin({ ...continuation, noteTransactionHash: undefined });
    expect(() => loadClinicalCapture()).toThrow(deny);
    pin({ ...continuation, pdfRequestId: plan.noteRequestId });
    expect(() => loadClinicalCapture()).toThrow(deny);
  });

  it('rejects a changed hash, expiry, another write mode and an unrelated history', () => {
    expect(() => loadClinicalCapture(process.env, plan.until)).toThrow('clinical_rehearsal_expired');
    vi.stubEnv('TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL', '1800000000');
    expect(() => loadClinicalCapture()).toThrow('clinical_rehearsal_scope_rejected');
    vi.stubEnv('TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL', undefined);
    vi.stubEnv('TRUSTLEAF_CLINICAL_CAPTURE_SHA256', '0'.repeat(64));
    expect(() => loadClinicalCapture()).toThrow('clinical_rehearsal_scope_rejected');
    pin({ ...plan, historyId: '1'.repeat(64) });
    expect(() => loadClinicalCapture()).toThrow('clinical_rehearsal_scope_rejected');
  });

  it('admits only the selected prescription on the existing note and the patient’s exact withdrawal', () => {
    const base = loadClinicalCapture()!;
    const prescriptionId = randomUUID();
    const correction = { requestId: randomUUID(), operationId: '1'.repeat(64), entryId: '2'.repeat(64),
      previousCommitment: '3'.repeat(64), note: { ...base.note, prescriptionId } };
    const revocation = { requestId: randomUUID(), operationId: '4'.repeat(64) };
    const scope = { ...base, schemaVersion: 2 as const, continuation: { correction, revocation, pdfTransactionHash: '5'.repeat(64) } };
    const edit: ClinicalPrepareRequest = { requestId: correction.requestId, action: 'append_version', historyId: scope.historyId,
      entryId: correction.entryId, expectedVersion: 1, note: correction.note };
    const revoke: ClinicalPrepareRequest = { requestId: revocation.requestId, action: 'set_permissions', doctorId: 9,
      expectedRevision: 1, canRead: false, canAppend: false };
    expect(assertClinicalCaptureInput(scope, doctor, edit)).toBeUndefined();
    expect(assertClinicalCaptureInput(scope, patient, revoke)).toBeUndefined();
    expect(captureOperationId(scope, edit.action)).toBe(correction.operationId);
    expect(captureOperationId(scope, revoke.action)).toBe(revocation.operationId);
    const denied = 'clinical_rehearsal_scope_rejected';
    for (const input of [{ ...edit, note: base.note }, { ...edit, note: { ...correction.note, prescriptionId: randomUUID() } },
      { ...edit, note: { ...correction.note, text: 'Changed' } }, { ...edit, entryId: '6'.repeat(64) }, { ...edit, expectedVersion: 0 },
      { ...edit, requestId: base.noteRequestId }]) expect(() => assertClinicalCaptureInput(scope, doctor, input)).toThrow(denied);
    expect(() => assertClinicalCaptureInput(scope, patient, edit)).toThrow(denied);
    expect(() => assertClinicalCaptureInput(scope, { ...doctor, userId: patient.userId }, edit)).toThrow(denied);
    for (const input of [{ ...revoke, canRead: true }, { ...revoke, canAppend: true }, { ...revoke, expectedRevision: 0 },
      { ...revoke, doctorId: 10 }, { ...revoke, requestId: base.grantRequestId }])
      expect(() => assertClinicalCaptureInput(scope, patient, input)).toThrow(denied);
    const expected = { patient: patient.address, historyId: scope.historyId, author: doctor.address,
      entryId: correction.entryId, operationId: correction.operationId, expectedVersion: 1,
      expectedGrantRevision: 1, previousCommitment: correction.previousCommitment };
    expect(assertClinicalCaptureExpected(scope, doctor, edit.action, expected)).toBeUndefined();
    for (const change of [{ previousCommitment: '6'.repeat(64) }, { operationId: '6'.repeat(64) }, { expectedGrantRevision: 2 }])
      expect(() => assertClinicalCaptureExpected(scope, doctor, edit.action, { ...expected, ...change })).toThrow(denied);
  });
});
