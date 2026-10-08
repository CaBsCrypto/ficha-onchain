import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Account, BASE_FEE, Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { CLINICAL_CONTRACT, clinicalInvocation, deriveClinicalEntryId, deriveClinicalHistoryId, sponsorClinicalSignature } from '@/lib/clinical/chain';
import type { ClinicalAction, ClinicalActor, ClinicalExpected, ClinicalPrepareRequest } from '@/types/clinical';

const m = vi.hoisted(() => ({ connection: vi.fn(), query: vi.fn(), sign: vi.fn(), doctor: vi.fn(), seal: vi.fn(), chain: {} as Record<string, any> }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDbConnection: m.connection, getDb: () => ({ query: m.query }) }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: m.doctor }));
vi.mock('@privy-io/server-auth', () => ({ PrivyClient: class {} }));
vi.mock('@/lib/stellar/privy-owner-signing', () => ({ signPreparedOwnerTransaction: m.sign }));
vi.mock('@/lib/clinical/history', () => ({ clinicalPublicOperation: (r: Record<string, any>) => ({ id: r.id, action: r.action, state: r.state, expiresAt: Number(r.expires_at), transactionHash: r.transaction_hash ?? null, errorCode: r.error_code ?? null }) }));
vi.mock('@/lib/clinical/config', () => ({ CLINICAL_ID: 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U', assertClinicalEnvironment: (write = false) => { if (write && process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'true') throw Error('private_writes_paused'); } }));
vi.mock('@/lib/private-config', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/private-config')>(), assertPrivateWrites: () => { if (process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'true') throw Error('private_writes_paused'); } }));
vi.mock('@/lib/clinical/chain', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/clinical/chain')>(), createClinicalWebChain: () => m.chain }));
vi.mock('../../scripts/lib/clinical-crypto.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('../../scripts/lib/clinical-crypto.mjs')>();
  return { ...actual, sealClinicalVersion: (...args: Parameters<typeof actual.sealClinicalVersion>) => { m.seal(...args); return actual.sealClinicalVersion(...args); } };
});
import { cancelClinicalOperation, prepareClinicalOperation, reconcileClinicalOperation, signClinicalOperation } from '@/lib/clinical/operations';

// Local deterministic identities only; no deployed secret or provider is used.
const patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 41));
const doctor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 42));
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 43));
const actor: ClinicalActor = { userId: 'did:privy:synthetic_patient', walletId: 'synthetic_wallet', address: patient.publicKey() };
const user = { userId: actor.userId, email: 'synthetic@example.test' };
const ID = '2f4929bd-48f9-4b9d-bde4-47f7b66a6d91', historyId = deriveClinicalHistoryId(actor.address);
const opId = '7'.repeat(64), keyring = { 'test-kek': '8'.repeat(64) };
const note = { title: 'Synthetic antecedent', text: 'LOCAL TEST CONTENT', eventDate: null };
const appendInput: ClinicalPrepareRequest = { requestId: ID, action: 'append_version', note };
const createInput: ClinicalPrepareRequest = { requestId: ID, action: 'create_history' };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function requestFingerprint(input: ClinicalPrepareRequest) {
  const canonical = JSON.stringify({ requestId: input.requestId, action: input.action, entryId: input.entryId, expectedVersion: input.expectedVersion,
    note: input.note, file: input.file, doctorId: input.doctorId, canRead: input.canRead, canAppend: input.canAppend, expectedRevision: input.expectedRevision });
  return 'test-kek:' + createHmac('sha256', Buffer.from(keyring['test-kek'], 'hex')).update(canonical).digest('hex');
}
function build(action: ClinicalAction, expected: ClinicalExpected, sequence = '100') {
  return new TransactionBuilder(new Account(actor.address, sequence), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(clinicalInvocation(action, expected)).setTimeout(180).build();
}
function fixture(ownHistory = false) {
  const state = { row: null as Record<string, any> | null, history: ownHistory ? { history_id: historyId, owner_user_id: actor.userId, wallet_id: actor.walletId, patient_wallet: actor.address, contract_id: CLINICAL_CONTRACT, network: 'testnet', transaction_hash: '1'.repeat(64) } : null,
    versions: {} as Record<string, any>, head: null as { author: string; headVersion: number } | null,
    version: null as Record<string, any> | null, receipt: 'NOT_FOUND', wrongReceipt: false, historyPatient: actor.address,
    queue: '', rpcFailure: false, failStorage: false, events: [] as string[], releaseCount: 0 };
  let transaction: { row: typeof state.row; history: typeof state.history; versions: typeof state.versions } | null = null;
  const savedPoints = new Map<string, typeof transaction>();
  const query = vi.fn(async (sql: string, values: any[] = []) => {
    state.events.push(sql.trim().replace(/\s+/g, ' '));
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q === 'BEGIN') { transaction = clone({ row: state.row, history: state.history, versions: state.versions }); return { rows: [] }; }
    if (q === 'COMMIT') { transaction = null; return { rows: [] }; }
    if (q === 'ROLLBACK') { if (transaction) Object.assign(state, clone(transaction)); transaction = null; return { rows: [] }; }
    if (q.startsWith('SAVEPOINT ')) { savedPoints.set(q.slice(10), clone({ row: state.row, history: state.history, versions: state.versions })); return { rows: [] }; }
    if (q.startsWith('ROLLBACK TO SAVEPOINT ')) { Object.assign(state, clone(savedPoints.get(q.slice(22)))); return { rows: [] }; }
    if (q.startsWith('RELEASE SAVEPOINT ')) { savedPoints.delete(q.slice(18)); return { rows: [] }; }
    if (q.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (q.startsWith('SELECT to_regclass')) return { rows: [{ relation: values[0] }] };
    if (q.startsWith('SELECT 1 FROM') && q.includes('state IN')) return { rows: state.queue && q.includes(`FROM ${state.queue} `) ? [{}] : [] };
    if (q.startsWith('SELECT * FROM clinical_web_operations')) {
      const visible = state.row && state.row.id === values[0] && (values[1] === undefined || state.row.actor_user_id === values[1]);
      return { rows: visible ? [clone(state.row)] : [] };
    }
    if (q.startsWith('SELECT 1 FROM clinical_web_histories')) return { rows: state.history ? [{}] : [] };
    if (q.startsWith('SELECT * FROM clinical_web_histories')) return { rows: state.history ? [clone(state.history)] : [] };
    if (q.startsWith('INSERT INTO clinical_web_operations')) {
      state.row = { id: values[0], actor_user_id: values[1], wallet_id: values[2], source_wallet: values[3], action: values[4], contract_id: values[5], network: 'testnet', method: values[6], expected: JSON.parse(values[7]),
        prepared_envelope: values[8] === null ? null : JSON.parse(values[8]), state: 'awaiting_signature', unsigned_xdr: values[9], signing_hash: values[10], expires_at: values[11], request_fingerprint: values[12], signed_xdr: null, transaction_hash: null, error_code: null };
      return { rows: [clone(state.row)] };
    }
    if (q.startsWith('INSERT INTO clinical_web_histories')) {
      state.history = { history_id: values[0], owner_user_id: values[1], wallet_id: values[2], patient_wallet: values[3], contract_id: values[4], network: 'testnet', transaction_hash: values[5] }; return { rows: [] };
    }
    if (q.startsWith('UPDATE clinical_web_operations')) {
      if (q.includes('expires_at<=') && (!state.row || state.row.state !== 'awaiting_signature' || state.row.expires_at > Date.now()/1000)) return { rows: [] };
      if (!state.row) return { rows: [] };
      if (q.includes("state='submitted'")) Object.assign(state.row, { state: 'submitted', signed_xdr: values[1], transaction_hash: values[2] });
      if (q.includes("state='confirmed'")) Object.assign(state.row, { state: 'confirmed', error_code: null });
      if (q.includes("state='failed'")) Object.assign(state.row, { state: 'failed', error_code: 'transaction_failed' });
      if (q.includes("state='cancelled'")) Object.assign(state.row, { state: 'cancelled', error_code: q.includes('signature_cancelled') ? 'signature_cancelled' : 'signature_request_expired' });
      return { rows: [clone(state.row)] };
    }
    if (q.startsWith('INSERT INTO clinical_private_versions')) {
      if (state.failStorage) throw Error('isolated_storage_failure');
      const id = [values[0], values[1], values[2], values[3]].join(':');
      state.versions[id] ??= { context: JSON.parse(values[4]), commitment: values[5], envelope: JSON.parse(values[6]), operation_id: values[7], state: 'prepared', transaction_hash: null };
      return { rows: [] };
    }
    if (q.startsWith('SELECT context,envelope,commitment,operation_id,state,transaction_hash')) {
      const stored = state.versions[values.slice(0,4).join(':')]; return { rows: stored ? [clone(stored)] : [] };
    }
    if (q.startsWith('UPDATE clinical_private_versions')) {
      Object.assign(state.versions[values.slice(0,4).join(':')], { state: 'confirmed', transaction_hash: values[4] }); return { rows: [] };
    }
    throw Error('unhandled_isolated_query: ' + q);
  });
  const client = { query, release: vi.fn(() => { state.releaseCount++; state.events.push('RELEASE_CLIENT'); }) };
  m.connection.mockResolvedValue(client); m.query.mockResolvedValue([]);
  m.chain = {
    verifyDeployment: vi.fn(async () => undefined), deriveHistoryId: vi.fn(async () => historyId), deriveEntryId: vi.fn(async (h, a, op) => deriveClinicalEntryId(h, a, op)),
    historyForPatient: vi.fn(async () => state.history ? { id: historyId, patient: state.historyPatient, createdAt: 1 } : null),
    history: vi.fn(async () => ({ id: historyId, patient: state.historyPatient, createdAt: 1 })), entry: vi.fn(async () => state.head),
    version: vi.fn(async () => state.version), grant: vi.fn(async () => null), doctorAuthorized: vi.fn(async () => true),
    prepare: vi.fn(async (_source, action, expected) => { state.events.push('PREPARE_CHAIN'); return build(action, expected); }),
    receipt: vi.fn(async () => { state.events.push('RPC_RECEIPT'); if (state.rpcFailure) throw Error('isolated_rpc_unavailable');
      if (state.receipt === 'NOT_FOUND') return { status: state.receipt };
      const envelope = state.wrongReceipt ? build('create_history', { historyId, patient: actor.address, operationId: opId }, '200').toEnvelope() : TransactionBuilder.fromXDR(state.row!.signed_xdr, Networks.TESTNET).toEnvelope();
      return { status: state.receipt, envelopeXdr: envelope }; }),
    submit: vi.fn(async xdr => { state.events.push('RPC_SUBMIT'); if (state.rpcFailure) throw Error('isolated_response_lost'); return { status: 'PENDING', xdr }; }),
  };
  m.doctor.mockResolvedValue({ address: doctor.publicKey(), doctor: { status: 'active' } });
  m.sign.mockImplementation(async (_token, owner, prepared) => {
    expect(owner).toEqual(actor); expect(prepared.userId).toBe(actor.userId); expect(prepared.walletId).toBe(actor.walletId); expect(prepared.address).toBe(actor.address);
    const tx = TransactionBuilder.fromXDR(prepared.unsignedXdr, Networks.TESTNET) as Transaction;
    expect(tx.hash().toString('hex')).toBe(prepared.hash); tx.sign(patient); state.events.push('PRIVY_SIGN'); return { signedXdr: tx.toXDR() };
  });
  function seed(action: ClinicalAction = 'create_history') {
    const expected: ClinicalExpected = { historyId, patient: actor.address, operationId: opId };
    if (action === 'append_version') Object.assign(expected, { entryId: deriveClinicalEntryId(historyId, actor.address, opId), author: actor.address, commitment: '6'.repeat(64), expectedVersion: 0, expectedGrantRevision: 0, previousCommitment: null });
    const tx = build(action, expected), signed = sponsorClinicalSignature(tx.toXDR(), actor.address, patient.sign(tx.hash()).toString('hex'), action, expected);
    state.row = { id: ID, actor_user_id: actor.userId, wallet_id: actor.walletId, source_wallet: actor.address, action, contract_id: CLINICAL_CONTRACT, method: action, expected, unsigned_xdr: tx.toXDR(), signing_hash: tx.hash().toString('hex'), expires_at: Number(tx.timeBounds!.maxTime), signed_xdr: signed.xdr, transaction_hash: signed.hash, state: 'submitted', error_code: null };
    return state.row;
  }
  return { state, client, seed };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'true'); vi.stubEnv('PRIVY_APP_SECRET', 'isolated-test-placeholder');
  vi.stubEnv('RELAYER_SECRET', payer.secret()); vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING', JSON.stringify(keyring)); vi.stubEnv('TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID', 'test-kek');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('clinical operation preparation and private idempotency', () => {
  it('persists one encrypted payload and one intent for two exact preparations of the same UUID', async () => {
    const f = fixture(true); const first = await prepareClinicalOperation(user, actor, appendInput), second = await prepareClinicalOperation(user, actor, clone(appendInput));
    expect(second).toEqual(first); expect(m.seal).toHaveBeenCalledTimes(1); expect(m.chain.prepare).toHaveBeenCalledTimes(1);
    expect(f.client.query.mock.calls.filter(([q]) => q.includes('INSERT INTO clinical_web_operations'))).toHaveLength(1);
    expect(JSON.stringify(f.state.row)).not.toContain(note.text); expect(JSON.stringify(f.state.row)).not.toContain(note.title);
    expect(f.state.row!.request_fingerprint).toBe(requestFingerprint(appendInput)); expect(f.state.row!.signed_xdr).toBeNull();
  });
  it('rejects changing the private payload behind an existing UUID rather than silently reusing or replacing it', async () => {
    const f = fixture(true); await prepareClinicalOperation(user, actor, appendInput); const stored = clone(f.state.row);
    await expect(prepareClinicalOperation(user, actor, { ...appendInput, note: { ...note, text: 'DIFFERENT LOCAL NOTE' } })).rejects.toThrow('clinical_request_conflict');
    expect(f.state.row).toEqual(stored); expect(m.seal).toHaveBeenCalledTimes(1); expect(m.chain.prepare).toHaveBeenCalledTimes(1);
  });
  it.each(['actor_user_id', 'wallet_id', 'source_wallet', 'contract_id'])('rejects another saved %s even if the UUID is known', async field => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput); f.state.row![field] = 'foreign';
    await expect(prepareClinicalOperation(user, actor, createInput)).rejects.toThrow('clinical_request_conflict'); expect(m.chain.prepare).toHaveBeenCalledTimes(1);
  });
  it.each(['private_operations', 'clinical_transaction_attempts', 'clinical_web_operations'])('respects a live wallet intent in %s', async queue => {
    const f = fixture(); f.state.queue = queue; await expect(prepareClinicalOperation(user, actor, createInput)).rejects.toThrow('another_operation_pending');
    expect(m.chain.prepare).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled(); expect(f.state.row).toBeNull(); expect(f.client.release).toHaveBeenCalledOnce();
  });
  it('rejects correction of a doctor-authored entry before encryption or preparation', async () => {
    const f = fixture(true); f.state.head = { author: doctor.publicKey(), headVersion: 1 };
    await expect(prepareClinicalOperation(user, actor, { ...appendInput, entryId: '9'.repeat(64), expectedVersion: 1 })).rejects.toThrow('clinical_version_conflict');
    expect(m.seal).not.toHaveBeenCalled(); expect(m.chain.prepare).not.toHaveBeenCalled(); expect(f.client.release).toHaveBeenCalledOnce();
  });
  it('allows a correction by the original patient author while retaining the previous commitment', async () => {
    const f = fixture(true); f.state.head = { author: actor.address, headVersion: 1 }; f.state.version = { commitment: '6'.repeat(64) };
    const entry = deriveClinicalEntryId(historyId, actor.address, opId);
    await prepareClinicalOperation(user, actor, { ...appendInput, entryId: entry, expectedVersion: 1 });
    expect(f.state.row!.expected).toMatchObject({ author: actor.address, entryId: entry, expectedVersion: 1, previousCommitment: '6'.repeat(64) });
    expect(m.seal.mock.calls[0][0].context).toMatchObject({ version: 2, previousCommitment: '6'.repeat(64) });
  });
  it('does not accept a changed or nonexistent private owner binding', async () => {
    const f = fixture(true); f.state.history!.wallet_id = 'foreign-wallet';
    await expect(prepareClinicalOperation(user, actor, appendInput)).rejects.toThrow('clinical_wallet_changed'); expect(m.seal).not.toHaveBeenCalled();
  });
  it('treats separate read/append grants independently and rejects an expired doctor when granting either', async () => {
    const f = fixture(true), input: ClinicalPrepareRequest = { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: true, canAppend: false, expectedRevision: 0 };
    await prepareClinicalOperation(user, actor, input); expect(f.state.row!.expected).toMatchObject({ canRead: true, canAppend: false });
    const other = fixture(true); m.chain.doctorAuthorized.mockResolvedValue(false);
    await expect(prepareClinicalOperation(user, actor, { ...input, canRead: false, canAppend: true })).rejects.toThrow('doctor_not_authorized'); expect(other.state.row).toBeNull();
  });
  it('releases and rolls back when deployment or storage preparation fails', async () => {
    const f = fixture(); m.chain.verifyDeployment.mockRejectedValue(Error('isolated_deployment_error'));
    await expect(prepareClinicalOperation(user, actor, createInput)).rejects.toThrow('isolated_deployment_error');
    expect(f.state.events).toContain('ROLLBACK'); expect(f.client.release).toHaveBeenCalledOnce(); expect(f.state.row).toBeNull();
  });
});

describe('clinical exact owner signing, transmission and reconciliation', () => {
  it('commits and releases the exact owner-signed fee bump before any RPC transmission', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput); f.state.events.length = 0;
    const result = await signClinicalOperation(user, actor, ID, 'isolated-credential');
    expect(result.operation.state).toBe('submitted'); expect(m.sign).toHaveBeenCalledOnce(); expect(m.chain.submit).toHaveBeenCalledExactlyOnceWith(f.state.row!.signed_xdr);
    expect(f.state.events.indexOf('COMMIT')).toBeLessThan(f.state.events.indexOf('RPC_RECEIPT'));
    expect(f.state.events.indexOf('RELEASE_CLIENT')).toBeLessThan(f.state.events.indexOf('RPC_SUBMIT'));
    expect(f.client.query.mock.calls.some(([q]) => q.includes('signed_xdr=$2,transaction_hash=$3,state=\'submitted\''))).toBe(true);
  });
  it('rejects changed unsigned method/hash before asking Privy to sign', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput); f.state.row!.signing_hash = '0'.repeat(64);
    await expect(signClinicalOperation(user, actor, ID, 'isolated-credential')).rejects.toThrow('clinical_saved_intent_invalid');
    expect(m.sign).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled(); expect(f.client.release).toHaveBeenCalledTimes(2);
  });
  it('does not persist or broadcast a signature from another owner', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput);
    m.sign.mockImplementation(async (_token, _owner, prepared) => { const tx = TransactionBuilder.fromXDR(prepared.unsignedXdr, Networks.TESTNET) as Transaction; tx.sign(doctor); return { signedXdr: tx.toXDR() }; });
    await expect(signClinicalOperation(user, actor, ID, 'isolated-credential')).rejects.toThrow('owner_signature_invalid');
    expect(f.state.row!.state).toBe('awaiting_signature'); expect(f.state.row!.signed_xdr).toBeNull(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('repeated sign clicks reuse the submitted envelope and do not request another owner signature', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput);
    const first = await signClinicalOperation(user, actor, ID, 'isolated-credential');
    const second = await signClinicalOperation(user, actor, ID, 'isolated-credential');
    expect(second.operation.transactionHash).toBe(first.operation.transactionHash); expect(m.sign).toHaveBeenCalledOnce();
    expect(m.chain.submit.mock.calls.map(([xdr]) => xdr)).toEqual([f.state.row!.signed_xdr, f.state.row!.signed_xdr]);
  });
  it('a cancelled provider signing request leaves no persisted or transmitted signature', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput); m.sign.mockRejectedValue(Error('isolated_signature_cancelled'));
    await expect(signClinicalOperation(user, actor, ID, 'isolated-credential')).rejects.toThrow('isolated_signature_cancelled');
    expect(f.state.row!.state).toBe('awaiting_signature'); expect(f.state.row!.signed_xdr).toBeNull(); expect(f.state.row!.transaction_hash).toBeNull();
    expect(m.chain.submit).not.toHaveBeenCalled(); expect(f.client.release).toHaveBeenCalledTimes(2);
  });
  it('GET-style reconciliation never resubmits while explicit retry uses the exact persisted envelope without signing again', async () => {
    const f = fixture(); const row = f.seed(); const before = clone(row);
    await reconcileClinicalOperation(actor, ID); expect(m.chain.submit).not.toHaveBeenCalled();
    await reconcileClinicalOperation(actor, ID, true); expect(m.chain.submit).toHaveBeenCalledExactlyOnceWith(before.signed_xdr);
    expect(f.state.row).toEqual(before); expect(m.chain.prepare).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
  });
  it('does not call a lost transmission response confirmed or create a replacement attempt', async () => {
    const f = fixture(); f.seed(); m.chain.submit.mockRejectedValue(Error('isolated_response_lost')); const hash = f.state.row!.transaction_hash;
    const result = await reconcileClinicalOperation(actor, ID, true); expect(result.operation.state).toBe('submitted'); expect(result.operation.transactionHash).toBe(hash);
    await reconcileClinicalOperation(actor, ID, true); expect(m.chain.submit.mock.calls.map(([xdr]) => xdr)).toEqual([f.state.row!.signed_xdr, f.state.row!.signed_xdr]); expect(m.sign).not.toHaveBeenCalled();
  });
  it('records an exact FAILED receipt without treating it as success or broadcasting again', async () => {
    const f = fixture(); f.seed(); f.state.receipt = 'FAILED';
    const result = await reconcileClinicalOperation(actor, ID, true); expect(result.operation).toMatchObject({ state: 'failed', errorCode: 'transaction_failed' });
    expect(m.chain.submit).not.toHaveBeenCalled(); expect(f.state.history).toBeNull();
  });
  it.each(['SUCCESS', 'FAILED'])('rejects a %s receipt for a different envelope', async status => {
    const f = fixture(); f.seed(); f.state.receipt = status; f.state.wrongReceipt = true;
    await expect(reconcileClinicalOperation(actor, ID)).rejects.toThrow('clinical_receipt_mismatch'); expect(f.state.row!.state).toBe('submitted'); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('creates the immutable owner binding only after the exact successful create-history receipt', async () => {
    const f = fixture(); f.seed(); f.state.receipt = 'SUCCESS';
    const result = await reconcileClinicalOperation(actor, ID); expect(result.operation.state).toBe('confirmed');
    expect(f.state.history).toMatchObject({ owner_user_id: actor.userId, wallet_id: actor.walletId, patient_wallet: actor.address, transaction_hash: f.state.row!.transaction_hash });
    expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('refuses a successful receipt whose current history belongs to another patient', async () => {
    const f = fixture(); f.seed(); f.state.receipt = 'SUCCESS'; f.state.historyPatient = doctor.publicKey();
    await expect(reconcileClinicalOperation(actor, ID)).rejects.toThrow('clinical_receipt_mismatch'); expect(f.state.row!.state).toBe('submitted'); expect(f.state.history).toBeNull();
  });
  it('persists the confirmed encrypted version and operation atomically through savepoints', async () => {
    const f = fixture(true); await prepareClinicalOperation(user, actor, appendInput);
    await signClinicalOperation(user, actor, ID, 'isolated-credential'); f.state.receipt = 'SUCCESS';
    const e = f.state.row!.expected; f.state.version = { commitment: e.commitment, context: { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_CONTRACT, historyId, entryId: e.entryId, author: actor.address, patient: actor.address, version: 1, previousCommitment: null } };
    const result = await reconcileClinicalOperation(actor, ID);
    expect(result.operation.state).toBe('confirmed'); expect(Object.values(f.state.versions)).toHaveLength(1);
    expect(Object.values(f.state.versions)[0]).toMatchObject({ state: 'confirmed', transaction_hash: result.operation.transactionHash });
    expect(f.state.events.filter(e => e === 'SAVEPOINT clinical_storage')).toHaveLength(2);
    expect(f.state.events.filter(e => e === 'RELEASE SAVEPOINT clinical_storage')).toHaveLength(2);
    expect(f.state.events.filter(e => e === 'BEGIN')).toHaveLength(4);
  });
  it('rolls back storage and releases the connection without confirming when the encrypted save fails', async () => {
    const f = fixture(true); await prepareClinicalOperation(user, actor, appendInput); await signClinicalOperation(user, actor, ID, 'isolated-credential');
    f.state.receipt = 'SUCCESS'; f.state.failStorage = true; const e = f.state.row!.expected;
    f.state.version = { commitment: e.commitment, context: { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_CONTRACT, historyId, entryId: e.entryId, author: actor.address, patient: actor.address, version: 1, previousCommitment: null } };
    await expect(reconcileClinicalOperation(actor, ID)).rejects.toThrow('isolated_storage_failure');
    expect(f.state.events).toContain('ROLLBACK TO SAVEPOINT clinical_storage'); expect(f.state.row!.state).toBe('submitted'); expect(Object.keys(f.state.versions)).toHaveLength(0); expect(f.client.release).toHaveBeenCalledTimes(4);
  });
  it('cancelled or expired unsigned signatures cannot be broadcast', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput); await cancelClinicalOperation(actor, ID);
    const result = await signClinicalOperation(user, actor, ID, 'isolated-credential'); expect(result.operation.state).toBe('cancelled'); expect(m.sign).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
    const expired = fixture(); await prepareClinicalOperation(user, actor, createInput); expired.state.row!.expires_at = Math.floor(Date.now()/1000)-1;
    expect((await reconcileClinicalOperation(actor, ID, true)).operation.state).toBe('cancelled'); expect(m.sign).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('turning writes off prevents preparation, signing and transmission but permits receipt reconciliation', async () => {
    const f = fixture(); f.seed(); vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'false');
    await expect(prepareClinicalOperation(user, actor, createInput)).rejects.toThrow('private_writes_paused');
    await expect(signClinicalOperation(user, actor, ID, 'isolated-credential')).rejects.toThrow('private_writes_paused');
    expect((await reconcileClinicalOperation(actor, ID, true)).operation.state).toBe('submitted');
    expect(m.chain.prepare).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('expired uncertain attempts retain the exact hash and never submit again', async () => {
    const f = fixture(); f.seed(); f.state.row!.expires_at = Math.floor(Date.now()/1000)-1;
    expect((await reconcileClinicalOperation(actor, ID, true)).operation.state).toBe('submitted'); expect(m.chain.submit).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
  });
  it('releases and rolls back after a provider receipt error while retaining the durable attempt', async () => {
    const f = fixture(); f.seed(); f.state.rpcFailure = true; const before = clone(f.state.row);
    await expect(reconcileClinicalOperation(actor, ID)).rejects.toThrow('isolated_rpc_unavailable');
    expect(f.state.row).toEqual(before); expect(f.state.events).toContain('ROLLBACK'); expect(f.client.release).toHaveBeenCalledOnce(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
});
