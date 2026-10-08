import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), config: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/config', () => ({ assertClinicalEnvironment: m.config }));
import { clinicalApi } from '@/lib/clinical/api';
const actor = { userId: 'did:privy:patient', walletId: 'wallet', address: 'wallet-address' };
const req = (method = 'GET') => new Request('http://localhost/test', { method, headers: { host: 'localhost', origin: 'http://localhost' } });
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ userId: actor.userId, email: 'test@example.test' }); m.actor.mockResolvedValue(actor); });
afterEach(() => vi.unstubAllEnvs());
it('rejects anonymous reads with no-store and no content', async () => {
  m.auth.mockResolvedValue(null); const work = vi.fn(); const response = await clinicalApi(req(), work);
  expect(response.status).toBe(401); expect(work).not.toHaveBeenCalled(); expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('rejects cross-origin writes before preparation', async () => {
  const work = vi.fn(); const response = await clinicalApi(new Request('http://localhost/test', { method: 'POST', headers: { host: 'localhost', origin: 'https://other.test' } }), work);
  expect(response.status).toBe(403); expect(work).not.toHaveBeenCalled();
});
it.each(['expired', 'changed'])('discards private content after a %s session', async condition => {
  m.auth.mockResolvedValueOnce({ userId: actor.userId, email: 'a@test.test' }).mockResolvedValueOnce(condition === 'expired' ? null : { userId: 'did:privy:other', email: 'b@test.test' });
  const response = await clinicalApi(req(), async () => ({ content: 'PRIVATE SENTINEL' }));
  expect(response.status).toBe(401); expect(await response.text()).not.toContain('PRIVATE SENTINEL');
});
it('discards decrypted content if wallet changes during IO', async () => {
  m.actor.mockResolvedValueOnce(actor).mockResolvedValueOnce({ ...actor, address: 'other-wallet' });
  const response = await clinicalApi(req(), async () => ({ content: 'PRIVATE SENTINEL' }));
  expect(response.status).toBe(403); expect(await response.text()).not.toContain('PRIVATE SENTINEL');
});
it('sanitizes provider exceptions and never labels failures verified', async () => {
  const response = await clinicalApi(req(), async () => { throw Error('postgres://secret PRIVATE SENTINEL'); });
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'clinical_service_unavailable' });
});
