import { beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Account, BASE_FEE, Contract, Keypair, Networks, SorobanDataBuilder, TransactionBuilder } from '@stellar/stellar-sdk';
vi.mock('server-only', () => ({}));
import { getDb, getDbConnection } from '@/lib/db';
import { databaseConnectionString } from '@/lib/database-config';
import { SqlSponsorshipStore, type SponsorshipConnection } from '@/lib/sponsorship/sql-store';
import { createSponsorshipService } from '@/lib/sponsorship/service';
import { quoteSponsorship } from '@/lib/sponsorship/quote';
import { bucketKeys, sha256, utcDay, verifySponsorshipPrincipal, type SponsorshipPolicy } from '@/lib/sponsorship/domain';
import { sealDraft, type DraftContext } from '@/lib/clinical/drafts-crypto';

const enabled = process.env.TRUSTLEAF_RESILIENCE_DB_TEST === 'true';
const diagnostics = process.env.TRUSTLEAF_RESILIENCE_DB_DIAGNOSTICS === 'true';
let diagnosticPhase = 'setup';
function diagnosticQuery(sql: string): string {
  if (sql.includes('pg_advisory_xact_lock')) return 'request_advisory_lock';
  if (sql.includes('FROM sponsorship_reservations')) return 'reservation_read';
  if (sql.includes('FROM sponsorship_daily_buckets')) return 'bucket_read';
  if (sql.includes('INTO sponsorship_daily_buckets')) return 'bucket_insert';
  if (sql.startsWith('UPDATE sponsorship_daily_buckets')) return 'bucket_update';
  if (sql.includes('INTO sponsorship_reservations') || sql.startsWith('UPDATE sponsorship_reservations')) return 'reservation_write';
  return sql.trim().split(/\s+/)[0];
}
async function diagnosticSnapshot() {
  if (!diagnostics) return;
  const rows = await getDb().query("SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers,ROUND(EXTRACT(epoch FROM clock_timestamp()-xact_start)*1000) AS transaction_ms,ROUND(EXTRACT(epoch FROM clock_timestamp()-query_start)*1000) AS query_ms,CASE WHEN query LIKE '%pg_advisory_xact_lock%' THEN 'request_advisory_lock' WHEN query LIKE '%FROM sponsorship_reservations%' THEN 'reservation_read' WHEN query LIKE '%FROM sponsorship_daily_buckets%' THEN 'bucket_read' WHEN query LIKE '%INTO sponsorship_daily_buckets%' THEN 'bucket_insert' WHEN query LIKE 'UPDATE sponsorship_daily_buckets%' THEN 'bucket_update' WHEN query LIKE '%INTO sponsorship_reservations%' OR query LIKE 'UPDATE sponsorship_reservations%' THEN 'reservation_write' ELSE UPPER(SPLIT_PART(TRIM(query),' ',1)) END AS query_kind FROM pg_stat_activity WHERE datname=current_database() AND application_name='trustleaf_resilience_test' ORDER BY pid");
  console.info('DEV fixture lock snapshot', JSON.stringify({ phase: diagnosticPhase, rows }));
}
const contractId = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const allowedDevHost = /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/;

/**
 * OFF by default. The coordinator may explicitly run this only against the migrated Neon DEV branch.
 * No Stellar RPC, Privy, live wallets, clinical operations/history tables, environment writes or DDL.
 * Any signatures below use unprovisioned ephemeral synthetic identities and are never broadcast.
 */
describe.skipIf(!enabled)('clinical resilience / real Postgres adapter (explicit DEV opt-in)', () => {
  beforeAll(() => {
    const url = databaseConnectionString();
    if (!url || !allowedDevHost.test(new URL(url).hostname) || process.env.TRUSTLEAF_DB_HOST !== new URL(url).hostname ||
        process.env.TRUSTLEAF_ENV !== 'local' || process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' ||
        process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false' || process.env.TRUSTLEAF_SPONSORSHIP_ENABLED === 'true' ||
        process.env.VERCEL !== undefined || process.env.VERCEL_ENV !== undefined) {
      throw Error('resilience_postgres_test_requires_explicit_local_DEV_with_chain_and_sponsorship_writes_off');
    }
  });
  async function connect(): Promise<SponsorshipConnection> {
    const client = await getDbConnection();
    try {
      // Ten duplicate UUIDs intentionally queue on one request lock over remote
      // Neon round trips. Keep finite fixture deadlines above that normal queue;
      // these settings affect this test connection only, never application policy.
      if (diagnostics) await client.query("SET application_name='trustleaf_resilience_test'");
      await client.query("SET statement_timeout='45000'");
      await client.query("SET lock_timeout='30000'");
      return { query: async (sql: string, values?: unknown[]) => {
        const startedAt = Date.now();
        try {
          const result = await client.query(sql, values);
          if (sql === 'BEGIN') {
            if (diagnostics) console.info('DEV fixture effective timeout before local settings', (await client.query("SELECT current_setting('statement_timeout') AS statement_timeout,current_setting('lock_timeout') AS lock_timeout")).rows);
            await client.query("SET LOCAL statement_timeout='45000'; SET LOCAL lock_timeout='30000'; SET LOCAL application_name='trustleaf_resilience_test'");
          }
          return result;
        }
        catch (error) {
          const code = (error as { code?: unknown }).code;
          console.error('DEV fixture query failed', { phase: diagnosticPhase, command: diagnosticQuery(sql), elapsedMs: Date.now()-startedAt,
            code: typeof code === 'string' && /^[A-Z0-9_]{1,30}$/.test(code) ? code : 'unavailable' });
          throw error;
        }
      }, release: () => client.release() };
    } catch (error) { client.release(); throw error; }
  }
  async function fixture(count: number) {
    const source = Keypair.random(), sponsor = Keypair.random(), patient = Keypair.random().publicKey();
    const actorId = 'did:privy:resilience_' + randomBytes(12).toString('hex'), walletId = 'resilience:' + randomUUID();
    const encounterId = randomBytes(32).toString('hex'), at = Math.floor(Date.now() / 1000), ids: string[] = [];
    const fixtures = [];
    for (let i = 0; i < count; i++) {
      const requestId = randomUUID(); ids.push(requestId);
      const operation = new Contract(contractId).call('append_version');
      const tx = new TransactionBuilder(new Account(source.publicKey(), String(i + 100)), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(operation).setSorobanData(new SorobanDataBuilder().setResourceFee('1000').build()).setTimebounds(0, at + 300).build();
      const principal = await verifySponsorshipPrincipal(async () => ({
        requestId, network: 'testnet', sourceAddress: source.publicKey(), sponsorAddress: sponsor.publicKey(), patientAddress: patient,
        actorId, walletId, contractId, action: 'append_version', encounterId,
        operationFingerprint: sha256(operation.body().invokeHostFunctionOp().hostFunction().toXDR('base64')),
      }));
      const quote = quoteSponsorship(principal, { unsignedXdr: tx.toXDR(), sponsorBaseFeeStroops: '100', preparedAt: at, now: at });
      expect(quote.offeredFeeStroops).toBe('1200');
      // Local signature on an unprovisioned synthetic key only; never an external signing request.
      tx.sign(source);
      fixtures.push({ principal, quote, signedSyntheticInner: tx.toXDR() });
    }
    const keys = bucketKeys(fixtures[0].principal), day = utcDay(at);
    const policy: SponsorshipPolicy = { enabled: true, sponsorDailyLimitStroops: '3600', patientDailyLimitStroops: '3600',
      encounterLimitStroops: '3600', emergencyReserveStroops: '0', maxFeeStroops: '2000' };
    const store = new SqlSponsorshipStore(connect), service = createSponsorshipService({ store, policy, now: () => at });
    const buckets = async () => {
      const client = await connect();
      try { return (await client.query(`SELECT bucket_key,utc_day::text,reserved_stroops::text,spent_stroops::text
        FROM sponsorship_daily_buckets WHERE network='testnet' AND bucket_key=ANY($1::text[]) AND utc_day IN ($2::date,'1970-01-01'::date)`, [keys, day])).rows; }
      finally { client.release(); }
    };
    const cleanup = async () => {
      const client = await connect();
      try {
        await client.query('BEGIN');
        // Exact random IDs AND fixture actor; never global state or a real wallet's bucket.
        await client.query(`DELETE FROM sponsorship_reservations WHERE network='testnet' AND request_id=ANY($1::uuid[])
          AND payload->'binding'->>'actorId'=$2 AND payload->'binding'->>'sponsorAddress'=$3`, [ids, actorId, sponsor.publicKey()]);
        await client.query(`DELETE FROM sponsorship_daily_buckets WHERE network='testnet' AND bucket_key=ANY($1::text[])
          AND utc_day IN ($2::date,'1970-01-01'::date)`, [keys, day]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    };
    return { fixtures, ids, service, store, buckets, cleanup, at };
  }

  it('admits exactly three of ten concurrent SQL reservations and keeps repeated UUIDs idempotent', async () => {
    const f = await fixture(10);
    try {
      diagnosticPhase = 'ten_distinct_requests';
      const results = await Promise.allSettled(f.fixtures.map(x => f.service.reserve(x.principal, x.quote)));
      const accepted = results.flatMap((r, i) => r.status === 'fulfilled' ? [i] : []);
      expect(accepted).toHaveLength(3);
      expect(results.filter(r => r.status === 'rejected').map(r => (r as PromiseRejectedResult).reason.message)).toEqual(Array(7).fill('sponsorship_daily_limit'));
      const rows = await f.buckets(); expect(rows).toHaveLength(3);
      for (const row of rows) { expect(row.reserved_stroops).toBe('3600'); expect(row.spent_stroops).toBe('0'); }
      const chosen = f.fixtures[accepted[0]];
      diagnosticPhase = 'ten_repeated_requests';
      let monitor: ReturnType<typeof setInterval> | undefined, observation: Promise<void> = Promise.resolve(), observing = false;
      if (diagnostics) monitor = setInterval(() => { if (!observing) { observing = true; observation = diagnosticSnapshot().catch(() => { console.info('DEV fixture lock monitor unavailable'); }).finally(() => { observing = false; }); } }, 1000);
      let repeated: PromiseSettledResult<unknown>[];
      try { repeated = await Promise.allSettled(Array.from({ length: 10 }, () => f.service.reserve(chosen.principal, chosen.quote))); }
      finally { if (monitor) clearInterval(monitor); await observation; }
      // Drain every caller before cleanup, including a failed lock waiter.
      for (const result of repeated!) if (result.status === 'rejected') throw result.reason;
      for (const row of await f.buckets()) { expect(row.reserved_stroops).toBe('3600'); expect(row.spent_stroops).toBe('0'); }
    } finally { await f.cleanup(); }
  }, 90_000);

  it('retains UNKNOWN exposure and settles an explicitly synthetic SUCCESS exactly once', async () => {
    const f = await fixture(1), chosen = f.fixtures[0];
    try {
      await f.service.reserve(chosen.principal, chosen.quote);
      const bound = await f.service.bindSubmission(chosen.principal, chosen.signedSyntheticInner, { signedAt: f.at });
      const unknownSyntheticReceipt = async (hash: string) => ({ transactionHash: hash, status: 'UNKNOWN' as const });
      await f.service.reconcile(chosen.principal.requestId, unknownSyntheticReceipt);
      await f.service.reconcile(chosen.principal.requestId, unknownSyntheticReceipt);
      expect((await f.store.get(chosen.principal.requestId))?.state).toBe('submitted');
      for (const row of await f.buckets()) { expect(row.reserved_stroops).toBe('1200'); expect(row.spent_stroops).toBe('0'); }
      // Synthetic fixture receipt, NOT evidence of an actual chain transaction.
      const syntheticSuccess = async (hash: string) => ({ transactionHash: hash, status: 'SUCCESS' as const, feeChargedStroops: '100', ledger: 424242 });
      await f.service.reconcile(chosen.principal.requestId, syntheticSuccess);
      await f.service.reconcile(chosen.principal.requestId, syntheticSuccess);
      expect(await f.store.get(chosen.principal.requestId)).toMatchObject({ state: 'settled', transactionHash: bound.transactionHash, chargedStroops: '100' });
      for (const row of await f.buckets()) { expect(row.reserved_stroops).toBe('0'); expect(row.spent_stroops).toBe('100'); }
    } finally { await f.cleanup(); }
  }, 90_000);

  it('enforces immutable draft scope and optimistic revision inside a transaction that is always rolled back', async () => {
    const client = await connect(), id = randomUUID(), author = Keypair.random().publicKey(), patient = Keypair.random().publicKey();
    const owner = 'did:privy:resilience_' + randomBytes(12).toString('hex'), wallet = 'resilience:' + randomUUID();
    const historyId = randomBytes(32).toString('hex'), keys = { activeKeyId: 'synthetic-pg-test', keyring: { 'synthetic-pg-test': randomBytes(32).toString('hex') } };
    const payload = { note: { title: 'Synthetic Postgres test', text: 'Not clinical data', eventDate: null } };
    const context: DraftContext = { schemaVersion: 1, network: 'testnet', contractId, draftId: id, authorUserId: owner, authorWalletId: wallet,
      author, historyId, patient, entryId: null, expectedVersion: null, revision: 1 };
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO clinical_private_drafts(id,owner_user_id,wallet_id,author_wallet,contract_id,network,history_id,patient_wallet,
        entry_id,expected_version,revision,envelope,request_fingerprint) VALUES($1,$2,$3,$4,$5,'testnet',$6,$7,NULL,NULL,1,$8::jsonb,$9)`,
      [id, owner, wallet, author, contractId, historyId, patient, JSON.stringify(sealDraft(context, payload, keys)), 'synthetic-pg-test:' + 'a'.repeat(64)]);
      await client.query('SAVEPOINT draft_scope');
      await expect(client.query('UPDATE clinical_private_drafts SET patient_wallet=$3 WHERE id=$1 AND owner_user_id=$2', [id, owner, author]))
        .rejects.toThrow('clinical_draft_scope_immutable');
      await client.query('ROLLBACK TO SAVEPOINT draft_scope');
      const updated = await client.query(`UPDATE clinical_private_drafts SET revision=2,envelope=$3::jsonb,request_fingerprint=$4,updated_at=NOW()
        WHERE id=$1 AND owner_user_id=$2 AND revision=1 RETURNING revision`,
      [id, owner, JSON.stringify(sealDraft({ ...context, revision: 2 }, payload, keys)), 'synthetic-pg-test:' + 'b'.repeat(64)]);
      expect(updated.rows).toHaveLength(1);
      expect((await client.query('UPDATE clinical_private_drafts SET revision=2 WHERE id=$1 AND owner_user_id=$2 AND revision=1 RETURNING id', [id, owner])).rows).toHaveLength(0);
    } finally { try { await client.query('ROLLBACK'); } finally { client.release(); } }
    const verify = await connect();
    try { expect((await verify.query('SELECT id FROM clinical_private_drafts WHERE id=$1 AND owner_user_id=$2', [id, owner])).rows).toHaveLength(0); }
    finally { verify.release(); }
  }, 60_000);

  it('shares SQL limits between renewal and medical sources while preserving the patient withdrawal reserve', async () => {
    const f = await fixture(3);
    const policy: SponsorshipPolicy = { enabled: true, sponsorDailyLimitStroops: '3600', patientDailyLimitStroops: '3600',
      encounterLimitStroops: '3600', emergencyReserveStroops: '1200', maxFeeStroops: '2000' };
    const service = createSponsorshipService({ store: f.store, policy, now: () => f.at });
    async function candidate(index: number, kind: 'renewal' | 'medical' | 'withdrawal') {
      const old = f.fixtures[index].principal;
      const sourceAddress = kind === 'renewal' ? Keypair.random().publicKey() : kind === 'withdrawal' ? old.patientAddress : old.sourceAddress;
      const target = kind === 'renewal' ? 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2' : contractId;
      const action = kind === 'renewal' ? 'reauthorize_doctor' : kind === 'withdrawal' ? 'set_permissions' : 'append_version';
      const operation = new Contract(target).call(action);
      const tx = new TransactionBuilder(new Account(sourceAddress, String(index + 300)), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(operation).setSorobanData(new SorobanDataBuilder().setResourceFee('1000').build()).setTimebounds(0, f.at + 300).build();
      const { encounterId, ...base } = old;
      const principal = await verifySponsorshipPrincipal(async () => ({ ...base, sourceAddress, contractId: target, action,
        ...(kind === 'medical' ? { encounterId } : {}), ...(kind === 'withdrawal' ? { intent: 'revoke' as const } : {}),
        operationFingerprint: sha256(operation.body().invokeHostFunctionOp().hostFunction().toXDR('base64')) }));
      return { principal, quote: quoteSponsorship(principal, { unsignedXdr: tx.toXDR(), sponsorBaseFeeStroops: '100', preparedAt: f.at, now: f.at }) };
    }
    try {
      const [renewal, medical, withdrawal] = await Promise.all([candidate(0, 'renewal'), candidate(1, 'medical'), candidate(2, 'withdrawal')]);
      const reservations = await Promise.allSettled([service.reserve(renewal.principal, renewal.quote), service.reserve(medical.principal, medical.quote)]);
      for (const result of reservations) if (result.status === 'rejected') throw result.reason;
      expect((await f.store.get(renewal.principal.requestId))?.state).toBe('reserved');
      expect((await f.store.get(medical.principal.requestId))?.state).toBe('reserved');
      await service.reserve(withdrawal.principal, withdrawal.quote);
      const rows = await f.buckets();
      for (const row of rows.filter(r => /^(patient|sponsor):/.test(r.bucket_key))) {
        expect(row.reserved_stroops).toBe('3600'); expect(row.spent_stroops).toBe('0');
      }
      expect((await f.store.get(withdrawal.principal.requestId))?.binding.intent).toBe('revoke');
    } finally { await f.cleanup(); }
  }, 90_000);

});
