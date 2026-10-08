/**
 * Live schema checks against the isolated Neon development branch only.
 * All fixtures are new and synthetic, enclosed in transactions and rolled back.
 * This script never applies schema, signs, transmits, or changes an existing record.
 *
 * Run from the main checkout (its .env.local stays there):
 *   TRUSTLEAF_CLINICAL_DB_TEST=true node /absolute/path/to/this-script --rollback
 * Add --concurrency after --rollback to probe two real sessions instead of single-session constraints.
 * DATABASE_URL may be provided directly; only that variable is read from .env.local.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { StrKey } from '@stellar/stellar-sdk';
import { sealClinicalVersion } from './lib/clinical-crypto.mjs';

const DEV_HOST = /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/;
const hex = () => randomBytes(32).toString('hex');
const publicWallet = () => StrKey.encodeEd25519PublicKey(randomBytes(32));
const contract = () => StrKey.encodeContract(randomBytes(32));
const fixtureXdr = Buffer.from('controlled SQL fixture; not a Stellar envelope').toString('base64');

export class ValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function assertRollbackArguments(args, env) {
  if (args[0] !== '--rollback' || args.length > 2 || args.length < 1 ||
      (args.length === 2 && args[1] !== '--concurrency')) throw new ValidationError('explicit_rollback_required');
  if (env.TRUSTLEAF_CLINICAL_DB_TEST !== 'true') throw new ValidationError('explicit_database_test_guard_required');
}

export function validateDevelopmentUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new ValidationError('isolated_development_database_required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !DEV_HOST.test(url.hostname) ||
      url.searchParams.get('sslmode') !== 'require') throw new ValidationError('isolated_development_database_required');
  return url;
}

/** Do not load, export, or copy the other secrets contained in the local file. */
export function databaseUrlFromLocalText(text) {
  const line = text.split(/\r?\n/).find((item) => /^\s*DATABASE_URL\s*=/.test(item));
  if (!line) throw new ValidationError('development_database_url_missing');
  let value = line.slice(line.indexOf('=') + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

function note(report, id, details = {}) {
  report.checks.push({ id, passed: true, ...details });
}

/** Expected SQLSTATE is mandatory: a syntax error or timeout is not proof of a constraint. */
export async function expectSqlRejection(client, report, { id, sql, values = [], states }) {
  const point = 'reject_' + report.checks.length;
  await client.query('SAVEPOINT ' + point);
  let rejection;
  try { await client.query(sql, values); } catch (error) { rejection = error; }
  finally {
    await client.query('ROLLBACK TO SAVEPOINT ' + point);
    await client.query('RELEASE SAVEPOINT ' + point);
  }
  const sqlState = typeof rejection?.code === 'string' && /^[0-9A-Z]{5}$/.test(rejection.code) ? rejection.code : undefined;
  if (!sqlState || !states.includes(sqlState)) {
    report.checks.push({ id, passed: false, ...(sqlState ? { sqlState } : {}) });
    throw new ValidationError('constraint_rejection_not_demonstrated');
  }
  note(report, id, { sqlState });
}

const OPERATION_INSERT = `
  INSERT INTO clinical_web_operations
  (id,actor_user_id,wallet_id,source_wallet,action,method,contract_id,expected,request_fingerprint,prepared_envelope,
   state,unsigned_xdr,signing_hash,expires_at,signed_xdr,transaction_hash,confirmed_at)
  VALUES ($1::uuid,$2,$3,$4,$5,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16::timestamptz)
  RETURNING id,network`;

function operationValues(row) {
  return [row.id, row.actorId, row.walletId, row.source, row.action, row.contractId, JSON.stringify(row.expected),
    row.fingerprint, row.envelope === null ? null : JSON.stringify(row.envelope), row.state,
    row.unsignedXdr, row.signingHash, row.expiresAt, row.signedXdr, row.hash, row.confirmedAt];
}

async function counts(client, fixtures) {
  const result = await client.query(`
    SELECT
      (SELECT count(*) FROM clinical_web_histories WHERE history_id=ANY($1::text[])) AS histories,
      (SELECT count(*) FROM clinical_web_operations WHERE id=ANY($2::uuid[])) AS operations,
      (SELECT count(*) FROM clinical_transaction_attempts WHERE run_id=ANY($3::uuid[])) AS attempts`,
  [fixtures.histories, fixtures.operations, fixtures.attempts]);
  return Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]));
}

function assertZero(value) {
  assert.deepEqual(value, { histories: 0, operations: 0, attempts: 0 }, 'synthetic_rows_must_be_absent');
}

function syntheticOperation(syntheticContract, overrides = {}) {
  const source = overrides.source ?? publicWallet();
  return {
    id: randomUUID(), actorId: 'did:privy:sql_' + randomBytes(16).toString('hex'),
    walletId: 'sql_' + randomBytes(16).toString('hex'), source, action: 'create_history',
    contractId: syntheticContract, expected: { historyId: hex(), patient: source, operationId: hex() },
    fingerprint: 'sql.1:' + hex(), envelope: null, state: 'awaiting_signature',
    unsignedXdr: fixtureXdr, signingHash: hex(), expiresAt: Math.floor(Date.now() / 1000) + 600,
    signedXdr: null, hash: null, confirmedAt: null, ...overrides,
  };
}

export async function runRollbackProbe(client, report) {
  const fixtures = { histories: [], operations: [], attempts: [] };
  const syntheticContract = contract();
  let schemaPresent = false;
  let started = false;
  const row = (overrides = {}) => {
    const result = syntheticOperation(syntheticContract, overrides);
    fixtures.operations.push(result.id);
    return result;
  };
  const insert = (value) => client.query(OPERATION_INSERT, operationValues(value));
  const reject = (id, sql, values, states = ['P0001']) => expectSqlRejection(client, report, { id, sql, values, states });
  const rejectInsert = (id, value, states = ['23514']) => reject(id, OPERATION_INSERT, operationValues(value), states);
  const attempt = async (source, state = 'prepared') => {
    const runId = randomUUID();
    fixtures.attempts.push(runId);
    await client.query(`
      INSERT INTO clinical_transaction_attempts
      (run_id,operation_name,source_wallet,intent,signed_xdr,transaction_hash,state)
      VALUES ($1::uuid,'sql_probe',$2,$3,$4,$5,$6)`,
    [runId, source, hex(), state === 'submitted' ? fixtureXdr : null, state === 'submitted' ? hex() : null, state]);
    return runId;
  };
  try {
    await client.query('BEGIN');
    started = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
    const schema = (await client.query(`
      SELECT to_regclass('public.clinical_web_histories') IS NOT NULL AS histories,
             to_regclass('public.clinical_web_operations') IS NOT NULL AS operations,
             to_regclass('public.clinical_transaction_attempts') IS NOT NULL AS attempts`)).rows[0];
    if (!schema || !schema.histories || !schema.operations || !schema.attempts) throw new ValidationError('clinical_web_schema_required');
    schemaPresent = true;
    note(report, 'required_schema_present');
    assertZero(await counts(client, fixtures));
    note(report, 'synthetic_rows_absent_before_probe');

    // These confirmations are controlled SQL fixtures, never on-chain claims.
    const historyId = hex(), ownerId = 'did:privy:sql_' + randomBytes(16).toString('hex');
    const patient = publicWallet(), walletId = 'sql_' + randomBytes(16).toString('hex');
    fixtures.histories.push(historyId);
    const historyValues = [historyId, ownerId, walletId, patient, syntheticContract, hex()];
    const historyInsert = `INSERT INTO clinical_web_histories
      (history_id,owner_user_id,wallet_id,patient_wallet,contract_id,transaction_hash)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING network`;
    assert.equal((await client.query(historyInsert, historyValues)).rows[0].network, 'testnet');
    note(report, 'history_default_network_testnet');
    await reject('history_owner_immutable', 'UPDATE clinical_web_histories SET owner_user_id=$2 WHERE history_id=$1',
      [historyId, 'did:privy:sql_changed']);
    await reject('history_wallet_binding_immutable', 'UPDATE clinical_web_histories SET patient_wallet=$2 WHERE history_id=$1',
      [historyId, publicWallet()]);
    await reject('history_wallet_id_immutable', 'UPDATE clinical_web_histories SET wallet_id=$2 WHERE history_id=$1',
      [historyId, 'sql_changed']);
    await reject('history_contract_binding_immutable', 'UPDATE clinical_web_histories SET contract_id=$2 WHERE history_id=$1',
      [historyId, contract()]);
    await reject('history_delete_rejected', 'DELETE FROM clinical_web_histories WHERE history_id=$1', [historyId]);
    const duplicateOwner = hex(), duplicateWallet = hex(), unconfirmedHistory = hex();
    fixtures.histories.push(duplicateOwner, duplicateWallet, unconfirmedHistory);
    await reject('history_owner_unique_per_contract',
      historyInsert, [duplicateOwner, ownerId, 'sql_other', publicWallet(), syntheticContract, hex()], ['23505']);
    await reject('history_wallet_unique_per_contract',
      historyInsert, [duplicateWallet, 'did:privy:sql_other', 'sql_other', patient, syntheticContract, hex()], ['23505']);
    await reject('history_requires_confirmation_hash',
      historyInsert, [unconfirmedHistory, 'did:privy:sql_unconfirmed', 'sql_unconfirmed', publicWallet(), syntheticContract, null], ['23502']);

    const first = row();
    assert.equal((await insert(first)).rows[0].network, 'testnet');
    note(report, 'operation_default_network_testnet');
    await reject('operation_actor_immutable', 'UPDATE clinical_web_operations SET actor_user_id=$2 WHERE id=$1::uuid',
      [first.id, 'did:privy:sql_changed']);
    await reject('operation_wallet_immutable', 'UPDATE clinical_web_operations SET source_wallet=$2 WHERE id=$1::uuid',
      [first.id, publicWallet()]);
    await reject('operation_intent_immutable',
      "UPDATE clinical_web_operations SET expected=jsonb_set(expected,'{operationId}',to_jsonb($2::text)) WHERE id=$1::uuid",
      [first.id, hex()]);
    await reject('request_fingerprint_immutable', 'UPDATE clinical_web_operations SET request_fingerprint=$2 WHERE id=$1::uuid',
      [first.id, 'sql.2:' + hex()]);
    await reject('unsigned_envelope_immutable', 'UPDATE clinical_web_operations SET unsigned_xdr=$2 WHERE id=$1::uuid',
      [first.id, Buffer.from('changed SQL fixture').toString('base64')]);
    await reject('signing_hash_immutable', 'UPDATE clinical_web_operations SET signing_hash=$2 WHERE id=$1::uuid', [first.id, hex()]);
    await reject('operation_expiry_immutable', 'UPDATE clinical_web_operations SET expires_at=expires_at+1 WHERE id=$1::uuid', [first.id]);
    await rejectInsert('one_live_operation_per_wallet', row({ source: first.source }), ['23505']);
    await reject('awaiting_signature_cannot_skip_to_confirmed',
      "UPDATE clinical_web_operations SET state='confirmed',signed_xdr=$2,transaction_hash=$3,confirmed_at=NOW() WHERE id=$1::uuid",
      [first.id, fixtureXdr, hex()]);
    await client.query("UPDATE clinical_web_operations SET state='submitted',signed_xdr=$2,transaction_hash=$3 WHERE id=$1::uuid",
      [first.id, fixtureXdr, hex()]);
    note(report, 'awaiting_to_submitted_allowed');
    await reject('submitted_envelope_immutable', 'UPDATE clinical_web_operations SET signed_xdr=$2 WHERE id=$1::uuid',
      [first.id, Buffer.from('another SQL fixture').toString('base64')]);
    await reject('submitted_hash_immutable', 'UPDATE clinical_web_operations SET transaction_hash=$2 WHERE id=$1::uuid', [first.id, hex()]);
    await reject('submitted_cannot_return_to_awaiting',
      "UPDATE clinical_web_operations SET state='awaiting_signature' WHERE id=$1::uuid", [first.id]);
    await reject('submitted_cannot_be_cancelled', "UPDATE clinical_web_operations SET state='cancelled' WHERE id=$1::uuid", [first.id]);
    await client.query("UPDATE clinical_web_operations SET state='confirmed',confirmed_at=NOW() WHERE id=$1::uuid", [first.id]);
    note(report, 'submitted_to_confirmed_allowed');
    await reject('confirmed_terminal_immutable', "UPDATE clinical_web_operations SET error_code='changed' WHERE id=$1::uuid", [first.id]);
    await reject('confirmed_delete_rejected', 'DELETE FROM clinical_web_operations WHERE id=$1::uuid', [first.id]);

    for (const state of ['failed', 'cancelled']) {
      const terminal = row();
      await insert(terminal);
      await client.query('UPDATE clinical_web_operations SET state=$2 WHERE id=$1::uuid', [terminal.id, state]);
      note(report, 'awaiting_to_' + state + '_allowed');
      await reject(state + '_terminal_immutable',
        "UPDATE clinical_web_operations SET state='awaiting_signature',error_code=NULL WHERE id=$1::uuid", [terminal.id]);
    }
    await rejectInsert('unknown_state_rejected', row({ state: 'invalid' }));
    await rejectInsert('submitted_requires_envelope_and_hash', row({ state: 'submitted' }));
    await rejectInsert('signature_and_hash_required_together', row({ state: 'submitted', signedXdr: fixtureXdr }));
    await rejectInsert('confirmed_requires_confirmation_time', row({ state: 'confirmed', signedXdr: fixtureXdr, hash: hex() }));
    await rejectInsert('fingerprint_format_required', row({ fingerprint: 'plaintext' }));
    await rejectInsert('private_metadata_not_allowed_in_intent', row({
      expected: { historyId: hex(), patient: publicWallet(), operationId: hex(), fileName: 'must-not-be-an-index.pdf' },
    }));
    await rejectInsert('wrong_patient_binding_rejected', row({
      expected: { historyId: hex(), patient: publicWallet(), operationId: hex() },
    }));

    const grant = row({ action: 'set_permissions' });
    grant.expected = { ...grant.expected, doctor: publicWallet(), doctorId: 777,
      canRead: true, canAppend: false, expectedRevision: 0 };
    await insert(grant);
    note(report, 'selected_doctor_id_allowed_for_permission_intent');
    await reject('selected_doctor_id_immutable',
      "UPDATE clinical_web_operations SET expected=jsonb_set(expected,'{doctorId}','778') WHERE id=$1::uuid", [grant.id]);
    for (const [label, doctorId] of [['zero', 0], ['negative', -1], ['fractional', 1.5], ['string', '777'], ['null', null]]) {
      const invalidGrant = row({ action: 'set_permissions' });
      invalidGrant.expected = { ...invalidGrant.expected, doctor: publicWallet(), doctorId,
        canRead: true, canAppend: false, expectedRevision: 0 };
      await rejectInsert('selected_doctor_id_' + label + '_rejected', invalidGrant,
        label === 'fractional' ? ['23514', '22P02'] : ['23514']);
    }
    const invalidCreate = row();
    invalidCreate.expected.doctorId = 777;
    await rejectInsert('selected_doctor_id_for_create_rejected', invalidCreate);

    const append = row();
    append.action = 'append_version';
    append.expected = { ...append.expected, entryId: hex(), author: append.source, commitment: hex(),
      previousCommitment: null, expectedVersion: 0 };
    const context = { schemaVersion: 1, network: 'testnet', contractId: syntheticContract,
      historyId: append.expected.historyId, entryId: append.expected.entryId, author: append.source,
      patient: append.source, version: 1, previousCommitment: null };
    append.envelope = sealClinicalVersion({ context, content: Buffer.from('{"note":"synthetic schema fixture"}'),
      metadata: { mediaType: 'application/json', fileName: 'sql-fixture.json' }, keyring: { 'sql.1': hex() }, activeKeyId: 'sql.1' }).envelope;
    await insert(append);
    note(report, 'encrypted_prepared_envelope_allowed');
    await reject('prepared_envelope_immutable',
      "UPDATE clinical_web_operations SET prepared_envelope=jsonb_set(prepared_envelope,'{payload}',to_jsonb($2::text)) WHERE id=$1::uuid",
      [append.id, 'dossier:v1:changed']);
    await client.query("UPDATE clinical_web_operations SET state='submitted',signed_xdr=$2,transaction_hash=$3 WHERE id=$1::uuid",
      [append.id, fixtureXdr, hex()]);
    await reject('submitted_prepared_envelope_immutable',
      "UPDATE clinical_web_operations SET prepared_envelope=jsonb_set(prepared_envelope,'{keyId}','\"sql.2\"') WHERE id=$1::uuid", [append.id]);
    const appendFixture = (overrides = {}) => {
      const next = row({ action: 'append_version', ...overrides });
      next.expected = { ...next.expected, entryId: hex(), author: next.source, commitment: hex(),
        previousCommitment: null, expectedVersion: 0 };
      next.envelope = overrides.envelope ?? append.envelope;
      return next;
    };
    await rejectInsert('prepared_envelope_size_limit',
      appendFixture({ envelope: { ...append.envelope, payload: 'dossier:v1:' + 'A'.repeat(6_000_000) } }));
    await rejectInsert('prepared_envelope_extra_plaintext_rejected',
      appendFixture({ envelope: { ...append.envelope, fileName: 'must-not-be-an-index.pdf' } }));
    await rejectInsert('prepared_envelope_wrong_cipher_format_rejected',
      appendFixture({ envelope: { ...append.envelope, payload: 'plaintext' } }));
    await rejectInsert('append_requires_prepared_envelope', row({ action: 'append_version' }));
    await rejectInsert('create_cannot_have_prepared_envelope', row({ envelope: append.envelope }));

    // Sequential cross-table enforcement is real; two-session concurrency remains
    // a separate scenario covered by isolated operation tests, not this SQL run.
    for (const state of ['awaiting_signature', 'submitted']) {
      const web = row({ state, ...(state === 'submitted' ? { signedXdr: fixtureXdr, hash: hex() } : {}) });
      await insert(web);
      const runId = randomUUID();
      fixtures.attempts.push(runId);
      await reject('web_' + state + '_blocks_synthetic_runner',
        `INSERT INTO clinical_transaction_attempts
          (run_id,operation_name,source_wallet,intent,state) VALUES ($1::uuid,'sql_probe',$2,$3,'prepared')`,
        [runId, web.source, hex()]);
    }
    for (const state of ['prepared', 'submitted']) {
      const source = publicWallet();
      await attempt(source, state);
      await rejectInsert('synthetic_runner_' + state + '_blocks_web', row({ source }), ['P0001']);
    }
  } finally {
    if (started) {
      await client.query('ROLLBACK');
      report.rollbackCompleted = true;
      if (schemaPresent) {
        report.syntheticRowsRemaining = await counts(client, fixtures);
        assertZero(report.syntheticRowsRemaining);
        note(report, 'synthetic_rows_absent_after_rollback');
      }
    }
  }
}

/**
 * Observe a second backend waiting for the holder's actual advisory lock.
 * PostgreSQL's blocking evidence, rather than a sleep alone, establishes the wait.
 * The pids and wallet remain internal and are never included in the report.
 */
async function observeAdvisoryWait(holder, holderPid, waitingPid, isSettled) {
  const startedAt = Date.now(), deadline = startedAt + 5_000;
  while (!isSettled() && Date.now() < deadline) {
    const observed = (await holder.query(`
      SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocker_matches,
        EXISTS(
          SELECT 1 FROM pg_locks held JOIN pg_locks waiting
            ON held.locktype=waiting.locktype AND held.database IS NOT DISTINCT FROM waiting.database
              AND held.classid=waiting.classid AND held.objid=waiting.objid AND held.objsubid=waiting.objsubid
          WHERE held.pid=$1::int AND waiting.pid=$2::int AND held.locktype='advisory'
            AND held.granted AND NOT waiting.granted
        ) AS same_advisory_lock_waiting`, [holderPid, waitingPid])).rows[0];
    if (observed?.blocker_matches && observed.same_advisory_lock_waiting && !isSettled()) {
      return { advisoryWaitObserved: true, blockerMatchesHolder: true, secondInsertCompletedWhileHeld: false,
        observationWaitMs: Date.now() - startedAt };
    }
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new ValidationError('cross_session_advisory_wait_not_demonstrated');
}

/**
 * Five independent, synthetic wallet pairs. No COMMIT is sent on either session.
 * Rollback makes the holder's row disappear, so the expected outcome is that the
 * waiter resumes successfully; this is serialization, not a committed-row conflict.
 */
export async function runConcurrencyProbe(holder, waiter, report) {
  const fixtures = { histories: [], operations: [], attempts: [] };
  let schemaPresent = false;
  let rollbackCount = 0;
  report.concurrencyCases = [];
  report.committedRowConflict = 'not-tested-by-this-rollback-only-concurrency-run';
  report.timingPurpose = 'lock-observation-not-performance-benchmark';
  const cases = [
    { id: 'web_awaiting_to_runner', holderTable: 'web', holderState: 'awaiting_signature', waiterTable: 'runner', waiterState: 'prepared' },
    { id: 'web_submitted_to_runner', holderTable: 'web', holderState: 'submitted', waiterTable: 'runner', waiterState: 'prepared' },
    { id: 'runner_prepared_to_web', holderTable: 'runner', holderState: 'prepared', waiterTable: 'web', waiterState: 'awaiting_signature' },
    { id: 'runner_submitted_to_web', holderTable: 'runner', holderState: 'submitted', waiterTable: 'web', waiterState: 'awaiting_signature' },
    { id: 'web_awaiting_to_web', holderTable: 'web', holderState: 'awaiting_signature', waiterTable: 'web', waiterState: 'awaiting_signature' },
  ];
  const syntheticContract = contract();
  function statement(table, state, source) {
    if (table === 'web') {
      const sample = syntheticOperation(syntheticContract, { source, state,
        ...(state === 'submitted' ? { signedXdr: fixtureXdr, hash: hex() } : {}) });
      fixtures.operations.push(sample.id);
      return { sql: OPERATION_INSERT, values: operationValues(sample) };
    }
    const runId = randomUUID();
    fixtures.attempts.push(runId);
    return { sql: `INSERT INTO clinical_transaction_attempts
      (run_id,operation_name,source_wallet,intent,signed_xdr,transaction_hash,state)
      VALUES ($1::uuid,'sql_concurrent_probe',$2,$3,$4,$5,$6)`,
    values: [runId, source, hex(), state === 'submitted' ? fixtureXdr : null, state === 'submitted' ? hex() : null, state] };
  }
  async function executeCase(sample) {
    const source = publicWallet();
    const first = statement(sample.holderTable, sample.holderState, source);
    const second = statement(sample.waiterTable, sample.waiterState, source);
    let pending, settled = false, holderRolledBack = false, waiterRolledBack = false;
    const evidence = { id: sample.id, holderTable: sample.holderTable, holderState: sample.holderState,
      waiterTable: sample.waiterTable, waiterState: sample.waiterState, passed: false };
    report.concurrencyCases.push(evidence);
    try {
      await holder.query('BEGIN');
      await waiter.query('BEGIN');
      // Resolve backend IDs inside each transaction: transaction pooling can
      // assign another backend between transactions.
      const backendRows = await Promise.all([holder, waiter].map((connection) => connection.query('SELECT pg_backend_pid() AS backend_pid')));
      const [holderPid, waiterPid] = backendRows.map((value) => value.rows[0]?.backend_pid);
      if (!Number.isInteger(holderPid) || !Number.isInteger(waiterPid) || holderPid === waiterPid) {
        throw new ValidationError('two_distinct_database_sessions_required');
      }
      evidence.distinctTransactionBackends = true;
      for (const connection of [holder, waiter]) {
        await connection.query("SET LOCAL statement_timeout = '10s'");
        await connection.query("SET LOCAL lock_timeout = '8s'");
        await connection.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
      }
      assert.equal((await holder.query(first.sql, first.values)).rowCount, 1);
      // Attach handlers immediately so a timeout is never an unhandled rejection.
      pending = waiter.query(second.sql, second.values).then(
        (result) => { settled = true; return { success: true, result }; },
        () => { settled = true; return { success: false }; },
      );
      Object.assign(evidence, await observeAdvisoryWait(holder, holderPid, waiterPid, () => settled));
      note(report, sample.id + '_advisory_exclusivity');
      await holder.query('ROLLBACK');
      holderRolledBack = true;
      rollbackCount += 1;
      const resumed = await pending;
      if (!resumed.success || resumed.result.rowCount !== 1) throw new ValidationError('waiter_did_not_resume_after_holder_rollback');
      const waiterCounts = await counts(waiter, fixtures);
      const expectedCounts = { histories: 0, operations: sample.waiterTable === 'web' ? 1 : 0,
        attempts: sample.waiterTable === 'runner' ? 1 : 0 };
      assert.deepEqual(waiterCounts, expectedCounts, 'waiter_must_only_see_its_own_synthetic_row');
      evidence.resumedAfterHolderRollback = true;
      evidence.waiterOwnSyntheticRows = 1;
      note(report, sample.id + '_serialization_after_rollback');
      evidence.passed = true;
    } finally {
      if (!holderRolledBack) {
        await holder.query('ROLLBACK');
        holderRolledBack = true;
        rollbackCount += 1;
      }
      // If observation failed, release the holder before draining the pending query.
      if (pending) await pending;
      await waiter.query('ROLLBACK');
      waiterRolledBack = true;
      rollbackCount += 1;
      evidence.bothSessionsRolledBack = holderRolledBack && waiterRolledBack;
    }
  }
  try {
    const schemaResults = await Promise.all([holder, waiter].map((connection) => connection.query(`
      SELECT to_regclass('public.clinical_web_operations') IS NOT NULL AS operations,
        to_regclass('public.clinical_transaction_attempts') IS NOT NULL AS attempts`)));
    const [first, second] = schemaResults.map((result) => result.rows[0]);
    if (!first?.operations || !first.attempts || !second?.operations || !second.attempts) {
      throw new ValidationError('clinical_web_schema_required');
    }
    schemaPresent = true;
    note(report, 'required_schema_visible_in_both_connections');
    assertZero(await counts(holder, fixtures));
    assertZero(await counts(waiter, fixtures));
    note(report, 'synthetic_rows_absent_before_concurrent_probe');
    for (const sample of cases) await executeCase(sample);
    report.crossSessionConcurrency = 'advisory-lock-exclusivity-and-rollback-serialization';
  } finally {
    // Redundant rollback on both connections protects setup and partial failures.
    await Promise.all([holder.query('ROLLBACK'), waiter.query('ROLLBACK')]);
    report.transactionRollbacks = rollbackCount;
    report.rollbackCompleted = report.concurrencyCases.every((sample) => sample.bothSessionsRolledBack === true);
    report.concurrencyCasesPassed = report.concurrencyCases.filter((sample) => sample.passed).length;
    if (schemaPresent) {
      const finalCounts = await Promise.all([counts(holder, fixtures), counts(waiter, fixtures)]);
      finalCounts.forEach(assertZero);
      report.syntheticRowsRemaining = finalCounts[0];
      report.syntheticRowsAbsentInBothSessions = true;
      note(report, 'synthetic_rows_absent_in_both_sessions_after_rollback');
    }
  }
}

function sourceCommit() {
  try {
    const value = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[a-f0-9]{40}$/.test(value) ? value : null;
  } catch { return null; }
}

export async function main() {
  const observedAt = new Date().toISOString();
  const concurrent = process.argv.includes('--concurrency');
  const report = { kind: concurrent ? 'live-database-concurrency-rollback-only' : 'live-database-rollback-only', observedAt, sourceCommit: sourceCommit(),
    environment: 'isolated-development', status: 'failed', checks: [], rollbackCompleted: false,
    syntheticRowsRemaining: null, durableWrites: 0, stellarTransactionsCreated: 0,
    receiptEvidence: 'controlled-sql-fixtures-no-stellar-transactions',
    crossSessionConcurrency: 'not-tested-in-this-run', connectionTimeoutMs: 15_000, queryTimeoutMs: 15_000 };
  let client, secondClient, pool;
  try {
    assertRollbackArguments(process.argv.slice(2), process.env);
    const databaseUrl = process.env.DATABASE_URL ||
      databaseUrlFromLocalText(await readFile(resolve('.env.local'), 'utf8'));
    const url = validateDevelopmentUrl(databaseUrl);
    note(report, 'explicit_rollback_and_isolated_dev_guards');
    neonConfig.webSocketConstructor = WebSocket;
    pool = new Pool({ connectionString: url.href, connectionTimeoutMillis: 15_000, query_timeout: 15_000, max: concurrent ? 2 : 1 });
    client = await pool.connect();
    if (concurrent) {
      secondClient = await pool.connect();
      await runConcurrencyProbe(client, secondClient, report);
    } else await runRollbackProbe(client, report);
    report.status = 'passed';
  } catch (error) {
    report.errorCode = error instanceof ValidationError ? error.code : 'schema_validation_failed';
    process.exitCode = 1;
  } finally {
    if (client) {
      // A failed timeout or dropped connection never becomes a cleanup approval.
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (secondClient) {
      await secondClient.query('ROLLBACK').catch(() => {});
      secondClient.release();
    }
    if (pool) await pool.end().catch(() => {});
  }
  const scriptContent = await readFile(new URL(import.meta.url));
  report.validatorSha256 = createHash('sha256').update(scriptContent).digest('hex');
  report.completedAt = new Date().toISOString();
  const outputDirectory = resolve('.trustleaf-local', 'sow2-validation');
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, (concurrent ? 'clinical-web-concurrency-' : 'clinical-web-schema-') + observedAt.replace(/[:.]/g, '-') + '.json');
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error('clinical_schema_validation_failed'); process.exitCode = 1; });
}
