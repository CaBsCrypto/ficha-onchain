import { beforeEach, expect, it, vi } from 'vitest';
import { CLINICAL_PREPARE_CAPABILITY_HEADER, CLINICAL_PREPARE_CAPABILITY_VERSION } from '@/lib/clinical/client-contract';
const m = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), environment: vi.fn(), configured: vi.fn(), body: vi.fn(), prepare: vi.fn(), sign: vi.fn(), reconcile: vi.fn(), cancel: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/config', () => ({ assertClinicalEnvironment: m.environment }));
vi.mock('@/lib/clinical/create-once', () => ({ clinicalCreateOnceConfigured: m.configured, assertClinicalWriteScope: vi.fn() }));
vi.mock('@/lib/clinical/rehearsal', () => ({ rehearsalConfigured: vi.fn(), currentClinicalRehearsal: vi.fn() }));
vi.mock('@/lib/clinical/input', () => ({ clinicalBody: m.body }));
vi.mock('@/lib/clinical/operations', () => ({ prepareClinicalOperation: m.prepare, signClinicalOperation: m.sign, reconcileClinicalOperation: m.reconcile, cancelClinicalOperation: m.cancel }));
import { clinicalApi } from '@/lib/clinical/api';
import { POST as prepare } from '@/app/api/private-clinical-operations/route';
import { POST as sign } from '@/app/api/private-clinical-operations/[id]/sign/route';
import { POST as reconcile } from '@/app/api/private-clinical-operations/[id]/retry/route';
import { POST as cancel } from '@/app/api/private-clinical-operations/[id]/cancel/route';
const actor = { userId: 'did:privy:capability', walletId: 'fixture-wallet', address: 'fixture-address' };
const user = { userId: actor.userId, email: 'fixture@example.test' };
const id = '09fedaff-8110-4415-8b5c-3409bf0a5731';
const input = { requestId: id, action: 'create_history' };
function request(capability?: string, origin = 'http://localhost') {
  const headers = new Headers({ host: 'localhost', origin, 'content-type': 'application/json' });
  if (capability !== undefined) headers.set(CLINICAL_PREPARE_CAPABILITY_HEADER, capability);
  return new Request('http://localhost/api/private-clinical-operations', { method: 'POST', headers, body: '{not parsed' });
}
beforeEach(() => {
  vi.resetAllMocks(); m.auth.mockResolvedValue(user); m.actor.mockResolvedValue(actor); m.configured.mockReturnValue(false);
  m.body.mockResolvedValue(input); m.prepare.mockResolvedValue({ prepared: true });
  m.sign.mockResolvedValue({ signed: true }); m.reconcile.mockResolvedValue({ reconciled: true }); m.cancel.mockResolvedValue({ cancelled: true });
});
it.each([undefined, '1', '2', '4', '3, 3', '3, 2'])('rejects missing or incompatible preparation capability (%s) before body, identity or operation effects', async capability => {
  const result = await prepare(request(capability));
  expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: 'clinical_client_update_required' });
  expect(result.headers.get('Cache-Control')).toBe('no-store');
  for (const effect of [m.environment, m.actor, m.configured, m.body, m.prepare, m.sign, m.reconcile, m.cancel]) expect(effect).not.toHaveBeenCalled();
  expect(m.auth).toHaveBeenCalledOnce();
});
it('retains authentication and same-origin rejection ahead of the capability check', async () => {
  m.auth.mockResolvedValueOnce(null);
  expect((await prepare(request())).status).toBe(401);
  expect((await prepare(request(undefined, 'https://other.test'))).status).toBe(403);
  expect(m.body).not.toHaveBeenCalled(); expect(m.prepare).not.toHaveBeenCalled(); expect(m.actor).not.toHaveBeenCalled();
});
it('allows the current client through the same authenticated preparation and final identity checks', async () => {
  expect(CLINICAL_PREPARE_CAPABILITY_VERSION).toBe('3');
  const incoming = request(CLINICAL_PREPARE_CAPABILITY_VERSION);
  const result = await prepare(incoming);
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ prepared: true });
  expect(m.body).toHaveBeenCalledExactlyOnceWith(incoming);
  expect(m.prepare).toHaveBeenCalledExactlyOnceWith(user, actor, input);
  expect(m.auth).toHaveBeenCalledTimes(2); expect(m.actor).toHaveBeenCalledTimes(2);
});
it('does not require a preparation capability for existing reads', async () => {
  const work = vi.fn().mockResolvedValue({ readable: true });
  const result = await clinicalApi(new Request('http://localhost/api/private-clinical-history'), work);
  expect(result.status).toBe(200); expect(work).toHaveBeenCalledExactlyOnceWith(user, actor);
});
it.each(['sign', 'reconcile', 'cancel'] as const)('keeps the actual existing %s route usable without a preparation capability', async action => {
  const routes = { sign, reconcile, cancel };
  const signature = '7'.repeat(128);
  const incoming = new Request(`http://localhost/api/private-clinical-operations/${id}/${action}`, { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true, ...(action === 'sign' ? { signature } : {}) }) });
  const result = await routes[action](incoming, { params: Promise.resolve({ id }) });
  expect(result.status).toBe(200); expect(m[action]).toHaveBeenCalledOnce(); expect(m.prepare).not.toHaveBeenCalled();
});
