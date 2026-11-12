import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), config: vi.fn(), context: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/config', () => ({ assertClinicalEnvironment: m.config }));
vi.mock('@/lib/clinical/doctor-context', () => ({ clinicalDoctorContext: m.context }));
import { GET } from '@/app/api/doctor/clinical-context/route';
import { isPrivatePortalPath } from '@/lib/private-routes';
const actor = { userId: 'did:privy:doctor', walletId: 'verified-wallet', address: 'verified-address' };
const id = 'ab'.repeat(32);
const request = (query = `historyId=${id}`) => new Request(`http://localhost/api/doctor/clinical-context?${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ userId: actor.userId, email: 'doctor@example.test' });
  m.actor.mockResolvedValue(actor);
  m.context.mockResolvedValue({ historyId: id, doctorId: 7, canRead: false, canAppend: true, grantRevision: 3, verifiedAt: 'now' });
});
it('exposes only the selected context endpoint through the portal gate', () => {
  expect(isPrivatePortalPath('/api/doctor/clinical-context')).toBe(true);
  expect(isPrivatePortalPath('/api/doctor/clinical-context/patients')).toBe(false);
  expect(isPrivatePortalPath('/api/doctor/clinical-context/anything')).toBe(false);
});
it('requires a real session before selecting any history', async () => {
  m.auth.mockResolvedValue(null);
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect(m.context).not.toHaveBeenCalled();
});
it.each(['', `historyId=${id}&historyId=${id}`, `historyId=${id}&wallet=forged`, `historyId=${id}&doctorId=7`, `historyId=${id}&role=doctor`])('rejects ambiguous locators and caller-supplied authority: %s', async query => {
  expect((await GET(request(query))).status).toBe(400);
  expect(m.context).not.toHaveBeenCalled();
});
it('returns only observed context without caching or enabling writes', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Vary')).toBe('Authorization');
  expect(m.config).toHaveBeenCalledWith(false);
  expect(m.context).toHaveBeenCalledWith({ userId: actor.userId, email: 'doctor@example.test' }, actor, id);
  expect(await response.json()).toMatchObject({ canRead: false, canAppend: true });
});
it('discards the observed context when the caller switches accounts during IO', async () => {
  m.auth.mockResolvedValueOnce({ userId: actor.userId, email: 'doctor@example.test' }).mockResolvedValueOnce({ userId: 'did:privy:other', email: 'other@example.test' });
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect(await response.text()).not.toContain(id);
});
it('sanitizes provider exceptions', async () => {
  m.context.mockRejectedValue(new Error('provider credential sentinel'));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'clinical_service_unavailable' });
});
