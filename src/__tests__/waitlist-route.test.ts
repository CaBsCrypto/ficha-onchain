import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ sql: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: () => mock.sql }));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: mock.user,
  unauthorized: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
  forbidden: () => Response.json({ error: 'forbidden' }, { status: 403 }) }));
import { GET, POST } from '@/app/api/waitlist/route';
import { isPrivatePortalPath } from '@/lib/private-routes';
const request = (body: unknown) => new Request('https://trustleaf.test/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('TRUSTLEAF_WAITLIST_ENABLED', 'true');
  vi.stubEnv('ADMIN_EMAILS', 'admin@example.test'); vi.stubEnv('WAITLIST_ADMIN_TOKEN', 'legacy');
  mock.user.mockResolvedValue(null); mock.sql.mockResolvedValue([{ count: 1 }]);
});
afterEach(() => vi.unstubAllEnvs());
describe('public waitlist', () => {
  it('allows only the existing endpoint, without reopening retired modules', () => {
    expect(isPrivatePortalPath('/api/waitlist')).toBe(true);
    expect(isPrivatePortalPath('/admin/waitlist')).toBe(true);
    expect(isPrivatePortalPath('/api/mcp')).toBe(false);
  });
  it('normalizes and uses an idempotent insert with identical confirmation for duplicates', async () => {
    for (let i=0;i<2;i++) {
      const response = await POST(request({ email: '  Test@Example.test  ' }));
      expect(response.status).toBe(200); expect(await response.json()).toEqual({ success: true });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    const insert = mock.sql.mock.calls.filter(([parts]) => parts.join('').includes('INSERT INTO waitlist'));
    expect(insert).toHaveLength(2);
    expect(insert[0][1]).toBe('test@example.test');
    expect(insert[0][0].join('')).toContain('ON CONFLICT (email) DO NOTHING');
  });
  it.each([null, [], {}, { email: [] }, { email: 'invalid' }, { email: 'a'.repeat(255)+'@example.test' }])('rejects invalid input without database calls: %j', async body => {
    expect((await POST(request(body))).status).toBe(400); expect(mock.sql).not.toHaveBeenCalled();
  });
  it('limits actual body bytes without trusting Content-Length', async () => {
    expect((await POST(request({ email: 'a@example.test', extra: 'x'.repeat(1100) }))).status).toBe(413);
    expect(mock.sql).not.toHaveBeenCalled();
  });
  it('does not accept new entries until explicitly enabled', async () => {
    vi.stubEnv('TRUSTLEAF_WAITLIST_ENABLED', 'false');
    expect((await POST(request({ email: 'a@example.test' }))).status).toBe(503); expect(mock.sql).not.toHaveBeenCalled();
  });
  it('rejects excess requests before insertion with a retry interval', async () => {
    mock.sql.mockResolvedValue([{ count: 31 }]);
    const response = await POST(request({ email: 'a@example.test' }));
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('60');
    expect(mock.sql).toHaveBeenCalledOnce();
  });
  it('fails closed and does not leak database errors or log email addresses', async () => {
    const log = vi.spyOn(console, 'error'); mock.sql.mockRejectedValue(new Error('postgres://secret@host user@example.test'));
    const response = await POST(request({ email: 'a@example.test' }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'waitlist_unavailable' });
    expect(log).not.toHaveBeenCalled(); log.mockRestore();
  });
});
describe('waitlist list authorization', () => {
  it('rejects anonymous callers including the obsolete shared token', async () => {
    expect((await GET(new Request('https://trustleaf.test/api/waitlist?token=legacy', { headers: { 'x-admin-token': 'legacy' } }))).status).toBe(401);
    expect(mock.user).toHaveBeenCalledWith(expect.any(Request), { strict: true }); expect(mock.sql).not.toHaveBeenCalled();
  });
  it('rejects authenticated non-admins without reading the list', async () => {
    mock.user.mockResolvedValue({ email: 'patient@example.test' });
    expect((await GET(new Request('https://trustleaf.test/api/waitlist'))).status).toBe(403); expect(mock.sql).not.toHaveBeenCalled();
  });
  it('permits only the configured authenticated admin and never caches the list', async () => {
    mock.user.mockResolvedValue({ email: 'admin@example.test' }); mock.sql.mockResolvedValue([]);
    const response = await GET(new Request('https://trustleaf.test/api/waitlist'));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ count: 0, signups: [] });
  });
});
