import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errors } from 'jose';

const mock = vi.hoisted(() => ({ verify: vi.fn(), user: vi.fn() }));
vi.mock('@privy-io/server-auth', () => ({ PrivyClient: class {
  verifyAuthToken = mock.verify;
  getUser = mock.user;
} }));

const secret = 'PRIVATE-synthetic-secret-Bearer-token';
const request = () => new Request('https://portal.example.test/api/test?email=' + secret, {
  headers: { authorization: 'Bearer ' + secret },
});
const authLines = () => vi.mocked(console.warn).mock.calls.filter(call => call[0] === '[auth]');
async function rejectProvider(phase: 'verifyAuthToken' | 'getUser', error: unknown, strict = true) {
  (phase === 'verifyAuthToken' ? mock.verify : mock.user).mockRejectedValue(error);
  const { requireUser } = await import('@/lib/auth/privy-auth');
  if (!strict) return requireUser(request());
  return requireUser(request(), { strict: true }).catch(failure => failure);
}
function noSecret(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/PRIVATE|synthetic-secret|Bearer|portal\.example|authorization|cookie|providerBody/);
}

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv('PRIVY_APP_ID', 'synthetic-app');
  vi.stubEnv('PRIVY_APP_SECRET', 'synthetic-server-secret');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mock.verify.mockResolvedValue({ userId: 'did:privy:synthetic-test' });
  mock.user.mockResolvedValue({ linkedAccounts: [{ type: 'email', address: 'owner@example.test' }] });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('closed Privy provider diagnostics', () => {
  it.each([
    ['verifyAuthToken', false], ['verifyAuthToken', true], ['getUser', false], ['getUser', true],
  ] as const)('keeps %s failure stage and emits one auth line with strict=%s', async (phase, strict) => {
    const failure = await rejectProvider(phase, new Error(secret), strict);
    if (strict) expect(failure).toMatchObject({ code: 'auth_service_unavailable', category: 'auth_provider' });
    else expect(failure).toBeNull();
    expect(authLines()).toEqual([['[auth]', {
      category: 'auth_provider', code: 'auth_service_unavailable', phase,
      name: 'Error', providerCode: 'unclassified', status: null, retryAfterSeconds: null,
    }]]);
    expect(console.warn).toHaveBeenCalledOnce();
    if (phase === 'verifyAuthToken') expect(mock.user).not.toHaveBeenCalled();
    noSecret(failure); noSecret(vi.mocked(console.warn).mock.calls);
  });

  it('extracts a rate limit and numeric Retry-After from the SDK cause without retaining raw headers or body', async () => {
    const provider = Object.assign(new Error(secret), {
      name: 'PrivyApiError', type: 'rate_limit_exceeded', status: 429, code: secret,
      cause: { headers: { 'retry-after': '12', authorization: secret, cookie: secret }, providerBody: secret },
      response: { providerBody: secret, user: { email: secret } },
    });
    const failure = await rejectProvider('getUser', provider);
    expect(authLines()).toEqual([['[auth]', {
      category: 'auth_provider', code: 'auth_service_unavailable', phase: 'getUser',
      name: 'PrivyApiError', providerCode: 'rate_limit_exceeded', status: 429, retryAfterSeconds: 12,
    }]]);
    expect(failure).not.toHaveProperty('cause');
    expect(failure).not.toHaveProperty('headers');
    const { accessServiceResponse } = await import('@/lib/auth/access-error');
    const response = accessServiceResponse(failure);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'auth_service_unavailable', reference: expect.stringMatching(/^[a-f0-9-]{36}$/) });
    noSecret(failure); noSecret(vi.mocked(console.warn).mock.calls);
  });

  it('keeps an allowlisted nested transport code at verify rather than attributing it to getUser', async () => {
    const provider = Object.assign(new TypeError(secret), { cause: { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } } });
    await rejectProvider('verifyAuthToken', provider);
    expect(authLines()[0][1]).toEqual({
      category: 'auth_provider', code: 'auth_service_unavailable', phase: 'verifyAuthToken',
      name: 'TypeError', providerCode: 'UND_ERR_CONNECT_TIMEOUT', status: null, retryAfterSeconds: null,
    });
    expect(mock.user).not.toHaveBeenCalled(); noSecret(vi.mocked(console.warn).mock.calls);
  });

  it.each([secret, '999999', '12 seconds'])('drops unapproved name/code/status/Retry-After (%s)', async retryAfter => {
    const provider = { name: secret, code: 'ETIMEDOUT-' + secret, status: 418, headers: { 'retry-after': retryAfter }, message: secret, user: secret, url: secret };
    await rejectProvider('getUser', provider);
    expect(authLines()[0][1]).toEqual({
      category: 'auth_provider', code: 'auth_service_unavailable', phase: 'getUser',
      name: 'unknown', providerCode: 'unclassified', status: null, retryAfterSeconds: null,
    });
    noSecret(vi.mocked(console.warn).mock.calls);
  });

  it('never reads a provider message and tolerates a throwing header accessor without changing denial', async () => {
    const message = vi.fn(() => { throw new Error(secret); });
    const getHeader = vi.fn(() => { throw new Error(secret); });
    const provider = Object.defineProperty({ name: 'Error', status: 503, headers: { get: getHeader } }, 'message', { get: message });
    const failure = await rejectProvider('getUser', provider);
    expect(failure).toMatchObject({ code: 'auth_service_unavailable' });
    expect(message).not.toHaveBeenCalled(); expect(getHeader).toHaveBeenCalledExactlyOnceWith('retry-after');
    expect(authLines()[0][1]).toMatchObject({ phase: 'getUser', status: 503, retryAfterSeconds: null });
    noSecret(vi.mocked(console.warn).mock.calls);
  });

  it('treats the actual jose JWTExpired error as an invalid session, not a provider outage', async () => {
    mock.verify.mockRejectedValue(new errors.JWTExpired(secret));
    const { requirePrivySession, requireUser } = await import('@/lib/auth/privy-auth');
    await expect(requirePrivySession(request())).resolves.toBeNull();
    await expect(requireUser(request(), { strict: true })).resolves.toBeNull();
    expect(mock.user).not.toHaveBeenCalled(); expect(console.warn).not.toHaveBeenCalled();
  });

  it('preserves provider credential rejection as a 503 configuration failure', async () => {
    const failure = await rejectProvider('verifyAuthToken', Object.assign(new Error(secret), { status: 401 }));
    expect(failure).toMatchObject({ code: 'auth_configuration_invalid', category: 'configuration' });
    const { accessServiceResponse } = await import('@/lib/auth/access-error');
    expect(accessServiceResponse(failure).status).toBe(503);
    expect(authLines()).toHaveLength(1);
    expect(authLines()[0][1]).toMatchObject({ phase: 'verifyAuthToken', status: 401 });
    noSecret(vi.mocked(console.warn).mock.calls);
  });

  it.each([false, true])('never grants access if the logger itself throws (strict=%s)', async strict => {
    vi.mocked(console.warn).mockImplementation(() => { throw new Error('logger unavailable'); });
    const failure = await rejectProvider('getUser', new Error(secret), strict);
    if (strict) expect(failure).toMatchObject({ code: 'auth_service_unavailable' });
    else expect(failure).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
