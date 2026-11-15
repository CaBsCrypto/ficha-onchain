import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from '@neondatabase/serverless';
import { Keypair } from '@stellar/stellar-sdk';
import { PrivateFlowError } from '@/lib/private-config';
import type { ClinicalActor, ClinicalExpected } from '@/types/clinical';
import {
  assertRegularClinicalWeb, HOSTED_CAPTURE_ORIGIN, lockHostedCaptureShared, readHostedCaptureActive,
} from '../../../scripts/lib/hosted-capture-store.mjs';
import { assertClinicalEnvironment } from './config';

const regularRequest = new AsyncLocalStorage<true>();
const host = new URL(HOSTED_CAPTURE_ORIGIN).host;
const denied = () => new PrivateFlowError('clinical_access_denied', 403);
const unavailable = () => new PrivateFlowError('regular_clinical_unavailable', 503);

export type RegularClinicalTarget = 'owner' | 'doctor';
export type RegularClinicalPolicy = {
  mode: 'regular';
  action: 'set_permissions' | 'append_version';
  wallet: string;
  relayer: string;
};

export function regularClinicalRequestEnabled(request: Request) {
  if (process.env.TRUSTLEAF_REGULAR_CLINICAL_ENABLED !== 'true' ||
      process.env.VERCEL_ENV !== 'production' || request.headers.get('host') !== host) return false;
  if (new URL(request.url).origin !== HOSTED_CAPTURE_ORIGIN ||
      (request.method !== 'GET' && request.headers.get('origin') !== HOSTED_CAPTURE_ORIGIN)) {
    throw new PrivateFlowError('forbidden', 403);
  }
  assertRegularClinicalEnvironment();
  return true;
}

function assertRegularClinicalEnvironment() {
  assertClinicalEnvironment();
  try {
    assertRegularClinicalWeb();
    return Keypair.fromSecret(process.env.RELAYER_SECRET ?? '').publicKey();
  } catch { throw unavailable(); }
}

export function regularClinicalRequestConfigured() {
  return regularRequest.getStore() === true;
}

export function withRegularClinicalRequest<T>(work: () => Promise<T>) {
  return regularRequest.run(true, work);
}

export function regularClinicalPolicy(wallet: string, action: RegularClinicalPolicy['action']): RegularClinicalPolicy {
  if (!regularClinicalRequestConfigured()) throw denied();
  return { mode: 'regular', action, wallet, relayer: assertRegularClinicalEnvironment() };
}

/** The prepared and recovered row must identify the same type of contribution. */
export function assertRegularClinicalIntent(policy: RegularClinicalPolicy, actor: ClinicalActor, expected: ClinicalExpected) {
  if (policy.wallet !== actor.address ||
      (policy.action === 'set_permissions' ? expected.patient !== actor.address || !expected.doctor
        : expected.patient === actor.address || expected.author !== actor.address)) throw denied();
}

/** Serialize with hosted scope transitions before looking at protected IDs or actors. */
export async function lockRegularClinicalIntent(client: PoolClient, policy: RegularClinicalPolicy, actor: ClinicalActor,
  requestId: string, historyId?: string) {
  if (regularClinicalPolicy(actor.address, policy.action).relayer !== policy.relayer) throw denied();
  await lockHostedCaptureShared(client);
  const reserved = await client.query('SELECT 1 FROM hosted_capture_requests WHERE request_id=$1', [requestId]);
  if (reserved.rows.length) throw denied();
  const active = await readHostedCaptureActive(client);
  if (!active || active.expiresAt <= Math.floor(Date.now() / 1000)) return;
  const protectedActor = [active.patient, active.doctor].some(value =>
    value.userId === actor.userId || value.walletId === actor.walletId || value.address === actor.address);
  if (protectedActor || historyId === active.historyId) throw denied();
}
