import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), config: vi.fn(), list: vi.fn(), get: vi.fn(), save: vi.fn(), del: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/config', () => ({ assertClinicalEnvironment: m.config }));
vi.mock('@/lib/clinical/api', () => ({ clinicalJson: (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } }) }));
vi.mock('@/lib/clinical/drafts', () => ({ listClinicalDrafts: m.list, getClinicalDraft: m.get, saveClinicalDraft: m.save, deleteClinicalDraft: m.del }));
import { clinicalDraftApi } from '@/lib/clinical/drafts-api';
import { GET, POST } from '@/app/api/private-clinical-drafts/route';
import { GET as GET_ITEM, PUT, DELETE } from '@/app/api/private-clinical-drafts/[id]/route';
const actor = { userId: 'did:privy:doctor', walletId: 'wallet', address: 'address' };
const id = '11111111-1111-4111-8111-111111111111', context = { params: Promise.resolve({ id }) };
const req = (method = 'GET', body?: unknown) => new Request('http://localhost/api/private-clinical-drafts', { method,
  headers: { host: 'localhost', origin: 'http://localhost' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue({ userId: actor.userId, email: 'a@example.test' }); m.actor.mockResolvedValue(actor); m.list.mockResolvedValue({ drafts: [], hasMore: false, nextBefore: null }); });

it('requires strict auth for reads and writes and prevents shared cache', async () => {
  m.auth.mockResolvedValue(null);
  for (const request of [req(), req('POST', {})]) {
    const response = await clinicalDraftApi(request, m.list);
    expect(response.status).toBe(401); expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  expect(m.list).not.toHaveBeenCalled();
});
it('checks origin before draft mutations', async () => {
  const response = await POST(new Request('http://localhost/x', { method: 'POST', headers: { host: 'localhost', origin: 'http://other.test' }, body: '{}' }));
  expect(response.status).toBe(403); expect(m.save).not.toHaveBeenCalled();
});
it('allows offchain saves while requesting read-only environment verification', async () => {
  m.save.mockResolvedValue({ id, revision: 1 });
  const response = await POST(req('POST', { id }));
  expect(response.status).toBe(200); expect(m.config).toHaveBeenCalledWith(false);
  expect(m.auth).toHaveBeenCalledWith(expect.any(Request), { strict: true });
});
it('hides returned content after logout or wallet switch during IO', async () => {
  m.get.mockResolvedValue({ payload: 'PRIVATE' });
  m.auth.mockResolvedValueOnce({ userId: actor.userId, email: 'a@example.test' }).mockResolvedValueOnce(null);
  const response = await GET_ITEM(req(), context);
  expect(response.status).toBe(401); expect(await response.text()).not.toContain('PRIVATE');
  m.auth.mockResolvedValue({ userId: actor.userId, email: 'a@example.test' });
  m.actor.mockResolvedValueOnce(actor).mockResolvedValueOnce({ ...actor, walletId: 'switched' });
  const changed = await GET_ITEM(req(), context); expect(changed.status).toBe(403);
  expect(await changed.text()).not.toContain('PRIVATE');
});
it('routes list/item/update/delete to author-only services with CAS', async () => {
  expect((await GET(req())).status).toBe(200); expect(m.list).toHaveBeenCalledWith(actor, {});
  m.get.mockResolvedValue({ id }); expect((await GET_ITEM(req(), context)).status).toBe(200); expect(m.get).toHaveBeenCalledWith(actor, id);
  m.save.mockResolvedValue({ id, revision: 2 });
  await PUT(req('PUT', { expectedRevision: 1, historyId: 'h', patient: 'p', payload: {} }), context);
  expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ userId: actor.userId }), actor, expect.objectContaining({ id, expectedRevision: 1 }));
  m.del.mockResolvedValue({ deleted: true, id, revision: 3 });
  expect((await DELETE(req('DELETE', { expectedRevision: 2 }), context)).status).toBe(200);
  expect(m.del).toHaveBeenCalledWith(actor, id, 2);
});
it('sanitizes DB/provider failures', async () => {
  m.list.mockRejectedValue(Error('postgres://SECRET PRIVATE'));
  const response = await GET(req()); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'clinical_drafts_unavailable' });
});
it('rejects missing delete CAS and unexpected update fields', async () => {
  expect((await DELETE(req('DELETE', {}), context)).status).toBe(400);
  expect((await PUT(req('PUT', { id: 'spoofed' }), context)).status).toBe(400);
  expect(m.save).not.toHaveBeenCalled(); expect(m.del).not.toHaveBeenCalled();
});

it('validates collection cursors and returns metadata pagination directly', async () => {
  const page = { drafts: [{ id }], hasMore: true, nextBefore: id }; m.list.mockResolvedValue(page);
  const response = await GET(new Request('http://localhost/api/private-clinical-drafts?before=' + id));
  expect(await response.json()).toEqual(page); expect(m.list).toHaveBeenCalledWith(actor, { before: id });
  for (const query of ['before=invalid', 'before=' + id + '&before=' + id, 'offset=1'])
    expect((await GET(new Request('http://localhost/api/private-clinical-drafts?' + query))).status).toBe(400);
});
