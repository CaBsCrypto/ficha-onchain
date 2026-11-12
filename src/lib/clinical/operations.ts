import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { PoolClient } from '@neondatabase/serverless';
import { getDbConnection, getDb } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { resolveDoctor } from '@/lib/doctor-authorizations';
import { PrivateFlowError, assertPrivateWrites } from '@/lib/private-config';
import type { ClinicalActor, ClinicalPrepareRequest, ClinicalExpected } from '@/types/clinical';
import { openClinicalVersion, sealClinicalVersion } from '../../../scripts/lib/clinical-crypto.mjs';
import { clinicalNeonStore } from '../../../scripts/lib/clinical-neon-store.mjs';
import { CLINICAL_ID, assertClinicalEnvironment } from './config';
import { clinicalKeyring } from './keys';
import { assertClinicalWriteScope, clinicalCreateOnceConfigured, assertClinicalCreateOnceFee, assertClinicalCreateOnceSavedFee, CLINICAL_PATIENT_DEMO_MAX_OPERATIONS, type ClinicalCreateOncePolicy } from './create-once';
import { createClinicalWebChain, assertClinicalUnsigned, assertClinicalSavedEnvelope, sponsorClinicalSignature, deriveClinicalEntryId, type ClinicalSavedEnvelope } from './chain';
import { assertClinicalOwner } from './identity';
import { clinicalPreparedOperation } from './history';
import { clinicalDoctorContext } from './doctor-context';
import { clinicalPrescriptionReference } from './prescriptions';
import { clinicalNote, clinicalInput } from './input';
import { validateNewClinicalFile } from './file-validation';
import { clinicalWebFeeQuote } from '../../../scripts/lib/clinical-web-fee-policy.mjs';
import { clinicalRehearsalStep, assertClinicalRehearsalExpected, assertClinicalRehearsalOrder, assertClinicalRehearsalFee, assertClinicalRehearsalAuthorization } from './rehearsal';
import { traceClinicalRehearsalPhase } from './diagnostics';
import { assertClinicalRehearsalBudget } from './rehearsal-budget';
import { assertDraftPublication, markDraftPrepared } from './drafts';
import { assertClinicalSponsorshipConfigured, reserveClinicalSponsorship, assertClinicalSponsorshipSign, bindClinicalSponsorshipSubmission, cancelClinicalSponsorship, cancelExpiredNeverSubmittedSponsorship, reconcileClinicalSponsorship } from './sponsorship';
import { captureAction, captureOperationId, captureRequestId, assertClinicalCaptureInput, assertClinicalCaptureExpected, assertClinicalCapturePdf, type ClinicalCapturePlan } from './capture';

type Row = Record<string, any>;
const chain = () => createClinicalWebChain();
const contextFor = (e: ClinicalExpected) => ({ schemaVersion: 1, network: 'testnet', contractId: CLINICAL_ID,
  historyId: e.historyId, entryId: e.entryId!, author: e.author!, patient: e.patient,
  version: e.expectedVersion!+1, previousCommitment: e.previousCommitment ?? null });
const methods = { create_history: 'create_history', append_version: 'append_version', set_permissions: 'set_permissions' };
const captureDenied = () => new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
const captureOrderConflict = () => new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
type CapturePolicy = Extract<ClinicalCreateOncePolicy, { mode: 'capture' }>;

function assertCaptureRow(plan: ClinicalCapturePlan, actor: ClinicalActor, row: Row, action: ClinicalPrepareRequest['action'],
  requestId = captureRequestId(plan, action)) {
  if (!row || row.id !== requestId || row.actor_user_id !== actor.userId ||
      row.wallet_id !== actor.walletId || row.source_wallet !== actor.address || row.action !== action ||
      row.network !== 'testnet' || row.contract_id !== CLINICAL_ID || row.method !== methods[action]) throw captureDenied();
  assertClinicalCaptureExpected(plan, actor, action, row.expected, requestId);
}

function assertCaptureDocument(plan: ClinicalCapturePlan, row: Row, kind: 'note' | 'pdf' | 'correction') {
  const e: ClinicalExpected = row.expected;
  const correction = plan.continuation?.correction;
  const entryId = kind === 'correction' ? correction?.entryId : deriveClinicalEntryId(e.historyId, plan.doctor.address, e.operationId);
  if (!entryId || e.entryId !== entryId) throw captureDenied();
  const document = openClinicalVersion({ envelope: row.prepared_envelope, expectedContext: contextFor(e),
    expectedCommitment: e.commitment, keyring: clinicalKeyring().keyring });
  try {
    if (kind === 'pdf') {
      assertClinicalCapturePdf(plan, document.metadata.fileName, document.metadata.mediaType, document.content);
      return;
    }
    const note = kind === 'correction' ? correction?.note : plan.note;
    if (!note) throw captureDenied();
    const expected = Buffer.from(JSON.stringify(note), 'utf8');
    try {
      if (document.metadata.mediaType !== 'application/json' || document.metadata.fileName !== 'antecedente.json' ||
          Buffer.compare(document.content, expected) !== 0) throw captureDenied();
    } finally { expected.fill(0); }
  } finally { document.content.fill(0); }
}

async function assertCaptureContinuationOrder(client: PoolClient, plan: ClinicalCapturePlan, action: 'append_version' | 'set_permissions') {
  const continuation = plan.continuation;
  if (!continuation || !plan.pdfRequestId || !plan.grantTransactionHash || !plan.noteTransactionHash) throw captureOrderConflict();
  const { correction, revocation, pdfTransactionHash } = continuation;
  const ids = [plan.grantRequestId, plan.noteRequestId, plan.pdfRequestId, correction.requestId, revocation.requestId];
  const rows = (await client.query('SELECT * FROM clinical_web_operations WHERE id=ANY($1::uuid[])', [ids])).rows;
  const byId = new Map<string, Row>(rows.map(row => [row.id, row]));
  if (rows.length !== byId.size || rows.some(row => !ids.includes(row.id))) throw captureOrderConflict();

  const grant = byId.get(plan.grantRequestId);
  const note = byId.get(plan.noteRequestId);
  const pdf = byId.get(plan.pdfRequestId);
  if (grant?.state !== 'confirmed' || grant.transaction_hash !== plan.grantTransactionHash ||
      note?.state !== 'confirmed' || note.transaction_hash !== plan.noteTransactionHash ||
      pdf?.state !== 'confirmed' || pdf.transaction_hash !== pdfTransactionHash) throw captureOrderConflict();
  assertCaptureRow(plan, plan.patient, grant, 'set_permissions', plan.grantRequestId);
  assertCaptureRow(plan, plan.doctor, note, 'append_version', plan.noteRequestId);
  assertCaptureRow(plan, plan.doctor, pdf, 'append_version', plan.pdfRequestId);
  if (note.expected.entryId !== correction.entryId || note.expected.commitment !== correction.previousCommitment ||
      pdf.expected.entryId === correction.entryId) throw captureOrderConflict();
  const operationIds = [grant.expected.operationId, note.expected.operationId, pdf.expected.operationId, correction.operationId, revocation.operationId];
  if (new Set(operationIds).size !== operationIds.length || operationIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) throw captureOrderConflict();
  assertCaptureDocument(plan, note, 'note');
  assertCaptureDocument(plan, pdf, 'pdf');

  if (action === 'append_version') {
    if (byId.has(revocation.requestId)) throw captureOrderConflict();
    return;
  }
  const corrected = byId.get(correction.requestId);
  if (corrected?.state !== 'confirmed' || !/^[a-f0-9]{64}$/.test(corrected.transaction_hash ?? '') ||
      /^0+$/.test(corrected.transaction_hash) || [grant.transaction_hash, note.transaction_hash, pdf.transaction_hash].includes(corrected.transaction_hash)) throw captureOrderConflict();
  assertCaptureRow(plan, plan.doctor, corrected, 'append_version', correction.requestId);
  assertCaptureDocument(plan, corrected, 'correction');
}

async function assertCaptureQuota(client: PoolClient, policy: CapturePolicy, requestId: string, mustExist: boolean) {
  const { plan, wallet } = policy;
  const action = captureAction(plan, wallet);
  if (!action || requestId !== captureRequestId(plan, action)) throw captureDenied();
  if (plan.continuation) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`clinical-capture:${plan.historyId}`]);
  }
  const rows = (await client.query(`SELECT id FROM clinical_web_operations WHERE source_wallet=$1
    AND contract_id=$2 AND network='testnet' AND action=$3 AND expected->>'historyId'=$4`,
    [wallet, CLINICAL_ID, action, plan.historyId])).rows;
  const priorIds = plan.continuation
    ? action === 'append_version' ? [plan.noteRequestId, plan.pdfRequestId] : [plan.grantRequestId]
    : plan.pdf ? [plan.noteRequestId] : [];
  if (rows.some(row => row.id !== requestId && !priorIds.includes(row.id)) ||
      (mustExist && !rows.some(row => row.id === requestId))) throw captureOrderConflict();
  if (plan.continuation) return assertCaptureContinuationOrder(client, plan, action);
  if (action === 'append_version') {
    const grant = (await client.query('SELECT * FROM clinical_web_operations WHERE id=$1', [plan.grantRequestId])).rows[0];
    if (grant?.state !== 'confirmed' || !/^[a-f0-9]{64}$/.test(grant.transaction_hash ?? '') ||
        (plan.pdf && grant.transaction_hash !== plan.grantTransactionHash)) throw captureOrderConflict();
    assertCaptureRow(plan, plan.patient, grant, 'set_permissions');
    if (plan.pdf) {
      const note = (await client.query('SELECT * FROM clinical_web_operations WHERE id=$1', [plan.noteRequestId])).rows[0];
      if (note?.state !== 'confirmed' || note.transaction_hash !== plan.noteTransactionHash) throw captureOrderConflict();
      assertCaptureRow(plan, plan.doctor, note, 'append_version', plan.noteRequestId);
      assertCaptureDocument(plan, note, 'note');
    }
  }
}

async function assertCaptureAuthorization(policy: ClinicalCreateOncePolicy | null, reader: ReturnType<typeof createClinicalWebChain>) {
  if (policy?.mode !== 'capture') return;
  const observed = await reader.doctorAuthorization(policy.plan.doctor.address);
  if (observed.version !== 1 || observed.validUntil !== policy.plan.doctorValidUntil ||
      observed.validUntil <= Math.floor(Date.now() / 1000) || observed.revoked) throw captureOrderConflict();
  if (policy.plan.continuation) {
    const grant = await reader.grant(policy.plan.historyId, policy.plan.doctor.address);
    if (grant?.revision !== 1 || grant.canRead !== true || grant.canAppend !== true) throw captureOrderConflict();
  }
}

async function assertScopedOwner(client: PoolClient, policy: ClinicalCreateOncePolicy | null, actor: ClinicalActor, row: Row) {
  if (policy?.mode === 'rehearsal') { await rehearsalStored(client, policy, actor, row); return; }
  if (policy?.mode === 'capture') {
    const action = captureAction(policy.plan, actor.address);
    if (!action) throw captureDenied();
    assertCaptureRow(policy.plan, actor, row, action);
    if (action === 'append_version') {
      const kind = policy.plan.continuation ? 'correction' : policy.plan.pdf ? 'pdf' : 'note';
      assertCaptureDocument(policy.plan, row, kind);
    }
    return;
  }
  if (policy && row.action === 'append_version' && row.expected.patient !== actor.address) {
    throw new PrivateFlowError('clinical_access_denied', 403);
  }
}
/** Called while holding the same wallet transaction lock as preparation/signing. */
async function assertCreateOnceQuota(client: PoolClient, policy: ClinicalCreateOncePolicy | null, requestId: string, mustExist = false) {
  if (!policy || policy.mode === 'rehearsal') return;
  if (policy.mode === 'capture') return assertCaptureQuota(client, policy, requestId, mustExist);
  const rows = (await client.query("SELECT id FROM clinical_web_operations WHERE source_wallet=$1 AND contract_id=$2 AND network='testnet'", [policy.wallet, CLINICAL_ID])).rows;
  if (policy.mode === 'patient_demo') {
    const saved = rows.some(row => row.id === requestId);
    if (mustExist && !saved) throw new PrivateFlowError('clinical_operation_not_found', 404);
    // Every persisted slot counts, including cancelled/failed operations. The
    // wallet lock makes this check atomic with INSERT. Existing UUIDs keep
    // their slot for signing and reconciliation even at the quota boundary.
    if (!saved && rows.length >= CLINICAL_PATIENT_DEMO_MAX_OPERATIONS) throw new PrivateFlowError('clinical_patient_demo_quota_exceeded', 409);
    return;
  }
  if (rows.length > 1 || (mustExist && rows.length !== 1) || rows.some(row => row.id !== requestId)) {
    throw new PrivateFlowError('clinical_create_once_already_used', 409);
  }
}

async function rehearsalStored(client: PoolClient, policy: Extract<ClinicalCreateOncePolicy, { mode: 'rehearsal' }>, actor: ClinicalActor, row: Row) {
  const step = policy.plan.steps.find(value => value.requestId === row.id);
  if (!step?.input) throw new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
  let input = clinicalInput({ ...step.input, ...(step.key === 'revoke' ? { expectedRevision: row.expected.expectedRevision } : {}) });
  clinicalRehearsalStep(policy.plan, actor, input);
  if (row.actor_user_id !== actor.userId || row.wallet_id !== actor.walletId || row.source_wallet !== actor.address ||
      row.contract_id !== CLINICAL_ID || row.network !== 'testnet' || row.action !== input.action) throw new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
  assertClinicalRehearsalExpected(policy.plan, step, actor, row.expected);
  if (fingerprint(input, row.request_fingerprint) !== row.request_fingerprint) {
    // New draft-backed intents include the exact draft UUID/revision in their HMAC.
    // Recover those fields exclusively from the immutable server publication link.
    const drafts = (await client.query(
      "SELECT id,revision,owner_user_id,wallet_id,author_wallet,contract_id,network,history_id,patient_wallet,publication_request_id,deleted_at FROM clinical_private_drafts WHERE publication_request_id=$1 AND owner_user_id=$2 AND wallet_id=$3 AND author_wallet=$4 AND contract_id=$5 AND network=$6 LIMIT 2 FOR UPDATE",
      [row.id, actor.userId, actor.walletId, actor.address, CLINICAL_ID, 'testnet'])).rows;
    if (drafts.length !== 1) throw new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
    const draft = drafts[0];
    if (draft.owner_user_id !== actor.userId || draft.wallet_id !== actor.walletId || draft.author_wallet !== actor.address ||
        draft.contract_id !== CLINICAL_ID || draft.network !== 'testnet' || draft.history_id !== row.expected.historyId ||
        draft.patient_wallet !== row.expected.patient || draft.publication_request_id !== row.id || draft.deleted_at !== null) throw new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
    input = clinicalInput({ ...input, draftId: draft.id, draftRevision: draft.revision });
    clinicalRehearsalStep(policy.plan, actor, input);
    if (fingerprint(input, row.request_fingerprint) !== row.request_fingerprint) throw new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
    await verifyDraft(client, actor, input, row.expected);
  }
  if (input.action === 'append_version') {
    const document = openClinicalVersion({ envelope: row.prepared_envelope, expectedContext: contextFor(row.expected),
      expectedCommitment: row.expected.commitment, keyring: clinicalKeyring().keyring });
    try {
      const expectedBytes = input.note ? Buffer.from(JSON.stringify(input.note), 'utf8') : Buffer.from(input.file!.base64, 'base64');
      try {
        if (!Buffer.from(document.content).equals(expectedBytes) ||
            document.metadata.mediaType !== (input.note ? 'application/json' : input.file!.mediaType) ||
            document.metadata.fileName !== (input.note ? 'antecedente.json' : input.file!.fileName)) throw new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
      } finally { expectedBytes.fill(0); }
    } finally { document.content.fill(0); }
  }
  return step;
}


async function rehearsalGate(client: PoolClient, policy: Extract<ClinicalCreateOncePolicy, { mode: 'rehearsal' }>, actor: ClinicalActor, step: ReturnType<typeof clinicalRehearsalStep>, mustExist = false, requestChain?: ReturnType<typeof createClinicalWebChain>) {
  await assertClinicalRehearsalOrder(client, policy.plan, step, mustExist);
  // Emergency withdrawal reduces access even after an external registry change.
  if (step.key === 'revoke') return;
  const [request] = (await client.query("SELECT commitment FROM doctor_authorization_requests WHERE id=$1 AND state='confirmed'", [policy.plan.authorization.requestId])).rows;
  const observed = await (requestChain ?? chain()).doctorAuthorization(policy.plan.doctor.address);
  assertClinicalRehearsalAuthorization(policy.plan, observed, request?.commitment);
}

function fingerprint(input: ClinicalPrepareRequest, saved?: string) {
  const keys = clinicalKeyring();
  const keyId = saved ? saved.slice(0, saved.lastIndexOf(':')) : keys.activeKeyId;
  if (!Object.hasOwn(keys.keyring, keyId)) throw new PrivateFlowError('clinical_keys_unavailable', 503);
  const canonical = JSON.stringify({ requestId: input.requestId, action: input.action, entryId: input.entryId,
    expectedVersion: input.expectedVersion, note: input.note, file: input.file, doctorId: input.doctorId,
    canRead: input.canRead, canAppend: input.canAppend, expectedRevision: input.expectedRevision, ...(input.historyId ? { historyId: input.historyId } : {}),
    ...(input.draftId ? { draftId: input.draftId, draftRevision: input.draftRevision } : {}) });
  return `${keyId}:${createHmac('sha256', Buffer.from(keys.keyring[keyId], 'hex')).update(canonical).digest('hex')}`;
}

async function locked<T>(actor: ClinicalActor, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDbConnection();
  try { await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`private-user:${actor.address}`]);
    const result = await work(client); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function ownHistory(client: PoolClient, actor: ClinicalActor) {
  const row = (await client.query("SELECT * FROM clinical_web_histories WHERE owner_user_id=$1 AND contract_id=$2 AND network='testnet'", [actor.userId, CLINICAL_ID])).rows[0];
  if (!row) throw new PrivateFlowError('clinical_history_required', 409);
  assertClinicalOwner(row, actor);
  const live = await chain().history(row.history_id);
  if (!live || live.patient !== actor.address || live.id !== row.history_id) throw new PrivateFlowError('clinical_history_unavailable', 503);
  return row;
}
async function operation(client: PoolClient, actor: ClinicalActor, id: string): Promise<Row> {
  const row = (await client.query('SELECT * FROM clinical_web_operations WHERE id=$1 AND actor_user_id=$2 AND contract_id=$3 FOR UPDATE', [id, actor.userId, CLINICAL_ID])).rows[0];
  if (!row || row.wallet_id !== actor.walletId || row.source_wallet !== actor.address) throw new PrivateFlowError('clinical_operation_not_found', 404);
  return row;
}
/** Recheck current doctor identity and the exact saved permission revision. */
async function doctorAppendContext(user: AuthedUser | undefined, actor: ClinicalActor, e: ClinicalExpected, requestChain?: ReturnType<typeof createClinicalWebChain>) {
  if (!user || e.author !== actor.address || e.patient === actor.address) throw new PrivateFlowError('clinical_access_denied', 403);
  const c = requestChain ?? chain();
  const context = await clinicalDoctorContext(user, actor, e.historyId, c);
  if (!context.canAppend || context.grantRevision !== e.expectedGrantRevision) throw new PrivateFlowError('clinical_permission_conflict', 403);
  const history = await c.history(e.historyId);
  if (!history || history.patient !== e.patient) throw new PrivateFlowError('clinical_identity_changed', 403);
  return context;
}
/** Link identifiers remain encrypted in the payload and covered by its commitment.
 * Rechecking a stored note prevents a later signature/retry from using stale RX access. */
async function checkSavedPrescription(user: AuthedUser | undefined, actor: ClinicalActor, row: Row) {
  if (row.action !== 'append_version') return;
  const document = openClinicalVersion({ envelope: row.prepared_envelope, expectedContext: contextFor(row.expected),
    expectedCommitment: row.expected.commitment, keyring: clinicalKeyring().keyring });
  try {
    if (document.metadata.mediaType === 'application/json') {
      const note = clinicalNote(JSON.parse(Buffer.from(document.content).toString('utf8')));
      if (note.prescriptionId) {
        if (!user) throw new PrivateFlowError('clinical_access_denied', 403);
        await clinicalPrescriptionReference(user, actor, row.expected.patient, note.prescriptionId);
      }
    }
  } finally { document.content.fill(0); }
}
async function eligible(actor: ClinicalActor, row: Row, replay = false, user?: AuthedUser, requestChain?: ReturnType<typeof createClinicalWebChain>) {
  const e: ClinicalExpected = row.expected;
  const medical = row.action === 'append_version' && e.patient !== actor.address;
  if (row.contract_id !== CLINICAL_ID || row.method !== methods[row.action as keyof typeof methods] ||
      (medical ? e.author !== actor.address : e.patient !== actor.address)) throw new PrivateFlowError('clinical_saved_intent_invalid', 503);
  const c = requestChain ?? chain(); await c.verifyDeployment();
  if (row.action === 'create_history') {
    if (!replay && await c.historyForPatient(actor.address)) throw new PrivateFlowError('clinical_history_already_exists');
    return;
  }
  const history = await c.history(e.historyId);
  if (!history || history.patient !== e.patient) throw new PrivateFlowError('clinical_identity_changed', 403);
  if (row.action === 'append_version') {
    if (medical) await doctorAppendContext(user, actor, e, c);
    else if (e.expectedGrantRevision !== 0) throw new PrivateFlowError('clinical_saved_intent_invalid', 503);
    const head = await c.entry(e.historyId, e.entryId!);
    if ((head?.headVersion ?? 0) !== e.expectedVersion || (head && head.author !== actor.address) || e.author !== actor.address) throw new PrivateFlowError('clinical_version_conflict');
    await checkSavedPrescription(user, actor, row);
    if (medical) await doctorAppendContext(user, actor, e, c);
  } else {
    const grant = await c.grant(e.historyId, e.doctor!);
    if ((grant?.revision ?? 0) !== e.expectedRevision) throw new PrivateFlowError('clinical_permission_conflict');
    if (e.canRead || e.canAppend) {
      if (!Number.isSafeInteger(e.doctorId) || Number(e.doctorId) < 1) throw new PrivateFlowError('clinical_saved_intent_invalid', 503);
      const target = await resolveDoctor(getDb(), e.doctorId!);
      if (target.address !== e.doctor || target.doctor.status !== 'active' || !await c.doctorAuthorized(e.doctor!)) {
        throw new PrivateFlowError('doctor_not_authorized', 403);
      }
    }
  }
}
function draftPayload(input: ClinicalPrepareRequest) {
  return { ...(input.entryId ? { entryId: input.entryId, expectedVersion: input.expectedVersion } : {}),
    ...(input.note ? { note: input.note } : { file: input.file }) };
}
async function verifyDraft(client: PoolClient, actor: ClinicalActor, input: ClinicalPrepareRequest, expected: ClinicalExpected) {
  if (!input.draftId) return;
  if (input.action !== 'append_version' || !input.draftRevision) throw new PrivateFlowError('clinical_request_invalid', 400);
  await assertDraftPublication(client, actor, { id: input.draftId, revision: input.draftRevision, requestId: input.requestId,
    historyId: expected.historyId, patient: expected.patient, payload: draftPayload(input) });
}
export async function prepareClinicalOperation(user: AuthedUser, actor: ClinicalActor, input: ClinicalPrepareRequest) {
  const policy = assertClinicalWriteScope(input.action, actor.address); clinicalKeyring();
  const rehearsal = policy?.mode === 'rehearsal' ? clinicalRehearsalStep(policy.plan, actor, input) : null;
  if (policy?.mode === 'capture') assertClinicalCaptureInput(policy.plan, actor, input);
  assertClinicalSponsorshipConfigured();
  if (input.historyId && (input.action !== 'append_version' || policy && policy.mode !== 'rehearsal' && policy.mode !== 'capture')) throw new PrivateFlowError('clinical_access_denied', 403);
  return locked(actor, async client => {
    if (rehearsal && policy?.mode === 'rehearsal') await rehearsalGate(client, policy, actor, rehearsal);
    await assertCreateOnceQuota(client, policy, input.requestId);
    const existing = (await client.query('SELECT * FROM clinical_web_operations WHERE id=$1 FOR UPDATE', [input.requestId])).rows[0];
    if (existing) {
      if (existing.actor_user_id !== actor.userId || existing.wallet_id !== actor.walletId || existing.source_wallet !== actor.address || existing.action !== input.action || existing.contract_id !== CLINICAL_ID) throw new PrivateFlowError('clinical_request_conflict');
      const expected = Buffer.from(fingerprint(input, existing.request_fingerprint)), actual = Buffer.from(existing.request_fingerprint ?? '');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new PrivateFlowError('clinical_request_conflict');
      // A repeated id names its first intent, never a replacement payload.
      await assertScopedOwner(client, policy, actor, existing);
      await verifyDraft(client, actor, input, existing.expected);
      assertClinicalCreateOnceSavedFee(policy, existing.unsigned_xdr, existing.id);
      return { operation: await clinicalPreparedOperation(actor, existing, client) };
    }
    if (input.file) await validateNewClinicalFile(input.file);
    await client.query("UPDATE clinical_web_operations SET state='cancelled',error_code='signature_request_expired',updated_at=NOW() WHERE source_wallet=$1 AND state='awaiting_signature' AND signed_xdr IS NULL AND expires_at<=EXTRACT(EPOCH FROM NOW())", [actor.address]);
    for (const table of ['private_operations', 'clinical_transaction_attempts', 'clinical_web_operations']) {
      if ((await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`])).rows[0]?.relation) {
        const states = table === 'clinical_transaction_attempts' ? "'prepared','submitted'" : "'awaiting_signature','submitted'";
        if ((await client.query(`SELECT 1 FROM ${table} WHERE source_wallet=$1 AND state IN (${states}) LIMIT 1`, [actor.address])).rows.length) throw new PrivateFlowError('another_operation_pending');
      }
    }
    const c = chain(); await c.verifyDeployment();
    await assertCaptureAuthorization(policy, c);
    let e: ClinicalExpected; let envelope: unknown = null;
    const captureNonce = policy?.mode === 'capture' ? captureOperationId(policy.plan, input.action) : undefined;
    const operationId = rehearsal?.operationId ?? captureNonce ?? randomBytes(32).toString('hex');
    if (input.action === 'create_history') {
      if ((await client.query('SELECT 1 FROM clinical_web_histories WHERE owner_user_id=$1 AND contract_id=$2', [user.userId, CLINICAL_ID])).rows.length || await c.historyForPatient(actor.address)) throw new PrivateFlowError('clinical_history_already_exists');
      e = { historyId: await c.deriveHistoryId(actor.address), patient: actor.address, operationId };
    } else {
      if (input.historyId) {
        const context = await clinicalDoctorContext(user, actor, input.historyId, c);
        if (!context.canAppend) throw new PrivateFlowError('clinical_access_denied', 403);
        const history = await c.history(input.historyId);
        if (!history || history.patient === actor.address) throw new PrivateFlowError('clinical_access_denied', 403);
        e = { historyId: input.historyId, patient: history.patient, operationId,
          expectedGrantRevision: context.grantRevision };
      } else {
        const h = await ownHistory(client, actor);
        e = { historyId: h.history_id, patient: actor.address, operationId };
      }
      if (input.action === 'append_version') {
        const entryId = input.entryId ?? await c.deriveEntryId(e.historyId, actor.address, operationId);
        const head = await c.entry(e.historyId, entryId), expectedVersion = input.expectedVersion ?? 0;
        if ((head?.headVersion ?? 0) !== expectedVersion || (head && head.author !== actor.address)) throw new PrivateFlowError('clinical_version_conflict');
        const previous = expectedVersion ? await c.version(e.historyId, entryId, expectedVersion) : null;
        e = { ...e, entryId, author: actor.address, expectedVersion, expectedGrantRevision: e.expectedGrantRevision ?? 0, previousCommitment: previous?.commitment ?? null };
        if (input.note?.prescriptionId) await clinicalPrescriptionReference(user, actor, e.patient, input.note.prescriptionId);
        const content = input.note ? Buffer.from(JSON.stringify(input.note), 'utf8') : Buffer.from(input.file!.base64, 'base64');
        const metadata = input.note ? { mediaType: 'application/json', fileName: 'antecedente.json' } : { mediaType: input.file!.mediaType, fileName: input.file!.fileName };
        const sealed = sealClinicalVersion({ context: contextFor(e), content, metadata, ...clinicalKeyring() });
        e.commitment = sealed.commitment; envelope = sealed.envelope;
        content.fill(0);
      } else {
        const d = await resolveDoctor(getDb(), input.doctorId!);
        const grant = await c.grant(e.historyId, d.address);
        if ((grant?.revision ?? 0) !== input.expectedRevision) throw new PrivateFlowError('clinical_permission_conflict');
        if ((input.canRead || input.canAppend) && (d.doctor.status !== 'active' || !await c.doctorAuthorized(d.address))) throw new PrivateFlowError('doctor_not_authorized', 403);
        e = { ...e, doctorId: input.doctorId!, doctor: d.address, canRead: input.canRead!, canAppend: input.canAppend!, expectedRevision: input.expectedRevision! };
      }
    }
    await verifyDraft(client, actor, input, e);
    if (rehearsal && policy?.mode === 'rehearsal') assertClinicalRehearsalExpected(policy.plan, rehearsal, actor, e);
    if (policy?.mode === 'capture') assertClinicalCaptureExpected(policy.plan, actor, input.action, e);
    const scopeUntil = policy?.mode === 'rehearsal' || policy?.mode === 'capture' ? policy.until : undefined;
    const tx = await traceClinicalRehearsalPhase(policy, 'prepare_chain', () => c.prepare(actor.address, input.action, e, scopeUntil));
    await traceClinicalRehearsalPhase(policy, 'prepare_recheck', async () => {
      if (input.historyId) await doctorAppendContext(user, actor, e, c);
      if (input.note?.prescriptionId) await clinicalPrescriptionReference(user, actor, e.patient, input.note.prescriptionId);
      await assertCaptureAuthorization(policy, c);
      assertClinicalCreateOnceFee(policy, tx, input.requestId);
      if (rehearsal && policy?.mode === 'rehearsal') {
        assertClinicalRehearsalFee(policy.plan, rehearsal, tx, clinicalWebFeeQuote(tx).sponsored);
        await assertClinicalRehearsalBudget(client, policy.plan, rehearsal, tx, e, hash => c.receipt(hash));
      }
    });
    await reserveClinicalSponsorship(actor, input.requestId, input.action, e, tx, client);
    const row = await traceClinicalRehearsalPhase(policy, 'prepare_save', async () => (await client.query(`INSERT INTO clinical_web_operations
      (id,actor_user_id,wallet_id,source_wallet,action,contract_id,method,expected,prepared_envelope,state,unsigned_xdr,signing_hash,expires_at,request_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'awaiting_signature',$10,$11,$12,$13) RETURNING *`,
      [input.requestId, user.userId, actor.walletId, actor.address, input.action, CLINICAL_ID, methods[input.action], JSON.stringify(e), envelope ? JSON.stringify(envelope) : null, tx.toXDR(), tx.hash().toString('hex'), Number(tx.timeBounds!.maxTime), fingerprint(input)])).rows[0]);
    if (input.draftId) await markDraftPrepared(client, actor, input.draftId, input.draftRevision!, input.requestId);
    return { operation: await clinicalPreparedOperation(actor, row, client) };
  });
}
export async function signClinicalOperation(user: AuthedUser, actor: ClinicalActor, id: string, signature: string) {
  assertClinicalEnvironment(!clinicalCreateOnceConfigured());
  const requestChain = chain(); // One reader for this HTTP request; all grants and identities remain fresh.
  await locked(actor, async client => {
    const row = await operation(client, actor, id);
    const policy = assertClinicalWriteScope(row.action, actor.address);
    await assertScopedOwner(client, policy, actor, row);
    await assertCreateOnceQuota(client, policy, id, true);
    if (policy?.mode === 'rehearsal') {
      const step = await rehearsalStored(client, policy, actor, row);
      await traceClinicalRehearsalPhase(policy, 'sign_policy', () => rehearsalGate(client, policy, actor, step, true, requestChain));
    }
    if (row.state !== 'awaiting_signature') return;
    if (Number(row.expires_at) <= Date.now()/1000) throw new PrivateFlowError('signature_request_expired');
    const unsigned = TransactionBuilder.fromXDR(row.unsigned_xdr, Networks.TESTNET);
    if (!(unsigned instanceof Transaction) || unsigned.hash().toString('hex') !== row.signing_hash || Number(unsigned.timeBounds?.maxTime) !== Number(row.expires_at)) throw new PrivateFlowError('clinical_saved_intent_invalid', 503);
    assertClinicalUnsigned(unsigned, actor.address, row.action, row.expected);
    await assertCaptureAuthorization(policy, requestChain);
    await traceClinicalRehearsalPhase(policy, 'sign_eligibility', () => eligible(actor, row, false, user, requestChain));
    await assertClinicalSponsorshipSign(actor, row);
    const sponsored = await traceClinicalRehearsalPhase(policy, 'sign_validation', async () => {
      assertClinicalCreateOnceFee(policy, unsigned, row.id);
      if (policy?.mode === 'rehearsal') {
        const step = await rehearsalStored(client, policy, actor, row);
        assertClinicalRehearsalFee(policy.plan, step, unsigned, clinicalWebFeeQuote(unsigned).sponsored);
        await assertClinicalRehearsalBudget(client, policy.plan, step, unsigned, row.expected, hash => requestChain.receipt(hash));
      }
      // The browser signs with the author's existing Privy wallet. All intent
      // fields come from this locked row; the client supplies only the signature.
      return sponsorClinicalSignature(row.unsigned_xdr, actor.address, signature, row.action, row.expected);
    });
    await traceClinicalRehearsalPhase(policy, 'sign_save', () => client.query("UPDATE clinical_web_operations SET signed_xdr=$2,transaction_hash=$3,state='submitted',updated_at=clock_timestamp() WHERE id=$1 AND state='awaiting_signature'", [id, sponsored.xdr, sponsored.hash]));
  });
  // Persisted first; a response lost after this point recovers this exact envelope.
  return reconcileClinicalOperation(actor, id, true, user, requestChain);
}
export async function reconcileClinicalOperation(actor: ClinicalActor, id: string, retry = false, user?: AuthedUser, requestChain?: ReturnType<typeof createClinicalWebChain>) {
  assertClinicalEnvironment();
  const c = requestChain ?? chain(); // A separate GET/retry always creates a new reader.
  return locked(actor, async client => {
    let row = await operation(client, actor, id);
    if (retry && clinicalCreateOnceConfigured()) {
      const policy = assertClinicalWriteScope(row.action, actor.address);
    await assertScopedOwner(client, policy, actor, row);
      await assertCreateOnceQuota(client, policy, id, true);
      assertClinicalCreateOnceSavedFee(policy, row.unsigned_xdr, row.id);
    }
    if (row.state === 'awaiting_signature' && Number(row.expires_at) <= Date.now()/1000) {
      await cancelClinicalSponsorship(actor, row);
      row = (await client.query("UPDATE clinical_web_operations SET state='cancelled',error_code='signature_request_expired',updated_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0];
    }
    if (row.state !== 'submitted') return { operation: await clinicalPreparedOperation(actor, row, client) };
    // Audit the saved payer signature independently of current relayer secrets.
    // Rotating a payer must not hide an already executed exact receipt.
    assertClinicalSavedEnvelope(row as ClinicalSavedEnvelope, { historical: true });
    const receipt = await c.receipt(row.transaction_hash);
    if (receipt.status === 'SUCCESS' || receipt.status === 'FAILED') {
      if (!receipt.envelopeXdr || receipt.envelopeXdr.toXDR('base64') !== row.signed_xdr) throw new PrivateFlowError('clinical_receipt_mismatch', 503);
    }
    // Some RPC backends return this SDK-number field as a decimal string.
    // Normalize only canonical positive integers; missing/malformed/unsafe values fail closed.
    const closeTime = typeof receipt.latestLedgerCloseTime === 'string' && /^[1-9][0-9]{0,15}$/.test(receipt.latestLedgerCloseTime)
      ? Number(receipt.latestLedgerCloseTime) : receipt.latestLedgerCloseTime;
    if (receipt.status === 'NOT_FOUND' && Number(row.expires_at) + 60 <= Date.now()/1000 &&
        Number.isSafeInteger(receipt.latestLedger) && receipt.latestLedger > 0 &&
        Number.isSafeInteger(closeTime) && Number(closeTime) >= Number(row.expires_at) + 60) {
      let recoverySavepoint = false;
      try {
        console.info('[clinical-expired-recovery] absence_start');
        const absent = await c.expiredOperationAbsent(row.expected, receipt.latestLedger);
        console.info('[clinical-expired-recovery] absence_verified');
        if (absent.contractId === CLINICAL_ID && absent.author === row.source_wallet && absent.operationId === row.expected.operationId &&
            absent.observedLedger >= receipt.latestLedger) {
          await client.query('SAVEPOINT clinical_expired_recovery'); recoverySavepoint = true;
          const released = await cancelExpiredNeverSubmittedSponsorship(actor, row, client);
          console.info('[clinical-expired-recovery] reserve_' + (released ? 'released' : 'retained'));
          if (released) {
          row = (await client.query("UPDATE clinical_web_operations SET state='failed',error_code='signed_expired_before_submission',updated_at=clock_timestamp() WHERE id=$1 AND state='submitted' RETURNING *", [id])).rows[0];
          await client.query('RELEASE SAVEPOINT clinical_expired_recovery'); recoverySavepoint = false;
          return { operation: await clinicalPreparedOperation(actor, row, client) };
          }
          await client.query('RELEASE SAVEPOINT clinical_expired_recovery'); recoverySavepoint = false;
        }
      } catch (error) {
        const code = error instanceof PrivateFlowError && /^[a-z0-9_]{1,80}$/.test(error.message) ? error.message : 'proof_unavailable';
        console.warn('[clinical-expired-recovery] ' + code);
        if (recoverySavepoint) { await client.query('ROLLBACK TO SAVEPOINT clinical_expired_recovery'); await client.query('RELEASE SAVEPOINT clinical_expired_recovery'); }
        // Unavailable, stale or ambiguous proof keeps the original envelope and full reserve.
      }
    }
    if (receipt.status === 'SUCCESS' || receipt.status === 'FAILED') await reconcileClinicalSponsorship(actor, row, receipt);
    if (receipt.status === 'SUCCESS') {
      await c.verifyDeployment(); const e: ClinicalExpected = row.expected;
      if (row.action === 'create_history') {
        const history = await c.history(e.historyId);
        if (!history || history.patient !== actor.address || history.id !== e.historyId) throw new PrivateFlowError('clinical_receipt_mismatch', 503);
        await client.query(`INSERT INTO clinical_web_histories(history_id,owner_user_id,wallet_id,patient_wallet,contract_id,network,transaction_hash)
          VALUES($1,$2,$3,$4,$5,'testnet',$6) ON CONFLICT DO NOTHING`, [e.historyId, actor.userId, actor.walletId, actor.address, CLINICAL_ID, row.transaction_hash]);
        const saved = (await client.query('SELECT * FROM clinical_web_histories WHERE history_id=$1', [e.historyId])).rows[0];
        assertClinicalOwner(saved, actor);
      } else if (row.action === 'append_version') {
        const version = await c.version(e.historyId, e.entryId!, e.expectedVersion!+1);
        const expectedContext = contextFor(e);
        if (!version || version.commitment !== e.commitment || Object.entries(expectedContext).some(([key, value]) => version.context[key as keyof typeof version.context] !== value)) throw new PrivateFlowError('clinical_receipt_mismatch', 503);
        // The reusable store owns a transaction. Savepoints keep the outer wallet
        // lock and the operation + confirmed version atomic until our final COMMIT.
        const store = clinicalNeonStore({ query: (sql: string, values?: unknown[]) =>
          client.query(sql === 'BEGIN' ? 'SAVEPOINT clinical_storage' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT clinical_storage' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT clinical_storage' : sql, values) });
        await store.stageVersion({ context: contextFor(e), envelope: row.prepared_envelope, commitment: e.commitment, operationId: e.operationId });
        await store.confirmVersion({ context: expectedContext, commitment: e.commitment, operationId: e.operationId, receipt: {
          status: 'SUCCESS', network: 'testnet', contractId: CLINICAL_ID, context: expectedContext,
          commitment: e.commitment, operationId: e.operationId, transactionHash: row.transaction_hash,
        } });
      }
      // The exact saved fee-bump receipt proves a historical grant; current permissions are read independently.
      row = (await client.query("UPDATE clinical_web_operations SET state='confirmed',error_code=NULL,confirmed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0];
    } else if (receipt.status === 'FAILED') {
      row = (await client.query("UPDATE clinical_web_operations SET state='failed',error_code='transaction_failed',updated_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0];
    } else if (retry && receipt.status === 'NOT_FOUND' && Number(row.expires_at) > Date.now()/1000 && (process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'true' || clinicalCreateOnceConfigured())) {
      const policy = assertClinicalWriteScope(row.action, actor.address);
    await assertScopedOwner(client, policy, actor, row);
      await assertCreateOnceQuota(client, policy, id, true);
      assertClinicalCreateOnceSavedFee(policy, row.unsigned_xdr, row.id);
      if (policy?.mode === 'rehearsal') await rehearsalGate(client, policy, actor, await rehearsalStored(client, policy, actor, row), true, c);
      if (!policy) assertPrivateWrites();
      try {
        await assertCaptureAuthorization(policy, c);
        await eligible(actor, row, true, user, c);
      }
      catch { return { operation: { ...(await clinicalPreparedOperation(actor, row, client)), errorCode: 'clinical_retry_unavailable' } }; }
      // No new preparation, signing, fee bump or hash. Uncertainty retains the saved attempt.
      try {
        assertClinicalSavedEnvelope(row as ClinicalSavedEnvelope); assertClinicalCreateOnceSavedFee(policy, row.unsigned_xdr, row.id);
        if (policy?.mode === 'rehearsal') {
          const saved = TransactionBuilder.fromXDR(row.unsigned_xdr, Networks.TESTNET);
          if (!(saved instanceof Transaction)) throw new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
          const step = await rehearsalStored(client, policy, actor, row);
          assertClinicalRehearsalFee(policy.plan, step, saved, clinicalWebFeeQuote(saved).sponsored);
          await assertClinicalRehearsalBudget(client, policy.plan, step, saved, row.expected, hash => c.receipt(hash));
        }
        await bindClinicalSponsorshipSubmission(actor, row);
        await c.submit(row.signed_xdr);
      } catch { /* Recoverable; keep submitted. */ }
    }
    return { operation: await clinicalPreparedOperation(actor, row, client) };
  });
}
export async function cancelClinicalOperation(actor: ClinicalActor, id: string) {
  return locked(actor, async client => {
    const row = await operation(client, actor, id);
    if (clinicalCreateOnceConfigured()) {
      const policy = assertClinicalWriteScope(row.action, actor.address);
      await assertScopedOwner(client, policy, actor, row);
      await assertCreateOnceQuota(client, policy, id, true);
    }
    if (row.state === 'awaiting_signature' && !row.signed_xdr) {
      await cancelClinicalSponsorship(actor, row);
      const saved = (await client.query("UPDATE clinical_web_operations SET state='cancelled',error_code='signature_cancelled',updated_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0];
      return { operation: await clinicalPreparedOperation(actor, saved, client) };
    }
    return { operation: await clinicalPreparedOperation(actor, row, client) };
  });
}
