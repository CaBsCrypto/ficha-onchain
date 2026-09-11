import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), user: vi.fn(), wallet: vi.fn(), create: vi.fn(), sql: vi.fn(), getDb: vi.fn() }));
vi.mock('@privy-io/server-auth', () => ({ PrivyClient: class {
  verifyAuthToken = mocks.verify; getUser = mocks.user;
  walletApi = { getWallet: mocks.wallet, createWallet: mocks.create };
} }));
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }));
const address = Keypair.random().publicKey();
const owner = 'did:privy:test-owner';
const adminEmail = 'cabscryptocontacto@gmail.com';
const wallet = { id: 'test-wallet', address, chainType: 'stellar', type: 'wallet' };
const localHost = 'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech';
const env = {
  TRUSTLEAF_ENV: 'local', TRUSTLEAF_DB_HOST: localHost, DATABASE_URL: `postgres://test:test@${localHost}/test`, VERCEL_ENV: '',
  TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false', ADMIN_EMAILS: adminEmail,
  PRIVY_APP_ID: 'cmrix722m03d30clewd1fuffq', NEXT_PUBLIC_PRIVY_APP_ID: 'cmrix722m03d30clewd1fuffq', PRIVY_APP_SECRET: 'synthetic-test-secret',
  DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2',
  PRESCRIPTION_PRIVATE_CONTRACT_ID: 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE',
  DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO',
  BOOKING_AUTHORITY_PUBLIC_KEY: 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO',
  NEXT_PUBLIC_STELLAR_NETWORK: 'testnet', NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
};
const request = (path: string, authenticated = true, method = 'GET') => new NextRequest(`https://portal.example.test${path}`, {
  method, headers: { host: 'portal.example.test', origin: 'https://portal.example.test', ...(authenticated ? { authorization: 'Bearer synthetic-access-token' } : {}) },
});
const noisyError = () => Object.assign(new Error('PRIVATE provider response containing synthetic-secret and postgres://credentials'), {
  response: { headers: { authorization: 'Bearer synthetic-access-token' } },
});
async function assertFailure(response: Response, status: number, error: string) {
  expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body).toEqual({ error, reference: expect.stringMatching(/^[a-f0-9-]{36}$/) });
  expect(JSON.stringify(body)).not.toMatch(/synthetic-secret|postgres:|Bearer|credentials/);
  return body;
}
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.verify.mockResolvedValue({ userId: owner });
  mocks.user.mockResolvedValue({ linkedAccounts: [{ type: 'email', address: adminEmail }, wallet] });
  mocks.wallet.mockResolvedValue(wallet);
  mocks.sql.mockImplementation(async (parts: TemplateStringsArray) => parts.join('?').startsWith('SELECT') ? [] : [{ wallet_id: wallet.id, address }]);
  mocks.getDb.mockReturnValue(Object.assign(mocks.sql, { query: mocks.sql }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('private entry diagnostics after Privy login', () => {
  it.each(['admin', 'wallet'])('rejects absent sessions before external services for %s', async entry => {
    const { GET } = entry === 'admin' ? await import('@/app/api/admin/whoami/route') : await import('@/app/api/privy/stellar-wallet/route');
    await assertFailure(await GET(request('/api/test', false)), 401, 'unauthorized');
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each(['ERR_JWT_EXPIRED', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED', 'ERR_JWS_INVALID'])('distinguishes invalid token %s from provider outage', async code => {
    mocks.verify.mockRejectedValue(Object.assign(noisyError(), { code }));
    const { GET } = await import('@/app/api/admin/whoami/route');
    await assertFailure(await GET(request('/api/admin/whoami')), 401, 'unauthorized');
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it.each(['verify', 'user'] as const)('reports Privy %s outages as recoverable service failures without raw logs', async method => {
    mocks[method].mockRejectedValue(noisyError());
    const { GET } = await import('@/app/api/admin/whoami/route');
    const body = await assertFailure(await GET(request('/api/admin/whoami')), 503, 'auth_service_unavailable');
    expect(console.warn).toHaveBeenCalledWith('[private-access]', { reference: body.reference, category: 'auth_provider', code: body.error });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/PRIVATE provider|synthetic-secret|postgres:|Bearer/);
  });
  it('reports missing server credentials as configuration failure', async () => {
    vi.stubEnv('PRIVY_APP_SECRET', undefined);
    const { GET } = await import('@/app/api/admin/whoami/route');
    await assertFailure(await GET(request('/api/admin/whoami')), 503, 'auth_configuration_missing');
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('does not mistake a provider API credential rejection for a user token rejection', async () => {
    mocks.verify.mockRejectedValue(Object.assign(noisyError(), { status: 401 }));
    const { GET } = await import('@/app/api/admin/whoami/route');
    await assertFailure(await GET(request('/api/admin/whoami')), 503, 'auth_configuration_invalid');
  });
  it('does not preserve a hardcoded administrator after removing it from the allowlist', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'another-admin@example.test');
    const { GET } = await import('@/app/api/admin/whoami/route');
    await assertFailure(await GET(request('/api/admin/whoami')), 403, 'forbidden');
  });
  it('does not grant administrator access when the allowlist is empty', async () => {
    vi.stubEnv('ADMIN_EMAILS', '');
    const { GET } = await import('@/app/api/admin/whoami/route');
    await assertFailure(await GET(request('/api/admin/whoami')), 403, 'forbidden');
  });
  it('allows an explicitly listed administrator while writes are paused', async () => {
    const { GET } = await import('@/app/api/admin/whoami/route');
    const response = await GET(request('/api/admin/whoami'));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ admin: true, email: adminEmail });
  });
  it('reports environment mismatch instead of denying the administrator role', async () => {
    vi.stubEnv('TRUSTLEAF_DB_HOST', 'wrong.example.test');
    const { GET } = await import('@/app/api/admin/whoami/route');
    await assertFailure(await GET(request('/api/admin/whoami')), 503, 'private_environment_mismatch');
  });
  it('classifies database failures separately from wallet provider failures', async () => {
    mocks.sql.mockRejectedValue(noisyError());
    const { GET } = await import('@/app/api/privy/stellar-wallet/route');
    await assertFailure(await GET(request('/api/privy/stellar-wallet')), 503, 'database_unavailable');
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('classifies a wallet provider failure without replacing the wallet', async () => {
    mocks.wallet.mockRejectedValue(noisyError());
    const { POST } = await import('@/app/api/privy/stellar-wallet/route');
    await assertFailure(await POST(request('/api/privy/stellar-wallet', true, 'POST')), 503, 'wallet_service_unavailable');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('keeps a mismatched saved wallet blocked and reports its binding code', async () => {
    mocks.sql.mockResolvedValue([{ wallet_id: 'another-wallet', address }]);
    const { POST } = await import('@/app/api/privy/stellar-wallet/route');
    await assertFailure(await POST(request('/api/privy/stellar-wallet', true, 'POST')), 409, 'wallet_binding_changed');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('recovers the same verified Stellar wallet after an unavailable database', async () => {
    mocks.sql.mockRejectedValueOnce(noisyError());
    const { GET } = await import('@/app/api/privy/stellar-wallet/route');
    await assertFailure(await GET(request('/api/privy/stellar-wallet')), 503, 'database_unavailable');
    const recovered = await GET(request('/api/privy/stellar-wallet'));
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ walletId: wallet.id, address, chain: 'stellar', created: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('keeps requireUser nullable for existing callers while offering a strict mode', async () => {
    mocks.user.mockRejectedValue(noisyError());
    const { requireUser } = await import('@/lib/auth/privy-auth');
    await expect(requireUser(request('/api/test'))).resolves.toBeNull();
    await expect(requireUser(request('/api/test'), { strict: true })).rejects.toMatchObject({ code: 'auth_service_unavailable' });
  });
});
