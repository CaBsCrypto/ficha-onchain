/** Local, explicitly approved rehearsal. Ordinary private writes remain disabled. */
import { createHash } from 'node:crypto';
import { Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { clinicalSimulationIsLive } from '../../../scripts/lib/clinical-live-read.mjs';
import { clinicalWebFeeQuote } from '../../../scripts/lib/clinical-web-fee-policy.mjs';
import type { PoolClient } from '@neondatabase/serverless';
import { PrivateFlowError } from '@/lib/private-config';
import { uuid } from '@/lib/private-api';
import type { ClinicalActor, ClinicalPrepareRequest, ClinicalExpected, ClinicalSnapshot } from '@/types/clinical';
import { loadRehearsalPolicy, rehearsalConfigured, assertRehearsalActor, rehearsalStep, assertRehearsalFee, payloadHash } from '../../../scripts/lib/clinical-rehearsal-policy.mjs';
import { assertClinicalUnsigned, assertClinicalSavedEnvelope, deriveClinicalEntryId } from './chain';
import { lockClinicalRehearsalRun } from '../../../scripts/lib/clinical-rehearsal-closure.mjs';
import { CLINICAL_ID } from './config';
import { inspectPriorRehearsalRenewal } from '../../../scripts/lib/clinical-rehearsal-budget.mjs';

export { rehearsalConfigured };
export type RehearsalPolicy = NonNullable<ReturnType<typeof loadRehearsalPolicy>>;
export type RehearsalStep = RehearsalPolicy['steps'][number];
const denied = () => new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
export function rehearsalError(error: unknown): never {
  const code = error instanceof Error ? error.message : '';
  if (['clinical_rehearsal_expired', 'signature_request_expired', 'clinical_rehearsal_fee_exceeded', 'clinical_rehearsal_order_conflict'].includes(code)) throw new PrivateFlowError(code, 409);
  throw denied();
}
export function currentClinicalRehearsal(actor?: ClinicalActor): RehearsalPolicy | null {
  try {
    const policy = loadRehearsalPolicy();
    if (policy && actor) assertRehearsalActor(policy, actor);
    return policy;
  } catch (error) { return rehearsalError(error); }
}
export function clinicalRehearsalStep(policy: RehearsalPolicy, actor: ClinicalActor, input: ClinicalPrepareRequest): RehearsalStep {
  try {
    const { draftId, draftRevision, ...approvedPayload } = input;
    if (draftId !== undefined || draftRevision !== undefined) {
      if (input.action !== 'append_version' || !uuid(draftId) || draftId !== draftId.toLowerCase() ||
          !Number.isSafeInteger(draftRevision) || Number(draftRevision) < 1 || Number(draftRevision) >= 2_147_483_647) throw denied();
    }
    // These two off-chain fields are validated separately by assertDraftPublication.
    // Every clinical field and every unknown field still reaches the exact approved-payload guard.
    return rehearsalStep(policy, actor, approvedPayload);
  } catch (error) { return rehearsalError(error); }
}
export function clinicalRehearsalView(actor: ClinicalActor, historyId: string): ClinicalSnapshot['rehearsal'] {
  // An expired or removed write permit cannot hide historical reads.
  try {
    const policy = currentClinicalRehearsal(actor);
    if (!policy || policy.historyId !== historyId) return undefined;
    const role = assertRehearsalActor(policy, actor);
    const steps = policy.steps.filter(step => step.actor === role &&
      (!policy.closingContinuation || step.key === 'correct_note' || step.key === 'revoke'));
    return { runId: policy.runId, until: policy.until, ...(role === 'doctor' && policy.noteReplacement ? { signingCheck: true as const } : {}), steps: steps.map(step => {
      const input = step.input!;
      return { requestId: step.requestId, action: input.action,
        ...(input.entryId ? { entryId: input.entryId } : {}),
        ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
        ...(input.expectedRevision !== undefined ? { expectedRevision: input.expectedRevision } : {}),
        ...(input.canRead !== undefined ? { canRead: input.canRead, canAppend: input.canAppend } : {}),
        ...(input.note ? { kind: 'note' as const } : input.file ? { kind: 'file' as const } : {}) };
    }) };
  } catch { return undefined; }
}
export function assertClinicalRehearsalExpected(policy: RehearsalPolicy, step: RehearsalStep, actor: ClinicalActor, e: ClinicalExpected) {
  try {
    const role = assertRehearsalActor(policy, actor);
    if (step.actor !== role || e.historyId !== policy.historyId || e.patient !== policy.patient.address || e.operationId !== step.operationId) throw denied();
    const input = step.input!;
    if (input.action === 'append_version') {
      const entryId = input.entryId ?? deriveClinicalEntryId(policy.historyId, policy.doctor.address, step.operationId!);
      if (e.author !== policy.doctor.address || e.entryId !== entryId || e.expectedVersion !== (input.expectedVersion ?? 0) ||
          e.expectedGrantRevision !== (step.key === 'append_note' ? policy.startingGrantRevision + (policy.schemaVersion === 2 ? 0 : 2) : policy.startingGrantRevision + (policy.schemaVersion === 2 ? 1 : 3))) throw denied();
    } else if (input.action === 'set_permissions') {
      const revisionAllowed = step.key === 'revoke' ? (policy.completionContinuation ? e.expectedRevision === 6 : (policy.schemaVersion === 2 ? [5,6] : [4,5,6]).includes(e.expectedRevision!)) : e.expectedRevision === input.expectedRevision;
      if (e.doctorId !== policy.doctorId || e.doctor !== policy.doctor.address || e.canRead !== input.canRead ||
          e.canAppend !== input.canAppend || !revisionAllowed) throw denied();
    } else throw denied();
  } catch (error) { rehearsalError(error); }
}
/** The rehearsal may use only its exact confirmed registry revision and expiry. */
export function assertClinicalRehearsalAuthorization(policy: RehearsalPolicy,
  authorization: { version: number; validUntil: number; commitment: string; revoked: boolean; schemaVersion: number }, confirmedCommitment: string) {
  if (!authorization || authorization.version !== policy.authorization.targetVersion || authorization.validUntil !== policy.authorization.validUntil ||
      authorization.schemaVersion !== 1 || authorization.revoked !== false || typeof confirmedCommitment !== 'string' ||
      !/^[a-f0-9]{64}$/.test(confirmedCommitment) || /^0+$/.test(confirmedCommitment) || authorization.commitment !== confirmedCommitment) {
    throw new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
  }
}
export function assertClinicalRehearsalFee(policy: RehearsalPolicy, step: RehearsalStep, transaction: Transaction, sponsoredFee: bigint) {
  try {
    if (!(transaction instanceof Transaction) || transaction.networkPassphrase !== Networks.TESTNET) throw denied();
    const extension = transaction.toEnvelope().v1().tx().ext();
    if (extension.switch() !== 1 || !clinicalSimulationIsLive({ transactionData: { build: () => extension.sorobanData() } }) ||
        clinicalWebFeeQuote(transaction).sponsored !== sponsoredFee) throw denied();
    assertRehearsalFee(policy, step, { source: transaction.source, maxTime: Number(transaction.timeBounds?.maxTime), feeStroops: sponsoredFee.toString() });
  } catch (error) { rehearsalError(error); }
}

/** Immutable prior receipts and the unsent expired slot are prerequisites, not
 * new authority or executable steps. Read them under the same source lock. */
async function assertContinuationLineage(client: PoolClient, policy: RehearsalPolicy) {
  const lineage = policy.lineage, prior = policy.previousAuthorization, previous = policy.previousSteps;
  const conflict = () => new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
  if (!lineage || !prior || !previous || previous.length !== 8) throw conflict();
  const ids = [...lineage.confirmed.slice(1).map(item => item.requestId), lineage.cancelledNote.requestId];
  const rows: Record<string, any>[] = (await client.query('SELECT id,state,action,source_wallet,actor_user_id,wallet_id,contract_id,network,transaction_hash,error_code,signed_xdr,expires_at,expected FROM clinical_web_operations WHERE id=ANY($1::uuid[])', [ids])).rows;
  if (rows.length !== 3 || new Set(rows.map(row => row.id)).size !== 3) throw conflict();
  for (let index = 1; index <= 2; index++) {
    const saved = lineage.confirmed[index], step = previous[index], row = rows.find(value => value.id === saved.requestId), expected = row?.expected;
    if (!row || row.state !== 'confirmed' || row.transaction_hash !== saved.transactionHash || row.action !== 'set_permissions' ||
        row.source_wallet !== policy.patient.address || row.actor_user_id !== policy.patient.userId || row.wallet_id !== policy.patient.walletId ||
        row.contract_id !== CLINICAL_ID || row.network !== 'testnet' || !expected || expected.historyId !== policy.historyId || expected.patient !== policy.patient.address ||
        expected.operationId !== step.operationId || expected.doctorId !== policy.doctorId || expected.doctor !== policy.doctor.address ||
        expected.canRead !== step.input!.canRead || expected.canAppend !== step.input!.canAppend || expected.expectedRevision !== step.input!.expectedRevision) throw conflict();
  }
  const expired = rows.find(row => row.id === lineage.cancelledNote.requestId), expected = expired?.expected;
  if (!expired || expired.state !== 'cancelled' || expired.error_code !== 'signature_request_expired' || expired.signed_xdr !== null || expired.transaction_hash !== null ||
      expired.action !== 'append_version' || expired.source_wallet !== policy.doctor.address || expired.actor_user_id !== policy.doctor.userId || expired.wallet_id !== policy.doctor.walletId ||
      expired.contract_id !== CLINICAL_ID || expired.network !== 'testnet' || Number(expired.expires_at) !== lineage.cancelledNote.expiresAt || Number(expired.expires_at) > Math.floor(Date.now()/1000) ||
      !expected || expected.operationId !== lineage.cancelledNote.operationId || expected.historyId !== policy.historyId || expected.patient !== policy.patient.address || expected.author !== policy.doctor.address || expected.expectedVersion !== 0 || expected.expectedGrantRevision !== 5) throw conflict();
  const [admin] = (await client.query('SELECT id,state,action,requested_by,requested_email,doctor_id,doctor_user_id,wallet_id,wallet,contract_id,network,method,expected_version,target_version,valid_until,dossier_id,transaction_hash FROM doctor_authorization_requests WHERE id=$1', [lineage.confirmed[0].requestId])).rows;
  if (!admin || admin.id !== prior.requestId || admin.state !== 'confirmed' || admin.transaction_hash !== lineage.confirmed[0].transactionHash || admin.action !== 'renew' ||
      admin.requested_by !== policy.reviewer.userId || admin.requested_email !== policy.reviewer.email || Number(admin.doctor_id) !== policy.doctorId || admin.doctor_user_id !== policy.doctor.userId ||
      admin.wallet_id !== policy.doctor.walletId || admin.wallet !== policy.doctor.address || admin.contract_id !== policy.registryId || admin.network !== 'testnet' ||
      admin.method !== prior.method || Number(admin.expected_version) !== prior.expectedVersion || Number(admin.target_version) !== prior.targetVersion || Number(admin.valid_until) !== prior.validUntil || admin.dossier_id !== prior.dossierId) throw conflict();
}

/** A replacement never reopens its old slot. The expired unsigned envelope
 * remains immutable evidence under the same source/run transaction locks. */
async function assertSupersededClinicalNote(client: PoolClient, policy: RehearsalPolicy) {
  const replacement = policy.noteReplacement;
  if (!replacement) return;
  const old = replacement.supersededStep, proof = replacement.supersededNote;
  const conflict = () => new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
  const [row] = (await client.query('SELECT id,state,error_code,expires_at,unsigned_xdr,signed_xdr,transaction_hash,action,source_wallet,actor_user_id,wallet_id,contract_id,network,expected FROM clinical_web_operations WHERE id=$1', [proof.requestId])).rows;
  const e = row?.expected;
  if (!row || row.id !== old.requestId || proof.requestId !== old.requestId || proof.operationId !== old.operationId ||
      row.state !== 'cancelled' || row.error_code !== 'signature_request_expired' || row.signed_xdr !== null || row.transaction_hash !== null ||
      Number(row.expires_at) !== proof.expiresAt || proof.expiresAt > Math.floor(Date.now()/1000) ||
      typeof row.unsigned_xdr !== 'string' || createHash('sha256').update(row.unsigned_xdr,'utf8').digest('hex') !== proof.unsignedEnvelopeHash ||
      row.action !== 'append_version' || row.source_wallet !== policy.doctor.address || row.actor_user_id !== policy.doctor.userId || row.wallet_id !== policy.doctor.walletId ||
      row.contract_id !== CLINICAL_ID || row.network !== 'testnet' || !e || e.historyId !== policy.historyId || e.patient !== policy.patient.address ||
      e.author !== policy.doctor.address || e.operationId !== old.operationId || e.expectedVersion !== 0 || e.expectedGrantRevision !== policy.startingGrantRevision ||
      e.entryId !== deriveClinicalEntryId(policy.historyId,policy.doctor.address,old.operationId!)) throw conflict();
}

/** A replacement may proceed only after its old PDF and ledger reservation are terminal.
 * This runs after the shared run lock; none of these reads resets an old slot or counter. */
async function assertSupersededClinicalPdf(client: PoolClient, policy: RehearsalPolicy) {
  if(!policy.pdfReplacement)return;
  if(policy.restoredCompletion){
    const id=policy.restoredCompletion.priorAuthorization.requestId;
    const [job]=(await client.query('SELECT id,state,action,method,doctor_id,doctor_user_id,doctor_email,wallet_id,wallet,contract_id,network,requested_by,requested_email,dossier_id,expected_version,target_version,valid_until,commitment,prepared_xdr,transaction_hash,error_code FROM doctor_authorization_requests WHERE id=$1',[id])).rows;
    const [reservationRow]=(await client.query('SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1',[id])).rows;
    try{inspectPriorRehearsalRenewal(policy,{job,reservationRow});}catch{throw new PrivateFlowError('clinical_rehearsal_order_conflict',409);}
  }
  const prior=policy.priorPdfReplacements??(policy.priorPdfReplacement?[policy.priorPdfReplacement]:[]);
  if(policy.priorPdfReplacements&&(!Array.isArray(prior)||prior.length!==(policy.expiredSignedPdfRecovery?5:policy.recoveredReopenedPdf?4:policy.expiredPdfRecovery?3:2)||prior[0]!==policy.priorPdfReplacement))throw new PrivateFlowError('clinical_rehearsal_order_conflict',409);
  for(const replacement of [...prior,policy.pdfReplacement]) {
  if(!replacement)continue;
  const old=replacement.supersededStep,proof=replacement.supersededPdf;
  const conflict=()=>new PrivateFlowError('clinical_rehearsal_order_conflict',409);
  const [row]=(await client.query('SELECT id,state,error_code,expires_at,unsigned_xdr,signing_hash,signed_xdr,transaction_hash,action,source_wallet,actor_user_id,wallet_id,contract_id,network,expected FROM clinical_web_operations WHERE id=$1',[proof.requestId])).rows;
  const e=row?.expected;
  const signedRecovery=policy.expiredSignedPdfRecovery?.requestId===proof.requestId?policy.expiredSignedPdfRecovery:undefined;
  if(signedRecovery){
    if(!row||row.error_code!=='signed_expired_before_submission'||typeof row.signed_xdr!=='string'||row.transaction_hash!==signedRecovery.transactionHash||createHash('sha256').update(row.signed_xdr,'utf8').digest('hex')!==signedRecovery.signedEnvelopeSha256)throw conflict();
    try{assertClinicalSavedEnvelope(row,{historical:true});}catch{throw conflict();}
  }
  if(!row||row.id!==old.requestId||proof.requestId!==old.requestId||proof.operationId!==old.operationId||
    row.state!==(signedRecovery?'failed':'cancelled')||(!signedRecovery&&(row.error_code!=='signature_request_expired'||row.signed_xdr!==null||row.transaction_hash!==null))||
    Number(row.expires_at)!==proof.expiresAt||proof.expiresAt>Math.floor(Date.now()/1000)||
    typeof row.unsigned_xdr!=='string'||createHash('sha256').update(row.unsigned_xdr,'utf8').digest('hex')!==proof.unsignedEnvelopeHash||
    row.signing_hash!==proof.signingHash||row.action!=='append_version'||row.source_wallet!==policy.doctor.address||
    row.actor_user_id!==policy.doctor.userId||row.wallet_id!==policy.doctor.walletId||row.contract_id!==CLINICAL_ID||row.network!=='testnet'||
    !e||e.historyId!==policy.historyId||e.patient!==policy.patient.address||e.author!==policy.doctor.address||
    e.operationId!==old.operationId||e.expectedVersion!==0||e.expectedGrantRevision!==policy.startingGrantRevision+1||e.previousCommitment!==null||
    e.entryId!==deriveClinicalEntryId(policy.historyId,policy.doctor.address,old.operationId!))throw conflict();
  const unsigned=TransactionBuilder.fromXDR(row.unsigned_xdr,Networks.TESTNET);
  if(!(unsigned instanceof Transaction)||unsigned.hash().toString('hex')!==proof.signingHash||Number(unsigned.timeBounds?.maxTime)!==proof.expiresAt)throw conflict();
  try{assertClinicalUnsigned(unsigned,policy.doctor.address,'append_version',e);}catch{throw conflict();}
  const [reservation]=(await client.query('SELECT request_id,network,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1',[proof.requestId])).rows;
  const p=reservation?.payload,b=p?.binding,q=p?.quote,invocation=unsigned.operations[0];
  if(!reservation||reservation.request_id!==proof.requestId||reservation.network!=='testnet'||reservation.state!=='released'||
    reservation.transaction_hash!==null||!p||p.state!=='released'||p.transactionHash!==null||p.signedInnerDigest!==null||p.signedAt!==null||
    p.chargedStroops!==null||p.outcome!==null||p.ledger!==null||!b||b.requestId!==proof.requestId||b.network!=='testnet'||
    b.sourceAddress!==policy.doctor.address||b.patientAddress!==policy.patient.address||b.sponsorAddress!==policy.relayer||
    b.actorId!==policy.doctor.userId||b.walletId!==policy.doctor.walletId||b.contractId!==CLINICAL_ID||b.action!=='append_version'||
    b.encounterId!==e.entryId||invocation.type!=='invokeHostFunction'||
    b.operationFingerprint!==createHash('sha256').update(invocation.func.toXDR('base64')).digest('hex')||
    !q||q.unsignedHash!==proof.unsignedEnvelopeHash||q.signingHash!==proof.signingHash||q.maxTime!==proof.expiresAt||
    q.offeredFeeStroops!==clinicalWebFeeQuote(unsigned).sponsored.toString())throw conflict();
  // A sibling recovery scope cannot hide already-spent or uncertain new-ledger attempts.
  const allowed=policy.steps.filter(s=>['append_pdf','correct_note','revoke',...(policy.completionContinuation?['renew']:[])].includes(s.key)).map(s=>s.requestId);
  if(policy.restoredCompletion)allowed.push(policy.restoredCompletion.priorAuthorization.requestId);
  const extras=(await client.query("SELECT request_id FROM sponsorship_reservations WHERE network='testnet' AND payload->'binding'->>'patientAddress'=$1 AND payload->'binding'->>'sponsorAddress'=$2 AND state<>'released' AND NOT(request_id=ANY($3::uuid[])) LIMIT 1",[policy.patient.address,policy.relayer,allowed])).rows;
  if(extras.length)throw conflict();
  }
}

/** Fixed UUIDs and fixed caps reserve the entire budget. Failed/cancelled slots
 * remain spent; order is checked under the existing source wallet lock. */
export async function assertClinicalRehearsalOrder(client: PoolClient, policy: RehearsalPolicy, step: RehearsalStep, mustExist = false) {
  const declared = policy.steps.find(item => item.requestId === step.requestId);
  if (!declared || payloadHash(declared) !== payloadHash(step)) throw denied();
  // Wallet lock is already held; retain this shared run lock through COMMIT.
  await lockClinicalRehearsalRun(client, policy);
  const rows = (await client.query("SELECT id,state,action,source_wallet,actor_user_id,wallet_id,contract_id,network,transaction_hash FROM clinical_web_operations WHERE id=ANY($1::uuid[])", [policy.steps.filter(s => s.actor !== 'admin').map(s => s.requestId)])).rows;
  for (const row of rows) {
    const planned = policy.steps.find(s => s.requestId === row.id);
    const expectedActor = planned?.actor === 'patient' ? policy.patient : policy.doctor;
    if (!planned || row.action !== planned.action || row.source_wallet !== expectedActor.address || row.actor_user_id !== expectedActor.userId ||
        row.wallet_id !== expectedActor.walletId || row.contract_id !== CLINICAL_ID || row.network !== 'testnet') throw denied();
  }
  if (mustExist && !rows.some(row => row.id === step.requestId)) throw denied();
  if (policy.closingContinuation) {
    const proof = policy.closingContinuation.confirmedPdf;
    const pdf = rows.find(row => row.id === proof.requestId);
    if (pdf?.state !== 'confirmed' || pdf.transaction_hash !== proof.transactionHash) {
      throw new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
    }
  }
  if (policy.aggregateBudget) {
    for (const proof of policy.aggregateBudget.confirmedSteps) {
      const row = rows.find(value => value.id === proof.requestId);
      if (!row || row.state !== 'confirmed' || row.transaction_hash !== proof.transactionHash) throw new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
    }
  }
  if (policy.schemaVersion === 2) await assertContinuationLineage(client, policy);
  await assertSupersededClinicalNote(client, policy);
  await assertSupersededClinicalPdf(client, policy);
  const final = policy.steps.find(s => s.key === 'revoke')!;
  if (step.key !== 'revoke' && rows.some(row => row.id === final.requestId)) throw new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
  // Withdrawal can reduce the existing revision5/6 grant before a new renewal.
  const confirmedRenewal = policy.completionContinuation ? undefined : policy.feeAmendment?.confirmedRenewalTransactionHash;
  if (policy.schemaVersion === 2 && step.key === 'revoke' && (policy.completionContinuation || !confirmedRenewal)) return;
  const [admin] = (await client.query("SELECT id,state,action,requested_by,requested_email,doctor_id,doctor_user_id,wallet_id,wallet,contract_id,network,method,expected_version,target_version,valid_until,dossier_id,transaction_hash FROM doctor_authorization_requests WHERE id=$1", [policy.authorization.requestId])).rows;
  const a = policy.authorization;
  if (!admin || admin.state !== 'confirmed' || admin.action !== 'renew' || admin.requested_by !== policy.reviewer.userId || admin.requested_email !== policy.reviewer.email || Number(admin.doctor_id) !== policy.doctorId || admin.doctor_user_id !== policy.doctor.userId ||
      admin.wallet_id !== policy.doctor.walletId || admin.wallet !== policy.doctor.address || admin.contract_id !== policy.registryId ||
      admin.network !== 'testnet' || admin.method !== a.method || Number(admin.expected_version) !== a.expectedVersion ||
      Number(admin.target_version) !== a.targetVersion || Number(admin.valid_until) !== a.validUntil || admin.dossier_id !== a.dossierId ||
      !/^[a-f0-9]{64}$/.test(admin.transaction_hash ?? '') || (confirmedRenewal !== undefined && admin.transaction_hash !== confirmedRenewal)) throw new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
  if (policy.schemaVersion === 2 && step.key === 'revoke') return;
  const index = policy.steps.findIndex(s => s.requestId === step.requestId);
  const prerequisites = step.key === 'revoke' ? policy.steps.filter(s => s.key === 'grant_read') : policy.steps.slice(1, index);
  if (index < 1 || prerequisites.some(s => !rows.some(row => row.id === s.requestId && row.state === 'confirmed' && /^[a-f0-9]{64}$/.test(row.transaction_hash ?? '')))) {
    throw new PrivateFlowError('clinical_rehearsal_order_conflict', 409);
  }
}
