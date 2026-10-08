import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('mirrors complete opt-in web history schema including immutable intent and wallet exclusivity', () => {
  const cli = readFileSync('scripts/migrate.mjs', 'utf8');
  const remote = readFileSync('src/app/api/admin/migrate/route.ts', 'utf8');
  const start = cli.indexOf('step("clinical-web-v1"');
  const end = cli.indexOf('step("clinical-history-v1"', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  const expected = [...cli.slice(start, end).matchAll(/await sql`([\s\S]*?)`;/g)]
    .map(m => normalize(m[1])).filter(sql => !sql.startsWith('SELECT'));
  const actual = [...remote.matchAll(/\["clinical_web_\d+", `([\s\S]*?)`\]/g)].map(m => normalize(m[1]));
  expect(expected).toHaveLength(14); expect(actual).toEqual(expected);
  expect(expected.join(' ')).toContain('pg_advisory_xact_lock');
  expect(expected.join(' ')).toContain('clinical_operation_immutable');
  expect(remote).toContain("const webEnabled = process.env.TRUSTLEAF_CLINICAL_WEB_MIGRATION === 'true'");
  expect(remote).toContain('webEnabled && !clinicalEnabled');
  expect(cli.slice(start, end)).toContain("process.argv.includes('--step=clinical-web-v1')");
});
