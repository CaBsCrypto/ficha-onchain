import { afterEach, expect, it, vi } from 'vitest';
import { privateEnvironmentChecks } from '@/lib/private-config';
afterEach(() => vi.unstubAllEnvs());
it('reports a mismatched database without disclosing values or credentials', () => {
  vi.stubEnv('DATABASE_URL', 'postgres://secret-user:secret-password@ep-synthetic.neon.tech/test');
  vi.stubEnv('TRUSTLEAF_DB_HOST', 'different.neon.tech');
  vi.stubEnv('TRUSTLEAF_ENV', 'test');
  vi.stubEnv('VERCEL_ENV', 'production');
  const checks = privateEnvironmentChecks();
  expect(checks.databaseHostMatches).toBe(false);
  expect(checks.databaseProtocol).toBe(true);
  expect(checks.productionEnvironmentMatches).toBe(true);
  expect(Object.values(checks).every(value => typeof value === 'boolean')).toBe(true);
  expect(JSON.stringify(checks)).not.toMatch(/secret-user|secret-password|ep-synthetic/);
});
it('identifies a missing database value separately from the deployment environment', () => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('TRUSTLEAF_ENV', 'preview');
  vi.stubEnv('VERCEL_ENV', 'production');
  const checks = privateEnvironmentChecks();
  expect(checks.databasePresent).toBe(false);
  expect(checks.databaseParseable).toBe(false);
  expect(checks.productionEnvironmentMatches).toBe(false);
});
