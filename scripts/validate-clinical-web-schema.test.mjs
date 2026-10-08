import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError, assertRollbackArguments, validateDevelopmentUrl, databaseUrlFromLocalText,
  expectSqlRejection, runRollbackProbe,
} from './validate-clinical-web-schema.mjs';

const url = 'postgresql://test:synthetic@ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

test('database probe requires one explicit rollback flag and an independent test guard', () => {
  assert.doesNotThrow(() => assertRollbackArguments(['--rollback'], { TRUSTLEAF_CLINICAL_DB_TEST: 'true' }));
  for (const args of [[], ['--rollback', '--apply'], ['--apply'], ['--read-only']]) {
    assert.throws(() => assertRollbackArguments(args, { TRUSTLEAF_CLINICAL_DB_TEST: 'true' }), ValidationError);
  }
  for (const flag of [undefined, 'false', '1', 'TRUE']) {
    assert.throws(() => assertRollbackArguments(['--rollback'], { TRUSTLEAF_CLINICAL_DB_TEST: flag }), ValidationError);
  }
});

test('only the exact isolated development endpoint over required SSL is accepted', () => {
  assert.equal(validateDevelopmentUrl(url).hostname, 'ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech');
  assert.doesNotThrow(() => validateDevelopmentUrl(url.replace('ahzh89z5.c-3', 'ahzh89z5-pooler.c-3')));
  for (const rejected of [
    url.replace('lingering-water-ahzh89z5', 'rapid-shadow-ahq94785'),
    url.replace('lingering-water-ahzh89z5', 'sweet-term-example'),
    url.replace('aws.neon.tech', 'aws.neon.tech.attacker.invalid'),
    url.replace('sslmode=require', 'sslmode=disable'),
    url.replace('?sslmode=require', ''),
    url.replace('postgresql:', 'https:'),
    'not-a-url',
  ]) assert.throws(() => validateDevelopmentUrl(rejected), ValidationError);
});

test('local dotenv reading extracts DATABASE_URL only without evaluating any content', () => {
  assert.equal(databaseUrlFromLocalText('OTHER_SECRET=do-not-load\nDATABASE_URL="' + url + '"\nRELAYER_SECRET=do-not-load\n'), url);
  assert.equal(databaseUrlFromLocalText("DATABASE_URL='" + url + "'"), url);
  assert.equal(databaseUrlFromLocalText('  DATABASE_URL = ' + url), url);
  assert.throws(() => databaseUrlFromLocalText('OTHER_SECRET=do-not-load'), ValidationError);
});

test('a required constraint SQLSTATE passes after rolling back the individual savepoint', async () => {
  const queries = [];
  const client = { query: async (sql) => {
    queries.push(sql);
    if (sql === 'synthetic negative') throw Object.assign(new Error('private detail must not be copied'), { code: '23514' });
    return { rows: [] };
  } };
  const report = { checks: [] };
  await expectSqlRejection(client, report, { id: 'constraint', sql: 'synthetic negative', states: ['23514'] });
  assert.deepEqual(report.checks, [{ id: 'constraint', passed: true, sqlState: '23514' }]);
  assert.deepEqual(queries, ['SAVEPOINT reject_0', 'synthetic negative', 'ROLLBACK TO SAVEPOINT reject_0', 'RELEASE SAVEPOINT reject_0']);
  assert.equal(JSON.stringify(report).includes('private detail'), false);
});

test('syntax errors, disconnects and missing rejection cannot be reported as constraint approval', async () => {
  for (const code of ['42601', '08006', '57014', undefined]) {
    const queries = [];
    const client = { query: async (sql) => {
      queries.push(sql);
      if (sql === 'negative' && code !== undefined) throw Object.assign(new Error('private detail'), { code });
      return { rows: [] };
    } };
    const report = { checks: [] };
    await assert.rejects(expectSqlRejection(client, report, { id: 'constraint', sql: 'negative', states: ['23514'] }), ValidationError);
    assert.equal(report.checks[0].passed, false);
    assert.equal(queries.at(-2), 'ROLLBACK TO SAVEPOINT reject_0');
    assert.equal(queries.at(-1), 'RELEASE SAVEPOINT reject_0');
    assert.equal(JSON.stringify(report).includes('private detail'), false);
  }
});

test('missing schema performs rollback without attempting fixture insert or schema creation', async () => {
  const queries = [];
  const client = { query: async (sql) => {
    queries.push(sql);
    if (sql.includes('to_regclass')) return { rows: [{ histories: false, operations: false, attempts: false }] };
    return { rows: [] };
  } };
  const report = { checks: [] };
  await assert.rejects(runRollbackProbe(client, report), { code: 'clinical_web_schema_required' });
  assert.equal(report.rollbackCompleted, true);
  assert.equal(queries[0], 'BEGIN');
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(queries.some((sql) => /INSERT|CREATE|COMMIT/.test(sql)), false);
});

test('fixture failure rolls back the enclosing transaction and checks synthetic rows are absent', async () => {
  const queries = [];
  const client = { query: async (sql) => {
    queries.push(sql);
    if (sql.includes('to_regclass')) return { rows: [{ histories: true, operations: true, attempts: true }] };
    if (sql.includes('SELECT count(*)')) return { rows: [{ histories: '0', operations: '0', attempts: '0' }] };
    if (sql.includes('INSERT INTO clinical_web_histories')) throw Object.assign(new Error('controlled fixture failure'), { code: '23514' });
    return { rows: [] };
  } };
  const report = { checks: [] };
  await assert.rejects(runRollbackProbe(client, report), /controlled fixture failure/);
  assert.equal(report.rollbackCompleted, true);
  assert.deepEqual(report.syntheticRowsRemaining, { histories: 0, operations: 0, attempts: 0 });
  assert.equal(queries.at(-2), 'ROLLBACK');
  assert.equal(queries.at(-1).includes('SELECT count(*)'), true);
  assert.equal(queries.some((sql) => /COMMIT|CREATE|ALTER|DROP/.test(sql)), false);
});

test('a remaining synthetic row fails cleanup validation instead of returning approval', async () => {
  let rolledBack = false;
  const client = { query: async (sql) => {
    if (sql.includes('to_regclass')) return { rows: [{ histories: true, operations: true, attempts: true }] };
    if (sql === 'ROLLBACK') { rolledBack = true; return { rows: [] }; }
    if (sql.includes('SELECT count(*)')) return { rows: [{ histories: rolledBack ? '1' : '0', operations: '0', attempts: '0' }] };
    if (sql.includes('INSERT INTO clinical_web_histories')) throw new Error('fixture failure');
    return { rows: [] };
  } };
  const report = { checks: [] };
  await assert.rejects(runRollbackProbe(client, report), /synthetic_rows_must_be_absent/);
  assert.equal(report.syntheticRowsRemaining.histories, 1);
  assert.equal(report.checks.some((check) => check.id === 'synthetic_rows_absent_after_rollback'), false);
});

