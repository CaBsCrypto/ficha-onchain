import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), config: vi.fn(), options: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/config', () => ({ assertClinicalEnvironment: m.config }));
vi.mock('@/lib/clinical/prescriptions', () => ({ clinicalPrescriptionOptions: m.options }));
import { GET } from '@/app/api/private-clinical-history/prescriptions/route';
const actor = { userId: 'did:privy:patient', walletId: 'wallet', address: 'address' };
const historyId = 'ab'.repeat(32);
const user = { userId: actor.userId, email: 'patient@example.test' };
const request = (query = '') => new Request(`http://localhost/api/private-clinical-history/prescriptions${query ? `?${query}` : ''}`);
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue(user); m.actor.mockResolvedValue(actor);
  m.options.mockResolvedValue({ prescriptions: [], verifiedAt: 'now' });
});
it('requires strict authentication before selecting RX options', async () => {
  m.auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401); expect(m.options).not.toHaveBeenCalled();
});
it.each(['', `historyId=${historyId}`])('returns only fresh scoped options without caching: %s', async query => {
  const response = await GET(request(query));
  expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Vary')).toBe('Authorization'); expect(m.config).toHaveBeenCalledWith(false);
  expect(m.options).toHaveBeenCalledWith(user, actor, query ? historyId : undefined);
  expect(await response.json()).toEqual({ prescriptions: [], verifiedAt: 'now' });
});
it.each(['historyId=', 'historyId=bad', `historyId=${historyId}&historyId=${historyId}`, 'role=doctor', 'patient=forged', 'wallet=forged'])('rejects caller-supplied authority or ambiguous context: %s', async query => {
  expect((await GET(request(query))).status).toBe(400); expect(m.options).not.toHaveBeenCalled();
});
it('drops options on an account change during provider IO', async () => {
  m.auth.mockResolvedValueOnce(user).mockResolvedValueOnce({ userId: 'did:privy:other', email: 'other@example.test' });
  expect((await GET(request())).status).toBe(401);
});
it('sanitizes provider failures', async () => {
  m.options.mockRejectedValue(new Error('credential sentinel'));
  const response = await GET(request());
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'clinical_service_unavailable' });
});


it.each([false, true])('narrows the selected RX without caller-supplied identity, doctor context=%s', async doctor => {
  const selected='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const q=(doctor ? `historyId=${historyId}&` : '')+`prescriptionId=${selected.toUpperCase()}`;
  const response=await GET(request(q));
  expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(m.options).toHaveBeenCalledWith(user,actor,doctor ? historyId : undefined,selected);
});
it.each(['prescriptionId=', 'prescriptionId=bad', 'prescriptionId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&prescriptionId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
 'prescriptionId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&wallet=forged'])('rejects malformed or ambiguous selected RX filters: %s',async query=>{
  expect((await GET(request(query))).status).toBe(400);expect(m.options).not.toHaveBeenCalled();
});
