import { beforeEach, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/db';
const m = vi.hoisted(() => ({ resolve: vi.fn(), request: vi.fn(), approve: vi.fn(), transaction: vi.fn(), submission: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: m.resolve, requestDoctorAuthorization: m.request }));
vi.mock('@/lib/doctor-onboarding', () => ({ approveDoctorOnboarding: m.approve, onboardingTransaction: m.transaction, readDoctorSubmission: m.submission }));
import { requestReviewedDoctorAuthorization } from '@/lib/reviewed-doctor-authorization';
const sql = { query: m.query } as unknown as Sql;
const actor = { userId: 'admin-test', email: 'admin@example.test' };
const owner = { userId: 'doctor-test', walletId: 'wallet-test', address: 'stellar-test' };
beforeEach(() => {
  vi.resetAllMocks();
  m.resolve.mockResolvedValue({ ...owner, doctor: { id: 1, email: 'doctor@example.test' } });
  m.transaction.mockImplementation(async (_email, run) => run(sql));
  m.query.mockResolvedValue([]);
});
it('does not authorize a pending legacy profile without a reviewed submission', async () => {
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, status: 'pending' }]).mockResolvedValueOnce([]);
  await expect(requestReviewedDoctorAuthorization(sql, actor, 1, 'authorize')).rejects.toThrow('onboarding_submission_required');
  expect(m.request).not.toHaveBeenCalled();
});
it.each(['draft', 'changes_requested', 'rejected', 'invited'])('blocks %s even when a chain authorization already exists', async state => {
  m.query.mockResolvedValueOnce([{ state }]).mockResolvedValueOnce([{ id: 1, status: 'active' }]).mockResolvedValueOnce([{ state, current_submission_id: 'revision-1' }]);
  await expect(requestReviewedDoctorAuthorization(sql, actor, 1, 'renew', 'revision-1')).rejects.toThrow('onboarding_state_changed');
  expect(m.request).not.toHaveBeenCalled();
});
it('routes a submitted revision through the transactional approval gate', async () => {
  const snapshot = { id: 'revision-1', owner };
  m.query.mockResolvedValueOnce([{ state: 'submitted' }]);
  m.approve.mockImplementation(async (_sql, _actor, _id, revision, prepare) => {
    expect(revision).toBe('revision-1');
    return prepare(sql, snapshot);
  });
  await requestReviewedDoctorAuthorization(sql, actor, 1, 'renew', 'revision-1');
  expect(m.request).toHaveBeenCalledWith(sql, actor, 1, 'renew', { submission: snapshot, transactional: true });
});
it('rejects a stale reviewed revision before renewal', async () => {
  m.query.mockResolvedValueOnce([{ state: 'authorized' }]).mockResolvedValueOnce([{ id: 1, status: 'active' }]).mockResolvedValueOnce([{ state: 'authorized', current_submission_id: 'revision-2' }]);
  await expect(requestReviewedDoctorAuthorization(sql, actor, 1, 'renew', 'revision-1')).rejects.toThrow('onboarding_state_changed');
  expect(m.request).not.toHaveBeenCalled();
});
it.each(['active','blocked'])('preserves renewal for a previously approved %s profile without onboarding', async status => {
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, status }]).mockResolvedValueOnce([]);
  await requestReviewedDoctorAuthorization(sql, actor, 1, 'renew');
  expect(m.request).toHaveBeenCalledWith(sql, actor, 1, 'renew', { transactional: true });
});
