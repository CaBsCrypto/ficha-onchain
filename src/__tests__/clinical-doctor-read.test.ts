import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Account, BASE_FEE, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { CLINICAL_CONTRACT, clinicalInvocation, deriveClinicalEntryId, deriveClinicalHistoryId, sponsorClinicalSignature } from '@/lib/clinical/chain';
import { sealClinicalVersion } from '../../scripts/lib/clinical-crypto.mjs';
import { PrivateFlowError } from '@/lib/private-config';
import type { ClinicalExpected } from '@/types/clinical';

const m = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), actor: vi.fn(), doctor: vi.fn(), rx: vi.fn(), chain: {} as any, reader: {} as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDb: () => ({ query: m.query }) }));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: m.doctor }));
vi.mock('@/lib/clinical/identity', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/clinical/identity')>(), resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/chain', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/clinical/chain')>(), createClinicalWebChain: () => m.chain }));
vi.mock('@/lib/clinical/prescriptions', () => ({ clinicalPrescriptionReference: m.rx }));
vi.mock('../../scripts/lib/clinical-chain-read.mjs', () => ({ createClinicalChainReader: () => m.reader }));
import { clinicalDocument, clinicalReadQuery, clinicalSnapshot } from '@/lib/clinical/history';
import { clinicalDoctorContext } from '@/lib/clinical/doctor-context';

const physician = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 91));
const patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 92));
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 93));
const actor = { userId: 'did:privy:doctor_read', walletId: 'doctor-read-wallet', address: physician.publicKey() };
const user = { userId: actor.userId, email: 'doctor-read@example.test' };
const historyId = deriveClinicalHistoryId(patient.publicKey());
const keyring = { 'doctor-read-test': '7'.repeat(64) };
const req = (query = '') => new Request(`http://localhost/api/private-clinical-history${query}`, { headers: { Authorization: 'Bearer local-doctor-read' } });
function fixture() {
  const state = { grant: { canRead: true, canAppend: true, revision: 3 } as any, authorized: true,
    stored: [] as any[], proofs: [] as any[], operations: [] as any[], revokeOnStorage: false, revokeOnReceipt: false };
  const history = { id: historyId, patient: patient.publicKey(), createdAt: 1 };
  function add(author = physician, version = 1, prescriptionId?: string) {
    const operationId = (author === physician ? (version === 1 ? '7' : '8') : '9').repeat(64);
    const entryId = deriveClinicalEntryId(historyId, author.publicKey(), (author === physician ? '7' : '9').repeat(64));
    const previousCommitment = state.proofs.find(p => p.context.entryId === entryId && p.context.version === version - 1)?.commitment ?? null;
    const context = { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_CONTRACT, historyId, entryId, patient: patient.publicKey(), author: author.publicKey(), version, previousCommitment };
    const note = { title: `Note ${version}`, text: 'LOCAL PRIVATE DOCTOR NOTE', eventDate: null, ...(prescriptionId ? { prescriptionId } : {}) };
    const sealed = sealClinicalVersion({ context, content: Buffer.from(JSON.stringify(note)), metadata: { mediaType: 'application/json', fileName: 'antecedente.json' }, keyring, activeKeyId: 'doctor-read-test' });
    const expected: ClinicalExpected = { historyId, patient: patient.publicKey(), operationId, entryId, author: author.publicKey(), commitment: sealed.commitment,
      previousCommitment, expectedVersion: version - 1, expectedGrantRevision: author === patient ? 0 : 3 };
    const unsigned = new TransactionBuilder(new Account(author.publicKey(), String(200 + version)), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(clinicalInvocation('append_version', expected)).setTimeout(180).build();
    const signed = sponsorClinicalSignature(unsigned.toXDR(), author.publicKey(), author.sign(unsigned.hash()).toString('hex'), 'append_version', expected);
    state.operations.push({ id: `operation-${operationId}`, actor_user_id: author === physician ? actor.userId : 'did:privy:patient_read', wallet_id: actor.walletId, source_wallet: author.publicKey(), contract_id: CLINICAL_CONTRACT,
      network: 'testnet', action: 'append_version', method: 'append_version', state: 'confirmed', expected, unsigned_xdr: unsigned.toXDR(), signed_xdr: signed.xdr, signing_hash: unsigned.hash().toString('hex'), transaction_hash: signed.hash, expires_at: Number(unsigned.timeBounds!.maxTime) });
    state.stored.push({ context, envelope: sealed.envelope, commitment: sealed.commitment, operation_id: operationId, transaction_hash: signed.hash, entry_id: entryId, version, state: 'confirmed' });
    state.proofs.push({ context, commitment: sealed.commitment, createdAt: version, state: 'confirmed' });
    return entryId;
  }
  m.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.includes('FROM doctors WHERE LOWER(email)')) return [{ id: 7 }];
    if (sql.includes('FROM clinical_web_histories')) return sql.includes('owner_user_id=$1') ? [] : [{ history_id: historyId, patient_wallet: history.patient, transaction_hash: 'a'.repeat(64) }];
    if (sql.includes('FROM clinical_web_operations') && sql.includes('transaction_hash=$1')) return state.operations.filter(o => o.transaction_hash === values[0]);
    if (sql.includes('FROM clinical_web_operations')) return state.operations.filter(o => o.actor_user_id === values[0] && o.wallet_id === values[1] && o.source_wallet === values[2] && (sql.includes("AND action='create_history'") ? o.action === 'create_history' && o.expected.patient === values[4] : !values[4] || o.expected.historyId === values[4]));
    if (sql.startsWith('SELECT entry_id,version,transaction_hash,operation_id,commitment')) return state.stored;
    if (sql.startsWith('SELECT context,envelope,commitment,operation_id,state,transaction_hash')) {
      if (state.revokeOnStorage) state.grant = { canRead: false, canAppend: false, revision: 4 };
      return state.stored.filter(v => v.context.historyId === values[1] && v.entry_id === values[2] && v.version === values[3]);
    }
    throw Error('unexpected_doctor_read_query');
  });
  m.auth.mockResolvedValue(user); m.actor.mockResolvedValue(actor);
  m.doctor.mockResolvedValue({ doctor: { id: 7, email: user.email, status: 'active' }, userId: actor.userId, walletId: actor.walletId, address: actor.address });
  m.chain = { history: vi.fn(async () => history), doctorAuthorized: vi.fn(async () => state.authorized), grant: vi.fn(async () => state.grant && { ...state.grant }),
    entry: vi.fn(async (_h, id) => ({ headVersion: Math.max(...state.proofs.filter(p => p.context.entryId === id).map(p => p.context.version)) })),
    version: vi.fn(async (_h, id, version) => state.proofs.find(p => p.context.entryId === id && p.context.version === version)),
    verifyRecordedOperation: vi.fn(async () => { if (state.revokeOnReceipt) state.grant = null; return true; }) };
  m.reader = { deployment: { network: 'testnet', contractId: CLINICAL_CONTRACT },
    readAccess: vi.fn(async ({ historyId: id, reader }) => ({ historyId: id, reader, patient: history.patient, canRead: state.grant?.canRead ?? false, grantRevision: state.grant?.revision ?? 0, doctorAuthorized: state.authorized })),
    readVersion: vi.fn(async ({ entryId, version }) => state.proofs.find(p => p.context.entryId === entryId && p.context.version === version)) };
  return { state, add };
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('RELAYER_SECRET', payer.secret()); vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING', JSON.stringify(keyring)); vi.stubEnv('TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID', 'doctor-read-test'); });
afterEach(() => vi.unstubAllEnvs());

it('reads the selected patient only and preserves patient/doctor authorship plus correction heads', async () => {
  const f = fixture(); const id = f.add(); f.add(physician, 2); f.add(patient);
  const snapshot = await clinicalSnapshot(req(), user, actor, historyId);
  expect(snapshot.context).toEqual({ role: 'doctor', canRead: true, canAppend: true, grantRevision: 3 });
  expect(snapshot.entries.filter(e => e.entryId === id).map(e => [e.version, e.source, e.canCorrect])).toEqual([[2, 'doctor', true], [1, 'doctor', false]]);
  expect(snapshot.entries.find(e => e.author === patient.publicKey())).toMatchObject({ source: 'patient', canCorrect: false });
  expect(snapshot.grants).toEqual([]); expect(snapshot.operations).toHaveLength(2);
  expect(m.query).toHaveBeenCalledWith(expect.stringContaining("expected->>'historyId'=$5"), [actor.userId, actor.walletId, actor.address, CLINICAL_CONTRACT, historyId]);
});
it('keeps owner lookup when no locator is selected', async () => {
  const f = fixture(); f.add(); const snapshot = await clinicalSnapshot(req(), user, actor);
  expect(snapshot).toMatchObject({ history: null, entries: [], operations: [] });
  expect(m.query).toHaveBeenCalledWith(expect.stringContaining("AND action='create_history' AND expected->>'patient'=$5"), [actor.userId, actor.walletId, actor.address, CLINICAL_CONTRACT, actor.address]); expect(m.doctor).not.toHaveBeenCalled();
});
it('allows append-only context without loading any content, versions or patient grant directory', async () => {
  const f = fixture(); f.add(); f.state.grant.canRead = false;
  const snapshot = await clinicalSnapshot(req(), user, actor, historyId);
  expect(snapshot).toMatchObject({ context: { canRead: false, canAppend: true }, entries: [], grants: [] });
  expect(m.reader.readAccess).not.toHaveBeenCalled();
  expect(m.query.mock.calls.every(([sql]: [string]) => !sql.includes('clinical_private_versions') && !sql.includes('SELECT id,name FROM doctors'))).toBe(true);
});
it('read-only doctors cannot correct even their own latest contribution', async () => {
  const f = fixture(); f.add(); f.state.grant.canAppend = false;
  const snapshot = await clinicalSnapshot(req(), user, actor, historyId);
  expect(snapshot.entries[0].canCorrect).toBe(false); expect(snapshot.writes.append_version).toBe(false);
});
it.each(['registry', 'grant'])('denies %s access before loading private content', async failure => {
  const f = fixture(); f.add(); if (failure === 'registry') f.state.authorized = false; else f.state.grant = null;
  await expect(clinicalSnapshot(req(), user, actor, historyId)).rejects.toMatchObject({ status: 404 });
  expect(m.reader.readAccess).not.toHaveBeenCalled();
});
it('discards decrypted content when permission is withdrawn during storage IO', async () => {
  const f = fixture(); const entryId = f.add(); const context = await clinicalDoctorContext(user, actor, historyId); f.state.revokeOnStorage = true;
  await expect(clinicalDocument(req(), actor, historyId, entryId, 1, m.reader, { user, context })).rejects.toThrow('clinical_version_unavailable');
});
it('discards the complete timeline when permission changes after version proof verification', async () => {
  const f = fixture(); f.add(); f.state.revokeOnReceipt = true;
  await expect(clinicalSnapshot(req(), user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});
it('does not accept an older live read revision even if read remains enabled', async () => {
  const f = fixture(); const entryId = f.add(); const context = await clinicalDoctorContext(user, actor, historyId);
  m.reader.readAccess.mockImplementation(async ({ historyId: id, reader }) => ({ historyId: id, reader, patient: patient.publicKey(), canRead: true, grantRevision: 2, doctorAuthorized: true }));
  await expect(clinicalDocument(req(), actor, historyId, entryId, 1, m.reader, { user, context })).rejects.toThrow('clinical_version_unavailable');
});
it('suppresses an inaccessible prescription ID while keeping the independently verified note', async () => {
  const f = fixture(); f.add(physician, 1, '4b6b8e88-7f9b-471c-a166-1c1d1bda2c32'); m.rx.mockRejectedValue(new PrivateFlowError('clinical_prescription_unavailable', 404));
  const snapshot = await clinicalSnapshot(req(), user, actor, historyId);
  expect(snapshot.entries[0]).toMatchObject({ prescriptionUnavailable: true, note: { text: 'LOCAL PRIVATE DOCTOR NOTE' } });
  expect(JSON.stringify(snapshot)).not.toContain('4b6b8e88-7f9b-471c-a166-1c1d1bda2c32');
  expect(m.rx).toHaveBeenCalledWith(user, actor, patient.publicKey(), '4b6b8e88-7f9b-471c-a166-1c1d1bda2c32');
});
it('never turns a prescription provider failure into a verified reference', async () => {
  const f = fixture(); f.add(physician, 1, '4b6b8e88-7f9b-471c-a166-1c1d1bda2c32'); m.rx.mockRejectedValue(new PrivateFlowError('clinical_prescription_verification_unavailable', 503));
  await expect(clinicalSnapshot(req(), user, actor, historyId)).rejects.toMatchObject({ status: 503 });
});
it.each(['?historyId=', '?historyId=ab', `?historyId=${historyId}&historyId=${historyId}`, `?historyId=${historyId}&patient=forged`, '?role=doctor'])('rejects untrusted read selectors %s', query => {
  expect(() => clinicalReadQuery(req(query))).toThrow('clinical_request_invalid');
});

it('discards decrypted bytes after the app doctor identity changes during storage IO', async () => {
  const f = fixture(); const entryId = f.add(); const context = await clinicalDoctorContext(user, actor, historyId);
  m.doctor.mockResolvedValueOnce({ doctor: { id: 7, email: user.email, status: 'active' }, userId: actor.userId, walletId: actor.walletId, address: actor.address })
    .mockResolvedValue({ doctor: { id: 7, email: user.email, status: 'paused' }, userId: actor.userId, walletId: actor.walletId, address: actor.address });
  await expect(clinicalDocument(req(), actor, historyId, entryId, 1, m.reader, { user, context })).rejects.toThrow('clinical_version_unavailable');
});
it('pins the selected app doctor profile independently of wallet equality', async () => {
  const f = fixture(); const entryId = f.add(); const context = await clinicalDoctorContext(user, actor, historyId);
  m.doctor.mockResolvedValue({ doctor: { id: 8, email: user.email, status: 'active' }, userId: actor.userId, walletId: actor.walletId, address: actor.address });
  await expect(clinicalDocument(req(), actor, historyId, entryId, 1, m.reader, { user, context })).rejects.toThrow('clinical_version_unavailable');
  expect(m.reader.readAccess).not.toHaveBeenCalled();
});
it('does not deliver an already assembled snapshot after session expiry', async () => {
  const f = fixture(); f.add();
  m.auth.mockResolvedValueOnce(user).mockResolvedValueOnce(user).mockResolvedValue(null);
  await expect(clinicalSnapshot(req(), user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('does not reuse a selected doctor context for another history', async () => {
  const f = fixture(); const entryId = f.add(); const context = await clinicalDoctorContext(user, actor, historyId);
  await expect(clinicalDocument(req(), actor, '0'.repeat(64), entryId, 1, m.reader, { user, context })).rejects.toMatchObject({ status: 404 });
  expect(m.reader.readAccess).not.toHaveBeenCalled();
});

it('keeps fresh identity and permission gates for every concurrently loaded doctor version', async () => {
  const f = fixture(); for (let version = 1; version <= 5; version++) f.add(physician, version);
  const snapshot = await clinicalSnapshot(req(), user, actor, historyId);
  expect(snapshot.entries.map(e => e.version)).toEqual([5,4,3,2,1]);
  expect(m.reader.readAccess).toHaveBeenCalledTimes(10);
  expect(m.reader.readVersion).toHaveBeenCalledTimes(10);
  expect(m.auth).toHaveBeenCalledTimes(11); // two per decrypt plus final complete-snapshot gate
  expect(snapshot.entries.filter(e => e.canCorrect).map(e => e.version)).toEqual([5]);
});

it.each(['revoked','session-changed'])('discards all concurrent doctor versions after %s during storage IO', async failure => {
  const f = fixture(); for (let version = 1; version <= 6; version++) f.add(physician, version);
  const original = m.query.getMockImplementation()!;
  let release!: () => void, reached!: () => void, loads = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { reached = resolve; });
  m.query.mockImplementation(async (sql: string, values: unknown[]) => {
    if (!sql.startsWith('SELECT context,envelope,commitment,operation_id,state,transaction_hash')) return original(sql, values);
    loads++; if (loads === 6) reached(); await gate; return original(sql, values);
  });
  const pending = expect(clinicalSnapshot(req(), user, actor, historyId)).rejects.toThrow('clinical_version_unavailable');
  await started;
  if (failure === 'revoked') f.state.grant = { canRead: false, canAppend: false, revision: 4 };
  else m.auth.mockResolvedValue({ userId: 'did:privy:changed_session', email: 'other@example.test' });
  release(); await pending;
  expect(loads).toBe(6); // no later job starts after the first failing batch
  expect(m.rx).not.toHaveBeenCalled();
});
