import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import type { ClinicalActor } from '@/types/clinical';
const m = vi.hoisted(() => ({ doctor: vi.fn(), keys: vi.fn(), db: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/clinical/doctor-context', () => ({ clinicalDoctorContext: m.doctor }));
vi.mock('@/lib/clinical/keys', () => ({ clinicalKeyring: m.keys }));
vi.mock('@/lib/db', () => ({ getDb: m.db }));
import { createClinicalDraftService, assertDraftPublication, markDraftPrepared } from '@/lib/clinical/drafts';
import { draftPayload, draftSave, draftBody } from '@/lib/clinical/drafts-input';
import { openDraft, sealDraft, type DraftContext } from '@/lib/clinical/drafts-crypto';
import { CLINICAL_ID } from '@/lib/clinical/config';

const address = (n: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey();
const actor: ClinicalActor = { userId: 'did:privy:doctor', walletId: 'wallet:doctor', address: address(1) };
const other: ClinicalActor = { userId: 'did:privy:patient', walletId: 'wallet:patient', address: address(2) };
const user = { userId: actor.userId, email: 'doctor@example.test' };
const id = '11111111-1111-4111-8111-111111111111', requestId = '22222222-2222-4222-8222-222222222222', history = 'a'.repeat(64);
const keys = { activeKeyId: 'test-v1', keyring: { 'test-v1': '12'.repeat(32), 'test-v2': '34'.repeat(32) } };
const payload = { note: { title: 'PRIVATE TITLE', text: 'PRIVATE TEXT', eventDate: null } };
const save = (overrides = {}) => ({ id, expectedRevision: 0, historyId: history, patient: other.address, payload, ...overrides });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
type Row = Record<string, any>;
function memory() {
  const rows = new Map<string, Row>(), queries: string[] = [];
  const matches = (r: Row | undefined, p: unknown[]) => r && [r.owner_user_id, r.wallet_id, r.author_wallet, r.contract_id, r.network].every((v, i) => v === p[i + 1]);
  const sql = { query: vi.fn(async (q: string, p: unknown[] = []): Promise<Row[]> => {
    queries.push(q);
    if (q.includes('FROM clinical_web_histories')) return [{ owner_user_id: other.userId, wallet_id: other.walletId, history_id: history, patient_wallet: other.address }];
    if (q.startsWith('INSERT')) {
      if (rows.has(String(p[0]))) return [];
      const r = { id: p[0], owner_user_id: p[1], wallet_id: p[2], author_wallet: p[3], contract_id: p[4], network: p[5],
        history_id: p[6], patient_wallet: p[7], entry_id: p[8], expected_version: p[9], revision: 1, envelope: JSON.parse(String(p[10])),
        request_fingerprint: p[11], publication_request_id: null, deleted_at: null, created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z' };
      rows.set(String(p[0]), r); return [clone(r)];
    }
    if (q.startsWith('UPDATE')) {
      const r = rows.get(String(p[0]));
      if (!matches(r, p) || r!.revision !== p[6] || r!.deleted_at !== null) return [];
      if (q.includes('SET publication_request_id')) {
        if (r!.publication_request_id !== null && r!.publication_request_id !== p[7]) return [];
        r!.publication_request_id = p[7]; return [{ id: r!.id }];
      }
      if (r!.publication_request_id !== null) return [];
      r!.revision++;
      if (q.includes('envelope=NULL')) { r!.envelope = null; r!.request_fingerprint = null; r!.deleted_at = '2026-10-25T11:00:00Z'; }
      else { r!.envelope = JSON.parse(String(p[7])); r!.request_fingerprint = p[8]; }
      return [clone(r!)];
    }
    if (q.includes('WHERE id=$1')) { const r = rows.get(String(p[0])); return matches(r, p) ? [clone(r!)] : []; }
    return [...rows.values()].filter(r => [r.owner_user_id, r.wallet_id, r.author_wallet, r.contract_id, r.network].every((v, i) => v === p[i]) && r.deleted_at === null &&
      (p.length === 5 || r.updated_at < String(p[5]).replace('.000Z','Z') || (r.updated_at === String(p[5]).replace('.000Z','Z') && r.id < p[6])))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || String(b.id).localeCompare(String(a.id))).slice(0, 51).map(clone);
  }) };
  return { rows, queries, sql, client: { query: async (q: string, p?: unknown[]) => ({ rows: await sql.query(q, p) }) } };
}
const service = (db: ReturnType<typeof memory>, authorize = vi.fn().mockResolvedValue(undefined)) =>
  createClinicalDraftService({ sql: db.sql, keys: () => keys, authorizeCreate: authorize });
beforeEach(() => { vi.clearAllMocks(); m.keys.mockReturnValue(keys); m.doctor.mockResolvedValue({ historyId: history, canAppend: true }); });

describe('encrypted recoverable author workspace', () => {
  it('persists only ciphertext and recovers after constructing a fresh service/session', async () => {
    const db = memory(), first = service(db), meta = await first.save(user, actor, save());
    expect(meta).toMatchObject({ id, revision: 1, state: 'draft', publicationRequestId: null });
    expect(JSON.stringify(db.rows.get(id))).not.toContain('PRIVATE');
    const recovered = await service(db).get(actor, id);
    expect(recovered.payload).toEqual(payload);
    expect(await service(db).list(actor)).toEqual({ drafts: [meta], hasMore: false, nextBefore: null });
    expect(JSON.stringify(await service(db).list(actor))).not.toMatch(/payload|ciphertext|envelope|fingerprint/);
    expect(db.queries.join(' ')).not.toMatch(/clinical_web_operations|private_operations|CREATE TABLE|signed_xdr|operation_id/);
  });
  it('recovers drafts beyond fifty through an author-bound keyset after a fresh session', async () => {
    const db = memory(), api = service(db);
    for (let n = 1; n <= 51; n++) await api.save(user, actor, save({ id: n.toString(16).padStart(8, '0') + '-1111-4111-8111-111111111111' }));
    const first = await service(db).list(actor); expect(first.drafts).toHaveLength(50); expect(first.hasMore).toBe(true);
    const second = await service(db).list(actor, { before: first.nextBefore! });
    expect(second.drafts).toHaveLength(1); expect(second.hasMore).toBe(false); expect(second.nextBefore).toBeNull();
    expect(new Set([...first.drafts, ...second.drafts].map(d => d.id)).size).toBe(51);
    await expect(service(db).list(other, { before: first.nextBefore! })).rejects.toThrow('clinical_draft_not_found');
  });
  it('allows incomplete notes and preserves editing whitespace', async () => {
    const db = memory(), draft = { note: { title: ' ', text: '', eventDate: null } };
    await service(db).save(user, actor, save({ payload: draft }));
    expect((await service(db).get(actor, id)).payload).toEqual(draft);
  });
  it('is idempotent after lost create/update responses and rejects changed stale saves', async () => {
    const db = memory(), authorize = vi.fn().mockResolvedValue(undefined), api = service(db, authorize);
    expect((await api.save(user, actor, save())).revision).toBe(1);
    expect((await api.save(user, actor, save())).revision).toBe(1);
    expect(authorize).toHaveBeenCalledTimes(1);
    const next = save({ expectedRevision: 1, payload: { note: { ...payload.note, text: 'EDIT' } } });
    expect((await api.save(user, actor, next)).revision).toBe(2);
    expect((await api.save(user, actor, next)).revision).toBe(2);
    await expect(api.save(user, actor, save({ expectedRevision: 1 }))).rejects.toThrow('clinical_draft_conflict');
  });
  it('only one concurrent distinct CAS update succeeds', async () => {
    const db = memory(), api = service(db); await api.save(user, actor, save());
    const results = await Promise.allSettled(['A', 'B'].map(text => api.save(user, actor, save({ expectedRevision: 1, payload: { note: { ...payload.note, text } } }))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.rows.get(id)!.revision).toBe(2);
  });
  it.each([
    { ...actor, userId: other.userId }, { ...actor, walletId: 'rotated' }, { ...actor, address: other.address }, other,
  ])('does not expose a draft to another user/wallet including its patient', async intruder => {
    const db = memory(), api = service(db); await api.save(user, actor, save());
    expect((await api.list(intruder)).drafts).toEqual([]);
    await expect(api.get(intruder, id)).rejects.toThrow('clinical_draft_not_found');
    await expect(api.delete(intruder, id, 1)).rejects.toThrow('clinical_draft_not_found');
  });
  it('requires the current user to match the author on updates as well as creation', async () => {
    const db = memory(), api = service(db); await api.save(user, actor, save());
    await expect(api.save({ ...user, userId: other.userId }, actor, save({ expectedRevision: 1 }))).rejects.toThrow('clinical_draft_not_found');
  });
  it('makes history/patient/correction target immutable', async () => {
    const db = memory(), api = service(db); await api.save(user, actor, save());
    for (const changed of [{ historyId: 'b'.repeat(64) }, { patient: actor.address }, { payload: { ...payload, entryId: 'c'.repeat(64), expectedVersion: 1 } }])
      await expect(api.save(user, actor, save({ expectedRevision: 1, ...changed }))).rejects.toThrow('clinical_draft_conflict');
  });
  it('deletes ciphertext with CAS and retains an idempotent tombstone', async () => {
    const db = memory(), api = service(db); await api.save(user, actor, save());
    await expect(api.delete(actor, id, 2)).rejects.toThrow('clinical_draft_conflict');
    expect(await api.delete(actor, id, 1)).toEqual({ deleted: true, id, revision: 2 });
    expect(await api.delete(actor, id, 1)).toEqual({ deleted: true, id, revision: 2 });
    expect(db.rows.get(id)!.envelope).toBeNull();
    expect((await api.list(actor)).drafts).toEqual([]);
    await expect(api.get(actor, id)).rejects.toThrow('clinical_draft_not_found');
    await expect(api.save(user, actor, save())).rejects.toThrow('clinical_draft_not_found');
  });
  it('recovers old-key drafts after active key rotation and fails closed if old key is absent', async () => {
    const db = memory(); await service(db).save(user, actor, save());
    const rotated = createClinicalDraftService({ sql: db.sql, keys: () => ({ ...keys, activeKeyId: 'test-v2' }) });
    expect((await rotated.get(actor, id)).payload).toEqual(payload);
    expect((await rotated.save(user, actor, save())).revision).toBe(1);
    const lost = createClinicalDraftService({ sql: db.sql, keys: () => ({ activeKeyId: 'test-v2', keyring: { 'test-v2': keys.keyring['test-v2'] } }) });
    await expect(lost.get(actor, id)).rejects.toThrow('clinical_drafts_unavailable');
  });
  it('reports missing schema as unavailable without DDL or error detail', async () => {
    const query = vi.fn().mockRejectedValue({ code: '42P01', message: 'postgres://SECRET' });
    const api = createClinicalDraftService({ sql: { query }, keys: () => keys });
    await expect(api.list(actor)).rejects.toThrow('clinical_drafts_unavailable');
    expect(query.mock.calls[0][0]).not.toMatch(/CREATE|ALTER/);
  });
});

describe('initial authorization and offline recovery', () => {
  it('requires live append context for initial doctor create, but not recovery/update/delete', async () => {
    const db = memory(), api = createClinicalDraftService({ sql: db.sql, keys: () => keys });
    await api.save(user, actor, save()); expect(m.doctor).toHaveBeenCalledTimes(1);
    m.doctor.mockRejectedValue(Error('RPC OFFLINE'));
    expect((await api.get(actor, id)).payload).toEqual(payload);
    await api.save(user, actor, save({ expectedRevision: 1 }));
    await api.delete(actor, id, 2);
    expect(m.doctor).toHaveBeenCalledTimes(1);
  });
  it('authorizes exact DB owner without RPC and refuses substituted patient', async () => {
    const db = memory(), api = createClinicalDraftService({ sql: db.sql, keys: () => keys });
    await api.save({ userId: other.userId, email: 'patient@example.test' }, other, save());
    expect(m.doctor).not.toHaveBeenCalled();
    await expect(api.save(user, actor, save({ id: requestId, patient: actor.address }))).rejects.toThrow('clinical_draft_not_found');
  });
  it('does not give append-only draft authorization to a read-only doctor', async () => {
    const db = memory(), api = createClinicalDraftService({ sql: db.sql, keys: () => keys });
    m.doctor.mockResolvedValue({ historyId: history, canAppend: false });
    await expect(api.save(user, actor, save())).rejects.toThrow('clinical_draft_not_found');
    expect(db.rows.size).toBe(0);
  });
});

describe('crypto context separation', () => {
  const context: DraftContext = { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_ID, draftId: id, authorUserId: actor.userId,
    authorWalletId: actor.walletId, author: actor.address, patient: other.address, historyId: history, entryId: null, expectedVersion: null, revision: 1 };
  it.each([{ patient: actor.address }, { historyId: 'd'.repeat(64) }, { author: other.address }, { authorUserId: other.userId },
    { authorWalletId: 'other' }, { revision: 2 }, { draftId: requestId }, { entryId: 'e'.repeat(64) }])('rejects substitution of a bound context', changed => {
    const envelope = sealDraft(context, payload, keys);
    expect(() => openDraft({ ...context, ...changed }, envelope, keys)).toThrow('clinical_drafts_unavailable');
  });
  it('uses canonical context encoding independent of object insertion order', () => {
    const e = sealDraft(context, payload, keys);
    const reordered = Object.fromEntries(Object.entries(context).reverse()) as unknown as DraftContext;
    expect(openDraft(reordered, e, keys)).toEqual(payload);
  });
  it('randomizes ciphertext and authenticates tampering', () => {
    const a = sealDraft(context, payload, keys), b = sealDraft(context, payload, keys);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    const bytes = Buffer.from(a.ciphertext, 'base64'); bytes[0] ^= 1;
    expect(() => openDraft(context, { ...a, ciphertext: bytes.toString('base64') }, keys)).toThrow('clinical_drafts_unavailable');
  });
});

describe('single immutable publication binding', () => {
  it('binds one request to this exact revision and blocks further edit/delete or another request', async () => {
    const db = memory(), api = service(db); await api.save(user, actor, save());
    const args = { id, revision: 1, requestId, historyId: history, patient: other.address, payload };
    await assertDraftPublication(db.client, actor, args);
    await markDraftPrepared(db.client, actor, id, 1, requestId);
    await assertDraftPublication(db.client, actor, args);
    expect((await api.get(actor, id)).publicationRequestId).toBe(requestId);
    await expect(assertDraftPublication(db.client, actor, { ...args, requestId: id })).rejects.toThrow('clinical_draft_publication_pending');
    await expect(api.save(user, actor, save({ expectedRevision: 1 }))).rejects.toThrow('clinical_draft_publication_pending');
    await expect(api.delete(actor, id, 1)).rejects.toThrow('clinical_draft_publication_pending');
  });
  it('normalizes whitespace when publishing but rejects changed content/version', async () => {
    const db = memory(), api = service(db); await api.save(user, actor, save({ payload: { note: { ...payload.note, title: ' PRIVATE TITLE ', text: ' PRIVATE TEXT ' } } }));
    const args = { id, revision: 1, requestId, historyId: history, patient: other.address, payload };
    await assertDraftPublication(db.client, actor, args);
    await expect(assertDraftPublication(db.client, actor, { ...args, payload: { note: { ...payload.note, text: 'DIFFERENT' } } })).rejects.toThrow('clinical_draft_conflict');
    await expect(assertDraftPublication(db.client, actor, { ...args, revision: 2 })).rejects.toThrow('clinical_draft_conflict');
  });
});

it.each([{ note: payload.note, requestId }, { note: payload.note, file: {} }, { note: { ...payload.note, text: 'x'.repeat(20_001) } },
  { note: payload.note, expectedVersion: 0 }, { note: payload.note, entryId: 'a'.repeat(64) }])('rejects invalid/intent-like draft inputs', supplied => {
  expect(() => draftPayload(supplied)).toThrow();
});
it('rejects unexpected save fields and bounds streamed JSON', async () => {
  expect(() => draftSave({ ...save(), action: 'append_version' })).toThrow('clinical_draft_invalid');
  await expect(draftBody(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(4_010_001) }))).rejects.toThrow('clinical_request_too_large');
});

describe('first create resolves patient without a full timeline snapshot', () => {
  const withoutPatient = (overrides: Record<string, unknown> = {}) => ({ id, expectedRevision: 0, historyId: history, payload, ...overrides });
  it('resolves exact server patient, encrypts the first note and retries the same UUID without another nonce or row', async () => {
    const db = memory(), api = createClinicalDraftService({ sql: db.sql, keys: () => keys });
    const first = await api.save(user, actor, withoutPatient());
    expect(first).toMatchObject({ id, revision: 1, patient: other.address, publicationRequestId: null });
    expect(JSON.stringify(db.rows.get(id))).not.toContain('PRIVATE');
    expect((await api.get(actor, id)).payload).toEqual(payload);
    expect(await api.save(user, actor, withoutPatient())).toEqual(first);
    expect(db.rows.size).toBe(1); expect(m.doctor).toHaveBeenCalledTimes(1);
    expect(db.queries.filter(q => q.startsWith('INSERT'))).toHaveLength(1);
    expect(db.queries.join(' ')).not.toMatch(/clinical_web_operations|sponsorship|operation_id|signed_xdr|CREATE TABLE/);
    const historyQueries = db.sql.query.mock.calls.filter(([q]) => q.includes('FROM clinical_web_histories'));
    expect(historyQueries.every(([, p]) => p?.[0] === history && p?.[1] === CLINICAL_ID)).toBe(true);
    expect(historyQueries.every(([q]) => q.includes("network='testnet'"))).toBe(true);
  });
  it('returns no patient metadata or ciphertext and creates no row when the doctor has no append grant', async () => {
    const db = memory(), api = createClinicalDraftService({ sql: db.sql, keys: () => keys });
    m.doctor.mockResolvedValue({ historyId: history, canAppend: false });
    const denied = await api.save(user, actor, withoutPatient()).catch(error => error);
    expect(denied).toMatchObject({ message: 'clinical_draft_not_found', status: 404 });
    expect(JSON.stringify(denied)).not.toContain(other.address);
    expect(db.rows.size).toBe(0); expect(db.queries.some(q => q.startsWith('INSERT'))).toBe(false);
  });
  it('returns the same private404 for absent or mismatched server history, before checking a grant', async () => {
    for (const records of [[], [{ history_id: 'b'.repeat(64), patient_wallet: other.address }]]) {
      const db = memory(), original = db.sql.query.getMockImplementation()!;
      db.sql.query.mockImplementation(async (q, p) => q.includes('FROM clinical_web_histories') ? records : original(q, p));
      const api = createClinicalDraftService({ sql: db.sql, keys: () => keys });
      await expect(api.save(user, actor, withoutPatient())).rejects.toMatchObject({ message: 'clinical_draft_not_found', status: 404 });
      expect(db.rows.size).toBe(0);
    }
    expect(m.doctor).not.toHaveBeenCalled();
  });
  it('still rejects a substituted patient and requires patient/context on updates; raw API keys stay closed', async () => {
    const db = memory(), api = createClinicalDraftService({ sql: db.sql, keys: () => keys });
    await expect(api.save(user, actor, withoutPatient({ patient: actor.address }))).rejects.toThrow('clinical_draft_not_found');
    expect(m.doctor).not.toHaveBeenCalled();
    await api.save(user, actor, withoutPatient());
    await expect(api.save(user, actor, withoutPatient({ expectedRevision: 1 }))).rejects.toThrow('clinical_draft_invalid');
    await expect(api.save(user, actor, withoutPatient({ operationId: 'forbidden' }))).rejects.toThrow('clinical_draft_invalid');
    expect(db.rows.get(id)!.revision).toBe(1);
    // The internal normalized/publication parser continues to require patient.
    expect(() => draftSave(withoutPatient())).toThrow('clinical_draft_invalid');
  });
  it('authorizes the exact stored patient owner without doctor RPC when patient is omitted', async () => {
    const db = memory(), api = createClinicalDraftService({ sql: db.sql, keys: () => keys });
    const saved = await api.save({ userId: other.userId, email: 'patient@example.test' }, other, withoutPatient());
    expect(saved).toMatchObject({ patient: other.address, author: other.address, revision: 1 });
    expect(m.doctor).not.toHaveBeenCalled();
    expect((await api.get(other, id)).payload).toEqual(payload);
  });
});

it.each([
  ['application/pdf','broken.pdf',Buffer.from('%PDF-1.7\nNO OBJECTS OR PAGES\n%%EOF\n')],
  ['image/jpeg','broken.jpg',Buffer.from('ffd8ffe000044a46ffd9','hex')],
] as const)('rejects corrupt %s before draft encryption or any persistent write',async(mediaType,fileName,bytes)=>{
  const db=memory();
  await expect(service(db).save(user,actor,save({payload:{file:{mediaType,fileName,base64:bytes.toString('base64')}}}))).rejects.toThrow('clinical_file_invalid');
  expect(db.rows.size).toBe(0);expect(db.queries.some(q=>/^(INSERT|UPDATE|DELETE)/.test(q))).toBe(false);
});
