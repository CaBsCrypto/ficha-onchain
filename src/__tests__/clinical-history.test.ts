import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, BASE_FEE, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { CLINICAL_CONTRACT, clinicalInvocation, deriveClinicalEntryId, deriveClinicalHistoryId, sponsorClinicalSignature } from '@/lib/clinical/chain';
import { sealClinicalVersion } from '../../scripts/lib/clinical-crypto.mjs';
import type { ClinicalActor, ClinicalExpected } from '@/types/clinical';

const m = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), actor: vi.fn(), doctor: vi.fn(), chain: {} as Record<string, any>, reader: {} as Record<string, any> }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDb: () => ({ query: m.query }) }));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: m.doctor }));
vi.mock('@/lib/clinical/identity', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/clinical/identity')>(), resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/chain', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/clinical/chain')>(), createClinicalWebChain: () => m.chain }));
vi.mock('../../scripts/lib/clinical-chain-read.mjs', () => ({ createClinicalChainReader: () => m.reader }));
import { clinicalDocument, clinicalGrants, clinicalOperations, clinicalPublicOperation, clinicalSnapshot, ownClinicalHistory } from '@/lib/clinical/history';

// Deterministic local identities and encryption keys; no Testnet or database calls.
const patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 51));
const doctor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 52));
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 53));
const actor: ClinicalActor = { userId: 'did:privy:history_patient', walletId: 'history_wallet', address: patient.publicKey() };
const user = { userId: actor.userId, email: 'history@example.test' };
const historyId = deriveClinicalHistoryId(actor.address), operationId = '7'.repeat(64);
const entryId = deriveClinicalEntryId(historyId, actor.address, operationId);
const keyring = { 'history-test': '9'.repeat(64) };
const request = () => new Request('http://localhost/api/private-clinical-history', { headers: { Authorization: 'Bearer local-synthetic-credential' } });
function fixture(author = patient) {
  const state = { own: { history_id: historyId, owner_user_id: actor.userId, wallet_id: actor.walletId, patient_wallet: actor.address, contract_id: CLINICAL_CONTRACT, network: 'testnet', transaction_hash: '1'.repeat(64) } as Record<string, any> | null,
    contexts: [] as Record<string, any>[], stored: [] as Record<string, any>[], operations: [] as Record<string, any>[], chainVersions: [] as Record<string, any>[],
    head: 0, headAuthor: author.publicKey(), unavailable: false, wrongRecordedOperation: false, readCount: 0, revokedDuringRead: false, encryptedFailure: false,
    doctors: [] as Record<string, any>[], grant: null as Record<string, any> | null, authorized: true };
  const firstOp = operationId;
  const actualEntryId = deriveClinicalEntryId(historyId, author.publicKey(), firstOp);
  function addVersion(text = 'LOCAL PRIVATE NOTE') {
    const version = state.head + 1, opId = version === 1 ? firstOp : '8'.repeat(64);
    const previous = state.stored.at(-1)?.commitment ?? null;
    const context = { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_CONTRACT, historyId, entryId: actualEntryId, author: author.publicKey(), patient: actor.address, version, previousCommitment: previous };
    const note = { title: `Local note v${version}`, text, eventDate: null }, metadata = { mediaType: 'application/json', fileName: 'antecedente.json' };
    const sealed = sealClinicalVersion({ context, content: Buffer.from(JSON.stringify(note)), metadata, keyring, activeKeyId: 'history-test' });
    const e: ClinicalExpected = { historyId, patient: actor.address, operationId: opId, entryId: actualEntryId, author: author.publicKey(), commitment: sealed.commitment,
      expectedVersion: version-1, expectedGrantRevision: author === patient ? 0 : 1, previousCommitment: previous };
    const unsigned = new TransactionBuilder(new Account(author.publicKey(), String(100+version)), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(clinicalInvocation('append_version', e)).setTimeout(180).build();
    const signed = sponsorClinicalSignature(unsigned.toXDR(), author.publicKey(), author.sign(unsigned.hash()).toString('hex'), 'append_version', e);
    const operation = { id: '4b6b8e88-7f9b-471c-a166-1c1d1bda2c31', actor_user_id: author === patient ? actor.userId : 'did:privy:history_doctor', wallet_id: actor.walletId, source_wallet: author.publicKey(), action: 'append_version', state: 'confirmed', contract_id: CLINICAL_CONTRACT,
      network: 'testnet', method: 'append_version', expected: e, unsigned_xdr: unsigned.toXDR(), signing_hash: unsigned.hash().toString('hex'), signed_xdr: signed.xdr, transaction_hash: signed.hash, expires_at: Number(unsigned.timeBounds!.maxTime), error_code: null };
    state.contexts.push(context); state.stored.push({ context, envelope: sealed.envelope, commitment: sealed.commitment, operation_id: opId, state: 'confirmed', transaction_hash: signed.hash, entry_id: actualEntryId, version });
    state.operations.push(operation); state.chainVersions.push({ context, commitment: sealed.commitment, state: 'confirmed', createdAt: version }); state.head = version;
    return { context, sealed, note, operation };
  }
  m.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.includes('FROM clinical_web_histories')) return state.own ? [state.own] : [];
    if (sql.startsWith('SELECT id,name FROM doctors')) return state.doctors;
    if (sql.includes('FROM clinical_web_operations') && sql.includes('transaction_hash=$1')) return state.operations.filter(o => o.transaction_hash === values[0]);
    if (sql.includes('FROM clinical_web_operations')) return state.operations.filter(o => o.actor_user_id === values[0] && o.wallet_id === values[1] && o.source_wallet === values[2]);
    if (sql.startsWith('SELECT entry_id,version,transaction_hash,operation_id,commitment')) return state.stored;
    if (sql.startsWith('SELECT context,envelope,commitment,operation_id,state,transaction_hash')) {
      if (state.encryptedFailure) throw Error('PRIVATE PROVIDER DIAGNOSTIC');
      return state.stored.filter(v => v.context.contractId === values[0] && v.context.historyId === values[1] && v.context.entryId === values[2] && v.version === values[3]);
    }
    throw Error('unhandled_isolated_history_query');
  });
  m.auth.mockResolvedValue(user); m.actor.mockResolvedValue(actor);
  m.chain = {
    history: vi.fn(async () => { if (state.unavailable) throw Error('isolated_chain_failure'); return { id: historyId, patient: actor.address, createdAt: 1 }; }),
    entry: vi.fn(async () => ({ author: state.headAuthor, headVersion: state.head })), version: vi.fn(async (_history, _entry, version) => state.chainVersions.find(v => v.context.version === version) ?? null),
    grant: vi.fn(async () => state.grant), doctorAuthorized: vi.fn(async () => state.authorized),
    verifyRecordedOperation: vi.fn(async (action, expected) => {
      const op = state.operations.find(o => o.expected.operationId === expected.operationId);
      if (state.wrongRecordedOperation || !op || action !== op.action) throw Error('clinical_chain_unavailable');
      return true;
    }),
    receipt: vi.fn(async () => ({ status: 'NOT_FOUND' })),
  };
  m.reader = {
    deployment: { network: 'testnet', contractId: CLINICAL_CONTRACT },
    readAccess: vi.fn(async ({ historyId: h, reader }) => { state.readCount++; return { historyId: h, patient: actor.address, reader, canRead: !(state.revokedDuringRead && state.readCount > 1), grantRevision: 0, doctorAuthorized: false }; }),
    readVersion: vi.fn(async ({ version }) => state.chainVersions.find(v => v.context.version === version) ?? null),
  };
  m.doctor.mockResolvedValue({ address: doctor.publicKey(), doctor: { status: 'active' } });
  return { state, actualEntryId, addVersion };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RELAYER_SECRET', payer.secret()); vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING', JSON.stringify(keyring)); vi.stubEnv('TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID', 'history-test');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('clinical history identity and response boundaries', () => {
  it('looks up the stable Privy owner and rechecks the live history wallet', async () => {
    const f = fixture(); expect(await ownClinicalHistory(actor)).toMatchObject({ history: { id: historyId, patient: actor.address } });
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('owner_user_id=$1 AND contract_id=$2'), [actor.userId, CLINICAL_CONTRACT]);
    f.state.own!.owner_user_id = 'did:privy:someone_else'; await expect(ownClinicalHistory(actor)).rejects.toThrow('clinical_access_denied');
  });
  it('does not adopt a historical binding after a wallet changes', async () => {
    const f = fixture(); f.state.own!.wallet_id = 'different-wallet'; await expect(ownClinicalHistory(actor)).rejects.toThrow('clinical_wallet_changed'); expect(m.chain.history).not.toHaveBeenCalled();
  });
  it('does not show a failed chain check as an empty verified history', async () => {
    const f = fixture(); f.state.unavailable = true; await expect(clinicalSnapshot(request(), user, actor)).rejects.toThrow('isolated_chain_failure');
  });
  it('returns the explicit no-history state without attempting to decrypt or enumerate doctors', async () => {
    const f = fixture(); f.state.own = null; const snapshot = await clinicalSnapshot(request(), user, actor);
    expect(snapshot).toMatchObject({ history: null, entries: [], grants: [], operations: [] }); expect(m.reader.readAccess).not.toHaveBeenCalled(); expect(m.doctor).not.toHaveBeenCalled();
  });
  it('exposes only public operation status fields and scopes operations to current identity and wallet', async () => {
    const f = fixture(); const v = f.addVersion(); const result = await clinicalOperations(actor);
    expect(Object.keys(result[0]).sort()).toEqual(['action', 'errorCode', 'expiresAt', 'id', 'state', 'transactionHash']);
    expect(result[0].transactionHash).toBe(v.operation.transaction_hash); expect(JSON.stringify(result)).not.toContain(v.operation.signed_xdr);
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('actor_user_id=$1 AND wallet_id=$2 AND source_wallet=$3'), [actor.userId, actor.walletId, actor.address, CLINICAL_CONTRACT]);
    expect(clinicalPublicOperation({ ...v.operation, expires_at: '123' }).expiresAt).toBe(123);
  });
});

describe('clinical private document reads and integrity', () => {
  it('decrypts only the selected version and rechecks identity, permissions and proof after storage', async () => {
    const f = fixture(); const v = f.addVersion(); const document = await clinicalDocument(request(), actor, historyId, f.actualEntryId, 1);
    expect(JSON.parse(Buffer.from(document.content).toString('utf8'))).toEqual(v.note); expect(m.auth).toHaveBeenCalledTimes(4); expect(m.actor).toHaveBeenCalledTimes(2);
    expect(m.reader.readAccess).toHaveBeenCalledTimes(2); expect(m.reader.readVersion).toHaveBeenCalledTimes(2);
    expect(Object.keys(document).sort()).toEqual(['content', 'entryId', 'historyId', 'metadata', 'version']);
  });
  it.each(['expired', 'changed-user', 'changed-wallet', 'withdrawn-access'])('discards the document when %s is detected after loading', async condition => {
    const f = fixture(); f.addVersion();
    if (condition === 'expired') m.auth.mockResolvedValueOnce(user).mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    if (condition === 'changed-user') m.auth.mockResolvedValueOnce(user).mockResolvedValueOnce(user).mockResolvedValueOnce({ userId: 'did:privy:changed', email: 'changed@example.test' });
    if (condition === 'changed-wallet') m.actor.mockResolvedValueOnce(actor).mockResolvedValueOnce({ ...actor, walletId: 'changed-wallet' });
    if (condition === 'withdrawn-access') f.state.revokedDuringRead = true;
    await expect(clinicalDocument(request(), actor, historyId, f.actualEntryId, 1)).rejects.toThrow('clinical_version_unavailable');
  });
  it.each(['missing-key', 'modified-ciphertext', 'storage-failure', 'wrong-version-proof'])('fails closed without private content on %s', async condition => {
    const f = fixture(); f.addVersion();
    if (condition === 'missing-key') vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING', JSON.stringify({ wrong: 'a'.repeat(64) }));
    if (condition === 'modified-ciphertext') f.state.stored[0].envelope.payload = f.state.stored[0].envelope.payload.slice(0,-4) + 'AAAA';
    if (condition === 'storage-failure') f.state.encryptedFailure = true;
    if (condition === 'wrong-version-proof') f.state.chainVersions[0].context.patient = doctor.publicKey();
    await expect(clinicalDocument(request(), actor, historyId, f.actualEntryId, 1)).rejects.toThrow('clinical_version_unavailable');
  });
  it('does not read storage after the request was aborted', async () => {
    const f = fixture(); f.addVersion(); const controller = new AbortController(); controller.abort();
    await expect(clinicalDocument(new Request('http://localhost/test', { signal: controller.signal }), actor, historyId, f.actualEntryId, 1)).rejects.toThrow('clinical_version_unavailable');
    expect(m.reader.readAccess).not.toHaveBeenCalled();
  });
});

describe('clinical timeline, historical versions and corresponding receipts', () => {
  it('preserves earlier patient versions while only the latest own contribution can be corrected', async () => {
    const f = fixture(); const v1 = f.addVersion('FIRST VERSION'), v2 = f.addVersion('SECOND VERSION');
    const snapshot = await clinicalSnapshot(request(), user, actor);
    expect(snapshot.entries.map(e => [e.version, e.note?.text, e.canCorrect])).toEqual([[2, 'SECOND VERSION', true], [1, 'FIRST VERSION', false]]);
    expect(snapshot.entries.map(e => e.transactionHash)).toEqual([v2.operation.transaction_hash, v1.operation.transaction_hash]);
    expect(snapshot.entries.every(e => e.source === 'patient' && e.author === actor.address)).toBe(true); expect(m.chain.verifyRecordedOperation).toHaveBeenCalledTimes(2); expect(m.chain.receipt).not.toHaveBeenCalled();
  });
  it('labels doctor records separately and never permits a patient correction of them', async () => {
    const f = fixture(doctor); f.addVersion(); const snapshot = await clinicalSnapshot(request(), user, actor);
    expect(snapshot.entries[0]).toMatchObject({ source: 'doctor', author: doctor.publicKey(), canCorrect: false });
  });
  it.each(['wrong-hash', 'wrong-operation', 'wrong-commitment', 'wrong-recorded-operation', 'missing-chain-version'])('rejects %s rather than exposing a partly verified timeline', async condition => {
    const f = fixture(); f.addVersion();
    if (condition === 'wrong-hash') f.state.stored[0].transaction_hash = '0'.repeat(64);
    if (condition === 'wrong-operation') f.state.operations[0].expected.operationId = '0'.repeat(64);
    if (condition === 'wrong-commitment') f.state.stored[0].commitment = '0'.repeat(64);
    if (condition === 'wrong-recorded-operation') f.state.wrongRecordedOperation = true;
    if (condition === 'missing-chain-version') f.state.chainVersions = [];
    await expect(clinicalSnapshot(request(), user, actor)).rejects.toThrow();
  });
  it('rejects an incomplete version index whose chain head is newer', async () => {
    const f = fixture(); f.addVersion(); f.state.head = 2;
    await expect(clinicalSnapshot(request(), user, actor)).rejects.toThrow('clinical_history_unavailable'); expect(m.reader.readAccess).not.toHaveBeenCalled();
  });
  it.each(['missing-operation', 'wrong-digest', 'wrong-outcome'])('rejects %s from the durable contract operation proof', async failure => {
    const f = fixture(); f.addVersion(); m.chain.verifyRecordedOperation.mockRejectedValue(Error('clinical_chain_unavailable'));
    await expect(clinicalSnapshot(request(), user, actor)).rejects.toThrow('clinical_chain_unavailable');
    expect(m.chain.receipt).not.toHaveBeenCalled();
  });
  it('keeps historical records readable after RPC receipt retention and without the current relayer secret', async () => {
    const f = fixture(); const v = f.addVersion(); delete process.env.RELAYER_SECRET;
    const snapshot = await clinicalSnapshot(request(), user, actor);
    expect(snapshot.entries[0].transactionHash).toBe(v.operation.transaction_hash);
    expect(m.chain.verifyRecordedOperation).toHaveBeenCalledExactlyOnceWith('append_version', v.operation.expected);
    expect(m.chain.receipt).not.toHaveBeenCalled();
  });
});

describe('clinical patient-managed permissions', () => {
  it('shows independent flags and preserves a retired doctor grant for withdrawal without marking that doctor authorized', async () => {
    const f = fixture(); f.state.doctors = [{ id: 1, name: 'Same visible name' }]; f.state.grant = { canRead: false, canAppend: true, revision: 2 }; f.state.authorized = false;
    expect(await clinicalGrants(historyId)).toEqual([{ doctorId: 1, doctorName: 'Same visible name', address: doctor.publicKey(), authorized: false, canRead: false, canAppend: true, revision: 2 }]);
  });
  it('omits an unauthorized doctor with no grant and does not fail on a doctor without a Privy binding', async () => {
    const f = fixture(); f.state.doctors = [{ id: 1, name: 'Not bound' }, { id: 2, name: 'Not authorized' }]; f.state.authorized = false;
    m.doctor.mockRejectedValueOnce(Error('doctor_privy_login_required'));
    expect(await clinicalGrants(historyId)).toEqual([]);
  });
  it('does not mark a blocked app doctor authorized even when registry authorization is still current', async () => {
    const f = fixture(); f.state.doctors = [{ id: 1, name: 'Blocked' }]; m.doctor.mockResolvedValue({ address: doctor.publicKey(), doctor: { status: 'revoked' } });
    const grants = await clinicalGrants(historyId); expect(grants[0].authorized).toBe(false);
  });
});
