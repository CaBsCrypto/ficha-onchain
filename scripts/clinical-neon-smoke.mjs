/** Isolated development Neon only. No Stellar/Privy calls, no clinical data.
 * Schema is installed separately with migrate.mjs --step=clinical-history-v1.
 * --read-only checks connectivity/schema. --verify-storage runs synthetic rows
 * inside one transaction and rolls EVERYTHING back, including confirmations.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { MAX_CLINICAL_CONTENT_BYTES, sealClinicalVersion, openClinicalVersion, rewrapClinicalVersion } from './lib/clinical-crypto.mjs';
import { clinicalNeonStore } from './lib/clinical-neon-store.mjs';

async function run() {
  const mode = process.argv[2];
  if (!['--read-only', '--verify-storage'].includes(mode) || process.argv.length !== 3) throw Error('clinical_smoke_mode_required');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !/^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(url.hostname) ||
      url.searchParams.get('sslmode') !== 'require') throw Error('clinical_smoke_isolated_dev_only');
  if (mode === '--verify-storage' && process.env.TRUSTLEAF_CLINICAL_DB_TEST !== 'true') throw Error('clinical_smoke_write_guard_required');
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: url.href, connectionTimeoutMillis: 15_000 });
  let client;
  try {
    client = await pool.connect();
    await client.query(mode === '--read-only' ? 'BEGIN READ ONLY' : 'BEGIN');
    const exists = (await client.query("SELECT to_regclass('public.clinical_private_versions') IS NOT NULL AS present")).rows[0].present;
    if (mode === '--read-only') {
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ environment: 'isolated-dev', liveDatabase: true, schemaPresent: exists, readOnly: true }));
      return;
    }
    assert.equal(exists, true, 'clinical_schema_required');
    // Savepoints exercise the adapter's real SQL while retaining an enclosing
    // transaction solely for test cleanup. This is not a persistence/restart proof.
    const transactionClient = { query: (sql, params) => client.query(
      sql === 'BEGIN' ? 'SAVEPOINT clinical_adapter' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT clinical_adapter' :
        sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT clinical_adapter' : sql, params) };
    const store = clinicalNeonStore(transactionClient), h = () => randomBytes(32).toString('hex');
    const context = { schemaVersion: 1, network: 'testnet', contractId: StrKey.encodeContract(randomBytes(32)),
      historyId: h(), entryId: h(), author: Keypair.random().publicKey(), patient: Keypair.random().publicKey(),
      version: 1, previousCommitment: null };
    const keyring = { 'smoke.1': h() }, newKeyring = { 'smoke.2': h() };
    const header = Buffer.from('%PDF-1.7\n% synthetic storage fixture\n'), footer = Buffer.from('\n%%EOF\n');
    const content = Buffer.concat([header, Buffer.alloc(MAX_CLINICAL_CONTENT_BYTES - header.length - footer.length, 46), footer]);
    const sealed = sealClinicalVersion({ context, content, metadata: { mediaType: 'application/pdf', fileName: 'synthetic.pdf' }, keyring, activeKeyId: 'smoke.1' });
    const record = { context, ...sealed, operationId: h() };
    const first = await store.stageVersion(record);
    assert.deepEqual(await store.stageVersion(record), first);
    await assert.rejects(store.stageVersion({ ...record, commitment: h() }));
    await assert.rejects(store.loadEnvelope(record));
    // Explicitly a controlled receipt fixture: validates storage transitions,
    // NOT a claim that a transaction was submitted or confirmed on Stellar.
    const receipt = { status: 'SUCCESS', network: 'testnet', contractId: context.contractId, context,
      commitment: record.commitment, operationId: record.operationId, transactionHash: h() };
    await store.confirmVersion({ ...record, receipt });
    const envelope = await store.loadEnvelope(record);
    assert.deepEqual(openClinicalVersion({ envelope, expectedContext: context, expectedCommitment: record.commitment, keyring }).content, content);
    const raw = (await client.query('SELECT envelope::text AS value FROM clinical_private_versions WHERE operation_id=$1', [record.operationId])).rows[0].value;
    assert.equal(raw.includes('synthetic storage fixture'), false);
    assert.equal(raw.includes('synthetic.pdf'), false);
    assert.equal(raw.includes(keyring['smoke.1']), false);
    async function mustFail(sql, params) {
      await client.query('SAVEPOINT reject_case');
      let rejected = false;
      try { await client.query(sql, params); } catch { rejected = true; }
      await client.query('ROLLBACK TO SAVEPOINT reject_case');
      assert.equal(rejected, true, 'database_constraint_must_reject');
    }
    await mustFail('DELETE FROM clinical_private_versions WHERE operation_id=$1', [record.operationId]);
    await mustFail('UPDATE clinical_private_versions SET commitment=$2 WHERE operation_id=$1', [record.operationId, h()]);
    await mustFail("UPDATE clinical_private_versions SET envelope=jsonb_set(envelope,'{payload}','\"plaintext\"') WHERE operation_id=$1", [record.operationId]);
    await mustFail("UPDATE clinical_private_versions SET state='prepared',transaction_hash=NULL,confirmed_at=NULL WHERE operation_id=$1", [record.operationId]);
    const rotated = rewrapClinicalVersion({ envelope, expectedContext: context, expectedCommitment: record.commitment,
      keyring, newKeyring, activeKeyId: 'smoke.2' });
    await client.query('UPDATE clinical_private_versions SET envelope=$2::jsonb WHERE operation_id=$1', [record.operationId, JSON.stringify(rotated.envelope)]);
    assert.deepEqual(openClinicalVersion({ envelope: await store.loadEnvelope(record), expectedContext: context, expectedCommitment: record.commitment, keyring: newKeyring }).content, content);
    assert.throws(() => openClinicalVersion({ envelope: rotated.envelope, expectedContext: context, expectedCommitment: record.commitment, keyring }));
    await client.query('ROLLBACK');
    const count = Number((await client.query('SELECT count(*) AS n FROM clinical_private_versions WHERE operation_id=$1', [record.operationId])).rows[0].n);
    assert.equal(count, 0);
    console.log(JSON.stringify({ environment: 'isolated-dev', liveDatabase: true, encryptedPdfRoundtrip: true,
      duplicatePreserved: true, conflictRejected: true, pendingReadRejected: true, immutableVersions: true,
      keyRewrapVerified: true, plaintextAbsent: true, syntheticRowsRolledBack: true,
      originalFileBytes: content.length, envelopeBytes: Buffer.byteLength(JSON.stringify(sealed.envelope)),
      receiptEvidence: 'controlled-fixture-no-stellar-transaction', restartPersistence: 'not-tested' }));
  } finally {
    if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); }
    await pool.end();
  }
}
run().catch(() => { console.error('clinical_neon_smoke_failed'); process.exitCode = 1; });
