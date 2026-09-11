import { afterEach, expect, it, vi } from 'vitest';
import { databaseConnectionString } from '@/lib/database-config';
import { privateEnvironmentChecks } from '@/lib/private-config';
import { assertDbSafe } from '@/lib/db';
afterEach(() => vi.unstubAllEnvs());
const host = 'ep-synthetic-demo.c-3.us-east-1.aws.neon.tech';
const isolated = `postgresql://test:test@${host}/test`;
const historical = 'postgresql://test:test@ep-rapid-shadow-ahq94785-pooler.c-3.us-east-1.aws.neon.tech/test';
it('selects the dedicated connection over a historical integration value', () => {
  vi.stubEnv('TRUSTLEAF_DATABASE_URL', isolated);
  vi.stubEnv('DATABASE_URL', historical);
  vi.stubEnv('TRUSTLEAF_DB_HOST', host);
  vi.stubEnv('TRUSTLEAF_ENV', 'test');
  vi.stubEnv('VERCEL_ENV', 'production');
  expect(databaseConnectionString()).toBe(isolated);
  expect(() => assertDbSafe(databaseConnectionString()!)).not.toThrow();
  expect(Object.values(privateEnvironmentChecks()).every(Boolean)).toBe(true);
});
it('does not fall back when the dedicated connection is empty or points to the wrong host', () => {
  vi.stubEnv('DATABASE_URL', isolated);
  vi.stubEnv('TRUSTLEAF_DB_HOST', host);
  vi.stubEnv('TRUSTLEAF_ENV', 'test');
  vi.stubEnv('TRUSTLEAF_DATABASE_URL', '');
  expect(databaseConnectionString()).toBe('');
  expect(privateEnvironmentChecks().databaseParseable).toBe(false);
  vi.stubEnv('TRUSTLEAF_DATABASE_URL', historical);
  expect(() => assertDbSafe(databaseConnectionString()!)).toThrow('private_database_not_authorized');
  expect(privateEnvironmentChecks().historicalDatabaseExcluded).toBe(false);
});
it('preserves local configuration while excluding POSTGRES_URL fallback for private environments', () => {
  expect(databaseConnectionString({ DATABASE_URL: isolated, TRUSTLEAF_ENV: 'local' })).toBe(isolated);
  expect(databaseConnectionString({ POSTGRES_URL: isolated, TRUSTLEAF_ENV: 'test' })).toBeUndefined();
  expect(databaseConnectionString({ POSTGRES_URL: isolated })).toBe(isolated);
});
