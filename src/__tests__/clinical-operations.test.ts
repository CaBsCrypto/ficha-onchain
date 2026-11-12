import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { sealDraft } from '@/lib/clinical/drafts-crypto';
import { Account, BASE_FEE, Keypair, Networks, SorobanDataBuilder, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { CLINICAL_CONTRACT, assertClinicalUnsigned, clinicalInvocation, deriveClinicalEntryId, deriveClinicalHistoryId, sponsorClinicalSignature } from '@/lib/clinical/chain';
import type { ClinicalAction, ClinicalActor, ClinicalExpected, ClinicalPrepareRequest } from '@/types/clinical';

const m = vi.hoisted(() => ({ connection: vi.fn(), query: vi.fn(), factory: vi.fn(), sponsor: vi.fn(), aggregate: vi.fn(), doctor: vi.fn(), seal: vi.fn(), context: vi.fn(), rx: vi.fn(), chain: {} as Record<string, any> }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/clinical/doctor-context', () => ({ clinicalDoctorContext: m.context }));
vi.mock('@/lib/clinical/prescriptions', () => ({ clinicalPrescriptionReference: m.rx }));
vi.mock('@/lib/db', () => ({ getDbConnection: m.connection, getDb: () => ({ query: m.query }) }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: m.doctor }));
vi.mock('@/lib/clinical/history', () => ({ clinicalPreparedOperation: (_actor: unknown, r: Record<string, any>) => ({ id: r.id, action: r.action, state: r.state, expiresAt: Number(r.expires_at), transactionHash: r.transaction_hash ?? null, errorCode: r.error_code ?? null }) }));
vi.mock('@/lib/clinical/config', () => ({ CLINICAL_ID: 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U', assertClinicalEnvironment: (write = false) => { if (write && process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'true') throw Error('private_writes_paused'); } }));
vi.mock('@/lib/private-config', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/private-config')>(), assertPrivateWrites: () => { if (process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'true') throw Error('private_writes_paused'); } }));
vi.mock('@/lib/clinical/chain', async importOriginal => { const actual = await importOriginal<typeof import('@/lib/clinical/chain')>(); return { ...actual, createClinicalWebChain: () => { m.factory(); return m.chain; }, sponsorClinicalSignature: (...args: Parameters<typeof actual.sponsorClinicalSignature>) => { m.sponsor(...args); return actual.sponsorClinicalSignature(...args); } }; });
vi.mock('../../scripts/lib/clinical-crypto.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('../../scripts/lib/clinical-crypto.mjs')>();
  return { ...actual, sealClinicalVersion: (...args: Parameters<typeof actual.sealClinicalVersion>) => { m.seal(...args); return actual.sealClinicalVersion(...args); } };
});
vi.mock('@/lib/clinical/rehearsal-budget',()=>({assertClinicalRehearsalBudget:(...args:unknown[])=>m.aggregate(...args)}));
import * as writeScope from '@/lib/clinical/create-once';
import * as rehearsalFunctions from '@/lib/clinical/rehearsal';
import { cancelClinicalOperation, prepareClinicalOperation, reconcileClinicalOperation, signClinicalOperation } from '@/lib/clinical/operations';
import { sealClinicalVersion } from '../../scripts/lib/clinical-crypto.mjs';
import type { ClinicalCapturePlan } from '@/lib/clinical/capture';

// Local deterministic identities only; no deployed secret or provider is used.
let testSignature: () => string;
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
    note: input.note, file: input.file, doctorId: input.doctorId, canRead: input.canRead, canAppend: input.canAppend, expectedRevision: input.expectedRevision,
    ...(input.historyId?{historyId:input.historyId}:{}),...(input.draftId?{draftId:input.draftId,draftRevision:input.draftRevision}:{}) });
  return 'test-kek:' + createHmac('sha256', Buffer.from(keyring['test-kek'], 'hex')).update(canonical).digest('hex');
}
function build(action: ClinicalAction, expected: ClinicalExpected, sequence = '100') {
  return new TransactionBuilder(new Account(actor.address, sequence), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(clinicalInvocation(action, expected)).setTimeout(180).build();
}
function fixture(ownHistory = false) {
  const state = { row: null as Record<string, any> | null, history: ownHistory ? { history_id: historyId, owner_user_id: actor.userId, wallet_id: actor.walletId, patient_wallet: actor.address, contract_id: CLINICAL_CONTRACT, network: 'testnet', transaction_hash: '1'.repeat(64) } : null,
    versions: {} as Record<string, any>, draft: null as Record<string, any> | null, head: null as { author: string; headVersion: number } | null,
    version: null as Record<string, any> | null, receipt: 'NOT_FOUND', wrongReceipt: false, historyPatient: actor.address,
    quotaRows: [] as Array<{id:string}>, queue: '', rpcFailure: false, failStorage: false, events: [] as string[], releaseCount: 0 };
  let transaction: { row: typeof state.row; history: typeof state.history; versions: typeof state.versions; draft: typeof state.draft } | null = null;
  const savedPoints = new Map<string, typeof transaction>();
  const query = vi.fn(async (sql: string, values: any[] = []) => {
    state.events.push(sql.trim().replace(/\s+/g, ' '));
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q === 'BEGIN') { transaction = clone({ row: state.row, history: state.history, versions: state.versions, draft:state.draft }); return { rows: [] }; }
    if (q === 'COMMIT') { transaction = null; return { rows: [] }; }
    if (q === 'ROLLBACK') { if (transaction) Object.assign(state, clone(transaction)); transaction = null; return { rows: [] }; }
    if (q.startsWith('SAVEPOINT ')) { savedPoints.set(q.slice(10), clone({ row: state.row, history: state.history, versions: state.versions, draft:state.draft })); return { rows: [] }; }
    if (q.startsWith('ROLLBACK TO SAVEPOINT ')) { Object.assign(state, clone(savedPoints.get(q.slice(22)))); return { rows: [] }; }
    if (q.startsWith('RELEASE SAVEPOINT ')) { savedPoints.delete(q.slice(18)); return { rows: [] }; }
    if (q.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (q.startsWith('SELECT commitment FROM doctor_authorization_requests')) return {rows:[{commitment:'c'.repeat(64)}]};
    if (q.startsWith('SELECT to_regclass')) return { rows: [{ relation: values[0] }] };
    if (q.startsWith("SELECT id FROM clinical_web_operations WHERE source_wallet=")) return { rows: [...state.quotaRows, ...(state.row ? [{ id: state.row.id }] : [])] };
    if (q.startsWith('SELECT 1 FROM') && q.includes('state IN')) return { rows: state.queue && q.includes(`FROM ${state.queue} `) ? [{}] : [] };
    if (q.startsWith('SELECT * FROM clinical_web_operations')) {
      const visible = state.row && state.row.id === values[0] && (values[1] === undefined || state.row.actor_user_id === values[1]);
      return { rows: visible ? [clone(state.row)] : [] };
    }
    if (q.startsWith('SELECT 1 FROM clinical_web_histories')) return { rows: state.history ? [{}] : [] };
    if (q.startsWith('SELECT * FROM clinical_web_histories')) return { rows: state.history ? [clone(state.history)] : [] };

    if(q.startsWith('SELECT id,revision,owner_user_id')&&q.includes('FROM clinical_private_drafts')){
      return {rows:state.draft&&state.draft.publication_request_id===values[0]?[clone(state.draft)]:[]};
    }
    if(q.startsWith('SELECT * FROM clinical_private_drafts')){
      const d=state.draft,visible=d&&d.id===values[0]&&[d.owner_user_id,d.wallet_id,d.author_wallet,d.contract_id,d.network].every((v,i)=>v===values[i+1]);
      return {rows:visible?[clone(d!)]:[]};
    }
    if(q.startsWith('UPDATE clinical_private_drafts SET publication_request_id')){
      const d=state.draft,visible=d&&d.id===values[0]&&[d.owner_user_id,d.wallet_id,d.author_wallet,d.contract_id,d.network].every((v,i)=>v===values[i+1])&&d.revision===values[6]&&d.deleted_at===null&&(d.publication_request_id===null||d.publication_request_id===values[7]);
      if(!visible)return {rows:[]};d!.publication_request_id=values[7];return {rows:[{id:d!.id}]};
    }

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
  testSignature = () => patient.sign(Buffer.from(state.row?.signing_hash ?? '1'.repeat(64), 'hex')).toString('hex');

  function seed(action: ClinicalAction = 'create_history') {
    const expected: ClinicalExpected = { historyId, patient: actor.address, operationId: opId };
    if (action === 'append_version') Object.assign(expected, { entryId: deriveClinicalEntryId(historyId, actor.address, opId), author: actor.address, commitment: '6'.repeat(64), expectedVersion: 0, expectedGrantRevision: 0, previousCommitment: null });
    const tx = build(action, expected), signed = sponsorClinicalSignature(tx.toXDR(), actor.address, patient.sign(tx.hash()).toString('hex'), action, expected);
    state.row = { id: ID, actor_user_id: actor.userId, wallet_id: actor.walletId, source_wallet: actor.address, action, contract_id: CLINICAL_CONTRACT, method: action, expected, unsigned_xdr: tx.toXDR(), signing_hash: tx.hash().toString('hex'), expires_at: Number(tx.timeBounds!.maxTime), signed_xdr: signed.xdr, transaction_hash: signed.hash, state: 'submitted', error_code: null };
    m.sponsor.mockClear(); return state.row;
  }
  return { state, client, seed };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'true'); vi.stubEnv('PRIVY_APP_SECRET', 'isolated-test-placeholder');
  for (const prefix of ['TRUSTLEAF_CLINICAL_CREATE_ONCE_', 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_']) for (const suffix of ['WALLET', 'RELAYER', 'UNTIL']) vi.stubEnv(prefix + suffix, undefined);
  vi.stubEnv('RELAYER_SECRET', payer.secret()); vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING', JSON.stringify(keyring)); vi.stubEnv('TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID', 'test-kek');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe.each(['local', 'hosted'])('single authorized %s history creation', mode => {
  function scoped() {
    vi.stubEnv('TRUSTLEAF_ENV', 'local'); vi.stubEnv('VERCEL_ENV', ''); vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'false');
    const prefix = mode === 'local' ? 'TRUSTLEAF_CLINICAL_CREATE_ONCE_' : 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_';
    vi.stubEnv(prefix + 'WALLET', actor.address);
    vi.stubEnv(prefix + 'RELAYER', payer.publicKey());
    vi.stubEnv(prefix + 'UNTIL', String(Math.floor(Date.now()/1000)+480));
    if (mode === 'hosted') {
      vi.stubEnv('TRUSTLEAF_ENV', 'test'); vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('TRUSTLEAF_DATABASE_URL', 'postgres://fixture:fixture@ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech/fixture');
    }
  }
  it('prepares one selected creation with broad writes off and persists before submitting its exact signed envelope', async () => {
    const f=fixture(); scoped();
    await prepareClinicalOperation(user,actor,createInput);
    expect(f.state.row?.action).toBe('create_history'); expect(f.state.row?.signed_xdr).toBeNull();
    await signClinicalOperation(user,actor,ID,testSignature());
    expect(m.sponsor).toHaveBeenCalledTimes(1); expect(m.chain.submit).toHaveBeenCalledExactlyOnceWith(f.state.row!.signed_xdr);
    expect(f.state.row!.state).toBe('submitted');
    expect(f.state.events.slice(0,f.state.events.indexOf('RPC_SUBMIT')).filter(q=>q==='COMMIT')).toHaveLength(2);
  });
  it('passes the active policy deadline only to a new preparation and preserves the saved unsigned attempt', async () => {
    const f = fixture(); scoped();
    const prefix = mode === 'local' ? 'TRUSTLEAF_CLINICAL_CREATE_ONCE_' : 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_';
    const until = Number(process.env[prefix + 'UNTIL']);
    await prepareClinicalOperation(user, actor, createInput);
    expect(m.chain.prepare).toHaveBeenCalledWith(actor.address, 'create_history', expect.any(Object), undefined);
    const saved = { unsigned: f.state.row!.unsigned_xdr, hash: f.state.row!.signing_hash, expires: f.state.row!.expires_at };
    await prepareClinicalOperation(user, actor, createInput);
    expect({ unsigned: f.state.row!.unsigned_xdr, hash: f.state.row!.signing_hash, expires: f.state.row!.expires_at }).toEqual(saved);
    expect(m.chain.prepare).toHaveBeenCalledTimes(1); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it.each(['append_version', 'set_permissions'] as const)('rejects %s before encryption, preparation or a database transaction', async action => {
    const f=fixture(); scoped();
    await expect(prepareClinicalOperation(user,actor,{...createInput,action})).rejects.toThrow('clinical_create_once_scope_rejected');
    expect(m.connection).not.toHaveBeenCalled(); expect(m.seal).not.toHaveBeenCalled(); expect(m.chain.prepare).not.toHaveBeenCalled(); expect(f.state.row).toBeNull();
  });
  it('does not let another UUID consume a second slot, including after confirmation or cancellation', async () => {
    const f=fixture(); scoped(); await prepareClinicalOperation(user,actor,createInput);
    for (const state of ['awaiting_signature','confirmed','cancelled','failed']) {
      f.state.row!.state=state;
      await expect(prepareClinicalOperation(user,actor,{...createInput,requestId:'1f4929bd-48f9-4b9d-bde4-47f7b66a6d91'})).rejects.toThrow('clinical_create_once_already_used');
    }
    expect(m.chain.prepare).toHaveBeenCalledTimes(1); expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('rejects the real sponsored fee above 1 XLM before persisting or signing', async () => {
    const f=fixture(); scoped();
    m.chain.prepare.mockImplementation(async (source,action,expected)=>new TransactionBuilder(new Account(source,'100'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
      .addOperation(clinicalInvocation(action,expected)).setTimeout(180).setSorobanData(new SorobanDataBuilder().setResourceFee('6000001').build()).build());
    await expect(prepareClinicalOperation(user,actor,createInput)).rejects.toThrow('clinical_create_once_fee_exceeded');
    expect(f.state.row).toBeNull(); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('rejects a creation with only 81 seconds left without persisting or submitting, rather than reporting lost access', async () => {
    const f=fixture(); scoped();
    const prefix = mode === 'local' ? 'TRUSTLEAF_CLINICAL_CREATE_ONCE_' : 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_';
    vi.stubEnv(prefix+'UNTIL', String(Math.floor(Date.now()/1000)+81));
    await expect(prepareClinicalOperation(user,actor,createInput)).rejects.toMatchObject({ message:'clinical_create_once_window_too_short', status:409 });
    expect(f.state.row).toBeNull(); expect(f.state.history).toBeNull();
    expect(f.state.events).toContain('ROLLBACK'); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('rechecks the cap on a saved unsigned operation immediately before signing', async () => {
    const f=fixture(); scoped(); await prepareClinicalOperation(user,actor,createInput);
    const tx=new TransactionBuilder(new Account(actor.address,'100'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
      .addOperation(clinicalInvocation('create_history',f.state.row!.expected)).setTimeout(180).setSorobanData(new SorobanDataBuilder().setResourceFee('6000001').build()).build();
    Object.assign(f.state.row!,{unsigned_xdr:tx.toXDR(),signing_hash:tx.hash().toString('hex'),expires_at:Number(tx.timeBounds!.maxTime)});
    await expect(signClinicalOperation(user,actor,ID,patient.sign(tx.hash()).toString('hex'))).rejects.toThrow('clinical_create_once_fee_exceeded');
    expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('keeps historical receipt reads working when the scoped authority has expired', async () => {
    const f=fixture(); f.seed(); scoped(); f.state.receipt='SUCCESS';
    vi.stubEnv(mode === 'local' ? 'TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL' : 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_UNTIL',String(Math.floor(Date.now()/1000)-1));
    expect((await reconcileClinicalOperation(actor,ID)).operation.state).toBe('confirmed');
    expect(m.chain.submit).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('cannot cancel or retry an existing append through the creation exception', async () => {
    const f=fixture(true); f.seed('append_version'); scoped(); const saved=clone(f.state.row);
    await expect(cancelClinicalOperation(actor,ID)).rejects.toThrow('clinical_create_once_scope_rejected');
    await expect(reconcileClinicalOperation(actor,ID,true)).rejects.toThrow('clinical_create_once_scope_rejected');
    expect(f.state.row).toEqual(saved); expect(m.chain.submit).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled();
  });
});

describe('clinical operation preparation and private idempotency', () => {
  it('a rejected prepared fee budget rolls back without persisting an intent, requesting Privy or submitting', async () => {
    const f=fixture();
    m.chain.prepare.mockImplementation(async (source,action,expected) => {
      const tx=new TransactionBuilder(new Account(source,'100'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
        .addOperation(clinicalInvocation(action,expected)).setTimeout(180)
        .setSorobanData(new SorobanDataBuilder().setResourceFee('496000001').build()).build();
      assertClinicalUnsigned(tx,source,action,expected); return tx;
    });
    await expect(prepareClinicalOperation(user,actor,createInput)).rejects.toThrow('clinical_fee_budget_exceeded');
    expect(f.state.row).toBeNull(); expect(f.state.events.some(q=>q.startsWith('INSERT'))).toBe(false);
    expect(f.state.events).toContain('ROLLBACK'); expect(f.client.release).toHaveBeenCalledOnce();
    expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
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
    expect(m.chain.prepare).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled(); expect(f.state.row).toBeNull(); expect(f.client.release).toHaveBeenCalledOnce();
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
  it.each(['inactive', 'wallet-changed'])('rejects a medical target %s changed after preparing positive permissions', async condition => {
    const f = fixture(true);
    await prepareClinicalOperation(user, actor, { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: true, canAppend: false, expectedRevision: 0 });
    m.doctor.mockResolvedValue({ address: condition === 'wallet-changed' ? payer.publicKey() : doctor.publicKey(), doctor: { status: condition === 'inactive' ? 'revoked' : 'active' } });
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('doctor_not_authorized');
    expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
    expect(f.state.row!.state).toBe('awaiting_signature');
  });
  it('does not replace the original selected doctor behind an existing request UUID', async () => {
    const f = fixture(true); const input: ClinicalPrepareRequest = { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: true, canAppend: false, expectedRevision: 0 };
    await prepareClinicalOperation(user, actor, input); const saved = clone(f.state.row);
    await expect(prepareClinicalOperation(user, actor, { ...input, doctorId: 2 })).rejects.toThrow('clinical_request_conflict');
    expect(f.state.row).toEqual(saved); expect(m.doctor).toHaveBeenCalledTimes(1); expect(m.chain.prepare).toHaveBeenCalledTimes(1);
  });
  it.each(['wallet_binding_ambiguous', 'doctor_not_found'])('does not sign a positive grant when re-resolving its original target fails with %s', async failure => {
    const f = fixture(true);
    await prepareClinicalOperation(user, actor, { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: false, canAppend: true, expectedRevision: 0 });
    m.doctor.mockRejectedValue(Error(failure));
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow(failure);
    expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled(); expect(f.state.row!.state).toBe('awaiting_signature');
  });
  it('requires a persisted original target for a legacy unsigned positive grant', async () => {
    const f = fixture(true);
    await prepareClinicalOperation(user, actor, { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: false, canAppend: true, expectedRevision: 0 });
    expect(f.state.row!.expected.doctorId).toBe(1); delete f.state.row!.expected.doctorId;
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('clinical_saved_intent_invalid');
    expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('allows full withdrawal without requiring a still-active physician target', async () => {
    const f = fixture(true); m.chain.grant.mockResolvedValue({ canRead: true, canAppend: true, revision: 3 });
    await prepareClinicalOperation(user, actor, { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: false, canAppend: false, expectedRevision: 3 });
    m.doctor.mockRejectedValue(Error('isolated_doctor_no_longer_bound')); m.chain.doctorAuthorized.mockResolvedValue(false);
    const result = await signClinicalOperation(user, actor, ID, testSignature());
    expect(result.operation.state).toBe('submitted'); expect(f.state.row!.expected).toMatchObject({ doctorId: 1, canRead: false, canAppend: false });
    expect(m.doctor).toHaveBeenCalledTimes(1); expect(m.sponsor).toHaveBeenCalledOnce();
  });
  it('rechecks registry authorization before granting access with an unchanged active app target', async () => {
    fixture(true);
    await prepareClinicalOperation(user, actor, { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: true, canAppend: true, expectedRevision: 0 });
    m.chain.doctorAuthorized.mockResolvedValue(false);
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('doctor_not_authorized');
    expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
    expect(m.doctor).toHaveBeenLastCalledWith(expect.anything(), 1);
  });
  it.each(['inactive', 'wallet-changed'])('retains the exact uncertain grant when its target becomes %s', async condition => {
    const f = fixture(true);
    await prepareClinicalOperation(user, actor, { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: true, canAppend: false, expectedRevision: 0 });
    await signClinicalOperation(user, actor, ID, testSignature()); const saved = clone(f.state.row);
    m.doctor.mockResolvedValue({ address: condition === 'wallet-changed' ? payer.publicKey() : doctor.publicKey(), doctor: { status: condition === 'inactive' ? 'revoked' : 'active' } });
    m.sponsor.mockClear(); m.chain.submit.mockClear();
    const result = await reconcileClinicalOperation(actor, ID, true);
    expect(result.operation).toMatchObject({ state: 'submitted', errorCode: 'clinical_retry_unavailable', transactionHash: saved.transaction_hash });
    expect(f.state.row).toEqual(saved); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('allows exact successful receipt reconciliation of a legacy grant without another target lookup or signature', async () => {
    const f = fixture(true);
    await prepareClinicalOperation(user, actor, { requestId: ID, action: 'set_permissions', doctorId: 1, canRead: true, canAppend: false, expectedRevision: 0 });
    await signClinicalOperation(user, actor, ID, testSignature()); delete f.state.row!.expected.doctorId; f.state.receipt = 'SUCCESS';
    m.doctor.mockRejectedValue(Error('isolated_target_unavailable')); m.doctor.mockClear(); m.sponsor.mockClear(); m.chain.submit.mockClear();
    expect((await reconcileClinicalOperation(actor, ID)).operation.state).toBe('confirmed');
    expect(m.doctor).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
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
    const result = await signClinicalOperation(user, actor, ID, testSignature());
    expect(result.operation.state).toBe('submitted'); expect(m.sponsor).toHaveBeenCalledOnce(); expect(m.chain.submit).toHaveBeenCalledExactlyOnceWith(f.state.row!.signed_xdr);
    expect(f.state.events.indexOf('COMMIT')).toBeLessThan(f.state.events.indexOf('RPC_RECEIPT'));
    expect(f.state.events.indexOf('RELEASE_CLIENT')).toBeLessThan(f.state.events.indexOf('RPC_SUBMIT'));
    expect(f.client.query.mock.calls.some(([q]) => q.includes('signed_xdr=$2,transaction_hash=$3,state=\'submitted\''))).toBe(true);
  });
  it('rejects changed unsigned method/hash before sponsoring a received signature', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput); f.state.row!.signing_hash = '0'.repeat(64);
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('clinical_saved_intent_invalid');
    expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled(); expect(f.client.release).toHaveBeenCalledTimes(2);
  });
  it('does not persist or broadcast a signature from another owner', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput);
    testSignature = () => doctor.sign(Buffer.from(f.state.row!.signing_hash, 'hex')).toString('hex');
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('owner_signature_invalid');
    expect(f.state.row!.state).toBe('awaiting_signature'); expect(f.state.row!.signed_xdr).toBeNull(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('repeated sign clicks reuse the submitted envelope and do not sponsor a different envelope', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput);
    const first = await signClinicalOperation(user, actor, ID, testSignature());
    const second = await signClinicalOperation(user, actor, ID, testSignature());
    expect(second.operation.transactionHash).toBe(first.operation.transactionHash); expect(m.sponsor).toHaveBeenCalledOnce();
    expect(m.chain.submit.mock.calls.map(([xdr]) => xdr)).toEqual([f.state.row!.signed_xdr, f.state.row!.signed_xdr]);
  });
  it('an absent browser signature leaves no persisted or transmitted signature', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput); testSignature = () => '';
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('owner_signature_invalid');
    expect(f.state.row!.state).toBe('awaiting_signature'); expect(f.state.row!.signed_xdr).toBeNull(); expect(f.state.row!.transaction_hash).toBeNull();
    expect(m.chain.submit).not.toHaveBeenCalled(); expect(f.client.release).toHaveBeenCalledTimes(2);
  });
  it('GET-style reconciliation never resubmits while explicit retry uses the exact persisted envelope without signing again', async () => {
    const f = fixture(); const row = f.seed(); const before = clone(row);
    await reconcileClinicalOperation(actor, ID); expect(m.chain.submit).not.toHaveBeenCalled();
    await reconcileClinicalOperation(actor, ID, true); expect(m.chain.submit).toHaveBeenCalledExactlyOnceWith(before.signed_xdr);
    expect(f.state.row).toEqual(before); expect(m.chain.prepare).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('does not call a lost transmission response confirmed or create a replacement attempt', async () => {
    const f = fixture(); f.seed(); m.chain.submit.mockRejectedValue(Error('isolated_response_lost')); const hash = f.state.row!.transaction_hash;
    const result = await reconcileClinicalOperation(actor, ID, true); expect(result.operation.state).toBe('submitted'); expect(result.operation.transactionHash).toBe(hash);
    await reconcileClinicalOperation(actor, ID, true); expect(m.chain.submit.mock.calls.map(([xdr]) => xdr)).toEqual([f.state.row!.signed_xdr, f.state.row!.signed_xdr]); expect(m.sponsor).not.toHaveBeenCalled();
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
    await signClinicalOperation(user, actor, ID, testSignature()); f.state.receipt = 'SUCCESS';
    const e = f.state.row!.expected; f.state.version = { commitment: e.commitment, context: { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_CONTRACT, historyId, entryId: e.entryId, author: actor.address, patient: actor.address, version: 1, previousCommitment: null } };
    const result = await reconcileClinicalOperation(actor, ID);
    expect(result.operation.state).toBe('confirmed'); expect(Object.values(f.state.versions)).toHaveLength(1);
    expect(Object.values(f.state.versions)[0]).toMatchObject({ state: 'confirmed', transaction_hash: result.operation.transactionHash });
    expect(f.state.events.filter(e => e === 'SAVEPOINT clinical_storage')).toHaveLength(2);
    expect(f.state.events.filter(e => e === 'RELEASE SAVEPOINT clinical_storage')).toHaveLength(2);
    expect(f.state.events.filter(e => e === 'BEGIN')).toHaveLength(4);
  });
  it('rolls back storage and releases the connection without confirming when the encrypted save fails', async () => {
    const f = fixture(true); await prepareClinicalOperation(user, actor, appendInput); await signClinicalOperation(user, actor, ID, testSignature());
    f.state.receipt = 'SUCCESS'; f.state.failStorage = true; const e = f.state.row!.expected;
    f.state.version = { commitment: e.commitment, context: { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_CONTRACT, historyId, entryId: e.entryId, author: actor.address, patient: actor.address, version: 1, previousCommitment: null } };
    await expect(reconcileClinicalOperation(actor, ID)).rejects.toThrow('isolated_storage_failure');
    expect(f.state.events).toContain('ROLLBACK TO SAVEPOINT clinical_storage'); expect(f.state.row!.state).toBe('submitted'); expect(Object.keys(f.state.versions)).toHaveLength(0); expect(f.client.release).toHaveBeenCalledTimes(4);
  });
  it('cancelled or expired unsigned signatures cannot be broadcast', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, createInput); await cancelClinicalOperation(actor, ID);
    const result = await signClinicalOperation(user, actor, ID, testSignature()); expect(result.operation.state).toBe('cancelled'); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
    const expired = fixture(); await prepareClinicalOperation(user, actor, createInput); expired.state.row!.expires_at = Math.floor(Date.now()/1000)-1;
    expect((await reconcileClinicalOperation(actor, ID, true)).operation.state).toBe('cancelled'); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('turning writes off prevents preparation, signing and transmission but permits receipt reconciliation', async () => {
    const f = fixture(); f.seed(); vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'false');
    await expect(prepareClinicalOperation(user, actor, createInput)).rejects.toThrow('private_writes_paused');
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('private_writes_paused');
    expect((await reconcileClinicalOperation(actor, ID, true)).operation.state).toBe('submitted');
    expect(m.chain.prepare).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it.each(['missing', 'rotated'])('audits an exact successful saved receipt when the current relayer is %s', async condition => {
    const f = fixture(); f.seed(); f.state.receipt = 'SUCCESS';
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'false'); vi.stubEnv('RELAYER_SECRET', condition === 'missing' ? '' : doctor.secret());
    const result = await reconcileClinicalOperation(actor, ID);
    expect(result.operation.state).toBe('confirmed'); expect(result.operation.transactionHash).toBe(f.state.row!.transaction_hash);
    expect(m.chain.receipt).toHaveBeenCalledOnce(); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it.each(['missing', 'rotated'])('does not retransmit an uncertain saved envelope when the current relayer is %s', async condition => {
    const f = fixture(); const saved = clone(f.seed()); vi.stubEnv('RELAYER_SECRET', condition === 'missing' ? '' : doctor.secret());
    const result = await reconcileClinicalOperation(actor, ID, true);
    expect(result.operation.state).toBe('submitted'); expect(f.state.row).toEqual(saved);
    expect(m.chain.receipt).toHaveBeenCalledOnce(); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('still rejects a different successful envelope after relayer rotation', async () => {
    const f = fixture(); f.seed(); f.state.receipt = 'SUCCESS'; f.state.wrongReceipt = true; vi.stubEnv('RELAYER_SECRET', doctor.secret());
    await expect(reconcileClinicalOperation(actor, ID)).rejects.toThrow('clinical_receipt_mismatch');
    expect(f.state.row!.state).toBe('submitted'); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('expired uncertain attempts retain the exact hash and never submit again', async () => {
    const f = fixture(); f.seed(); f.state.row!.expires_at = Math.floor(Date.now()/1000)-1;
    expect((await reconcileClinicalOperation(actor, ID, true)).operation.state).toBe('submitted'); expect(m.chain.submit).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('releases and rolls back after a provider receipt error while retaining the durable attempt', async () => {
    const f = fixture(); f.seed(); f.state.rpcFailure = true; const before = clone(f.state.row);
    await expect(reconcileClinicalOperation(actor, ID)).rejects.toThrow('isolated_rpc_unavailable');
    expect(f.state.row).toEqual(before); expect(f.state.events).toContain('ROLLBACK'); expect(f.client.release).toHaveBeenCalledOnce(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
});


describe('continuous owner recording operations',()=>{
  function demo(){
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false');vi.stubEnv('TRUSTLEAF_ENV','test');vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK','testnet');
    vi.stubEnv('TRUSTLEAF_DATABASE_URL','postgres://fixture:fixture@ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech/fixture');
    vi.stubEnv('TRUSTLEAF_CLINICAL_PATIENT_DEMO_ENABLED','true');vi.stubEnv('TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS',actor.address);vi.stubEnv('TRUSTLEAF_CLINICAL_PATIENT_DEMO_RELAYER',payer.publicKey());
  }
  const previous=(count:number)=>Array.from({length:count},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`}));
  it('creates the selected history without broad writes and without submitting before the patient signs',async()=>{
    const f=fixture();demo();await prepareClinicalOperation(user,actor,createInput);
    expect(f.state.row).toMatchObject({action:'create_history',state:'awaiting_signature',signed_xdr:null});
    expect(m.sponsor).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
    await signClinicalOperation(user,actor,ID,testSignature());expect(m.chain.submit).toHaveBeenCalledExactlyOnceWith(f.state.row!.signed_xdr);
  });
  it('allows a patient note or file contribution and enforces the real cap before encryption is committed',async()=>{
    const f=fixture(true);demo();await prepareClinicalOperation(user,actor,appendInput);
    expect(f.state.row).toMatchObject({action:'append_version',expected:{author:actor.address,patient:actor.address}});expect(m.seal).toHaveBeenCalledOnce();
    await signClinicalOperation(user,actor,ID,testSignature());expect(m.chain.submit).toHaveBeenCalledOnce();
  });
  it('allows the twentieth persisted slot and its same-ID signing/reconciliation, but rejects slot twenty-one',async()=>{
    const f=fixture();demo();f.state.quotaRows=previous(19);await prepareClinicalOperation(user,actor,createInput);
    await prepareClinicalOperation(user,actor,createInput);expect(m.chain.prepare).toHaveBeenCalledOnce();
    await signClinicalOperation(user,actor,ID,testSignature());await reconcileClinicalOperation(actor,ID);
    expect(m.sponsor).toHaveBeenCalledOnce();expect(m.chain.submit).toHaveBeenCalledOnce();
    for(const state of ['confirmed','failed','cancelled']){
      f.state.row!.state=state;
      await expect(prepareClinicalOperation(user,actor,{...createInput,requestId:'1f4929bd-48f9-4b9d-bde4-47f7b66a6d91'})).rejects.toMatchObject({message:'clinical_patient_demo_quota_exceeded',status:409});
    }
    expect(m.chain.prepare).toHaveBeenCalledOnce();
  });
  it('counts cancelled and failed historical slots without resetting the lifetime quota',async()=>{
    const f=fixture();demo();f.state.quotaRows=previous(20);
    await expect(prepareClinicalOperation(user,actor,createInput)).rejects.toThrow('clinical_patient_demo_quota_exceeded');
    expect(f.state.row).toBeNull();expect(m.chain.prepare).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('takes the existing wallet transaction lock before counting or inserting a new slot',async()=>{
    const f=fixture();demo();await prepareClinicalOperation(user,actor,createInput);
    const lock=f.state.events.findIndex(q=>q.includes('pg_advisory_xact_lock'));
    const quota=f.state.events.findIndex(q=>q.startsWith('SELECT id FROM clinical_web_operations'));
    const insert=f.state.events.findIndex(q=>q.startsWith('INSERT INTO clinical_web_operations'));
    expect(lock).toBeGreaterThanOrEqual(0);expect(quota).toBeGreaterThan(lock);expect(insert).toBeGreaterThan(quota);
  });
  it('keeps permission changes and another wallet blocked before opening a database transaction',async()=>{
    fixture();demo();await expect(prepareClinicalOperation(user,actor,{...createInput,action:'set_permissions'})).rejects.toThrow();
    await expect(prepareClinicalOperation(user,{...actor,address:doctor.publicKey()},createInput)).rejects.toThrow();
    expect(m.connection).not.toHaveBeenCalled();expect(m.chain.prepare).not.toHaveBeenCalled();
  });
  it('retains author ownership checks for corrections in continuous mode',async()=>{
    const f=fixture(true);demo();f.state.head={author:doctor.publicKey(),headVersion:1};
    await expect(prepareClinicalOperation(user,actor,{...appendInput,entryId:'a'.repeat(64),expectedVersion:1})).rejects.toThrow('clinical_version_conflict');
    expect(f.state.row).toBeNull();expect(m.seal).not.toHaveBeenCalled();
  });
  it('rejects an oversized fee before persisting or sponsoring a patient contribution',async()=>{
    const f=fixture(true);demo();m.chain.prepare.mockImplementation(async(source,action,expected)=>new TransactionBuilder(new Account(source,'100'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).addOperation(clinicalInvocation(action,expected)).setTimeout(180).setSorobanData(new SorobanDataBuilder().setResourceFee('6000001').build()).build());
    await expect(prepareClinicalOperation(user,actor,appendInput)).rejects.toThrow('clinical_create_once_fee_exceeded');
    expect(f.state.row).toBeNull();expect(m.sponsor).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('recovers an uncertain response using the same persisted signed envelope and no second sponsorship',async()=>{
    const f=fixture();demo();await prepareClinicalOperation(user,actor,createInput);f.state.rpcFailure=true;
    await expect(signClinicalOperation(user,actor,ID,testSignature())).rejects.toThrow('isolated_rpc_unavailable');
    const saved=f.state.row!.signed_xdr,hash=f.state.row!.transaction_hash;expect(f.state.row!.state).toBe('submitted');
    f.state.rpcFailure=false;await reconcileClinicalOperation(actor,ID);expect(m.chain.submit).not.toHaveBeenCalled();
    await reconcileClinicalOperation(actor,ID,true);expect(m.chain.submit).toHaveBeenCalledExactlyOnceWith(saved);
    expect(f.state.row!.transaction_hash).toBe(hash);expect(m.sponsor).toHaveBeenCalledOnce();expect(m.chain.prepare).toHaveBeenCalledOnce();
  });
  it('can still cancel the last unsigned slot without creating a replacement',async()=>{
    const f=fixture();demo();f.state.quotaRows=previous(19);await prepareClinicalOperation(user,actor,createInput);
    expect((await cancelClinicalOperation(actor,ID)).operation.state).toBe('cancelled');expect(m.chain.submit).not.toHaveBeenCalled();
    await expect(prepareClinicalOperation(user,actor,{...createInput,requestId:'1f4929bd-48f9-4b9d-bde4-47f7b66a6d91'})).rejects.toThrow('clinical_patient_demo_quota_exceeded');
  });
});


describe('medical append uses the author wallet and the selected patient permission', () => {
  const selectedHistory = deriveClinicalHistoryId(doctor.publicKey());
  const medicalInput: ClinicalPrepareRequest = { ...appendInput, historyId: selectedHistory };
  function medicalFixture() {
    const f = fixture(true);
    f.state.historyPatient = doctor.publicKey();
    m.chain.history.mockImplementation(async () => ({ id: selectedHistory, patient: doctor.publicKey(), createdAt: 1 }));
    m.context.mockResolvedValue({ historyId: selectedHistory, doctorId: 7, canRead: false, canAppend: true, grantRevision: 3 });
    return f;
  }
  it('prepares and signs an append-only doctor note without reading patient content', async () => {
    const f = medicalFixture();
    await prepareClinicalOperation(user, actor, medicalInput);
    expect(f.state.row!.expected).toMatchObject({ historyId: selectedHistory, patient: doctor.publicKey(), author: actor.address,
      expectedGrantRevision: 3, expectedVersion: 0 });
    expect(f.state.row!.source_wallet).toBe(actor.address);
    expect(JSON.stringify(f.state.row)).not.toContain(note.text);
    const result = await signClinicalOperation(user, actor, ID, testSignature());
    expect(result.operation.state).toBe('submitted');
    expect(m.chain.submit).toHaveBeenCalledOnce();
    expect(m.chain.version).not.toHaveBeenCalled();
  });
  it('shares only the current request deployment reader while checking medical permissions before and after signing',async()=>{
    medicalFixture();await prepareClinicalOperation(user,actor,medicalInput);
    expect(m.context).toHaveBeenCalledTimes(2);
    for(const call of m.context.mock.calls)expect(call[3]).toBe(m.chain);
    m.context.mockClear();await signClinicalOperation(user,actor,ID,testSignature());
    expect(m.context.mock.calls.length).toBeGreaterThanOrEqual(2);
    for(const call of m.context.mock.calls)expect(call[3]).toBe(m.chain);
  });
  it('still rejects permission withdrawn between the two signing observations when the deployment reader is reused',async()=>{
    const f=medicalFixture();await prepareClinicalOperation(user,actor,medicalInput);
    m.context.mockReset();m.context.mockResolvedValueOnce({doctorId:7,canRead:false,canAppend:true,grantRevision:3}).mockResolvedValue({doctorId:7,canRead:false,canAppend:false,grantRevision:4});
    await expect(signClinicalOperation(user,actor,ID,testSignature())).rejects.toThrow('clinical_permission_conflict');
    expect(f.state.row!.signed_xdr).toBeNull();expect(m.sponsor).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('uses one deployment reader for signing and its initial send, while a later retry gets a fresh reader',async()=>{
    const f=medicalFixture();await prepareClinicalOperation(user,actor,medicalInput);m.factory.mockClear();
    await signClinicalOperation(user,actor,ID,testSignature());expect(m.factory).toHaveBeenCalledTimes(1);
    m.factory.mockClear();await reconcileClinicalOperation(actor,ID,true,user);expect(m.factory).toHaveBeenCalledTimes(1);
    expect(f.state.row!.signed_xdr).not.toBeNull();expect(m.sponsor).toHaveBeenCalledOnce();
  });
  it('cannot use a read-only grant to prepare a contribution', async () => {
    const f = medicalFixture(); m.context.mockResolvedValue({ doctorId: 7, canRead: true, canAppend: false, grantRevision: 3 });
    await expect(prepareClinicalOperation(user, actor, medicalInput)).rejects.toThrow('clinical_access_denied');
    expect(f.state.row).toBeNull(); expect(m.chain.prepare).not.toHaveBeenCalled();
  });
  it('does not let a doctor overwrite an entry by the patient or another doctor', async () => {
    const f = medicalFixture(); f.state.head = { author: doctor.publicKey(), headVersion: 1 };
    await expect(prepareClinicalOperation(user, actor, { ...medicalInput, entryId: 'cd'.repeat(32), expectedVersion: 1 })).rejects.toThrow('clinical_version_conflict');
    expect(f.state.row).toBeNull(); expect(m.seal).not.toHaveBeenCalled();
  });
  it('supports a new version of the doctor own entry and preserves its previous commitment', async () => {
    const f = medicalFixture(); f.state.head = { author: actor.address, headVersion: 1 }; f.state.version = { commitment: '6'.repeat(64) };
    await prepareClinicalOperation(user, actor, { ...medicalInput, entryId: 'cd'.repeat(32), expectedVersion: 1 });
    expect(f.state.row!.expected).toMatchObject({ patient: doctor.publicKey(), author: actor.address, expectedVersion: 1, previousCommitment: '6'.repeat(64), expectedGrantRevision: 3 });
  });
  it('rechecks a withdrawal before signing without saving or sending a signature', async () => {
    const f = medicalFixture(); await prepareClinicalOperation(user, actor, medicalInput);
    m.context.mockRejectedValue(new Error('clinical_context_unavailable'));
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('clinical_context_unavailable');
    expect(f.state.row!.signed_xdr).toBeNull(); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('rejects a changed permission revision even when append remains granted', async () => {
    medicalFixture(); await prepareClinicalOperation(user, actor, medicalInput);
    m.context.mockResolvedValue({ doctorId: 7, canRead: true, canAppend: true, grantRevision: 4 });
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('clinical_permission_conflict');
    expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('rechecks permission after preparing the unsigned transaction and rolls back if changed', async () => {
    const f = medicalFixture(); m.context.mockResolvedValueOnce({ doctorId: 7, canRead: true, canAppend: true, grantRevision: 3 })
      .mockResolvedValue({ doctorId: 7, canRead: true, canAppend: false, grantRevision: 4 });
    await expect(prepareClinicalOperation(user, actor, medicalInput)).rejects.toThrow('clinical_permission_conflict');
    expect(f.state.row).toBeNull(); expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('preserves a signed uncertain attempt when permissions are withdrawn before retry', async () => {
    const f = medicalFixture(); await prepareClinicalOperation(user, actor, medicalInput);
    await signClinicalOperation(user, actor, ID, testSignature()); const original = clone(f.state.row);
    m.chain.submit.mockClear(); m.context.mockRejectedValue(new Error('clinical_context_unavailable'));
    const result = await reconcileClinicalOperation(actor, ID, true, user);
    expect(result.operation.errorCode).toBe('clinical_retry_unavailable'); expect(f.state.row).toEqual(original);
    expect(m.chain.submit).not.toHaveBeenCalled(); expect(m.sponsor).toHaveBeenCalledOnce();
  });
  it.each(['sign', 'retry'])('does not extend a restricted patient demo to a saved doctor %s', async action => {
    const f = medicalFixture(); await prepareClinicalOperation(user, actor, medicalInput);
    if (action === 'retry') await signClinicalOperation(user, actor, ID, testSignature());
    const original = clone(f.state.row); m.sponsor.mockClear(); m.chain.submit.mockClear();
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false'); vi.stubEnv('TRUSTLEAF_ENV','test'); vi.stubEnv('VERCEL_ENV','production'); vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK','testnet');
    vi.stubEnv('TRUSTLEAF_DATABASE_URL','postgres://fixture:fixture@ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech/fixture');
    vi.stubEnv('TRUSTLEAF_CLINICAL_PATIENT_DEMO_ENABLED','true'); vi.stubEnv('TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS',actor.address); vi.stubEnv('TRUSTLEAF_CLINICAL_PATIENT_DEMO_RELAYER',payer.publicKey());
    await expect(action === 'sign' ? signClinicalOperation(user, actor, ID, testSignature()) : reconcileClinicalOperation(actor, ID, true, user)).rejects.toThrow('clinical_access_denied');
    expect(f.state.row).toEqual(original); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('binds a reused UUID to its original selected patient', async () => {
    const f = medicalFixture(); await prepareClinicalOperation(user, actor, medicalInput); const original = clone(f.state.row);
    await expect(prepareClinicalOperation(user, actor, { ...medicalInput, historyId: 'ef'.repeat(32) })).rejects.toThrow('clinical_request_conflict');
    expect(f.state.row).toEqual(original);
  });
  it('revalidates a linked prescription before signing and keeps the link encrypted', async () => {
    const f = medicalFixture(); const id = '20000000-0000-4000-8000-000000000002'; m.rx.mockResolvedValue({ id });
    await prepareClinicalOperation(user, actor, { ...medicalInput, note: { ...note, prescriptionId: id } });
    expect(JSON.stringify(f.state.row)).not.toContain(id);
    expect(m.rx).toHaveBeenCalledWith(user, actor, doctor.publicKey(), id);
    m.rx.mockRejectedValue(new Error('clinical_prescription_unavailable'));
    await expect(signClinicalOperation(user, actor, ID, testSignature())).rejects.toThrow('clinical_prescription_unavailable');
    expect(f.state.row!.signed_xdr).toBeNull(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it.each(['private_operations', 'clinical_transaction_attempts', 'clinical_web_operations'])('shares source exclusion with %s', async table => {
    const f = medicalFixture(); f.state.queue = table;
    await expect(prepareClinicalOperation(user, actor, medicalInput)).rejects.toThrow('another_operation_pending');
    expect(f.state.row).toBeNull(); expect(m.context).not.toHaveBeenCalled();
  });
  function aggregateFixture(){
    const f=medicalFixture();
    const step={key:'append_pdf',actor:'doctor',action:'append_version',requestId:ID,operationId:opId,maxFeeStroops:'150000000',input:medicalInput};
    const plan={schemaVersion:2,runId:'00000000-0000-4000-8000-000000000001',historyId:selectedHistory,patient:{...actor,address:doctor.publicKey(),userId:'did:privy:selected'},doctor:actor,startingGrantRevision:2,steps:[step],authorization:{requestId:'00000000-0000-4000-8000-000000000002'},aggregateBudget:{approvedAt:1}};
    const policy={mode:'rehearsal',wallet:actor.address,relayer:payer.publicKey(),until:Math.floor(Date.now()/1000)+600,plan};
    vi.spyOn(writeScope,'assertClinicalWriteScope').mockReturnValue(policy as any);
    vi.spyOn(writeScope,'clinicalCreateOnceConfigured').mockReturnValue(true);
    vi.spyOn(writeScope,'assertClinicalCreateOnceFee').mockImplementation(()=>{});
    vi.spyOn(writeScope,'assertClinicalCreateOnceSavedFee').mockImplementation(()=>{});
    vi.spyOn(rehearsalFunctions,'assertClinicalRehearsalOrder').mockImplementation(async client=>{await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['clinical-rehearsal:'+plan.runId]);});
    vi.spyOn(rehearsalFunctions,'assertClinicalRehearsalAuthorization').mockImplementation(()=>{});
    vi.spyOn(rehearsalFunctions,'assertClinicalRehearsalFee').mockImplementation(()=>{});
    m.chain.doctorAuthorization=vi.fn(async()=>({}));
    m.aggregate.mockImplementation(async()=>{f.state.events.push('AGGREGATE_CHECK');});
    return f;
  }

  function draftAggregateFixture() {
    const f=aggregateFixture(),draftId='60000000-0000-4000-8000-000000000001';
    const context={schemaVersion:1 as const,network:'testnet' as const,contractId:CLINICAL_CONTRACT,draftId,
      authorUserId:actor.userId,authorWalletId:actor.walletId,author:actor.address,historyId:selectedHistory,
      patient:doctor.publicKey(),entryId:null,expectedVersion:null,revision:1};
    f.state.draft={id:draftId,owner_user_id:actor.userId,wallet_id:actor.walletId,author_wallet:actor.address,
      contract_id:CLINICAL_CONTRACT,network:'testnet',history_id:selectedHistory,patient_wallet:doctor.publicKey(),
      entry_id:null,expected_version:null,revision:1,envelope:sealDraft(context,{note},{activeKeyId:'test-kek',keyring}),
      publication_request_id:null,deleted_at:null};
    return {...f,input:{...medicalInput,draftId,draftRevision:1},draftContext:context};
  }
  it('publishes an exact approved draft then signs and recovers the same HMAC-bound intent and envelope',async()=>{
    const f=draftAggregateFixture();await prepareClinicalOperation(user,actor,f.input);
    expect(f.state.draft!.publication_request_id).toBe(ID);
    expect(f.state.row!.request_fingerprint).toBe(requestFingerprint(f.input));
    const originalUnsigned=f.state.row!.unsigned_xdr,originalFingerprint=f.state.row!.request_fingerprint;
    await prepareClinicalOperation(user,actor,f.input); // Lost prepare response: one original UUID and draft revision.
    await signClinicalOperation(user,actor,ID,testSignature());
    expect(m.sponsor).toHaveBeenCalledOnce();expect(m.chain.submit).toHaveBeenCalledOnce();
    const signed=f.state.row!.signed_xdr,hash=f.state.row!.transaction_hash;
    await reconcileClinicalOperation(actor,ID,true,user);
    expect(m.sponsor).toHaveBeenCalledOnce();expect(m.chain.submit).toHaveBeenLastCalledWith(signed);
    expect(f.state.row).toMatchObject({unsigned_xdr:originalUnsigned,request_fingerprint:originalFingerprint,signed_xdr:signed,transaction_hash:hash});
  });
  it('rejects a foreign or stale encrypted draft before preparing or inserting the approved intent',async()=>{
    for(const patch of [{owner_user_id:'did:privy:other'},{wallet_id:'other-wallet'},{author_wallet:doctor.publicKey()},{revision:2}]){
      const f=draftAggregateFixture();Object.assign(f.state.draft!,patch);
      await expect(prepareClinicalOperation(user,actor,f.input)).rejects.toThrow(/clinical_draft/);
      expect(f.state.row).toBeNull();expect(m.chain.prepare).not.toHaveBeenCalled();expect(m.sponsor).not.toHaveBeenCalled();
    }
  });
  it('refuses a changed server draft UUID/revision/publication binding before any relayer signature',async()=>{
    for(const patch of [{id:'60000000-0000-4000-8000-000000000002'},{revision:2},{publication_request_id:null},{patient_wallet:actor.address},{owner_user_id:'did:privy:other'}]){
      const f=draftAggregateFixture();await prepareClinicalOperation(user,actor,f.input);Object.assign(f.state.draft!,patch);
      await expect(signClinicalOperation(user,actor,ID,testSignature())).rejects.toThrow('clinical_rehearsal_scope_rejected');
      expect(f.state.row!.signed_xdr).toBeNull();expect(m.sponsor).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
    }
  });
  it('rechecks decrypted draft content after preparation, rather than trusting matching metadata alone',async()=>{
    const f=draftAggregateFixture();await prepareClinicalOperation(user,actor,f.input);
    f.state.draft!.envelope=sealDraft(f.draftContext,{note:{...note,text:'altered private draft'}},{activeKeyId:'test-kek',keyring});
    await expect(signClinicalOperation(user,actor,ID,testSignature())).rejects.toThrow('clinical_draft_conflict');
    expect(f.state.row!.signed_xdr).toBeNull();expect(m.sponsor).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
  });

  it('aggregate denial rolls back preparation before INSERT or any signature',async()=>{
    const f=aggregateFixture();m.aggregate.mockImplementation(async()=>{f.state.events.push('AGGREGATE_DENIED');throw Error('clinical_rehearsal_budget_exceeded');});
    await expect(prepareClinicalOperation(user,actor,medicalInput)).rejects.toThrow('clinical_rehearsal_budget_exceeded');
    expect(f.state.row).toBeNull();expect(f.state.events).toContain('ROLLBACK');
    expect(f.state.events.some(sql=>sql.startsWith('INSERT INTO clinical_web_operations'))).toBe(false);
    expect(f.state.events.findIndex(sql=>sql.includes('pg_advisory_xact_lock')&&sql.includes('$1'))).toBeLessThan(f.state.events.indexOf('AGGREGATE_DENIED'));
    expect(m.sponsor).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('aggregate denial before sponsoring leaves the same unsigned intent unchanged',async()=>{
    const f=aggregateFixture();await prepareClinicalOperation(user,actor,medicalInput);const saved=clone(f.state.row);
    m.aggregate.mockRejectedValue(Error('clinical_rehearsal_budget_exceeded'));
    await expect(signClinicalOperation(user,actor,ID,testSignature())).rejects.toThrow('clinical_rehearsal_budget_exceeded');
    expect(f.state.row).toEqual(saved);expect(f.state.row!.signed_xdr).toBeNull();expect(m.sponsor).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('a final aggregate denial preserves one signed hash and permits only recovery of that same envelope',async()=>{
    const f=aggregateFixture();await prepareClinicalOperation(user,actor,medicalInput);
    m.aggregate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('clinical_rehearsal_budget_unavailable'));
    const result=await signClinicalOperation(user,actor,ID,testSignature());
    expect(result.operation.state).toBe('submitted');expect(m.chain.submit).not.toHaveBeenCalled();expect(m.sponsor).toHaveBeenCalledOnce();
    const saved=clone(f.state.row);m.aggregate.mockResolvedValue(undefined);
    await reconcileClinicalOperation(actor,ID,true,user);
    expect(m.chain.submit).toHaveBeenCalledExactlyOnceWith(saved.signed_xdr);expect(f.state.row!.transaction_hash).toBe(saved.transaction_hash);expect(f.state.row!.unsigned_xdr).toBe(saved.unsigned_xdr);expect(m.sponsor).toHaveBeenCalledOnce();
  });

});

vi.mock('@/lib/clinical/sponsorship', () => ({ assertClinicalSponsorshipConfigured: vi.fn(), reserveClinicalSponsorship: vi.fn(), assertClinicalSponsorshipSign: vi.fn(), bindClinicalSponsorshipSubmission: vi.fn(), cancelClinicalSponsorship: vi.fn(), reconcileClinicalSponsorship: vi.fn() }));

describe('Digital and Cabs correction and withdrawal', () => {
  function continuationFixture() {
    const f = fixture(true);
    const author: ClinicalActor = { userId: 'did:privy:synthetic_doctor', walletId: 'synthetic_doctor_wallet', address: doctor.publicKey() };
    const authorUser = { userId: author.userId, email: 'synthetic-doctor@example.test' };
    const requestId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const pdfBytes = Buffer.from('%PDF-1.4\n%%EOF\n');
    const pdf = { mediaType: 'application/pdf' as const, fileName: 'synthetic.pdf', byteLength: pdfBytes.length,
      sha256: createHash('sha256').update(pdfBytes).digest('hex') };
    const openedAt = Math.floor(Date.now() / 1000) - 1;
    function confirmedContribution(id: string, operationId: string, hash: string, content: Buffer, metadata: { fileName: string; mediaType: string }) {
      const entryId = deriveClinicalEntryId(historyId, author.address, operationId);
      const context = { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_CONTRACT, historyId, entryId,
        author: author.address, patient: actor.address, version: 1, previousCommitment: null };
      const sealed = sealClinicalVersion({ context, content, metadata, keyring, activeKeyId: 'test-kek' });
      return { id, state: 'confirmed', transaction_hash: hash, action: 'append_version', method: 'append_version',
        actor_user_id: author.userId, wallet_id: author.walletId, source_wallet: author.address, contract_id: CLINICAL_CONTRACT, network: 'testnet',
        prepared_envelope: sealed.envelope, expected: { historyId, patient: actor.address, author: author.address, entryId, operationId,
          expectedVersion: 0, expectedGrantRevision: 1, previousCommitment: null, commitment: sealed.commitment } };
    }
    const original = confirmedContribution(requestId(2), '2'.repeat(64), 'a'.repeat(64), Buffer.from(JSON.stringify(note)),
      { fileName: 'antecedente.json', mediaType: 'application/json' });
    const attachment = confirmedContribution(requestId(3), '3'.repeat(64), 'b'.repeat(64), pdfBytes,
      { fileName: pdf.fileName, mediaType: pdf.mediaType });
    const grant = { id: requestId(1), state: 'confirmed', transaction_hash: 'c'.repeat(64), action: 'set_permissions', method: 'set_permissions',
      actor_user_id: actor.userId, wallet_id: actor.walletId, source_wallet: actor.address, contract_id: CLINICAL_CONTRACT, network: 'testnet',
      expected: { historyId, patient: actor.address, doctorId: 9, doctor: author.address, operationId: '1'.repeat(64),
        expectedRevision: 0, canRead: true, canAppend: true } };
    const prescriptionId = requestId(7);
    const correction = { requestId: requestId(4), operationId: '4'.repeat(64), entryId: original.expected.entryId,
      previousCommitment: original.expected.commitment, note: { ...note, prescriptionId } };
    const revocation = { requestId: requestId(5), operationId: '5'.repeat(64) };
    const plan: ClinicalCapturePlan = { schemaVersion: 2, runId: requestId(6), openedAt, until: openedAt + 600, network: 'testnet',
      contractId: CLINICAL_CONTRACT, registryId: 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2',
      relayer: payer.publicKey(), patient: actor, doctor: author, historyId, doctorId: 9, doctorValidUntil: openedAt + 3600,
      grantRequestId: grant.id, noteRequestId: original.id, pdfRequestId: attachment.id, note, pdf,
      grantTransactionHash: grant.transaction_hash, noteTransactionHash: original.transaction_hash,
      continuation: { correction, revocation, pdfTransactionHash: attachment.transaction_hash }, policyHash: 'e'.repeat(64) };
    const proofs: Array<Record<string, any>> = [grant, original, attachment];
    const query = f.client.query.getMockImplementation()!;
    f.client.query.mockImplementation(async (sql, values = []) => {
      if (sql.startsWith('SELECT * FROM clinical_web_operations WHERE id=ANY')) {
        return { rows: [...proofs, ...(f.state.row ? [f.state.row] : [])].filter(row => values[0].includes(row.id)) };
      }
      if (sql.startsWith('SELECT id FROM clinical_web_operations WHERE source_wallet=')) {
        return { rows: [...proofs, ...(f.state.row ? [f.state.row] : [])]
          .filter(row => row.source_wallet === values[0] && row.action === values[2]).map(row => ({ id: row.id })) };
      }
      return query(sql, values);
    });
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'false');
    vi.spyOn(writeScope, 'assertClinicalWriteScope').mockImplementation((_action, wallet) => ({ mode: 'capture', wallet, plan, until: plan.until, relayer: plan.relayer }));
    vi.spyOn(writeScope, 'assertClinicalCreateOnceFee').mockImplementation(() => {});
    m.chain.doctorAuthorization = vi.fn(async () => ({ version: 1, validUntil: plan.doctorValidUntil, revoked: false }));
    m.chain.grant.mockResolvedValue({ revision: 1, canRead: true, canAppend: true });
    m.chain.entry.mockResolvedValue({ headVersion: 1, author: author.address });
    m.chain.version.mockResolvedValue({ commitment: correction.previousCommitment });
    m.context.mockResolvedValue({ historyId, doctorId: 9, grantRevision: 1, canRead: true, canAppend: true });
    m.rx.mockResolvedValue({ id: prescriptionId });
    const edit: ClinicalPrepareRequest = { requestId: correction.requestId, action: 'append_version', historyId,
      entryId: correction.entryId, expectedVersion: 1, note: correction.note };
    const revoke: ClinicalPrepareRequest = { requestId: revocation.requestId, action: 'set_permissions', doctorId: 9,
      expectedRevision: 1, canRead: false, canAppend: false };
    return { f, plan, author, authorUser, edit, revoke, proofs, attachment, prescriptionId };
  }

  it('preserves grant revision 1 until the exact note correction is confirmed, then prepares only the fixed withdrawal', async () => {
    const c = continuationFixture();
    await expect(prepareClinicalOperation(user, actor, c.revoke)).rejects.toThrow('clinical_rehearsal_order_conflict');
    expect(m.chain.prepare).not.toHaveBeenCalled();
    await prepareClinicalOperation(c.authorUser, c.author, c.edit);
    expect(c.f.state.row?.expected).toMatchObject({ expectedVersion: 1, entryId: c.edit.entryId,
      previousCommitment: c.plan.continuation!.correction.previousCommitment, operationId: c.plan.continuation!.correction.operationId });
    expect(m.rx).toHaveBeenCalledWith(c.authorUser, c.author, actor.address, c.prescriptionId);
    expect(JSON.stringify(c.f.state.row)).not.toContain(c.prescriptionId);
    await expect(prepareClinicalOperation(user, actor, c.revoke)).rejects.toThrow('clinical_rehearsal_order_conflict');
    c.proofs.push({ ...c.f.state.row!, state: 'confirmed', transaction_hash: 'd'.repeat(64) });
    c.f.state.row = null;
    await prepareClinicalOperation(user, actor, c.revoke);
    expect(c.f.state.row?.expected).toMatchObject({ expectedRevision: 1, canRead: false, canAppend: false,
      operationId: c.plan.continuation!.revocation.operationId });
    expect(c.f.client.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [`clinical-capture:${historyId}`]);
    await expect(prepareClinicalOperation(c.authorUser, c.author, c.edit)).rejects.toThrow('clinical_rehearsal_order_conflict');
  });

  it('rejects an inaccessible prescription or absent read permission before preparing an envelope', async () => {
    const c = continuationFixture();
    m.rx.mockRejectedValue(Error('clinical_prescription_unavailable'));
    await expect(prepareClinicalOperation(c.authorUser, c.author, c.edit)).rejects.toThrow('clinical_prescription_unavailable');
    expect(c.f.state.row).toBeNull();
    expect(m.chain.prepare).not.toHaveBeenCalled();
    m.chain.grant.mockResolvedValue({ revision: 1, canRead: false, canAppend: true });
    await expect(prepareClinicalOperation(c.authorUser, c.author, c.edit)).rejects.toThrow('clinical_rehearsal_order_conflict');
    expect(m.chain.prepare).not.toHaveBeenCalled();
  });

  it('refuses a substituted PDF receipt before preparing a correction', async () => {
    const c = continuationFixture();
    c.attachment.transaction_hash = 'f'.repeat(64);
    await expect(prepareClinicalOperation(c.authorUser, c.author, c.edit)).rejects.toThrow('clinical_rehearsal_order_conflict');
    expect(m.chain.prepare).not.toHaveBeenCalled();
  });
});
