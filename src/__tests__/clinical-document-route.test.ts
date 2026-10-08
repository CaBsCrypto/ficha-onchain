import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), own: vi.fn(), document: vi.fn(), fetch: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/config', () => ({ assertClinicalEnvironment: vi.fn() }));
vi.mock('@/lib/clinical/history', () => ({ ownClinicalHistory: m.own, clinicalDocument: m.document }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: m.fetch }));
import { GET } from '@/app/api/private-clinical-history/document/route';
import { readClinicalDownload } from '@/components/private-portal/clinical-client';
const entry = '1'.repeat(64);
const actor = { userId: 'did:privy:synthetic', walletId: 'synthetic-wallet', address: 'synthetic-public-address' };
const request = (query = `entryId=${entry}&version=1`) => new Request(`http://localhost/api/private-clinical-history/document?${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ userId: actor.userId, email: 'synthetic@example.test' });
  m.actor.mockResolvedValue(actor); m.own.mockResolvedValue({ history: { id: '2'.repeat(64) } });
});
it.each(['application/pdf', 'image/png', 'image/jpeg'])('downloads verified %s through the actual route/client boundary', async mediaType => {
  m.document.mockResolvedValue({ metadata: { mediaType, fileName: "examen prueba's.pdf" }, content: new Uint8Array([1, 2, 3]) });
  const response = await GET(request());
  expect(response.status).toBe(200); expect(response.headers.get('Content-Type')).toBe(mediaType);
  expect(response.headers.get('Content-Disposition')).toContain('attachment;');
  expect(response.headers.get('Content-Disposition')).toContain('examen%20prueba%27s.pdf');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  m.fetch.mockResolvedValue(response);
  expect((await readClinicalDownload(entry, 1, new AbortController().signal)).size).toBe(3);
});
it.each([`entryId=${entry}&version=1&patient=other`, `entryId=${entry}&entryId=${entry}&version=1`, `entryId=${entry}&version=0`, `entryId=${entry}&version=4294967296`])('rejects untrusted selector %s without reading a document', async query => {
  expect((await GET(request(query))).status).toBe(400); expect(m.document).not.toHaveBeenCalled();
});
it('does not return downloaded bytes after session expiry', async () => {
  m.document.mockResolvedValue({ metadata: { mediaType: 'application/pdf', fileName: 'examen.pdf' }, content: Buffer.from('PRIVATE SENTINEL') });
  m.auth.mockResolvedValueOnce({ userId: actor.userId }).mockResolvedValueOnce(null);
  const response = await GET(request());
  expect(response.status).toBe(401); expect(await response.text()).not.toContain('PRIVATE SENTINEL');
});
