import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { Keypair } from '@stellar/stellar-sdk';
import { getDbConnection } from '@/lib/db';
import { PrivateFlowError } from '@/lib/private-config';
import type { ClinicalAction, ClinicalActor, ClinicalExpected, ClinicalSnapshot } from '@/types/clinical';
import {
  assertHostedCaptureWeb, hostedCaptureWebConfigured, lockHostedCaptureMutation, lockHostedCaptureRecovery,
  readHostedCaptureActive, readHostedCaptureByRequest,
  type HostedCaptureSnapshot,
} from '../../../scripts/lib/hosted-capture-store.mjs';
import { captureAction, clinicalCaptureView, validateClinicalCapture, type ClinicalCapturePlan } from './capture';
import { CLINICAL_ID } from './config';
import { deriveClinicalHistoryId } from './chain';

interface HostedClinicalRequest {
  snapshot: HostedCaptureSnapshot;
  actor: ClinicalActor;
  canonicalRequest: boolean;
}

const hostedRequest = new AsyncLocalStorage<HostedClinicalRequest>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const denied = () => new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
const expired = () => new PrivateFlowError('clinical_rehearsal_expired', 409);
const sameActor = (a: ClinicalActor, b: ClinicalActor) =>
  a.userId === b.userId && a.walletId === b.walletId && a.address === b.address;
const overlapsActor = (a: ClinicalActor, b: ClinicalActor) =>
  a.userId === b.userId || a.walletId === b.walletId || a.address === b.address;

export async function withHostedClinicalRequest<T>(request: Request, actor: ClinicalActor, work: () => Promise<T>,
  options?: { allowRegularFallback?: boolean }): Promise<T> {
  if (!hostedCaptureWebConfigured()) return work();
  const environment = assertHostedCaptureWeb();
  const client = await getDbConnection();
  let snapshot: HostedCaptureSnapshot | null;
  try { snapshot = await readHostedCaptureActive(client); }
  finally { client.release(); }
  if (!snapshot || ![snapshot.patient, snapshot.doctor].some(value => overlapsActor(actor, value))) return work();
  const canonicalRequest = snapshot.origin === environment.origin &&
    request.headers.get('host') === new URL(environment.origin).host &&
    (request.method === 'GET' || request.headers.get('origin') === environment.origin);
  // The regular mutation lock still rejects staged and historical request IDs.
  if (options?.allowRegularFallback && canonicalRequest && snapshot.expiresAt <= Math.floor(Date.now() / 1000)) return work();
  return hostedRequest.run({ snapshot, actor, canonicalRequest }, work);
}

export function hostedClinicalActor(wallet: string) {
  const request = hostedRequest.getStore();
  return request?.actor.address === wallet ? request : undefined;
}

export type HostedClinicalPolicy = { wallet: string; relayer: string; until: number; hosted: HostedCaptureSnapshot } &
  ({ mode: 'once'; requestId: string } | { mode: 'capture'; plan: ClinicalCapturePlan });

function assertHostedSnapshot(request: HostedClinicalRequest) {
  const { snapshot, actor } = request;
  const now = Math.floor(Date.now() / 1000);
  const legacyWallets = (process.env.TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS ?? '').split(',');
  if (!request.canonicalRequest || !snapshot.active || ![snapshot.patient, snapshot.doctor].some(value => sameActor(value, actor)) ||
      legacyWallets.includes(snapshot.patient.address) || legacyWallets.includes(snapshot.doctor.address) ||
      snapshot.approvalSha256 !== snapshot.sha256 ||
      !Buffer.isBuffer(snapshot.bytes) || !uuid.test(snapshot.runId) ||
      createHash('sha256').update(snapshot.bytes).digest('hex') !== snapshot.sha256 ||
      snapshot.historyId !== deriveClinicalHistoryId(snapshot.patient.address) ||
      Keypair.fromSecret(process.env.RELAYER_SECRET ?? '').publicKey() !== snapshot.relayer) throw denied();
  if (snapshot.expiresAt <= now) throw expired();
  return now;
}

export function hostedClinicalPolicy(request: HostedClinicalRequest, action: ClinicalAction): HostedClinicalPolicy {
  const now = assertHostedSnapshot(request);
  const { snapshot, actor } = request;
  const common = { wallet: actor.address, relayer: snapshot.relayer, until: snapshot.expiresAt, hosted: snapshot };
  if (snapshot.phase === 'create') {
    const plan = JSON.parse(snapshot.bytes.toString('utf8'));
    if (!sameActor(actor, snapshot.patient) || action !== 'create_history' ||
        plan.schemaVersion !== 1 || plan.phase !== 'create' || plan.network !== 'testnet' ||
        plan.runId !== snapshot.runId || !sameActor(plan.patient, snapshot.patient) || !sameActor(plan.doctor, snapshot.doctor) ||
        plan.historyId !== snapshot.historyId || plan.doctorId !== snapshot.doctorId || plan.relayer !== snapshot.relayer ||
        plan.until !== snapshot.expiresAt || !Number.isSafeInteger(plan.openedAt) || plan.openedAt > now ||
        plan.openedAt >= plan.until || plan.until - plan.openedAt > 600 ||
        typeof plan.requestId !== 'string' || !uuid.test(plan.requestId)) throw denied();
    return { ...common, mode: 'once', requestId: plan.requestId };
  }
  if (snapshot.phase !== 'grant-note' && snapshot.phase !== 'pdf' && snapshot.phase !== 'close') throw denied();
  const baseline = snapshot.baseSha256 && snapshot.baseBytes && snapshot.baseReceiptHash
    ? { sha256: snapshot.baseSha256, pdfTransactionHash: snapshot.baseReceiptHash, readBytes: () => snapshot.baseBytes! }
    : undefined;
  const plan = validateClinicalCapture(snapshot.bytes, {
    policyHash: snapshot.sha256, doctorId: String(snapshot.doctorId), relayer: snapshot.relayer, baseline, now,
  });
  if (plan.contractId !== CLINICAL_ID || !sameActor(plan.patient, snapshot.patient) || !sameActor(plan.doctor, snapshot.doctor) ||
      plan.historyId !== snapshot.historyId || plan.until !== snapshot.expiresAt || captureAction(plan, actor.address) !== action ||
      (snapshot.phase === 'grant-note' && !!plan.pdf) ||
      (snapshot.phase === 'pdf' && (!plan.pdf || !!plan.continuation)) ||
      (snapshot.phase === 'close' && !plan.continuation)) throw denied();
  return { ...common, mode: 'capture', plan };
}

export function hostedClinicalView(actor: ClinicalActor, historyId?: string): ClinicalSnapshot['rehearsal'] {
  const request = hostedClinicalActor(actor.address);
  if (!request) return undefined;
  const { snapshot } = request;
  try {
    if (!historyId && snapshot.phase === 'create') {
      const policy = hostedClinicalPolicy(request, 'create_history');
      if (policy.mode !== 'once') return undefined;
      return { runId: snapshot.runId, until: policy.until, steps: [{ action: 'create_history', requestId: policy.requestId }] };
    }
    if (historyId !== snapshot.historyId) return undefined;
    const policy = hostedClinicalPolicy(request, sameActor(actor, snapshot.patient) ? 'set_permissions' : 'append_version');
    return policy.mode === 'capture' ? clinicalCaptureView(actor, historyId, policy.plan) : undefined;
  } catch { return undefined; }
}

export async function lockHostedClinicalPolicy(client: PoolClient, policy: HostedClinicalPolicy, requestId: string) {
  if (policy.mode === 'once' && requestId !== policy.requestId) throw denied();
  assertHostedClinicalDeadline(policy);
  try { await lockHostedCaptureMutation(client, policy.hosted.phase, policy.hosted.sha256); }
  catch (error) {
    if (error instanceof Error && error.message === 'hosted_capture_expired') throw expired();
    throw denied();
  }
}

export function assertHostedClinicalDeadline(policy: HostedClinicalPolicy) {
  if (policy.until <= Math.floor(Date.now() / 1000)) throw expired();
}

export async function assertHostedClinicalRecovery(client: PoolClient, actor: ClinicalActor, requestId: string,
  action: ClinicalAction, expected: ClinicalExpected, mutate: boolean) {
  if (!hostedCaptureWebConfigured()) return;
  const scope = await readHostedCaptureByRequest(client, requestId);
  if (!scope) return;
  const owner = action === 'append_version' ? scope.doctor : scope.patient;
  const matchingPhase = action === 'create_history' ? scope.phase === 'create'
    : action === 'set_permissions' ? scope.phase === 'grant-note' || scope.phase === 'close'
    : ['grant-note', 'pdf', 'close'].includes(scope.phase);
  if (!matchingPhase || !sameActor(owner, actor) || expected.historyId !== scope.historyId ||
      expected.patient !== scope.patient.address) throw denied();
  if (mutate) {
    const request = hostedClinicalActor(actor.address);
    if (!request || request.snapshot.sha256 !== scope.sha256) throw denied();
  } else {
    await lockHostedCaptureRecovery(client, requestId, scope.sha256);
  }
}
