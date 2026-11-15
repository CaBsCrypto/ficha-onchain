import { createHash, randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import type { PoolClient } from '@neondatabase/serverless';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedCaptureSnapshot } from '../../scripts/lib/hosted-capture-store.mjs';
import { clinicalApi } from '@/lib/clinical/api';
import { assertClinicalWriteScope, clinicalCreateOnceConfigured } from '@/lib/clinical/create-once';
import { deriveClinicalHistoryId } from '@/lib/clinical/chain';
import { CLINICAL_ID } from '@/lib/clinical/config';
import {
  assertHostedClinicalRecovery, hostedClinicalView, lockHostedClinicalPolicy, withHostedClinicalRequest,
} from '@/lib/clinical/hosted';
import { PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';

const mocked = vi.hoisted(() => ({
  active: vi.fn(), historical: vi.fn(), mutation: vi.fn(), recovery: vi.fn(), auth: vi.fn(), identity: vi.fn(),
  client: { query: vi.fn(), release: vi.fn() },
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: mocked.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: mocked.identity }));
vi.mock('@/lib/db', () => ({ getDbConnection: async () => mocked.client }));
vi.mock('../../scripts/lib/hosted-capture-store.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../../scripts/lib/hosted-capture-store.mjs')>(),
  readHostedCaptureActive: mocked.active,
  readHostedCaptureByRequest: mocked.historical,
  lockHostedCaptureMutation: mocked.mutation,
  lockHostedCaptureRecovery: mocked.recovery,
}));

const origin = 'https://www.trustleaf.org';
const host = 'ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech';
const payer = Keypair.random();
const actor = (name: string) => ({
  userId: 'did:privy:' + name + 'testexample',
  walletId: name + '-wallet-fixture',
  address: Keypair.random().publicKey(),
});
const patient = actor('patient');
const doctor = actor('doctor');
const legacy = actor('legacy');
const historyId = deriveClinicalHistoryId(patient.address);
const doctorId = 9;
const baseRunId = randomUUID();
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const client = mocked.client as unknown as PoolClient;

function snapshot(phase: HostedCaptureSnapshot['phase'], overrides = {}, openedAt = Math.floor(Date.now() / 1000) - 1) {
  const until = openedAt + 600;
  const pair = { patient, doctor, historyId, doctorId, relayer: payer.publicKey() };
  const requestId = randomUUID();
  const bytes = Buffer.from(JSON.stringify(phase === 'create'
    ? { schemaVersion: 1, phase, runId: baseRunId, openedAt, until, network: 'testnet', ...pair, requestId }
    : { schemaVersion: 1, runId: randomUUID(), openedAt, until, network: 'testnet', ...pair,
      contractId: CLINICAL_ID, registryId: REGISTRY_PRIVATE, doctorValidUntil: until + 600,
      grantRequestId: randomUUID(), noteRequestId: requestId,
      note: { title: 'Synthetic note', text: 'A scheduled example', eventDate: null } }));
  const sha256 = sha(bytes);
  const scope: HostedCaptureSnapshot = {
    phase, sha256, bytes, approvalSha256: sha256, approvedAt: openedAt, expiresAt: until,
    baseSha256: null, baseBytes: null, baseReceiptHash: null, predecessorSha256: null,
    runId: baseRunId, origin, active: true, ...pair, ...overrides,
  };
  return { scope, requestId };
}

function request(base = origin) {
  return new Request(base + '/api/private-clinical-operations', {
    method: 'POST',
    headers: { host: new URL(base).host, origin: base },
  });
}

beforeEach(() => {
  const environment = {
    TRUSTLEAF_HOSTED_CAPTURE_ENABLED: 'true', VERCEL_ENV: 'production', TRUSTLEAF_ENV: 'test',
    TRUSTLEAF_DATABASE_URL: 'postgres://fixture:fixture@' + host + '/test',
    TRUSTLEAF_DB_HOST: host, PRIVY_APP_ID: PRIVY_APP, NEXT_PUBLIC_PRIVY_APP_ID: PRIVY_APP,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: REGISTRY_PRIVATE, PRESCRIPTION_PRIVATE_CONTRACT_ID: RX_PRIVATE,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: PRIVATE_ADMIN, BOOKING_AUTHORITY_PUBLIC_KEY: PRIVATE_ADMIN,
    NEXT_PUBLIC_STELLAR_NETWORK: 'testnet', NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
    TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false', TRUSTLEAF_CLINICAL_WEB_ENABLED: 'true',
    CLINICAL_HISTORY_PRIVATE_CONTRACT_ID: CLINICAL_ID, RELAYER_SECRET: payer.secret(),
    TRUSTLEAF_CLINICAL_PATIENT_DEMO_ENABLED: 'true', TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS: legacy.address,
    TRUSTLEAF_CLINICAL_PATIENT_DEMO_RELAYER: payer.publicKey(),
  };
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  vi.clearAllMocks();
  mocked.active.mockResolvedValue(null);
  mocked.historical.mockResolvedValue(null);
  mocked.mutation.mockResolvedValue(undefined);
  mocked.recovery.mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('hosted clinical phase policy', () => {
  it('keeps the existing patient demo working while the new patient gets only the fixed creation intent', async () => {
    const { scope, requestId } = snapshot('create');
    mocked.active.mockResolvedValue(scope);
    await withHostedClinicalRequest(request(), patient, async () => {
      expect(clinicalCreateOnceConfigured(patient.address)).toBe(true);
      const policy = assertClinicalWriteScope('create_history', patient.address);
      expect(policy).toMatchObject({ mode: 'once', requestId });
      expect(hostedClinicalView(patient)?.steps).toEqual([{ action: 'create_history', requestId }]);
      expect(hostedClinicalView(patient, 'unrelated-history')).toBeUndefined();
      expect(() => assertClinicalWriteScope('append_version', patient.address)).toThrow('clinical_rehearsal_scope_rejected');
      if (!policy || !('hosted' in policy)) throw new Error('expected hosted policy');
      await expect(lockHostedClinicalPolicy(client, policy, randomUUID())).rejects.toThrow('clinical_rehearsal_scope_rejected');
      expect(mocked.mutation).not.toHaveBeenCalled();
      await lockHostedClinicalPolicy(client, policy, requestId);
      expect(mocked.mutation).toHaveBeenCalledWith(client, 'create', scope.sha256);
    });
    await withHostedClinicalRequest(request(), legacy, async () => {
      expect(assertClinicalWriteScope('append_version', legacy.address)).toMatchObject({ mode: 'patient_demo' });
      expect(hostedClinicalView(legacy)).toBeUndefined();
    });
  });

  it('matches the exact doctor and history for an approved note', async () => {
    const { scope, requestId } = snapshot('grant-note');
    mocked.active.mockResolvedValue(scope);
    await withHostedClinicalRequest(request(), doctor, async () => {
      expect(assertClinicalWriteScope('append_version', doctor.address)).toMatchObject({ mode: 'capture' });
      expect(hostedClinicalView(doctor, historyId)?.steps).toEqual([
        { action: 'append_version', requestId, expectedVersion: 0, kind: 'note' },
      ]);
      expect(hostedClinicalView(doctor, 'unrelated-history')).toBeUndefined();
    });
    await withHostedClinicalRequest(request(), { ...doctor, walletId: patient.walletId }, async () => {
      expect(() => assertClinicalWriteScope('append_version', doctor.address)).toThrow('clinical_rehearsal_scope_rejected');
    });
  });

  it('does not allow a cross-origin, expired, unapproved or changed scope', async () => {
    const { scope, requestId } = snapshot('create');
    mocked.active.mockResolvedValue(scope);
    await withHostedClinicalRequest(request('https://trustleaf-preview.vercel.app'), patient, async () => {
      expect(() => assertClinicalWriteScope('create_history', patient.address)).toThrow('clinical_rehearsal_scope_rejected');
    });
    mocked.active.mockResolvedValue({ ...scope, expiresAt: 1 });
    await withHostedClinicalRequest(request(), patient, async () => {
      expect(() => assertClinicalWriteScope('create_history', patient.address)).toThrow('clinical_rehearsal_expired');
    });
    mocked.active.mockResolvedValue({ ...scope, approvalSha256: null });
    await withHostedClinicalRequest(request(), patient, async () => {
      expect(() => assertClinicalWriteScope('create_history', patient.address)).toThrow('clinical_rehearsal_scope_rejected');
    });
    mocked.active.mockResolvedValue(scope);
    mocked.mutation.mockRejectedValue(new Error('hosted_capture_not_active'));
    await withHostedClinicalRequest(request(), patient, async () => {
      const policy = assertClinicalWriteScope('create_history', patient.address);
      if (!policy || !('hosted' in policy)) throw new Error('expected hosted policy');
      await expect(lockHostedClinicalPolicy(client, policy, requestId)).rejects.toThrow('clinical_rehearsal_scope_rejected');
    });
  });

  it.each([
    { actor: patient, action: 'set_permissions', target: 'owner' },
    { actor: doctor, action: 'append_version', target: 'doctor' },
  ] as const)('restores the opted-in regular $action after the matching capture expires', async ({ actor, action, target }) => {
    vi.stubEnv('TRUSTLEAF_REGULAR_CLINICAL_ENABLED', 'true');
    mocked.auth.mockResolvedValue({ userId: actor.userId, email: 'synthetic@example.test' });
    mocked.identity.mockResolvedValue(actor);
    const active = snapshot('grant-note');
    mocked.active.mockResolvedValue(active.scope);
    const work = async () => ({ mode: assertClinicalWriteScope(action, actor.address, target)?.mode });
    const scoped = await clinicalApi(request(), work, { allowCreateOnce: true });
    expect(await scoped.json()).toEqual({ mode: 'capture' });

    const elapsed = snapshot('grant-note', {}, Math.floor(Date.now() / 1000) - 601);
    mocked.active.mockResolvedValue(elapsed.scope);
    const regular = await clinicalApi(request(), async () => {
      expect(hostedClinicalView(actor, historyId)).toBeUndefined();
      return work();
    }, { allowCreateOnce: true });
    expect(await regular.json()).toEqual({ mode: 'regular' });

    await withHostedClinicalRequest(request(), actor, async () => {
      expect(() => assertClinicalWriteScope(action, actor.address, target)).toThrow('clinical_rehearsal_expired');
    });
  });

  it('settles only the original capture receipt after the canonical request returns to regular mode', async () => {
    vi.stubEnv('TRUSTLEAF_REGULAR_CLINICAL_ENABLED', 'true');
    mocked.auth.mockResolvedValue({ userId: doctor.userId, email: 'synthetic@example.test' });
    mocked.identity.mockResolvedValue(doctor);
    const { scope, requestId } = snapshot('grant-note', {}, Math.floor(Date.now() / 1000) - 601);
    mocked.active.mockResolvedValue(scope);
    mocked.historical.mockResolvedValue(scope);
    const expected = { historyId, patient: patient.address, operationId: 'a'.repeat(64) };

    const result = await clinicalApi(request(), async () => {
      await expect(assertHostedClinicalRecovery(client, doctor, requestId, 'append_version', expected, true))
        .rejects.toThrow('clinical_rehearsal_scope_rejected');
      await assertHostedClinicalRecovery(client, doctor, requestId, 'append_version', expected, false);
      return { receipt: 'checked' };
    }, { allowCreateOnce: true });

    expect(result.status).toBe(200);
    expect(mocked.recovery).toHaveBeenCalledWith(client, requestId, scope.sha256);
    expect(mocked.mutation).not.toHaveBeenCalled();
  });

  it('can settle the historical request but cannot reopen it after the active phase ends', async () => {
    const { scope, requestId } = snapshot('create');
    mocked.historical.mockResolvedValue({ ...scope, active: false, expiresAt: 1 });
    const expected = { historyId, patient: patient.address, operationId: 'a'.repeat(64) };
    await assertHostedClinicalRecovery(client, patient, requestId, 'create_history', expected, false);
    expect(mocked.recovery).toHaveBeenCalledWith(client, requestId, scope.sha256);
    await expect(assertHostedClinicalRecovery(client, patient, requestId, 'create_history', expected, true))
      .rejects.toThrow('clinical_rehearsal_scope_rejected');
    await expect(assertHostedClinicalRecovery(client, doctor, requestId, 'create_history', expected, false))
      .rejects.toThrow('clinical_rehearsal_scope_rejected');
    await expect(assertHostedClinicalRecovery(client, patient, requestId, 'create_history',
      { ...expected, historyId: 'f'.repeat(64) }, false)).rejects.toThrow('clinical_rehearsal_scope_rejected');
  });
});
