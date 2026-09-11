import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps onboarding migrations equivalent in the CLI and administrative migration', () => {
  const cli = readFileSync('scripts/migrate.mjs', 'utf8');
  const remote = readFileSync('src/app/api/admin/migrate/route.ts', 'utf8');
  const block = cli.slice(cli.indexOf('step("doctor onboarding requests"'), cli.indexOf('// ── Run'));
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  const statements = [...block.matchAll(/await sql`([\s\S]*?)`;/g)].map(m => normalize(m[1]));
  const remoteStatements = [...remote.matchAll(/\["doctor_onboarding_\d+", `([\s\S]*?)`\]/g)].map(m => normalize(m[1]));
  expect(statements.length).toBeGreaterThan(8);
  expect(remoteStatements).toEqual(statements);
  expect(statements.some(s => s.includes('BEFORE UPDATE OR DELETE ON doctor_onboarding_submissions'))).toBe(true);
  expect(statements.some(s => s.includes('onboarding_submission_id UUID REFERENCES doctor_onboarding_submissions'))).toBe(true);
});
