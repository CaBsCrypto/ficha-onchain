import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/db';
import { decryptDossier } from '../../scripts/lib/private-doctor-dossier.mjs';
const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), release: vi.fn(), wallet: vi.fn(), writes: vi.fn() }));
vi.mock('@/lib/db', () => ({
  getDbConnection: async () => ({ query: mocks.transaction, release: mocks.release }),
  sqlForConnection: () => ({ query: mocks.query }),
}));
vi.mock('@/lib/doctor-authorizations', () => ({ verifiedWallet: mocks.wallet, resolveDoctor: vi.fn() }));
vi.mock('@/lib/private-config', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/private-config')>();
  return { ...actual, assertPrivateEnvironment: vi.fn(), assertPrivateWrites: mocks.writes };
});
import { acceptDoctorInvitation, createDoctorInvitation, onboardingTransaction, saveDoctorApplication, reviewDoctorOnboarding, isDoctorLocallyApproved } from '@/lib/doctor-onboarding';
const actor = { userId: 'did:privy:synthetic', email: 'doctor@example.test' };
const id = 'd9a1e787-73bc-41ae-805b-a246ab75cac3';
const submissionId = 'f7388b3e-236f-40d1-9315-8dcf8e80b3b9';
const binding = { walletId: 'stellar-owned', address: 'G'.padEnd(56, 'A') };
const doctor = { id: 12, name: 'Synthetic Doctor', specialty: 'Test', status: 'pending' };
const profile = { name: 'Synthetic Doctor', specialty: 'Test', licenseNum: 'TEST-01', rut: 'SYNTHETIC-01' };
const sql = { query: mocks.query } as unknown as Sql;
const owned = { id, doctor_id: doctor.id, email: actor.email, privy_user_id: actor.userId, wallet_id: binding.walletId, wallet: binding.address };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TRUSTLEAF_DATA_KEY', 'ab'.repeat(32));
  mocks.wallet.mockResolvedValue(binding);
  mocks.query.mockResolvedValue([]);
  mocks.transaction.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe('onboarding transaction and ownership boundaries', () => {
  it('rolls back and releases the connection when a transition fails', async () => {
    await expect(onboardingTransaction(' Doctor@Example.Test ', async () => { throw Error('test failure'); })).rejects.toThrow('test failure');
    expect(mocks.transaction.mock.calls.map(c => c[0])).toEqual(['BEGIN', 'SELECT pg_advisory_xact_lock(hashtext($1))', 'ROLLBACK']);
    expect(mocks.transaction.mock.calls[1][1]).toEqual(['doctor-onboarding:doctor@example.test']);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it('does not open a transaction when writes are disabled', async () => {
    mocks.writes.mockImplementation(() => { throw Error('private_writes_disabled'); });
    await expect(onboardingTransaction(actor.email, async () => null)).rejects.toThrow('private_writes_disabled');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('accepts an invitation as a draft without any authorization request', async () => {
    let accepted = false;
    mocks.query.mockImplementation(async (q: string) => {
      if (q.includes('FROM doctors')) return [doctor];
      if (q.includes('SELECT * FROM doctor_onboarding_requests')) return [accepted ? { ...owned, source: 'invitation', state: 'draft', accepted_at: 'now' } : { id, source: 'invitation', state: 'invited', email: actor.email }];
      if (q.includes('expires_at>NOW()')) return [{ id }];
      if (q.includes('FROM privy_stellar_wallet_bindings')) return [{ user_id: actor.userId }];
      if (q.includes("SET state='draft'")) accepted = true;
      return [];
    });
    const result = await acceptDoctorInvitation(sql, actor);
    expect(result.onboarding?.state).toBe('draft');
    expect(mocks.transaction).toHaveBeenCalledWith('COMMIT');
    expect(mocks.query.mock.calls.some(c => String(c[0]).includes('doctor_authorization_requests'))).toBe(false);
  });
  it('rejects an expired invitation without saving an identity', async () => {
    mocks.query.mockImplementation(async (q: string) => q.includes('SELECT * FROM doctor_onboarding_requests') ? [{ id, state: 'invited' }] : []);
    await expect(acceptDoctorInvitation(sql, actor)).rejects.toThrow('invitation_expired');
    expect(mocks.query.mock.calls.some(c => String(c[0]).startsWith('UPDATE'))).toBe(false);
    expect(mocks.transaction).toHaveBeenCalledWith('ROLLBACK');
  });
  it('rejects a changed wallet before accepting an already claimed invitation', async () => {
    mocks.query.mockImplementation(async (q: string) => q.includes('SELECT * FROM doctor_onboarding_requests') ? [{ ...owned, wallet: 'another', state: 'draft', source: 'invitation', accepted_at: 'now' }] : []);
    await expect(acceptDoctorInvitation(sql, actor)).rejects.toThrow('doctor_identity_mismatch');
  });
  it('blocks a duplicate invitation without replacing the process', async () => {
    mocks.query.mockImplementation(async (q: string) => q.includes('FROM doctors') ? [doctor] : q.includes('SELECT * FROM doctor_onboarding_requests') ? [{ id, state: 'submitted' }] : []);
    await expect(createDoctorInvitation(sql, actor, { email: actor.email, name: profile.name, specialty: profile.specialty })).rejects.toThrow('doctor_onboarding_already_active');
    expect(mocks.query.mock.calls.some(c => String(c[0]).startsWith('INSERT'))).toBe(false);
  });
});

describe('immutable submitted profile and review', () => {
  it('stores a complete submission encrypted and tied to the verified identity', async () => {
    let current: Record<string, unknown> = { ...owned, state: 'draft' };
    let snapshot: Record<string, unknown> | undefined;
    mocks.query.mockImplementation(async (q: string, p: unknown[] = []) => {
      if (q.includes('FROM doctors')) return [doctor];
      if (q.includes('SELECT * FROM doctor_onboarding_requests')) return [current];
      if (q.includes('FROM privy_stellar_wallet_bindings')) return [{ user_id: actor.userId }];
      if (q.includes('COALESCE(MAX(revision)')) return [{ revision: 1 }];
      if (q.startsWith('INSERT INTO doctor_onboarding_submissions')) snapshot = { id: p[0], onboarding_id: p[1], revision: p[2], privy_user_id: p[3], email: p[4], wallet_id: p[5], wallet: p[6], encrypted_profile: p[7] };
      if (q.startsWith('UPDATE doctor_onboarding_requests')) current = { ...current, state: p[1], encrypted_draft: p[2], current_submission_id: p[3] };
      if (q.includes('SELECT * FROM doctor_onboarding_submissions')) return [snapshot];
      return [];
    });
    const result = await saveDoctorApplication(sql, actor, profile, true);
    expect(result.onboarding?.state).toBe('submitted');
    expect(snapshot?.wallet).toBe(binding.address);
    expect(String(snapshot?.encrypted_profile)).not.toContain(profile.licenseNum);
    const context = JSON.stringify(['TrustLeaf/DoctorOnboarding/v1', 'testnet', 'cmrix722m03d30clewd1fuffq', 'submission', snapshot?.id]);
    expect(decryptDossier<{profile: typeof profile}>(String(snapshot?.encrypted_profile), 'ab'.repeat(32), context).profile).toEqual(profile);
    expect(() => decryptDossier(String(snapshot?.encrypted_profile), 'ab'.repeat(32), context + 'wrong')).toThrow();
  });
  it.each(['submitted', 'authorization_pending', 'rejected', 'authorized'])('cannot edit a %s profile', async state => {
    mocks.query.mockImplementation(async (q: string) => q.includes('FROM doctors') ? [doctor] : q.includes('SELECT * FROM doctor_onboarding_requests') ? [{ ...owned, state }] : []);
    await expect(saveDoctorApplication(sql, actor, profile, false)).rejects.toThrow();
    expect(mocks.query.mock.calls.some(c => /^(UPDATE|INSERT)/.test(String(c[0])))).toBe(false);
  });
  it('rejects an administrator review of a stale submission', async () => {
    mocks.query.mockImplementation(async (q: string) => q.startsWith('SELECT email') ? [{ email: actor.email }] : q.includes('SELECT * FROM doctor_onboarding_requests') ? [{ ...owned, state: 'submitted', current_submission_id: 'newer' }] : []);
    await expect(reviewDoctorOnboarding(sql, actor, id, 'request_changes', 'Synthetic review', submissionId)).rejects.toThrow('onboarding_state_changed');
    expect(mocks.transaction).toHaveBeenCalledWith('ROLLBACK');
  });
  it('does not treat a pending profile as approved even if a grant exists elsewhere', async () => {
    mocks.query.mockResolvedValue([{ status: 'pending' }]);
    expect(await isDoctorLocallyApproved(sql, doctor.id, { ...actor, ...binding })).toBe(false);
  });
  it('preserves an existing locally approved doctor without a new application', async () => {
    mocks.query.mockResolvedValue([{ status: 'active', onboarding_id: null }]);
    expect(await isDoctorLocallyApproved(sql, doctor.id, { ...actor, ...binding })).toBe(true);
  });
});
