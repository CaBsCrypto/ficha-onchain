import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { PrivateFlowError, REGISTRY_PRIVATE } from '@/lib/private-config';
import type { ClinicalAction, ClinicalActor, ClinicalExpected, ClinicalNote, ClinicalPrepareRequest, ClinicalSnapshot } from '@/types/clinical';
import { CLINICAL_ID } from './config';
import { clinicalNote } from './input';
import { deriveClinicalHistoryId } from './chain';

const fileKey = 'TRUSTLEAF_CLINICAL_CAPTURE_FILE';
const digestKey = 'TRUSTLEAF_CLINICAL_CAPTURE_SHA256';
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const denied = () => new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
const epoch = (value: number) => Number.isSafeInteger(value) && value > 0;

interface CaptureSlot { requestId: string; operationId: string }
interface CaptureContinuation {
  pdfTransactionHash: string;
  correction: CaptureSlot & { entryId: string; previousCommitment: string; note: ClinicalNote };
  revocation: CaptureSlot;
}

interface CaptureContinuationManifest extends CaptureContinuation {
  schemaVersion: 2;
  runId: string;
  openedAt: number;
  until: number;
  basePdfScopeSha256: string;
}

export interface ClinicalCapturePlan {
  schemaVersion: 1 | 2;
  runId: string;
  openedAt: number;
  until: number;
  network: 'testnet';
  contractId: string;
  registryId: string;
  relayer: string;
  patient: ClinicalActor;
  doctor: ClinicalActor;
  historyId: string;
  doctorId: number;
  doctorValidUntil: number;
  grantRequestId: string;
  noteRequestId: string;
  note: ClinicalNote;
  pdfRequestId?: string;
  grantTransactionHash?: string;
  noteTransactionHash?: string;
  pdf?: { fileName: string; mediaType: 'application/pdf'; byteLength: number; sha256: string };
  continuation?: CaptureContinuation;
  policyHash: string;
}

function exact(value: object, keys: string[]) {
  return value !== null && typeof value === 'object' && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}

function validActor(actor: ClinicalActor) {
  return exact(actor, ['userId', 'walletId', 'address']) && /^did:privy:[a-z0-9]{10,80}$/.test(actor.userId) &&
    /^[a-zA-Z0-9_-]{6,100}$/.test(actor.walletId) && StrKey.isValidEd25519PublicKey(actor.address);
}

function validPdf(pdf: NonNullable<ClinicalCapturePlan['pdf']>) {
  return exact(pdf, ['fileName', 'mediaType', 'byteLength', 'sha256']) && pdf.mediaType === 'application/pdf' &&
    typeof pdf.fileName === 'string' && pdf.fileName === pdf.fileName.trim() && /\.pdf$/i.test(pdf.fileName) &&
    Buffer.byteLength(pdf.fileName) <= 255 && !/[\x00-\x1f\x7f/\\]/.test(pdf.fileName) &&
    Number.isSafeInteger(pdf.byteLength) && pdf.byteLength > 0 && pdf.byteLength <= 3_000_000 &&
    digest.test(pdf.sha256);
}

export function clinicalCaptureConfigured(env = process.env) {
  return Object.hasOwn(env, fileKey) || Object.hasOwn(env, digestKey);
}

function nonzeroDigest(value: unknown): value is string {
  return typeof value === 'string' && digest.test(value) && !/^0+$/.test(value);
}

function loadCaptureContinuation(raw: CaptureContinuationManifest, file: string, policyHash: string, env: NodeJS.ProcessEnv, now: number): ClinicalCapturePlan {
  const basePdfScopeSha256 = env.TRUSTLEAF_DEMO_PDF_SCOPE_SHA256;
  const confirmedPdfHash = env.TRUSTLEAF_DEMO_PDF_TX_SHA256;
  if (!nonzeroDigest(basePdfScopeSha256) || !nonzeroDigest(confirmedPdfHash) ||
      !exact(raw, ['schemaVersion', 'runId', 'openedAt', 'until', 'basePdfScopeSha256', 'pdfTransactionHash', 'correction', 'revocation']) ||
      raw.basePdfScopeSha256 !== basePdfScopeSha256 || raw.pdfTransactionHash !== confirmedPdfHash ||
      !epoch(raw.openedAt) || !epoch(raw.until) || raw.openedAt > now || raw.until <= raw.openedAt || raw.until - raw.openedAt > 3600 ||
      !exact(raw.correction, ['requestId', 'operationId', 'entryId', 'previousCommitment', 'note']) ||
      !exact(raw.revocation, ['requestId', 'operationId']) ||
      ![raw.correction.operationId, raw.revocation.operationId, raw.correction.entryId, raw.correction.previousCommitment].every(nonzeroDigest) ||
      raw.correction.operationId === raw.revocation.operationId) throw denied();

  const baseFile = fileURLToPath(new URL('digital-cabs-pdf-scope.private.json', pathToFileURL(file)));
  if (file === baseFile || policyHash === basePdfScopeSha256) throw denied();
  const baseBytes = readFileSync(baseFile);
  if (baseBytes.length > 4096 || createHash('sha256').update(baseBytes).digest('hex') !== basePdfScopeSha256) throw denied();
  const basePdfOpenedAt = JSON.parse(baseBytes.toString('utf8')).openedAt;
  if (!epoch(basePdfOpenedAt)) throw denied();
  const base = loadClinicalCapture({ ...env, [fileKey]: baseFile, [digestKey]: basePdfScopeSha256 }, basePdfOpenedAt);
  if (!base?.pdf || !base.pdfRequestId || base.schemaVersion !== 1 || raw.openedAt < base.until || raw.until >= base.doctorValidUntil) throw denied();
  const ids = [base.runId, base.grantRequestId, base.noteRequestId, base.pdfRequestId, raw.runId, raw.correction.requestId, raw.revocation.requestId];
  if (!ids.every(id => typeof id === 'string' && uuid.test(id)) || new Set(ids).size !== ids.length) throw denied();

  const note = clinicalNote(raw.correction.note);
  if (!exact(raw.correction.note, ['title', 'text', 'eventDate', 'prescriptionId']) || !note.prescriptionId || !uuid.test(note.prescriptionId) ||
      !sameNoteFields(base.note, raw.correction.note) || !sameNoteFields(note, raw.correction.note)) throw denied();
  const continuation = Object.freeze({
    pdfTransactionHash: raw.pdfTransactionHash,
    correction: Object.freeze({ ...raw.correction, note: Object.freeze(note) }),
    revocation: Object.freeze({ ...raw.revocation }),
  });
  return Object.freeze({ ...base, schemaVersion: 2, runId: raw.runId, openedAt: raw.openedAt, until: raw.until, continuation, policyHash });
}

export function loadClinicalCapture(env = process.env, now = Math.floor(Date.now() / 1000)): ClinicalCapturePlan | null {
  if (!clinicalCaptureConfigured(env)) return null;
  let plan: Omit<ClinicalCapturePlan, 'policyHash'>;
  let policyHash: string;
  try {
    const file = env[fileKey];
    policyHash = env[digestKey] ?? '';
    const competingScope = Object.keys(env).some(key =>
      /^TRUSTLEAF_CLINICAL_(?:CREATE_ONCE|HOSTED_CREATE_ONCE|PATIENT_DEMO|REHEARSAL|MIGRATION|WEB_MIGRATION)(?:_|$)/.test(key) ||
      key.startsWith('TRUSTLEAF_INITIAL_DOCTOR_SCOPE_'));
    if (competingScope || env.TRUSTLEAF_ENV !== 'local' || env.VERCEL || env.VERCEL_ENV ||
        env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false' || env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' ||
        !file || !isAbsolute(file) || resolve(file) !== realpathSync(file) || !digest.test(policyHash)) throw denied();
    const bytes = readFileSync(file);
    if (bytes.length > 4096 || createHash('sha256').update(bytes).digest('hex') !== policyHash) throw denied();
    const raw = JSON.parse(bytes.toString('utf8'));
    if (raw?.schemaVersion === 2) {
      plan = loadCaptureContinuation(raw, file, policyHash, env, now);
    } else {
      plan = raw;
      const pdfKeys = ['pdfRequestId', 'grantTransactionHash', 'noteTransactionHash', 'pdf'];
      const pdfMode = pdfKeys.some(key => Object.hasOwn(plan, key));
      if (!exact(plan, ['schemaVersion', 'runId', 'openedAt', 'until', 'network', 'contractId', 'registryId', 'relayer',
        'patient', 'doctor', 'historyId', 'doctorId', 'doctorValidUntil', 'grantRequestId', 'noteRequestId', 'note',
        ...(pdfMode ? pdfKeys : [])])) throw denied();
      const ids = [plan.runId, plan.grantRequestId, plan.noteRequestId];
      if (pdfMode) {
        if (!plan.pdfRequestId || !plan.pdf || !validPdf(plan.pdf) ||
            !nonzeroDigest(plan.grantTransactionHash) || !nonzeroDigest(plan.noteTransactionHash) ||
            plan.grantTransactionHash === plan.noteTransactionHash) throw denied();
        ids.push(plan.pdfRequestId);
      }
      if (plan.schemaVersion !== 1 || !ids.every(id => uuid.test(id)) || new Set(ids).size !== ids.length ||
          !epoch(plan.openedAt) || !epoch(plan.until) || plan.openedAt > now || plan.until <= plan.openedAt ||
          plan.until - plan.openedAt > 3600 || !epoch(plan.doctorValidUntil) || plan.until >= plan.doctorValidUntil ||
          plan.network !== 'testnet' || plan.contractId !== CLINICAL_ID || plan.registryId !== REGISTRY_PRIVATE ||
          !epoch(plan.doctorId) || String(plan.doctorId) !== env.TRUSTLEAF_DEMO_DOCTOR_ID ||
          !digest.test(plan.historyId) || !validActor(plan.patient) || !validActor(plan.doctor) ||
          plan.historyId !== deriveClinicalHistoryId(plan.patient.address) ||
          plan.patient.userId === plan.doctor.userId || plan.patient.walletId === plan.doctor.walletId ||
          new Set([plan.patient.address, plan.doctor.address, plan.relayer]).size !== 3 ||
          Keypair.fromSecret(env.RELAYER_SECRET ?? '').publicKey() !== plan.relayer ||
          !exact(plan.note, ['title', 'text', 'eventDate']) || plan.note.eventDate !== null ||
          !sameNote(plan.note, clinicalNote(plan.note))) throw denied();
    }
  } catch { throw denied(); }
  if (now >= plan.until) throw new PrivateFlowError('clinical_rehearsal_expired', 409);
  return Object.freeze({ ...plan, patient: Object.freeze(plan.patient), doctor: Object.freeze(plan.doctor),
    note: Object.freeze(clinicalNote(plan.note)), ...(plan.pdf ? { pdf: Object.freeze(plan.pdf) } : {}), policyHash });
}

function sameNoteFields(left: ClinicalNote, right: ClinicalNote) {
  return left.title === right.title && left.text === right.text && left.eventDate === right.eventDate;
}

function sameNote(left: ClinicalNote, right: ClinicalNote) {
  return sameNoteFields(left, right) && left.prescriptionId === right.prescriptionId;
}

export function captureAction(plan: ClinicalCapturePlan, wallet: string): 'set_permissions' | 'append_version' | undefined {
  if ((!plan.pdf || plan.continuation) && wallet === plan.patient.address) return 'set_permissions';
  if (wallet === plan.doctor.address) return 'append_version';
  return undefined;
}

function assertActor(expected: ClinicalActor, actor: ClinicalActor) {
  if (actor.userId !== expected.userId || actor.walletId !== expected.walletId || actor.address !== expected.address) throw denied();
}

export function assertClinicalCaptureActor(plan: ClinicalCapturePlan, actor: ClinicalActor) {
  const action = captureAction(plan, actor.address);
  if (!action) throw denied();
  assertActor(action === 'set_permissions' ? plan.patient : plan.doctor, actor);
  return action;
}

export function captureRequestId(plan: ClinicalCapturePlan, action: ClinicalAction) {
  if (action === 'set_permissions') return plan.continuation?.revocation.requestId ?? plan.grantRequestId;
  if (action === 'append_version') return plan.continuation?.correction.requestId ?? plan.pdfRequestId ?? plan.noteRequestId;
  throw denied();
}

export function captureOperationId(plan: ClinicalCapturePlan, action: ClinicalAction) {
  if (action === 'set_permissions') return plan.continuation?.revocation.operationId;
  if (action === 'append_version') return plan.continuation?.correction.operationId;
  return undefined;
}

export function assertClinicalCapturePdf(plan: ClinicalCapturePlan, fileName: string, mediaType: string, bytes: Uint8Array) {
  const pdf = plan.pdf;
  if (!pdf || fileName !== pdf.fileName || mediaType !== pdf.mediaType || bytes.byteLength !== pdf.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== pdf.sha256) throw denied();
}

export function assertClinicalCaptureInput(plan: ClinicalCapturePlan, actor: ClinicalActor, input: ClinicalPrepareRequest) {
  const action = assertClinicalCaptureActor(plan, actor);
  if (input.action !== action || input.requestId !== captureRequestId(plan, action)) throw denied();
  if (action === 'set_permissions') {
    const granting = !plan.continuation;
    if (input.doctorId !== plan.doctorId || input.expectedRevision !== (granting ? 0 : 1) || input.canRead !== granting || input.canAppend !== granting) throw denied();
    return;
  }
  if (plan.continuation) {
    const correction = plan.continuation.correction;
    if (input.historyId !== plan.historyId || input.entryId !== correction.entryId || input.expectedVersion !== 1 ||
        input.file || !input.note || !sameNote(correction.note, input.note)) throw denied();
    return;
  }
  if (input.historyId !== plan.historyId || input.entryId !== undefined || (input.expectedVersion ?? 0) !== 0) throw denied();
  if (plan.pdf) {
    if (input.note || !input.file) throw denied();
    const bytes = Buffer.from(input.file.base64, 'base64');
    try { assertClinicalCapturePdf(plan, input.file.fileName, input.file.mediaType, bytes); }
    finally { bytes.fill(0); }
  } else if (input.file || !input.note || !sameNote(plan.note, input.note)) throw denied();
}

export function assertClinicalCaptureExpected(plan: ClinicalCapturePlan, actor: ClinicalActor, action: ClinicalAction, expected: ClinicalExpected,
  requestId = captureRequestId(plan, action)) {
  if ((action !== 'set_permissions' && action !== 'append_version') || expected.patient !== plan.patient.address ||
      expected.historyId !== plan.historyId) throw denied();
  assertActor(action === 'set_permissions' ? plan.patient : plan.doctor, actor);
  if (action === 'set_permissions') {
    const revocation = plan.continuation?.revocation;
    const granting = requestId === plan.grantRequestId;
    if ((!granting && requestId !== revocation?.requestId) || expected.doctorId !== plan.doctorId || expected.doctor !== plan.doctor.address ||
        expected.expectedRevision !== (granting ? 0 : 1) || expected.canRead !== granting || expected.canAppend !== granting ||
        (!granting && expected.operationId !== revocation?.operationId)) throw denied();
    return;
  }
  if (expected.author !== plan.doctor.address || expected.expectedGrantRevision !== 1) throw denied();
  const correction = plan.continuation?.correction;
  if (correction && requestId === correction.requestId) {
    if (expected.entryId !== correction.entryId || expected.operationId !== correction.operationId || expected.expectedVersion !== 1 ||
        expected.previousCommitment !== correction.previousCommitment) throw denied();
  } else if ((requestId !== plan.noteRequestId && requestId !== plan.pdfRequestId) || expected.expectedVersion !== 0 ||
      expected.previousCommitment !== null) throw denied();
}

export function clinicalCaptureView(actor: ClinicalActor, historyId: string): ClinicalSnapshot['rehearsal'] {
  try {
    const plan = loadClinicalCapture();
    if (!plan || plan.historyId !== historyId) return undefined;
    const action = assertClinicalCaptureActor(plan, actor);
    const requestId = captureRequestId(plan, action);
    return { runId: plan.runId, until: plan.until, steps: [
      action === 'set_permissions'
        ? { requestId, action, expectedRevision: plan.continuation ? 1 : 0, canRead: !plan.continuation, canAppend: !plan.continuation }
        : plan.continuation
          ? { requestId, action, entryId: plan.continuation.correction.entryId, expectedVersion: 1, kind: 'note' }
          : { requestId, action, expectedVersion: 0, kind: plan.pdf ? 'file' : 'note' },
    ] };
  } catch { return undefined; }
}
