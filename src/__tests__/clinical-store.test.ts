import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { clinicalWebStore, type ClinicalHistoryInsert, type ClinicalOperationInsert, type ClinicalSqlClient } from '@/lib/clinical/store';
import type { ClinicalExpected, ClinicalOperationState } from '@/types/clinical';

const CONTRACT = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const PATIENT = 'GBYP4WWYQ37AZN2DIL6C3TCSEUSHG4DYZZWP26IBQYWDGVIJKVBCR66S';
const USER = 'did:privy:patient_1', OTHER_USER = 'did:privy:other_2', WALLET_ID = 'wallet_1';
const H = 'a'.repeat(64), ENTRY = 'b'.repeat(64), OP = 'c'.repeat(64), TX = 'd'.repeat(64);
const ID = '4901b623-2bea-4769-bb8f-f4e530d0fa02', NOW = '2026-10-08T04:00:00.000Z';
const scope = { contractId: CONTRACT, network: 'testnet' as const };
const expected: ClinicalExpected = { historyId: H, patient: PATIENT, operationId: OP };
const encrypted = { schemaVersion: 1 as const, keyId: 'web-v1', wrappedKey: `dossier:v1:${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(16).toString('base64')}:YWJj`, payload: `dossier:v1:${Buffer.alloc(12).toString('base64')}:${Buffer.alloc(16).toString('base64')}:YWJj` };
function historyRow(overrides = {}) { return { history_id: H, owner_user_id: USER, wallet_id: WALLET_ID, patient_wallet: PATIENT,
  contract_id: CONTRACT, network: 'testnet', transaction_hash: TX, created_at: NOW, ...overrides }; }
function operationRow(overrides = {}) { return { id: ID, actor_user_id: USER, wallet_id: WALLET_ID, source_wallet: PATIENT,
  action: 'create_history', contract_id: CONTRACT, network: 'testnet', method: 'create_history', expected,
  request_fingerprint: 'web-v1:' + OP, prepared_envelope: null, state: 'awaiting_signature', unsigned_xdr: 'YWJj', signing_hash: OP, expires_at: '1791425000',
  signed_xdr: null, transaction_hash: null, error_code: null, created_at: NOW, updated_at: NOW, confirmed_at: null, ...overrides }; }
function insert(overrides: Partial<ClinicalOperationInsert> = {}): ClinicalOperationInsert {
  return { id: ID, actorUserId: USER, walletId: WALLET_ID, sourceWallet: PATIENT, action: 'create_history', contractId: CONTRACT,
    network: 'testnet', method: 'create_history', expected, requestFingerprint: 'web-v1:' + OP, state: 'awaiting_signature', unsignedXdr: 'YWJj', signingHash: OP, expiresAt: 1791425000, ...overrides };
}
function historyInsert(overrides = {}): ClinicalHistoryInsert { return { historyId: H, ownerUserId: USER, walletId: WALLET_ID, patientWallet: PATIENT,
  contractId: CONTRACT, network: 'testnet', transactionHash: TX, ...overrides }; }
function client(...results: Record<string, unknown>[][]) {
  const query = vi.fn<ClinicalSqlClient['query']>();
  for (const rows of results) query.mockResolvedValueOnce({ rows });
  return { query };
}
const versionRow = () => ({ context: { schemaVersion: 1, network: 'testnet', contractId: CONTRACT, historyId: H, entryId: ENTRY, author: PATIENT,
  patient: PATIENT, version: 1, previousCommitment: null }, commitment: OP, operation_id: TX, state: 'confirmed', transaction_hash: TX });

describe('clinical web persistence: identity and encrypted index', () => {
  it('binds every history lookup to stable actor, contract and Testnet', async () => {
    const db = client([historyRow()]);
    const h = await clinicalWebStore(db, scope).getHistory(USER);
    expect(h?.ownerUserId).toBe(USER); expect(h?.createdAt).toBe(NOW);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('owner_user_id=$1 AND contract_id=$2 AND network=$3'), [USER, CONTRACT, 'testnet']);
  });
  it.each([{ network: 'mainnet' }, { contractId: 'invalid' }])('rejects an unsafe scope before SQL', change => {
    const db = client(); expect(() => clinicalWebStore(db, { ...scope, ...change } as typeof scope)).toThrow('clinical_storage_invalid'); expect(db.query).not.toHaveBeenCalled();
  });
  it.each(["x' OR 1=1", 'person@example.org', '', OTHER_USER])('does not infer access from malformed or foreign identity %s', async actor => {
    const db = client([historyRow()]);
    await expect(clinicalWebStore(db, scope).getHistory(actor)).rejects.toThrow('clinical_storage_invalid');
  });
  it.each([{ owner_user_id: OTHER_USER }, { contract_id: `C${'A'.repeat(55)}` }, { network: 'mainnet' }])('rejects inconsistent returned history binding', async change => {
    await expect(clinicalWebStore(client([historyRow(change)]), scope).getHistory(USER)).rejects.toThrow('clinical_storage_invalid');
  });
  it('inserts a history only with a transaction hash and never overwrites a conflicting binding', async () => {
    const db = client([historyRow()]); await clinicalWebStore(db, scope).saveHistory(historyInsert());
    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT DO NOTHING');
    expect(db.query.mock.calls[0][1]).toEqual([H, USER, WALLET_ID, PATIENT, CONTRACT, 'testnet', TX]);
    await expect(clinicalWebStore(client([], [historyRow({ wallet_id: 'different_wallet' })]), scope).saveHistory(historyInsert())).rejects.toThrow('clinical_history_binding_conflict');
    const invalidDb = client(); await expect(clinicalWebStore(invalidDb, scope).saveHistory(historyInsert({ transactionHash: null }))).rejects.toThrow('clinical_storage_invalid'); expect(invalidDb.query).not.toHaveBeenCalled();
  });
  it('allows an exact repeated history registration without changing data', async () => {
    const db = client([], [historyRow()]); await expect(clinicalWebStore(db, scope).saveHistory(historyInsert())).resolves.toMatchObject({ historyId: H });
    expect(db.query.mock.calls.every(([sql]) => !sql.startsWith('UPDATE'))).toBe(true);
  });
  it('lists only confirmed, scoped ciphertext metadata and does not return any envelope', async () => {
    const db = client([historyRow()], [versionRow()]); const versions = await clinicalWebStore(db, scope).listVersions(H, USER);
    expect(versions).toEqual([{ context: versionRow().context, commitment: OP, operationId: TX, state: 'confirmed', transactionHash: TX }]);
    const [sql, params] = db.query.mock.calls[1]; expect(sql).toContain("v.state='confirmed'"); expect(sql).not.toMatch(/SELECT[^;]*envelope/); expect(params).toEqual([H, USER, CONTRACT, 'testnet']);
  });
  it('cannot list another history even with a known ID', async () => {
    const db = client([historyRow()]); await expect(clinicalWebStore(db, scope).listVersions(ENTRY, USER)).rejects.toThrow('clinical_history_unavailable'); expect(db.query).toHaveBeenCalledTimes(1);
  });
  it.each([{ state: 'prepared' }, { transaction_hash: null }, { context: { ...versionRow().context, patient: `G${'A'.repeat(55)}` } }, { context: { ...versionRow().context, fileName: 'private.pdf' } }])('rejects unconfirmed or misbound index rows', async change => {
    await expect(clinicalWebStore(client([historyRow()], [{ ...versionRow(), ...change }]), scope).listVersions(H, USER)).rejects.toThrow('clinical_storage_invalid');
  });
});

describe('clinical web persistence: immutable operation intents', () => {
  it('scopes operation lookups and lists by the authenticated actor', async () => {
    const db = client([operationRow()], [operationRow()]); const store = clinicalWebStore(db, scope);
    expect((await store.getOperation(ID, USER))?.expected).toEqual(expected); expect((await store.listOperations(USER)).length).toBe(1);
    expect(db.query.mock.calls[0][1]).toEqual([ID, USER, CONTRACT, 'testnet']); expect(db.query.mock.calls[1][1]).toEqual([USER, CONTRACT, 'testnet']);
    await expect(clinicalWebStore(client([operationRow({ actor_user_id: OTHER_USER })]), scope).getOperation(ID, USER)).rejects.toThrow('clinical_storage_invalid');
  });
  it('inserts immutable intent before a signature with parameterized JSON', async () => {
    const db = client([], [], [operationRow()]); const row = await clinicalWebStore(db, scope).insertOperation(insert());
    expect(row.state).toBe('awaiting_signature'); expect(row.signedXdr).toBeNull(); expect(row.preparedEnvelope).toBeNull();
    expect(db.query.mock.calls[2][0]).toContain('ON CONFLICT DO NOTHING'); expect(db.query.mock.calls[2][1]?.[8]).toBe(JSON.stringify(expected));
  });
  it('reuses exactly the persisted request and rejects a changed unsigned envelope', async () => {
    await expect(clinicalWebStore(client([operationRow()]), scope).insertOperation(insert())).resolves.toMatchObject({ id: ID });
    await expect(clinicalWebStore(client([operationRow()]), scope).insertOperation(insert({ unsignedXdr: 'ZGVm' }))).rejects.toThrow('clinical_operation_conflict');
  });
  it.each([{ expected: { ...expected, fileName: 'private.pdf' } }, { expected: { ...expected, patient: `G${'A'.repeat(55)}` } }, { method: 'append_version' }, { state: 'submitted' }, { signingHash: 'wrong' }, { requestFingerprint: 'plaintext' }])('rejects plaintext, misbound or invalid preparations', async change => {
    const db = client(); await expect(clinicalWebStore(db, scope).insertOperation(insert(change as Partial<ClinicalOperationInsert>))).rejects.toThrow('clinical_storage_invalid'); expect(db.query).not.toHaveBeenCalled();
  });
  it('recovers a confirmed create-history attempt after its history now exists', async () => {
    const db = client([operationRow({ state: 'confirmed', signed_xdr: 'c2lnbmVk', transaction_hash: TX, confirmed_at: NOW })]);
    const row = await clinicalWebStore(db, scope).insertOperation(insert());
    expect(row.state).toBe('confirmed'); expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).not.toContain('clinical_web_histories');
  });
  it('rejects reuse of a request UUID for a different privately fingerprinted payload', async () => {
    const db = client([operationRow()]);
    await expect(clinicalWebStore(db, scope).insertOperation(insert({ requestFingerprint: 'web-v1:' + TX }))).rejects.toThrow('clinical_operation_conflict');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('requires own confirmed history and exactly one encrypted envelope when appending', async () => {
    const e = { ...expected, entryId: ENTRY, author: PATIENT, commitment: OP, previousCommitment: null, expectedVersion: 0 };
    const data = insert({ action: 'append_version', method: 'append_version', expected: e, preparedEnvelope: encrypted });
    const db = client([], [historyRow()], [operationRow({ action: 'append_version', method: 'append_version', expected: e, prepared_envelope: encrypted })]);
    const row = await clinicalWebStore(db, scope).insertOperation(data);
    expect(row.preparedEnvelope).toEqual(encrypted); expect(db.query.mock.calls[2][1]?.[10]).toBe(JSON.stringify(encrypted));
    expect(db.query.mock.calls.every(([sql]) => !sql.includes('INSERT INTO clinical_private_versions'))).toBe(true);
    await expect(clinicalWebStore(client(), scope).insertOperation({ ...data, preparedEnvelope: null })).rejects.toThrow('clinical_storage_invalid');
    await expect(clinicalWebStore(client(), scope).insertOperation({ ...data, preparedEnvelope: { ...encrypted, fileName: 'plain.pdf' } } as typeof data)).rejects.toThrow('clinical_storage_invalid');
    await expect(clinicalWebStore(client([], [historyRow({ wallet_id: 'changed_wallet' })]), scope).insertOperation(data)).rejects.toThrow('clinical_history_binding_conflict');
  });
  it('keeps read and append grants independent without storing display names', async () => {
    const e = { ...expected, doctor: PATIENT, canRead: true, canAppend: false, expectedRevision: 0 };
    const data = insert({ action: 'set_permissions', method: 'set_permissions', expected: e });
    const db = client([], [historyRow()], [operationRow({ action: 'set_permissions', method: 'set_permissions', expected: e })]);
    expect((await clinicalWebStore(db, scope).insertOperation(data)).expected).toEqual(e);
  });
  it('persists the immutable target doctor ID while preserving legacy permission row reads', async () => {
    const e = { ...expected, doctorId: 17, doctor: PATIENT, canRead: true, canAppend: false, expectedRevision: 0 };
    const data = insert({ action: 'set_permissions', method: 'set_permissions', expected: e });
    const db = client([], [historyRow()], [operationRow({ action: 'set_permissions', method: 'set_permissions', expected: e })]);
    expect((await clinicalWebStore(db, scope).insertOperation(data)).expected).toEqual(e);
    const { doctorId: _doctorId, ...legacy } = e;
    const existing = client([operationRow({ action: 'set_permissions', method: 'set_permissions', expected: legacy })]);
    expect((await clinicalWebStore(existing, scope).getOperation(ID, USER))?.expected).toEqual(legacy);
  });
  it.each([null, 0, -1, 1.5, '17', 2_147_483_648])('rejects an invalid target doctor ID %s before querying', async doctorId => {
    const db = client(); const e = { ...expected, doctorId, doctor: PATIENT, canRead: true, canAppend: false, expectedRevision: 0 };
    await expect(clinicalWebStore(db, scope).insertOperation(insert({ action: 'set_permissions', method: 'set_permissions', expected: e } as Partial<ClinicalOperationInsert>))).rejects.toThrow('clinical_storage_invalid');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('does not replace a competing live wallet request when insert conflicts', async () => {
    await expect(clinicalWebStore(client([], [], [], []), scope).insertOperation(insert())).rejects.toThrow('clinical_operation_conflict');
  });
});

describe('clinical web persistence: uncertain and terminal state recovery', () => {
  const submitted = operationRow({ state: 'submitted', signed_xdr: 'c2lnbmVk', transaction_hash: TX });
  it('durably records the signed envelope with a compare-and-set before transmission', async () => {
    const db = client([operationRow()], [submitted]); const row = await clinicalWebStore(db, scope).updateOperation(ID, 'awaiting_signature', { actorUserId: USER, state: 'submitted', signedXdr: 'c2lnbmVk', transactionHash: TX });
    expect(row.transactionHash).toBe(TX); const [sql, params] = db.query.mock.calls[1];
    expect(sql).toContain('state=$9'); expect(sql).toContain('signed_xdr IS NOT DISTINCT FROM $10'); expect(params?.slice(4)).toEqual(['submitted', 'c2lnbmVk', TX, null, 'awaiting_signature', null, null]);
  });
  it('keeps an uncertain response submitted and recovers the same envelope', async () => {
    const db = client([submitted], [{ ...submitted, error_code: 'rpc_response_unavailable' }]);
    const row = await clinicalWebStore(db, scope).updateOperation(ID, 'submitted', { actorUserId: USER, errorCode: 'rpc_response_unavailable' });
    expect(row.state).toBe('submitted'); expect(row.signedXdr).toBe('c2lnbmVk'); expect(row.transactionHash).toBe(TX);
  });
  it.each([{ state: 'cancelled' }, { state: 'awaiting_signature' }, { signedXdr: 'Y2hhbmdlZA==', transactionHash: OP }])('rejects replacement or cancellation of an uncertain transmitted operation', async patch => {
    const db = client([submitted]); await expect(clinicalWebStore(db, scope).updateOperation(ID, 'submitted', { actorUserId: USER, ...patch } as Parameters<ReturnType<typeof clinicalWebStore>['updateOperation']>[2])).rejects.toThrow(); expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('never marks a request confirmed without a signed envelope', async () => {
    const db = client([operationRow()]); await expect(clinicalWebStore(db, scope).updateOperation(ID, 'awaiting_signature', { actorUserId: USER, state: 'confirmed' })).rejects.toThrow(); expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('detects a raced update rather than returning a false confirmation', async () => {
    const db = client([submitted], []); await expect(clinicalWebStore(db, scope).updateOperation(ID, 'submitted', { actorUserId: USER, state: 'confirmed' })).rejects.toThrow('clinical_operation_state_changed');
  });
  it.each(['confirmed', 'failed', 'cancelled'] as ClinicalOperationState[])('leaves terminal state %s intact on a repeated reconciliation', async state => {
    const row = operationRow({ state, signed_xdr: state === 'cancelled' ? null : 'c2lnbmVk', transaction_hash: state === 'cancelled' ? null : TX, confirmed_at: state === 'confirmed' ? NOW : null });
    const db = client([row]); expect((await clinicalWebStore(db, scope).updateOperation(ID, state, { actorUserId: USER, state })).state).toBe(state); expect(db.query).toHaveBeenCalledTimes(1);
    await expect(clinicalWebStore(client([row]), scope).updateOperation(ID, state, { actorUserId: USER, errorCode: 'changed' })).rejects.toThrow('clinical_operation_immutable');
  });
  it('cannot update another actor request or send an envelope without its transaction hash', async () => {
    await expect(clinicalWebStore(client([]), scope).updateOperation(ID, 'awaiting_signature', { actorUserId: OTHER_USER, state: 'cancelled' })).rejects.toThrow('clinical_operation_state_changed');
    const db = client([operationRow()]); await expect(clinicalWebStore(db, scope).updateOperation(ID, 'awaiting_signature', { actorUserId: USER, state: 'submitted', signedXdr: 'c2lnbmVk' })).rejects.toThrow('clinical_storage_invalid');
  });
  it('can record a cancelled signature without pretending it was transmitted', async () => {
    const db = client([operationRow()], [operationRow({ state: 'cancelled', error_code: 'signature_cancelled' })]);
    const row = await clinicalWebStore(db, scope).updateOperation(ID, 'awaiting_signature', { actorUserId: USER, state: 'cancelled', errorCode: 'signature_cancelled' });
    expect(row.signedXdr).toBeNull(); expect(row.transactionHash).toBeNull();
  });
});

describe('clinical web migration: explicit dev-only preparation', () => {
  const source = readFileSync(new URL('../../scripts/migrate.mjs', import.meta.url), 'utf8');
  const section = source.slice(source.indexOf('step("clinical-web-v1",'), source.indexOf('// Clinical SOW 2 storage is deliberately opt-in.'));
  it('requires the selected step, explicit clinical flag and exact existing dev host before DDL', () => {
    expect(section).toContain("if (!process.argv.includes('--step=clinical-web-v1')) return;");
    expect(section).toContain("process.env.TRUSTLEAF_CLINICAL_MIGRATION !== 'true'");
    expect(section).toContain('ep-lingering-water-ahzh89z5'); expect(section).not.toContain('ep-sweet-term'); expect(section).not.toContain('ep-rapid-shadow');
    expect(section.indexOf('clinical_migration_requires_isolated_dev_database')).toBeLessThan(section.indexOf('CREATE TABLE'));
  });
  it('requires the encrypted version dependency, no plaintext data index and a live wallet uniqueness constraint', () => {
    expect(section.indexOf("to_regclass('public.clinical_private_versions')")).toBeLessThan(section.indexOf('CREATE TABLE'));
    expect(section).toContain('clinical_web_requires_clinical_history_v1'); expect(section).toContain("ON clinical_web_operations(source_wallet) WHERE state IN ('awaiting_signature','submitted')");
    expect(section).not.toMatch(/file_name|diagnosis|patient_email|note_text/);
  });
  it('protects identity, intents, ciphertext and terminal states against overwrite or deletion', () => {
    expect(section).toContain('request_fingerprint TEXT NOT NULL'); expect(section).toContain('NEW.request_fingerprint'); expect(section).toContain('OLD.request_fingerprint');
    expect(section).toContain('clinical_history_binding_immutable'); expect(section).toContain('NEW.prepared_envelope'); expect(section).toContain('OLD.prepared_envelope');
    expect(section).toContain("OLD.state IN ('confirmed','failed','cancelled') AND NEW IS DISTINCT FROM OLD");
    expect(section).toContain("IF TG_OP='DELETE'"); expect(section).toContain('clinical_operation_transition_invalid');
  });
  it('keeps each CREATE TABLE parentheses balanced outside SQL literals', () => {
    const definitions = [...section.matchAll(/CREATE TABLE IF NOT EXISTS [^`]+/g)]; expect(definitions.length).toBe(2);
    for (const [definition] of definitions) {
      let balance = 0; const clean = definition.replace(/'(?:[^']|'')*'/g, "''");
      for (const char of clean) { if (char === '(') balance++; if (char === ')') balance--; expect(balance).toBeGreaterThanOrEqual(0); }
      expect(balance).toBe(0);
    }
  });
});
