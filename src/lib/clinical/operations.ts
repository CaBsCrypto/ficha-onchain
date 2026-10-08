import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { PrivyClient } from '@privy-io/server-auth';
import { Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { PoolClient } from '@neondatabase/serverless';
import { getDbConnection, getDb } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { resolveDoctor } from '@/lib/doctor-authorizations';
import { PrivateFlowError, PRIVY_APP, assertPrivateWrites } from '@/lib/private-config';
import { signPreparedOwnerTransaction } from '@/lib/stellar/privy-owner-signing';
import type { ClinicalActor, ClinicalPrepareRequest, ClinicalExpected } from '@/types/clinical';
import { sealClinicalVersion } from '../../../scripts/lib/clinical-crypto.mjs';
import { clinicalNeonStore } from '../../../scripts/lib/clinical-neon-store.mjs';
import { CLINICAL_ID, assertClinicalEnvironment } from './config';
import { clinicalKeyring } from './keys';
import { createClinicalWebChain, assertClinicalUnsigned, assertClinicalSavedEnvelope, sponsorClinicalSignature, type ClinicalSavedEnvelope } from './chain';
import { assertClinicalOwner } from './identity';
import { clinicalPublicOperation } from './history';

type Row = Record<string, any>;
const chain = () => createClinicalWebChain();
const contextFor = (e: ClinicalExpected) => ({ schemaVersion: 1, network: 'testnet', contractId: CLINICAL_ID,
  historyId: e.historyId, entryId: e.entryId!, author: e.author!, patient: e.patient,
  version: e.expectedVersion!+1, previousCommitment: e.previousCommitment ?? null });
const methods = { create_history: 'create_history', append_version: 'append_version', set_permissions: 'set_permissions' };
function fingerprint(input: ClinicalPrepareRequest, saved?: string) {
  const keys = clinicalKeyring();
  const keyId = saved ? saved.slice(0, saved.lastIndexOf(':')) : keys.activeKeyId;
  if (!Object.hasOwn(keys.keyring, keyId)) throw new PrivateFlowError('clinical_keys_unavailable', 503);
  const canonical = JSON.stringify({ requestId: input.requestId, action: input.action, entryId: input.entryId,
    expectedVersion: input.expectedVersion, note: input.note, file: input.file, doctorId: input.doctorId,
    canRead: input.canRead, canAppend: input.canAppend, expectedRevision: input.expectedRevision });
  return `${keyId}:${createHmac('sha256', Buffer.from(keys.keyring[keyId], 'hex')).update(canonical).digest('hex')}`;
}

async function locked<T>(actor: ClinicalActor, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDbConnection();
  try { await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`private-user:${actor.address}`]);
    const result = await work(client); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function ownHistory(client: PoolClient, actor: ClinicalActor) {
  const row = (await client.query("SELECT * FROM clinical_web_histories WHERE owner_user_id=$1 AND contract_id=$2 AND network='testnet'", [actor.userId, CLINICAL_ID])).rows[0];
  if (!row) throw new PrivateFlowError('clinical_history_required', 409);
  assertClinicalOwner(row, actor);
  const live = await chain().history(row.history_id);
  if (!live || live.patient !== actor.address || live.id !== row.history_id) throw new PrivateFlowError('clinical_history_unavailable', 503);
  return row;
}
async function operation(client: PoolClient, actor: ClinicalActor, id: string): Promise<Row> {
  const row = (await client.query('SELECT * FROM clinical_web_operations WHERE id=$1 AND actor_user_id=$2 AND contract_id=$3 FOR UPDATE', [id, actor.userId, CLINICAL_ID])).rows[0];
  if (!row || row.wallet_id !== actor.walletId || row.source_wallet !== actor.address) throw new PrivateFlowError('clinical_operation_not_found', 404);
  return row;
}
async function eligible(actor: ClinicalActor, row: Row, replay = false) {
  if (row.contract_id !== CLINICAL_ID || row.method !== methods[row.action as keyof typeof methods] || row.expected.patient !== actor.address) throw new PrivateFlowError('clinical_saved_intent_invalid', 503);
  const c = chain(), e: ClinicalExpected = row.expected; await c.verifyDeployment();
  if (row.action === 'create_history') {
    if (!replay && await c.historyForPatient(actor.address)) throw new PrivateFlowError('clinical_history_already_exists');
    return;
  }
  const history = await c.history(e.historyId);
  if (!history || history.patient !== actor.address) throw new PrivateFlowError('clinical_identity_changed', 403);
  if (row.action === 'append_version') {
    const head = await c.entry(e.historyId, e.entryId!);
    if ((head?.headVersion ?? 0) !== e.expectedVersion || (head && head.author !== actor.address) || e.author !== actor.address) throw new PrivateFlowError('clinical_version_conflict');
  } else {
    const grant = await c.grant(e.historyId, e.doctor!);
    if ((grant?.revision ?? 0) !== e.expectedRevision) throw new PrivateFlowError('clinical_permission_conflict');
    if (e.canRead || e.canAppend) {
      // Re-resolve the original selected doctor immediately before signing or
      // replaying a saved envelope. A wallet-only legacy intent may be audited
      // or withdrawn, but never newly grant access to an unbound app target.
      if (!Number.isSafeInteger(e.doctorId) || Number(e.doctorId) < 1) throw new PrivateFlowError('clinical_saved_intent_invalid', 503);
      const target = await resolveDoctor(getDb(), e.doctorId!);
      if (target.address !== e.doctor || target.doctor.status !== 'active' || !await c.doctorAuthorized(e.doctor!)) {
        throw new PrivateFlowError('doctor_not_authorized', 403);
      }
    }
  }
}
export async function prepareClinicalOperation(user: AuthedUser, actor: ClinicalActor, input: ClinicalPrepareRequest) {
  assertClinicalEnvironment(true); clinicalKeyring();
  return locked(actor, async client => {
    const existing = (await client.query('SELECT * FROM clinical_web_operations WHERE id=$1 FOR UPDATE', [input.requestId])).rows[0];
    if (existing) {
      if (existing.actor_user_id !== actor.userId || existing.wallet_id !== actor.walletId || existing.source_wallet !== actor.address || existing.action !== input.action || existing.contract_id !== CLINICAL_ID) throw new PrivateFlowError('clinical_request_conflict');
      const expected = Buffer.from(fingerprint(input, existing.request_fingerprint)), actual = Buffer.from(existing.request_fingerprint ?? '');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new PrivateFlowError('clinical_request_conflict');
      // A repeated id names its first intent, never a replacement payload.
      return { operation: clinicalPublicOperation(existing) };
    }
    await client.query("UPDATE clinical_web_operations SET state='cancelled',error_code='signature_request_expired',updated_at=NOW() WHERE source_wallet=$1 AND state='awaiting_signature' AND signed_xdr IS NULL AND expires_at<=EXTRACT(EPOCH FROM NOW())", [actor.address]);
    for (const table of ['private_operations', 'clinical_transaction_attempts', 'clinical_web_operations']) {
      if ((await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`])).rows[0]?.relation) {
        const states = table === 'clinical_transaction_attempts' ? "'prepared','submitted'" : "'awaiting_signature','submitted'";
        if ((await client.query(`SELECT 1 FROM ${table} WHERE source_wallet=$1 AND state IN (${states}) LIMIT 1`, [actor.address])).rows.length) throw new PrivateFlowError('another_operation_pending');
      }
    }
    const c = chain(); await c.verifyDeployment();
    let e: ClinicalExpected; let envelope: unknown = null;
    const operationId = randomBytes(32).toString('hex');
    if (input.action === 'create_history') {
      if ((await client.query('SELECT 1 FROM clinical_web_histories WHERE owner_user_id=$1 AND contract_id=$2', [user.userId, CLINICAL_ID])).rows.length || await c.historyForPatient(actor.address)) throw new PrivateFlowError('clinical_history_already_exists');
      e = { historyId: await c.deriveHistoryId(actor.address), patient: actor.address, operationId };
    } else {
      const h = await ownHistory(client, actor);
      e = { historyId: h.history_id, patient: actor.address, operationId };
      if (input.action === 'append_version') {
        const entryId = input.entryId ?? await c.deriveEntryId(e.historyId, actor.address, operationId);
        const head = await c.entry(e.historyId, entryId), expectedVersion = input.expectedVersion ?? 0;
        if ((head?.headVersion ?? 0) !== expectedVersion || (head && head.author !== actor.address)) throw new PrivateFlowError('clinical_version_conflict');
        const previous = expectedVersion ? await c.version(e.historyId, entryId, expectedVersion) : null;
        e = { ...e, entryId, author: actor.address, expectedVersion, expectedGrantRevision: 0, previousCommitment: previous?.commitment ?? null };
        const content = input.note ? Buffer.from(JSON.stringify(input.note), 'utf8') : Buffer.from(input.file!.base64, 'base64');
        const metadata = input.note ? { mediaType: 'application/json', fileName: 'antecedente.json' } : { mediaType: input.file!.mediaType, fileName: input.file!.fileName };
        const sealed = sealClinicalVersion({ context: contextFor(e), content, metadata, ...clinicalKeyring() });
        e.commitment = sealed.commitment; envelope = sealed.envelope;
      } else {
        const d = await resolveDoctor(getDb(), input.doctorId!);
        const grant = await c.grant(e.historyId, d.address);
        if ((grant?.revision ?? 0) !== input.expectedRevision) throw new PrivateFlowError('clinical_permission_conflict');
        if ((input.canRead || input.canAppend) && (d.doctor.status !== 'active' || !await c.doctorAuthorized(d.address))) throw new PrivateFlowError('doctor_not_authorized', 403);
        e = { ...e, doctorId: input.doctorId!, doctor: d.address, canRead: input.canRead!, canAppend: input.canAppend!, expectedRevision: input.expectedRevision! };
      }
    }
    const tx = await c.prepare(actor.address, input.action, e);
    const row = (await client.query(`INSERT INTO clinical_web_operations
      (id,actor_user_id,wallet_id,source_wallet,action,contract_id,method,expected,prepared_envelope,state,unsigned_xdr,signing_hash,expires_at,request_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'awaiting_signature',$10,$11,$12,$13) RETURNING *`,
      [input.requestId, user.userId, actor.walletId, actor.address, input.action, CLINICAL_ID, methods[input.action], JSON.stringify(e), envelope ? JSON.stringify(envelope) : null, tx.toXDR(), tx.hash().toString('hex'), Number(tx.timeBounds!.maxTime), fingerprint(input)])).rows[0];
    return { operation: clinicalPublicOperation(row) };
  });
}
export async function signClinicalOperation(user: AuthedUser, actor: ClinicalActor, id: string, token: string) {
  assertClinicalEnvironment(true);
  await locked(actor, async client => {
    const row = await operation(client, actor, id);
    if (row.state !== 'awaiting_signature') return;
    if (Number(row.expires_at) <= Date.now()/1000) throw new PrivateFlowError('signature_request_expired');
    const unsigned = TransactionBuilder.fromXDR(row.unsigned_xdr, Networks.TESTNET);
    if (!(unsigned instanceof Transaction) || unsigned.hash().toString('hex') !== row.signing_hash || Number(unsigned.timeBounds?.maxTime) !== Number(row.expires_at)) throw new PrivateFlowError('clinical_saved_intent_invalid', 503);
    assertClinicalUnsigned(unsigned, actor.address, row.action, row.expected); await eligible(actor, row);
    if (!process.env.PRIVY_APP_SECRET) throw new PrivateFlowError('clinical_signing_unavailable', 503);
    const signed = await signPreparedOwnerTransaction(token, actor, { ...actor, network: 'testnet', unsignedXdr: row.unsigned_xdr, hash: row.signing_hash, expiresAt: Number(row.expires_at)*1000 }, {
      privy: new PrivyClient(PRIVY_APP, process.env.PRIVY_APP_SECRET), appId: PRIVY_APP, appSecret: process.env.PRIVY_APP_SECRET,
    });
    const tx = TransactionBuilder.fromXDR(signed.signedXdr, Networks.TESTNET);
    if (!(tx instanceof Transaction) || tx.signatures.length !== 1) throw new PrivateFlowError('clinical_signature_invalid');
    const sponsored = sponsorClinicalSignature(row.unsigned_xdr, actor.address, tx.signatures[0].signature().toString('hex'), row.action, row.expected);
    await client.query("UPDATE clinical_web_operations SET signed_xdr=$2,transaction_hash=$3,state='submitted',updated_at=NOW() WHERE id=$1 AND state='awaiting_signature'", [id, sponsored.xdr, sponsored.hash]);
  });
  // Persisted first; a response lost after this point recovers this exact envelope.
  return reconcileClinicalOperation(actor, id, true);
}
export async function reconcileClinicalOperation(actor: ClinicalActor, id: string, retry = false) {
  assertClinicalEnvironment();
  return locked(actor, async client => {
    let row = await operation(client, actor, id);
    if (row.state === 'awaiting_signature' && Number(row.expires_at) <= Date.now()/1000) {
      row = (await client.query("UPDATE clinical_web_operations SET state='cancelled',error_code='signature_request_expired',updated_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0];
    }
    if (row.state !== 'submitted') return { operation: clinicalPublicOperation(row) };
    // Audit the saved payer signature independently of current relayer secrets.
    // Rotating a payer must not hide an already executed exact receipt.
    assertClinicalSavedEnvelope(row as ClinicalSavedEnvelope, { historical: true });
    const c = chain(), receipt = await c.receipt(row.transaction_hash);
    if (receipt.status === 'SUCCESS' || receipt.status === 'FAILED') {
      if (!receipt.envelopeXdr || receipt.envelopeXdr.toXDR('base64') !== row.signed_xdr) throw new PrivateFlowError('clinical_receipt_mismatch', 503);
    }
    if (receipt.status === 'SUCCESS') {
      await c.verifyDeployment(); const e: ClinicalExpected = row.expected;
      if (row.action === 'create_history') {
        const history = await c.history(e.historyId);
        if (!history || history.patient !== actor.address || history.id !== e.historyId) throw new PrivateFlowError('clinical_receipt_mismatch', 503);
        await client.query(`INSERT INTO clinical_web_histories(history_id,owner_user_id,wallet_id,patient_wallet,contract_id,network,transaction_hash)
          VALUES($1,$2,$3,$4,$5,'testnet',$6) ON CONFLICT DO NOTHING`, [e.historyId, actor.userId, actor.walletId, actor.address, CLINICAL_ID, row.transaction_hash]);
        const saved = (await client.query('SELECT * FROM clinical_web_histories WHERE history_id=$1', [e.historyId])).rows[0];
        assertClinicalOwner(saved, actor);
      } else if (row.action === 'append_version') {
        const version = await c.version(e.historyId, e.entryId!, e.expectedVersion!+1);
        const expectedContext = contextFor(e);
        if (!version || version.commitment !== e.commitment || Object.entries(expectedContext).some(([key, value]) => version.context[key as keyof typeof version.context] !== value)) throw new PrivateFlowError('clinical_receipt_mismatch', 503);
        // The reusable store owns a transaction. Savepoints keep the outer wallet
        // lock and the operation + confirmed version atomic until our final COMMIT.
        const store = clinicalNeonStore({ query: (sql: string, values?: unknown[]) =>
          client.query(sql === 'BEGIN' ? 'SAVEPOINT clinical_storage' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT clinical_storage' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT clinical_storage' : sql, values) });
        await store.stageVersion({ context: contextFor(e), envelope: row.prepared_envelope, commitment: e.commitment, operationId: e.operationId });
        await store.confirmVersion({ context: expectedContext, commitment: e.commitment, operationId: e.operationId, receipt: {
          status: 'SUCCESS', network: 'testnet', contractId: CLINICAL_ID, context: expectedContext,
          commitment: e.commitment, operationId: e.operationId, transactionHash: row.transaction_hash,
        } });
      }
      // The exact saved fee-bump receipt proves a historical grant; current permissions are read independently.
      row = (await client.query("UPDATE clinical_web_operations SET state='confirmed',error_code=NULL,confirmed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0];
    } else if (receipt.status === 'FAILED') {
      row = (await client.query("UPDATE clinical_web_operations SET state='failed',error_code='transaction_failed',updated_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0];
    } else if (retry && receipt.status === 'NOT_FOUND' && Number(row.expires_at) > Date.now()/1000 && process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'true') {
      assertPrivateWrites();
      try { await eligible(actor, row, true); }
      catch { return { operation: { ...clinicalPublicOperation(row), errorCode: 'clinical_retry_unavailable' } }; }
      // No new preparation, signing, fee bump or hash. Uncertainty retains the saved attempt.
      try { assertClinicalSavedEnvelope(row as ClinicalSavedEnvelope); await c.submit(row.signed_xdr); } catch { /* Recoverable; keep submitted. */ }
    }
    return { operation: clinicalPublicOperation(row) };
  });
}
export async function cancelClinicalOperation(actor: ClinicalActor, id: string) {
  return locked(actor, async client => {
    const row = await operation(client, actor, id);
    if (row.state === 'awaiting_signature' && !row.signed_xdr) {
      const saved = (await client.query("UPDATE clinical_web_operations SET state='cancelled',error_code='signature_cancelled',updated_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0];
      return { operation: clinicalPublicOperation(saved) };
    }
    return { operation: clinicalPublicOperation(row) };
  });
}
