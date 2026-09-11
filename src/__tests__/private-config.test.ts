import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPrivateEnvironment, assertPrivateWrites, PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';

const localHost = 'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech';
const env = {
  TRUSTLEAF_ENV: 'local', TRUSTLEAF_DB_HOST: localHost, DATABASE_URL: `postgres://test:test@${localHost}/test`,
  VERCEL_ENV: '', TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'true',
  PRIVY_APP_ID: PRIVY_APP, NEXT_PUBLIC_PRIVY_APP_ID: PRIVY_APP,
  DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: REGISTRY_PRIVATE, PRESCRIPTION_PRIVATE_CONTRACT_ID: RX_PRIVATE,
  DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: PRIVATE_ADMIN, BOOKING_AUTHORITY_PUBLIC_KEY: PRIVATE_ADMIN,
  NEXT_PUBLIC_STELLAR_NETWORK: 'testnet', NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
};
beforeEach(() => { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());

describe('explicit private Testnet configuration', () => {
  it('accepts the complete local development environment', () => expect(assertPrivateWrites).not.toThrow());
  it.each([['preview', 'preview'], ['test', 'production']])('accepts an isolated %s database for Vercel %s', (environment, vercel) => {
    vi.stubEnv('TRUSTLEAF_ENV', environment); vi.stubEnv('VERCEL_ENV', vercel);
    vi.stubEnv('TRUSTLEAF_DB_HOST', 'isolated.neon.tech'); vi.stubEnv('DATABASE_URL', 'postgres://test:test@isolated.neon.tech/test');
    expect(assertPrivateWrites).not.toThrow();
  });
  it('accepts the unpooled local endpoint and the postgresql scheme used by the worker', () => {
    const host = 'ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech';
    vi.stubEnv('TRUSTLEAF_DB_HOST', host); vi.stubEnv('DATABASE_URL', `postgresql://test:test@${host}/test`);
    expect(assertPrivateWrites).not.toThrow();
    vi.stubEnv('TRUSTLEAF_ENV', 'test');
    expect(assertPrivateEnvironment).toThrow('private_environment_mismatch');
  });
  it.each(['https', 'http'])('rejects a %s database URL before connecting even with the expected host', scheme => {
    vi.stubEnv('DATABASE_URL', `${scheme}://test:test@${localHost}/test`);
    expect(assertPrivateEnvironment).toThrow('private_environment_mismatch');
  });
  it.each(['database.example.test', 'isolated.neon.tech.attacker.test'])('rejects a non-Neon host %s even when explicitly configured', host => {
    vi.stubEnv('TRUSTLEAF_ENV', 'test'); vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('TRUSTLEAF_DB_HOST', host); vi.stubEnv('DATABASE_URL', `postgres://test:test@${host}/test`);
    expect(assertPrivateEnvironment).toThrow('private_environment_mismatch');
  });
  it.each(['TRUSTLEAF_ENV', 'TRUSTLEAF_DB_HOST', 'DATABASE_URL'])('rejects missing %s', key => {
    vi.stubEnv(key, undefined); expect(assertPrivateEnvironment).toThrow('private_environment_mismatch');
  });
  it.each(['PRIVY_APP_ID', 'NEXT_PUBLIC_PRIVY_APP_ID', 'DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID', 'PRESCRIPTION_PRIVATE_CONTRACT_ID',
    'DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY', 'BOOKING_AUTHORITY_PUBLIC_KEY', 'NEXT_PUBLIC_STELLAR_NETWORK', 'NEXT_PUBLIC_SOROBAN_RPC_URL'])('rejects missing %s instead of substituting configuration', key => {
    vi.stubEnv(key, undefined); expect(assertPrivateEnvironment).toThrow('private_configuration_mismatch');
  });
  it.each(['', 'false', 'TRUE', '1', undefined])('keeps new writes paused for %s while allowing reads', value => {
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', value);
    expect(assertPrivateEnvironment).not.toThrow(); expect(assertPrivateWrites).toThrow('private_writes_paused');
  });
  it.each(['preview', 'test'])('does not use the local database as %s', value => {
    vi.stubEnv('TRUSTLEAF_ENV', value); expect(assertPrivateEnvironment).toThrow('private_environment_mismatch');
  });
  it('rejects the historical database even when its configured hostname matches', () => {
    vi.stubEnv('TRUSTLEAF_ENV', 'test'); vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('TRUSTLEAF_DB_HOST', 'ep-rapid-shadow-ahq94785.c-3.us-east-1.aws.neon.tech');
    vi.stubEnv('DATABASE_URL', 'postgres://test:test@ep-rapid-shadow-ahq94785.c-3.us-east-1.aws.neon.tech/test');
    expect(assertPrivateEnvironment).toThrow('private_environment_mismatch');
  });
  it.each([['preview', 'test'], ['production', 'preview']])('rejects Vercel %s configured as %s', (vercel, environment) => {
    vi.stubEnv('VERCEL_ENV', vercel); vi.stubEnv('TRUSTLEAF_ENV', environment);
    vi.stubEnv('TRUSTLEAF_DB_HOST', 'isolated.neon.tech'); vi.stubEnv('DATABASE_URL', 'postgres://test:test@isolated.neon.tech/test');
    expect(assertPrivateEnvironment).toThrow('private_environment_mismatch');
  });
  it.each([['NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet'], ['NEXT_PUBLIC_SOROBAN_RPC_URL', 'https://soroban.stellar.org'],
    ['NEXT_PUBLIC_SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org.attacker.test']])('rejects a different network configuration: %s', (key, value) => {
    vi.stubEnv(key, value); expect(assertPrivateEnvironment).toThrow('private_configuration_mismatch');
  });
});
