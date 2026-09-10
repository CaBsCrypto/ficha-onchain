import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/db';
import { PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';

const mocks = vi.hoisted(() => ({ wallet: vi.fn() }));
vi.mock('@/lib/doctor-authorizations', () => ({ verifiedWallet: mocks.wallet }));

import {
  acceptDoctorInvitation, assertSubmittedOnboarding, createDoctorInvitation, doctorOnboardingView,
  markOnboardingAuthorizationPending, reconcileAuthorizedDoctorOnboarding, reviewDoctorOnboarding, saveDoctorApplication,
} from '@/lib/doctor-onboarding';

const actor = { userId: 'did:privy:doctor', email: 'doctor@example.test' };
const admin = { userId: 'did:privy:admin', email: 'admin@example.test' };
const wallet = { walletId: 'wallet-stellar-1', address: 'GBJDFTESTWALLET', chain: 'stellar' as const, created: false as const };
const profile = { name: 'Médico sintético', specialty: 'Medicina de prueba', licenseNum: 'TEST-100', rut: '11.111.111-1' };
const id = '11111111-1111-4111-8111-111111111111';
const doctor = { id: 21, name: profile.name, email: actor.email, specialty: profile.specialty, license_num: profile.licenseNum, rut: profile.rut, status: 'pending' };
const onboarding = { id, doctor_id: 21, source: 'application', email: actor.email, state: 'draft', privy_user_id: actor.userId, wallet_id: wallet.walletId, wallet: wallet.address, expires_at: null };

function fakeSql(query = vi.fn()) { return Object.assign(vi.fn(), { query }) as unknown as Sql; }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.wallet.mockResolvedValue(wallet);
  const env = {
    TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'true', TRUSTLEAF_ENV: 'local',
    TRUSTLEAF_DB_HOST: 'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',
    DATABASE_URL: 'postgres://test:test@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test',
    PRIVY_APP_ID: PRIVY_APP, NEXT_PUBLIC_PRIVY_APP_ID: PRIVY_APP,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: REGISTRY_PRIVATE, PRESCRIPTION_PRIVATE_CONTRACT_ID: RX_PRIVATE,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: PRIVATE_ADMIN, BOOKING_AUTHORITY_PUBLIC_KEY: PRIVATE_ADMIN,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe('doctor invitation acceptance', () => {
  it('binds the authenticated Privy identity and its single Stellar wallet', async () => {
    const invited = { ...onboarding, source: 'invitation', state: 'draft', expires_at: new Date(Date.now() + 86_400_000).toISOString() };
    const query = vi.fn().mockResolvedValueOnce([invited]).mockResolvedValueOnce([invited]).mockResolvedValueOnce([doctor]);
    const result = await acceptDoctorInvitation(fakeSql(query), actor);
    expect(result).toMatchObject({ wallet: wallet.address, onboarding: { source: 'invitation', state: 'draft' } });
    expect(query.mock.calls[0][0]).toContain("state='draft'");
    expect(query.mock.calls[0][1]).toEqual([actor.email, actor.userId, wallet.walletId, wallet.address]);
  });

  it('does not accept an expired invitation', async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...onboarding, source: 'invitation', state: 'invited', expires_at: new Date(Date.now() - 1000).toISOString() }]);
    await expect(acceptDoctorInvitation(fakeSql(query), actor)).rejects.toMatchObject({ message: 'invitation_expired', status: 409 });
  });

  it('rejects a changed Privy or wallet association on read', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ ...onboarding, wallet_id: 'another-wallet' }]).mockResolvedValueOnce([doctor]);
    await expect(doctorOnboardingView(fakeSql(query), actor)).rejects.toMatchObject({ message: 'doctor_identity_mismatch', status: 403 });
  });

  it('reconciles an accepted invitation only for the same verified identity', async () => {
    const authorized = { ...onboarding, source: 'invitation', state: 'authorized', authorized_at: new Date().toISOString() };
    const query = vi.fn().mockResolvedValueOnce([authorized]).mockResolvedValueOnce([]).mockResolvedValueOnce([authorized]).mockResolvedValueOnce([{ ...doctor, status: 'active' }]);
    const result = await reconcileAuthorizedDoctorOnboarding(fakeSql(query), actor);
    expect(result).toMatchObject({ wallet: wallet.address, onboarding: { state: 'authorized' } });
    expect(query.mock.calls[0][0]).toContain("state='authorized'");
    expect(query.mock.calls[0][1]).toEqual([actor.email, actor.userId, wallet.walletId, wallet.address]);
  });
});

describe('doctor self-application and invitation precedence', () => {
  it('creates one application and submits the completed synthetic profile', async () => {
    const submitted = { ...onboarding, state: 'submitted', submitted_at: new Date().toISOString() };
    const query = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([doctor])
      .mockResolvedValueOnce([onboarding])
      .mockResolvedValueOnce([{ id: doctor.id }])
      .mockResolvedValueOnce([submitted])
      .mockResolvedValueOnce([submitted])
      .mockResolvedValueOnce([doctor]);
    const result = await saveDoctorApplication(fakeSql(query), actor, profile, true);
    expect(result).toMatchObject({ onboarding: { source: 'application', state: 'submitted', profile: { licenseNum: profile.licenseNum } } });
    expect(query.mock.calls[2][0]).toContain("'application'");
  });

  it('requires accepting an existing invitation instead of creating a competing application', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ ...onboarding, source: 'invitation', state: 'invited', expires_at: new Date(Date.now() + 86_400_000).toISOString() }]);
    await expect(saveDoctorApplication(fakeSql(query), actor, profile, true)).rejects.toMatchObject({ message: 'invitation_acceptance_required' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(['submitted', 'authorization_pending', 'authorized', 'rejected'])('does not edit a %s application', async state => {
    const query = vi.fn().mockResolvedValueOnce([{ ...onboarding, state }]);
    await expect(saveDoctorApplication(fakeSql(query), actor, profile, false)).rejects.toMatchObject({ status: 409 });
  });

  it('requires every synthetic profile field before saving or submitting', async () => {
    await expect(saveDoctorApplication(fakeSql(), actor, { ...profile, licenseNum: '' }, true)).rejects.toMatchObject({ message: 'incomplete_doctor_profile', status: 400 });
  });
});

describe('admin invitation and review', () => {
  it('creates a seven-day invitation without accepting a caller-selected wallet', async () => {
    const invited = { ...onboarding, source: 'invitation', state: 'invited', privy_user_id: null, wallet_id: null, wallet: null, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), invited_by: admin.userId };
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([doctor]).mockResolvedValueOnce([invited]);
    const result = await createDoctorInvitation(fakeSql(query), admin, { name: profile.name, email: actor.email, specialty: profile.specialty, wallet: 'forged' });
    expect(result).toMatchObject({ onboarding: { source: 'invitation', state: 'invited', wallet: null } });
    expect(query.mock.calls[3][1]).not.toContain('forged');
  });

  it('keeps one active onboarding process per email', async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id }]);
    await expect(createDoctorInvitation(fakeSql(query), admin, { name: profile.name, email: actor.email, specialty: profile.specialty })).rejects.toMatchObject({ message: 'doctor_onboarding_already_active', status: 409 });
  });

  it('allows request changes, rejection and reopening only through valid transitions', async () => {
    const changed = { ...onboarding, state: 'changes_requested', review_note: 'Corrige el registro' };
    const query = vi.fn().mockResolvedValueOnce([changed]).mockResolvedValueOnce([doctor]);
    await expect(reviewDoctorOnboarding(fakeSql(query), admin, id, 'request_changes', 'Corrige el registro')).resolves.toMatchObject({ state: 'changes_requested' });
    await expect(reviewDoctorOnboarding(fakeSql(), admin, id, 'approve', '')).rejects.toMatchObject({ message: 'invalid_onboarding_review', status: 400 });
  });
});

describe('authorization handoff', () => {
  it('accepts only a submitted, identity-bound onboarding record', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ ...onboarding, state: 'submitted' }]);
    await expect(assertSubmittedOnboarding(fakeSql(query), 21)).resolves.toMatchObject({ id, state: 'submitted' });
    const invalid = vi.fn().mockResolvedValueOnce([{ ...onboarding, state: 'draft' }]);
    await expect(assertSubmittedOnboarding(fakeSql(invalid), 21)).rejects.toMatchObject({ message: 'doctor_onboarding_not_submitted' });
  });

  it('moves the exact submitted record to the exact authorization request idempotently', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ id }]);
    await expect(markOnboardingAuthorizationPending(fakeSql(query), id, 'request-1')).resolves.toBeUndefined();
    expect(query.mock.calls[0][0]).toContain("state='authorization_pending'");
    expect(query.mock.calls[0][1]).toEqual([id, 'request-1']);
  });

  it('can replace only an unsigned failed handoff with a new pending request', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ id }]);
    await markOnboardingAuthorizationPending(fakeSql(query), id, 'replacement-request');
    const statement = String(query.mock.calls[0][0]);
    expect(statement).toContain("previous.state='failed'");
    expect(statement).toContain('previous.prepared_xdr IS NULL');
    expect(statement).toContain('previous.transaction_hash IS NULL');
    expect(statement).toContain("replacement.state='pending'");
    expect(statement).toContain('authorization_request_id=$2');
  });
});
