import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError, assertRollbackArguments, validateDevelopmentUrl, databaseUrlFromLocalText,
  expectSqlRejection, runRollbackProbe, runConcurrencyProbe,
} from './validate-clinical-web-schema.mjs';

const url = 'postgresql://test:synthetic@ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

test('database probe requires one explicit rollback flag and an independent test guard', () => {
  assert.doesNotThrow(() => assertRollbackArguments(['--rollback'], { TRUSTLEAF_CLINICAL_DB_TEST: 'true' }));
  assert.doesNotThrow(() => assertRollbackArguments(['--rollback', '--concurrency'], { TRUSTLEAF_CLINICAL_DB_TEST: 'true' }));
  for (const args of [[], ['--rollback', '--apply'], ['--apply'], ['--read-only'], ['--concurrency'], ['--rollback', '--concurrency', '--concurrency']]) {
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

/** Isolated regression fixture; the real PostgreSQL lock evidence is a separate run. */
function concurrentClients(options = {}) {
  const statements = [];
  const state = { holderHeld: false, releaseWaiter: null,
    holderRows: { histories: 0, operations: 0, attempts: 0 },
    waiterRows: { histories: 0, operations: 0, attempts: 0 } };
  const zero = () => ({ histories: 0, operations: 0, attempts: 0 });
  const client = (role) => ({ query: async (sql) => {
    statements.push({ role, sql });
    if (sql.includes('to_regclass')) return { rows: [{ operations: true, attempts: true }] };
    if (sql === 'SELECT pg_backend_pid() AS backend_pid') {
      return { rows: [{ backend_pid: role === 'holder' || options.sameBackend ? 111 : 222 }] };
    }
    if (sql === 'ROLLBACK') {
      if (role === 'holder') {
        state.holderHeld = false;
        state.holderRows = zero();
        state.releaseWaiter?.();
        state.releaseWaiter = null;
      } else state.waiterRows = zero();
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('pg_blocking_pids')) {
      if (options.observationError) throw Object.assign(new Error('sensitive database error'), { code: '42501' });
      return { rows: [{ blocker_matches: state.holderHeld && !options.waiterCompletesEarly,
        same_advisory_lock_waiting: state.holderHeld && !options.waiterCompletesEarly }] };
    }
    if (sql.includes('SELECT count(*)')) {
      return { rows: [{ ...(role === 'holder' ? state.holderRows : state.waiterRows) }] };
    }
    if (sql.includes('INSERT INTO')) {
      const field = sql.includes('INSERT INTO clinical_web_operations') ? 'operations' : 'attempts';
      if (role === 'holder') {
        state.holderHeld = true;
        state.holderRows[field] += 1;
        return { rowCount: 1, rows: [] };
      }
      const finish = () => { state.waiterRows[field] += 1; return { rowCount: 1, rows: [] }; };
      if (options.waiterCompletesEarly) return finish();
      return new Promise((done) => { state.releaseWaiter = () => done(finish()); });
    }
    return { rowCount: 0, rows: [] };
  } });
  return { holder: client('holder'), waiter: client('waiter'), statements, state };
}

test('concurrency probe observes blocking, resumes after rollback and cleans both sessions in five cases', async () => {
  const fixture = concurrentClients();
  const report = { checks: [], crossSessionConcurrency: 'not-tested-in-this-run' };
  await runConcurrencyProbe(fixture.holder, fixture.waiter, report);
  assert.equal(report.concurrencyCases.length, 5);
  assert.equal(report.concurrencyCasesPassed, 5);
  assert.equal(report.transactionRollbacks, 10);
  assert.equal(report.rollbackCompleted, true);
  assert.equal(report.syntheticRowsAbsentInBothSessions, true);
  assert.deepEqual(report.syntheticRowsRemaining, { histories: 0, operations: 0, attempts: 0 });
  for (const evidence of report.concurrencyCases) {
    assert.equal(evidence.passed, true);
    assert.equal(evidence.distinctTransactionBackends, true);
    assert.equal(evidence.advisoryWaitObserved, true);
    assert.equal(evidence.blockerMatchesHolder, true);
    assert.equal(evidence.secondInsertCompletedWhileHeld, false);
    assert.equal(evidence.resumedAfterHolderRollback, true);
    assert.equal(evidence.bothSessionsRolledBack, true);
  }
  assert.equal(report.committedRowConflict, 'not-tested-by-this-rollback-only-concurrency-run');
  assert.equal(fixture.statements.some(({ sql }) => /COMMIT|CREATE|ALTER|DROP/.test(sql)), false);
  assert.equal(JSON.stringify(report).includes('backend_pid'), false);
});

test('early waiter completion cannot be declared exclusive and still rolls back both sessions', async () => {
  const fixture = concurrentClients({ waiterCompletesEarly: true });
  const report = { checks: [], crossSessionConcurrency: 'not-tested-in-this-run' };
  await assert.rejects(runConcurrencyProbe(fixture.holder, fixture.waiter, report),
    { code: 'cross_session_advisory_wait_not_demonstrated' });
  assert.equal(report.crossSessionConcurrency, 'not-tested-in-this-run');
  assert.equal(report.concurrencyCasesPassed, 0);
  assert.equal(report.rollbackCompleted, true);
  assert.equal(report.concurrencyCases[0].passed, false);
  assert.deepEqual(report.syntheticRowsRemaining, { histories: 0, operations: 0, attempts: 0 });
});

test('a shared transaction backend is rejected before inserting any concurrent fixture', async () => {
  const fixture = concurrentClients({ sameBackend: true });
  const report = { checks: [] };
  await assert.rejects(runConcurrencyProbe(fixture.holder, fixture.waiter, report),
    { code: 'two_distinct_database_sessions_required' });
  assert.equal(fixture.statements.some(({ sql }) => /INSERT/.test(sql)), false);
  assert.equal(report.rollbackCompleted, true);
  assert.equal(report.concurrencyCasesPassed, 0);
  assert.deepEqual(report.syntheticRowsRemaining, { histories: 0, operations: 0, attempts: 0 });
});

test('observer query failure drains the blocked query after release and never records a passed case', async () => {
  const fixture = concurrentClients({ observationError: true });
  const report = { checks: [] };
  await assert.rejects(runConcurrencyProbe(fixture.holder, fixture.waiter, report), /sensitive database error/);
  assert.equal(report.concurrencyCasesPassed, 0);
  assert.equal(report.concurrencyCases[0].passed, false);
  assert.equal(report.rollbackCompleted, true);
  assert.equal(fixture.state.releaseWaiter, null);
  assert.deepEqual(report.syntheticRowsRemaining, { histories: 0, operations: 0, attempts: 0 });
  assert.equal(JSON.stringify(report).includes('sensitive database error'), false);
});
