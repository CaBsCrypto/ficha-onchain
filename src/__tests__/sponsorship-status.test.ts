import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ query: vi.fn(), config: vi.fn(), admin: vi.fn(), environment: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDb: () => ({ query: m.query }) }));
vi.mock('@/lib/sponsorship/config', () => ({ loadSponsorshipConfig: m.config }));
vi.mock('@/lib/auth/admin', () => ({ requirePrivyAdmin: m.admin }));
vi.mock('@/lib/private-config', () => ({ assertPrivateEnvironment: m.environment }));
import { getSponsorshipStatus } from '@/lib/sponsorship/status';
import { GET } from '@/app/api/admin/sponsorship-status/route';
const row = () => ({ bucket_count: '2', recorded_limit: '10000', reserved: '1200', spent: '100',
  reserved_count: '2', signed_count: '1', submitted_count: '3', settled_count: '4', released_count: '5',
  oldest_pending: '2026-10-25T23:58:00Z' });
const policy = { enabled: true, maxFeeStroops: '2000', encounterLimitStroops: '3000', sponsorDailyLimitStroops: '10000',
  patientDailyLimitStroops: '5000', emergencyReserveStroops: '1000' };
const request = () => new Request('http://localhost/api/admin/sponsorship-status');
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T23:59:30Z'));
  m.query.mockResolvedValue([row()]); m.config.mockReturnValue({ policy, paths: ['/api/private-clinical-operations'] });
  m.admin.mockResolvedValue({ user: { userId: 'did:privy:admin', email: 'admin@example.test' } });
});
afterEach(() => vi.useRealTimers());

describe('aggregated sponsorship status', () => {
  it('uses one read-only snapshot, sums sponsor buckets only and returns no identifiers or payloads', async () => {
    m.query.mockResolvedValue([{ ...row(), source_wallet: 'PRIVATE_WALLET', patient: 'PRIVATE_PATIENT', payload: 'PRIVATE_CONTENT' }]);
    const status = await getSponsorshipStatus();
    expect(m.query).toHaveBeenCalledOnce();
    const sql = m.query.mock.calls[0][0] as string;
    expect(sql).toContain("bucket_key LIKE 'sponsor:%'");
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i);
    expect(sql).not.toMatch(/SELECT\s+\*|patient_wallet|source_wallet|request_id|payload|actor_id/i);
    expect(m.query.mock.calls[0][1]).toEqual(['testnet', '2026-10-25']);
    expect(status).toMatchObject({ network: 'testnet', coverage: 'new_reservations_only', configurationValid: true, spendingEnabled: true,
      sponsorBuckets: { scope: 'all_sponsors_today', count: 2, recordedLimitStroops: '10000', reservedStroops: '1200', spentStroops: '100' },
      reservations: { scope: 'all_testnet_days', pendingCount: 6, oldestPendingAgeSeconds: 90 } });
    expect(JSON.stringify(status)).not.toMatch(/PRIVATE|wallet|email|actorId|patientAddress|transactionHash|requestId|SECRET/);
  });
  it('reports the policy separately from stored totals and maps the limit to entry semantics', async () => {
    const status = await getSponsorshipStatus();
    expect(status.policy).toEqual({ maxFeeStroops: '2000', entryLimitStroops: '3000', sponsorDailyLimitStroops: '10000',
      patientDailyLimitStroops: '5000', emergencyReserveStroops: '1000' });
    expect(JSON.stringify(status)).not.toContain('encounter');
  });
  it('keeps disabled configuration distinct from historical ledger activity', async () => {
    m.config.mockReturnValue({ policy: null, paths: [] });
    const status = await getSponsorshipStatus();
    expect(status).toMatchObject({ configurationValid: false, spendingEnabled: false, policy: null });
    expect(status.sponsorBuckets.spentStroops).toBe('100');
    expect(status.coverage).toBe('new_reservations_only');
  });
  it('uses UTC rollover and the shared quote freshness limit without requesting a wallet balance', async () => {
    const status = await getSponsorshipStatus();
    expect(status.utcDay).toBe('2026-10-25'); expect(status.resetAt).toBe('2026-10-26T00:00:00.000Z');
    expect(status.quoteMaxAgeSeconds).toBe(90); expect(status.verifiedAt).toBe('2026-10-25T23:59:30.000Z');
    expect(JSON.stringify(status)).not.toMatch(/balance|address|secret|rpc/i);
  });
  it('preserves integer amounts beyond JS number precision', async () => {
    m.query.mockResolvedValue([{ ...row(), spent: '9007199254740993123' }]);
    expect((await getSponsorshipStatus()).sponsorBuckets.spentStroops).toBe('9007199254740993123');
  });
  it('represents a genuinely empty ledger without claiming coverage of prior rehearsal charges', async () => {
    m.query.mockResolvedValue([{ bucket_count: '0', recorded_limit: '0', reserved: '0', spent: '0', reserved_count: '0', signed_count: '0',
      submitted_count: '0', settled_count: '0', released_count: '0', oldest_pending: null }]);
    expect((await getSponsorshipStatus()).reservations).toMatchObject({ pendingCount: 0, oldestPendingAt: null, oldestPendingAgeSeconds: null });
  });
  it.each([{ reserved: '-1' }, { oldest_pending: 'not-a-date' }, { submitted_count: '9007199254740993123' },
    { reserved_count: '0', signed_count: '0', submitted_count: '0' }])('fails closed on malformed or contradictory aggregate rows', async changed => {
    m.query.mockResolvedValue([{ ...row(), ...changed }]);
    await expect(getSponsorshipStatus()).rejects.toThrow('sponsorship_status_unavailable');
  });
});

describe('strict admin GET', () => {
  it.each([401,403])('returns %s without querying totals or exposing auth provider data', async status => {
    m.admin.mockResolvedValue({ error: Response.json({ error: 'SECRET_PROVIDER_CONTENT' }, { status }) });
    const response = await GET(request());
    expect(response.status).toBe(status); expect(m.query).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(response.headers.get('Vary')).toBe('Authorization');
    expect(await response.text()).not.toContain('SECRET');
  });
  it('reuses the strict Privy admin helper, rechecks after IO and returns no admin identity', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200); expect(m.admin).toHaveBeenCalledTimes(2);
    expect(m.admin).toHaveBeenCalledWith(expect.any(Request));
    const body = await response.json(); expect(body.coverage).toBe('new_reservations_only');
    expect(JSON.stringify(body)).not.toContain('admin@example.test');
  });
  it.each(['logout','role','identity'])('discards the aggregate after a %s change during IO', async change => {
    m.admin.mockResolvedValueOnce({ user: { userId: 'did:privy:admin' } }).mockResolvedValueOnce(change === 'identity'
      ? { user: { userId: 'did:privy:different' } } : { error: Response.json({}, { status: change === 'role' ? 403 : 401 }) });
    const response = await GET(request()); expect(response.status).toBe(change === 'role' ? 403 : 401);
    expect(await response.text()).not.toMatch(/sponsorBuckets|reservedStroops|pendingCount/);
  });
  it('returns a fixed503 when the schema or database is unavailable', async () => {
    m.query.mockRejectedValue(Error('42P01 postgres://SECRET PRIVATE_CONTENT'));
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'sponsorship_status_unavailable' });
  });
  it('returns a fixed503 before DB access when the environment is invalid', async () => {
    m.environment.mockImplementation(() => { throw Error('PRIVATE CONFIG'); });
    const response = await GET(request()); expect(response.status).toBe(503); expect(m.query).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'sponsorship_status_unavailable' });
  });
});
