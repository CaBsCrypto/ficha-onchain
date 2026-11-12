import { createHash } from 'node:crypto';
import { clinicalWebFeeQuote } from '../../scripts/lib/clinical-web-fee-policy.mjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Contract, Keypair, Networks, Transaction, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import type { PoolClient } from '@neondatabase/serverless';
import type { ClinicalActor, ClinicalExpected, ClinicalPrepareRequest } from '@/types/clinical';

const m = vi.hoisted(() => ({
  connection: vi.fn(), query: vi.fn(), path: vi.fn(), config: vi.fn(), reserve: vi.fn(), ready: vi.fn(), bind: vi.fn(),
  cancel: vi.fn(), settle: vi.fn(), storeGet: vi.fn(), createService: vi.fn(), principal: vi.fn(), quote: vi.fn(),
  sponsor: vi.fn(), unsigned: vi.fn(), saved: vi.fn(), draftAssert: vi.fn(), draftMark: vi.fn(), chain: {} as Record<string, any>,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDbConnection: m.connection, getDb: () => ({ query: m.query }) }));
vi.mock('@/lib/clinical/config', () => ({ CLINICAL_ID: 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U', assertClinicalEnvironment: vi.fn() }));
vi.mock('@/lib/private-config', async original => ({ ...await original<typeof import('@/lib/private-config')>(), assertPrivateWrites: vi.fn() }));
vi.mock('@/lib/clinical/create-once', () => ({ assertClinicalWriteScope: () => null, clinicalCreateOnceConfigured: () => true,
  assertClinicalCreateOnceFee: vi.fn(), assertClinicalCreateOnceSavedFee: vi.fn(), CLINICAL_PATIENT_DEMO_MAX_OPERATIONS: 20 }));
vi.mock('@/lib/clinical/keys', () => ({ clinicalKeyring: () => ({ activeKeyId: 'fixture', keyring: { fixture: '12'.repeat(32) } }) }));
vi.mock('@/lib/clinical/identity', () => ({ assertClinicalOwner: vi.fn() }));
vi.mock('@/lib/clinical/doctor-context', () => ({ clinicalDoctorContext: vi.fn() }));
vi.mock('@/lib/clinical/prescriptions', () => ({ clinicalPrescriptionReference: vi.fn() }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: vi.fn() }));
vi.mock('@/lib/clinical/drafts', () => ({ assertDraftPublication: m.draftAssert, markDraftPrepared: m.draftMark }));
vi.mock('@/lib/clinical/rehearsal-budget', () => ({ assertClinicalRehearsalBudget: vi.fn() }));
vi.mock('@/lib/clinical/rehearsal', () => ({ clinicalRehearsalStep: vi.fn(), assertClinicalRehearsalExpected: vi.fn(),
  assertClinicalRehearsalOrder: vi.fn(), assertClinicalRehearsalFee: vi.fn(), assertClinicalRehearsalAuthorization: vi.fn() }));
vi.mock('@/lib/clinical/history', () => ({ clinicalPreparedOperation: (_actor: unknown, r: any) => ({ id: r.id, action: r.action, state: r.state,
  expiresAt: Number(r.expires_at), transactionHash: r.transaction_hash ?? null, errorCode: r.error_code ?? null }) }));
vi.mock('@/lib/clinical/chain', () => ({ createClinicalWebChain: () => m.chain, assertClinicalUnsigned: m.unsigned,
  assertClinicalSavedEnvelope: m.saved, sponsorClinicalSignature: m.sponsor }));
vi.mock('../../scripts/lib/clinical-crypto.mjs', () => ({
  sealClinicalVersion: () => ({ commitment: 'f'.repeat(64), envelope: { fixture: true } }),
  openClinicalVersion: () => ({ content: Buffer.from(JSON.stringify({ title: 'Fixture', text: 'synthetic', eventDate: null })),
    metadata: { mediaType: 'application/json', fileName: 'antecedente.json' } }),
}));
vi.mock('@/lib/sponsorship', async original => {
  const actual = await original<typeof import('@/lib/sponsorship')>();
  return { ...actual, assertSponsorshipPath: m.path, loadSponsorshipConfig: m.config,
    verifySponsorshipPrincipal: m.principal, quoteSponsorship: m.quote, createSponsorshipService: m.createService,
    SqlSponsorshipStore: class {
      constructor(readonly connect?: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<any>; release: () => void }>) {}
      get = m.storeGet;
    } };
});

import { prepareClinicalOperation, reconcileClinicalOperation, signClinicalOperation, cancelClinicalOperation } from '@/lib/clinical/operations';
import { reserveClinicalSponsorship, reconcileClinicalSponsorship, cancelClinicalSponsorship } from '@/lib/clinical/sponsorship';
import { SponsorshipError } from '@/lib/sponsorship';
const contract = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const address = (n: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, n)).publicKey();
const actor: ClinicalActor = { userId: 'did:privy:fixture', walletId: 'fixture-wallet', address: address(21) };
const payer = address(22), user = { userId: actor.userId, email: 'fixture@example.test' };
const id = '10000000-0000-4000-8000-000000000001', draftId = '20000000-0000-4000-8000-000000000002';
const historyId = 'a'.repeat(64), expected: ClinicalExpected = { historyId, patient: actor.address, operationId: 'b'.repeat(64) };
const input: ClinicalPrepareRequest = { requestId: id, action: 'create_history' };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
type Row = Record<string, any>;
function unsigned(source = actor.address, operationId = 'b'.repeat(64)) {
  // An unsigned public fixture only: never calls sign(), Privy, RPC or a real database.
  return new TransactionBuilder(new Account(source, '100'), { fee: '1100', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(contract).call('create_history', nativeToScVal(Buffer.from(operationId, 'hex')))).setTimeout(180).build();
}
function fixture() {
  const state = { row: null as Row | null, events: [] as string[], insertFailure: false, signSaveFailure: false,
    draftFailure: false, signed: false, budget: null as Row | null };
  let snapshot: Row | null = null, budgetSnapshot: Row | null = null, savepoint: Row | null = null, expiredSavepoint: {row:Row|null;budget:Row|null}|null=null;
  const client = { release: vi.fn(), query: vi.fn(async (q: string, p: any[] = []) => {
    if (q === 'BEGIN') { state.events.push('clinical:begin'); snapshot = clone(state.row); budgetSnapshot = clone(state.budget); }
    if (q === 'ROLLBACK') { state.events.push('clinical:rollback'); state.row = snapshot; state.budget = budgetSnapshot; }
    if (q === 'COMMIT') state.events.push('clinical:commit');
    if(q==='SAVEPOINT clinical_expired_recovery') expiredSavepoint=clone({row:state.row,budget:state.budget});
    if(q==='ROLLBACK TO SAVEPOINT clinical_expired_recovery'&&expiredSavepoint){state.row=clone(expiredSavepoint.row);state.budget=clone(expiredSavepoint.budget);}
    if (q === 'SAVEPOINT sponsorship_reserve') { state.events.push('budget:savepoint'); savepoint = clone(state.budget); }
    if (q === 'RELEASE SAVEPOINT sponsorship_reserve') state.events.push('budget:savepoint-release');
    if (q === 'ROLLBACK TO SAVEPOINT sponsorship_reserve') { state.events.push('budget:savepoint-rollback'); state.budget = savepoint; }
    if (q.includes('pg_advisory_xact_lock')) state.events.push('clinical:lock');
    if (q.startsWith('SELECT to_regclass')) return { rows: [{ relation: null }] };
    if (q.startsWith('SELECT * FROM clinical_web_operations')) return { rows: state.row ? [clone(state.row)] : [] };
    if (q.startsWith('SELECT * FROM clinical_web_histories')) return { rows: [{ history_id: historyId, patient_wallet: actor.address, owner_user_id: actor.userId, wallet_id: actor.walletId }] };
    if (q.startsWith('SELECT 1 FROM clinical_web_histories')) return { rows: [] };
    if (q.startsWith('INSERT INTO clinical_web_operations')) {
      state.events.push('clinical:insert'); if (state.insertFailure) throw Error('fixture insert unavailable');
      state.row = { id: p[0], actor_user_id: p[1], wallet_id: p[2], source_wallet: p[3], action: p[4], contract_id: p[5], method: p[6],
        expected: JSON.parse(p[7]), prepared_envelope: p[8] ? JSON.parse(p[8]) : null, state: 'awaiting_signature', unsigned_xdr: p[9],
        signing_hash: p[10], expires_at: p[11], request_fingerprint: p[12], signed_xdr: null, transaction_hash: null, error_code: null,
        updated_at: new Date().toISOString() };
      return { rows: [clone(state.row)] };
    }
    if (q.includes('SET signed_xdr=')) {
      state.events.push('clinical:save-signed'); if (state.signSaveFailure) throw Error('fixture signed persistence unavailable');
      state.row = { ...state.row!, signed_xdr: p[1], transaction_hash: p[2], state: 'submitted', updated_at: new Date().toISOString() };
      return { rows: [] };
    }
    if (q.includes("SET state='confirmed'")) { state.row = { ...state.row!, state: 'confirmed' }; return { rows: [clone(state.row)] }; }
    if (q.includes("SET state='failed'")) { state.row = { ...state.row!, state: 'failed', error_code: q.includes('signed_expired_before_submission') ? 'signed_expired_before_submission' : state.row!.error_code }; return { rows: [clone(state.row)] }; }
    if (q.includes("SET state='cancelled'") && q.includes('WHERE id=$1')) { state.row = { ...state.row!, state: 'cancelled' }; return { rows: [clone(state.row)] }; }
    if (q.startsWith('SELECT * FROM clinical_web_histories WHERE history_id')) return { rows: [] };
    return { rows: [] };
  }) };
  m.connection.mockResolvedValue(client); m.query.mockResolvedValue([]);
  Object.assign(m.chain, {
    verifyDeployment: vi.fn(async () => true), historyForPatient: vi.fn(async () => null),
    deriveHistoryId: vi.fn(async () => historyId), deriveEntryId: vi.fn(async () => 'c'.repeat(64)), entry: vi.fn(async () => null),
    history: vi.fn(async () => ({ id: historyId, patient: actor.address })), version: vi.fn(async () => null),
    prepare: vi.fn(async (source, _action, expected) => { state.events.push('rpc:prepare'); return unsigned(source, expected.operationId); }),
    receipt: vi.fn(async () => ({ status: 'NOT_FOUND' })),
    submit: vi.fn(async () => { state.events.push('rpc:broadcast'); expect(state.budget?.state).toBe('submitted'); return {}; }),
  });
  m.reserve.mockImplementation(async (p, quote) => {
    state.events.push('budget:reserve');
    if (state.budget && state.budget.binding.operationFingerprint !== p.operationFingerprint) throw new SponsorshipError('sponsorship_binding_conflict');
    state.budget ??= { binding: p, quote, state: 'reserved', transactionHash: null }; return state.budget;
  });
  m.ready.mockImplementation(async (_p, phase) => { state.events.push('budget:ready:' + phase); return state.budget; });
  m.bind.mockImplementation(async () => {
    state.events.push('budget:bind-hash'); state.budget = { ...state.budget!, state: 'submitted', transactionHash: state.row!.transaction_hash };
    return { transactionHash: state.row!.transaction_hash, reservation: state.budget };
  });
  m.storeGet.mockImplementation(async () => state.budget);
  m.cancel.mockImplementation(async () => { state.events.push('budget:cancel'); state.budget = { ...state.budget!, state: 'released' }; });
  m.settle.mockImplementation(async (_id, reader) => { state.events.push('budget:settle'); await reader(state.row!.transaction_hash); });
  m.sponsor.mockImplementation((xdr: string) => {
    state.events.push('sdk:sponsor'); state.signed = true;
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    const outer = TransactionBuilder.buildFeeBumpTransaction(payer, '2000000', tx, Networks.TESTNET);
    return { xdr: outer.toXDR(), hash: outer.hash().toString('hex') };
  });
  m.draftAssert.mockImplementation(async passed => { expect(passed).toBe(client); state.events.push('draft:assert'); });
  m.draftMark.mockImplementation(async passed => { expect(passed).toBe(client); state.events.push('draft:bind'); if (state.draftFailure) throw Error('fixture draft binding failed'); });
  return { state, client };
}
beforeEach(() => {
  vi.resetAllMocks();
  // Ignore the argument entirely: the fixture never reads or uses a private key.
  vi.spyOn(Keypair, 'fromSecret').mockReturnValue({ publicKey: () => payer } as Keypair);
  m.path.mockReturnValue(undefined); m.config.mockReturnValue({ policy: null, paths: [] });
  m.principal.mockImplementation(async resolve => resolve());
  m.quote.mockReturnValue({ offeredFeeStroops: '4001000', unsignedHash: 'd'.repeat(64) });
  m.createService.mockImplementation(({ store }) => ({ reserve: async (p: unknown, q: unknown) => {
    if (!store.connect) return m.reserve(p, q);
    const client = await store.connect();
    try { await client.query('BEGIN'); const result = await m.reserve(p, q); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }, assertReady: m.ready, bindSubmission: m.bind, cancelUnsigned: m.cancel, reconcile: m.settle }));
});

describe('clinical sponsorship integration boundaries', () => {
  it('opts in only a new clinical reservation to a persisted expiry bounded by its existing XDR', async () => {
    const f=fixture(),tx=unsigned(),before=tx.toXDR();
    await reserveClinicalSponsorship(actor,id,'create_history',expected,tx,f.client as unknown as PoolClient);
    const args=m.quote.mock.calls[0][1];
    expect(args.validUntil).toBe(Math.min(args.preparedAt+300,Number(tx.timeBounds!.maxTime)));
    expect(args.preparedAt).toBe(args.now);expect(args.sponsorBaseFeeStroops).toBe('2000000');
    expect(tx.toXDR()).toBe(before);expect(m.reserve).toHaveBeenCalledOnce();
  });

  it('missing sponsorship configuration blocks before any clinical transaction or RPC preparation', async () => {
    fixture(); m.path.mockImplementation(() => { throw new SponsorshipError('sponsorship_path_disabled'); });
    await expect(prepareClinicalOperation(user, actor, input)).rejects.toThrow('clinical_sponsorship_unavailable');
    expect(m.connection).not.toHaveBeenCalled(); expect(m.chain.prepare).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('reserves after pricing and before INSERT, then checks budget before sponsoring and binds hash before broadcast', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, input);
    expect(f.state.events.indexOf('budget:reserve')).toBeGreaterThan(f.state.events.indexOf('rpc:prepare'));
    expect(f.state.events.indexOf('clinical:insert')).toBeGreaterThan(f.state.events.indexOf('budget:reserve'));
    expect(m.sponsor).not.toHaveBeenCalled();
    await signClinicalOperation(user, actor, id, 'fixture-signature');
    const events = f.state.events;
    expect(events.indexOf('sdk:sponsor')).toBeGreaterThan(events.indexOf('budget:ready:sign'));
    expect(events.indexOf('clinical:save-signed')).toBeGreaterThan(events.indexOf('sdk:sponsor'));
    expect(events.indexOf('budget:bind-hash')).toBeGreaterThan(events.indexOf('clinical:save-signed'));
    expect(events.indexOf('rpc:broadcast')).toBeGreaterThan(events.indexOf('budget:bind-hash'));
    expect(events.indexOf('rpc:broadcast')).toBeGreaterThan(events.indexOf('budget:ready:submit'));
  });
  it('uses a savepoint on the existing wallet client and has no RPC after taking budget locks', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, input);
    const events = f.state.events, reserveAt = events.indexOf('budget:reserve');
    expect(events.indexOf('budget:savepoint')).toBeLessThan(reserveAt);
    expect(events.indexOf('budget:savepoint-release')).toBeGreaterThan(reserveAt);
    expect(events.indexOf('clinical:insert')).toBeGreaterThan(events.indexOf('budget:savepoint-release'));
    expect(events.slice(reserveAt + 1).some(e => e.startsWith('rpc:'))).toBe(false);
    expect(f.client.release).toHaveBeenCalledTimes(1); expect(m.connection).toHaveBeenCalledTimes(1);
  });
  it('a definitive unsigned SQL rollback permits the same request UUID to recover with a fresh nonce', async () => {
    const f = fixture(); f.state.insertFailure = true;
    await expect(prepareClinicalOperation(user, actor, input)).rejects.toThrow();
    expect(f.state.budget).toBeNull(); f.state.insertFailure = false;
    await prepareClinicalOperation(user, actor, input);
    expect(f.state.row!.id).toBe(id); expect(m.reserve).toHaveBeenCalledTimes(2);
    expect(m.reserve.mock.calls[0][0].operationFingerprint).not.toBe(m.reserve.mock.calls[1][0].operationFingerprint);
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it('a reservation failure rolls back before clinical INSERT or any signing', async () => {
    const f = fixture(); m.reserve.mockRejectedValue(new SponsorshipError('sponsorship_daily_limit'));
    await expect(prepareClinicalOperation(user, actor, input)).rejects.toThrow('clinical_sponsorship_budget_exceeded');
    expect(f.state.row).toBeNull(); expect(f.state.events).not.toContain('clinical:insert');
    expect(f.state.events).toContain('clinical:rollback'); expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('SQL failure after reservation rolls back the unsigned reservation with its clinical row', async () => {
    const f = fixture(); f.state.insertFailure = true;
    await expect(prepareClinicalOperation(user, actor, input)).rejects.toThrow('fixture insert unavailable');
    expect(f.state.row).toBeNull(); expect(f.state.budget).toBeNull();
    expect(m.cancel).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('signed-persistence failure does not free the reservation or broadcast a lost envelope', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, input); f.state.signSaveFailure = true;
    await expect(signClinicalOperation(user, actor, id, 'fixture-signature')).rejects.toThrow('fixture signed persistence unavailable');
    expect(f.state.signed).toBe(true); expect(f.state.row!.signed_xdr).toBeNull(); expect(f.state.budget?.state).toBe('reserved');
    expect(m.cancel).not.toHaveBeenCalled(); expect(m.bind).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
  it('binding failure after signed COMMIT preserves one signed intent and its full reserved exposure', async () => {
    const f = fixture(); await prepareClinicalOperation(user, actor, input);
    m.bind.mockRejectedValue(new SponsorshipError('sponsorship_accounting_unavailable'));
    const result = await signClinicalOperation(user, actor, id, 'fixture-signature');
    expect(result.operation.state).toBe('submitted'); expect(f.state.row!.signed_xdr).not.toBeNull();
    expect(f.state.budget?.state).toBe('reserved'); expect(m.cancel).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
    await cancelClinicalOperation(actor, id); expect(m.cancel).not.toHaveBeenCalled();
  });
  it.each(['confirmed', 'failed', 'cancelled'])('reads historical terminal %s without new budget authority', async terminal => {
    const f = fixture(); await prepareClinicalOperation(user, actor, input); f.state.row!.state = terminal;
    vi.clearAllMocks(); m.path.mockImplementation(() => { throw new SponsorshipError('sponsorship_path_disabled'); });
    const result = await reconcileClinicalOperation(actor, id);
    expect(result.operation.state).toBe(terminal); expect(m.path).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled(); expect(m.ready).not.toHaveBeenCalled(); expect(m.sponsor).not.toHaveBeenCalled();
  });
  it('recovery wrappers allow historical rows without reservations and without a configured spending policy', async () => {
    fixture(); m.storeGet.mockResolvedValue(null); m.config.mockReturnValue({ policy: null, paths: [] });
    m.path.mockImplementation(() => { throw new SponsorshipError('sponsorship_path_disabled'); });
    const row = { id };
    await reconcileClinicalSponsorship(actor, row, { status: 'SUCCESS' });
    await cancelClinicalSponsorship(actor, row);
    expect(m.path).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled(); expect(m.ready).not.toHaveBeenCalled();
    expect(m.createService).toHaveBeenCalledWith(expect.objectContaining({ policy: null }));
  });
  it('keeps draft verification and publication binding in the same clinical transaction', async () => {
    const f = fixture();
    await prepareClinicalOperation(user, actor, { requestId: id, action: 'append_version', note: { title: 'Fixture', text: 'synthetic', eventDate: null },
      draftId, draftRevision: 1 });
    const events = f.state.events;
    expect(events.indexOf('draft:assert')).toBeLessThan(events.indexOf('rpc:prepare'));
    expect(events.indexOf('draft:bind')).toBeGreaterThan(events.indexOf('clinical:insert'));
    expect(events.indexOf('draft:bind')).toBeLessThan(events.lastIndexOf('clinical:commit'));
    expect(m.draftAssert.mock.calls[0][0]).toBe(f.client); expect(m.draftMark.mock.calls[0][0]).toBe(f.client);
  });
  it('draft binding failure atomically rolls back draft publication, clinical intent and unsigned reserve', async () => {
    const f = fixture(); f.state.draftFailure = true;
    await expect(prepareClinicalOperation(user, actor, { requestId: id, action: 'append_version', note: { title: 'Fixture', text: 'synthetic', eventDate: null },
      draftId, draftRevision: 1 })).rejects.toThrow('fixture draft binding failed');
    expect(f.state.row).toBeNull(); expect(f.state.events).toContain('clinical:rollback'); expect(f.state.budget).toBeNull();
    expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled(); expect(m.cancel).not.toHaveBeenCalled();
  });
  it('forwards ten independent unsigned request identities through the same mandatory reserve boundary', async () => {
    fixture(); const seen = new Set<string>();
    m.reserve.mockImplementation(async p => { expect(seen.has(p.requestId)).toBe(false); seen.add(p.requestId); return { state: 'reserved' }; });
    await Promise.all(Array.from({ length: 10 }, (_, i) => {
      const who = { ...actor, userId: 'did:privy:fixture' + i, walletId: 'wallet' + i, address: address(i + 1) };
      return reserveClinicalSponsorship(who, '10000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'), 'create_history',
        { ...expected, patient: who.address }, unsigned(who.address), { query: async () => ({ rows: [] }), release: () => {} } as unknown as PoolClient);
    }));
    expect(seen.size).toBe(10); expect(m.reserve).toHaveBeenCalledTimes(10); expect(m.sponsor).not.toHaveBeenCalled(); expect(m.chain.submit).not.toHaveBeenCalled();
  });
});

async function expiredNeverSentFixture(){
 const f=fixture();await prepareClinicalOperation(user,actor,input);const row=f.state.row!,expiry=Number(row.expires_at);
 Object.assign(row,{state:'submitted',signed_xdr:'UNIT-SIGNED-ENVELOPE-PRESERVED',transaction_hash:'ca'.repeat(32)});
 const tx=TransactionBuilder.fromXDR(row.unsigned_xdr,Networks.TESTNET) as Transaction;
 Object.assign(f.state.budget!,{state:'reserved',transactionHash:null,signedInnerDigest:null,signedAt:null,chargedStroops:null,outcome:null,ledger:null,
   quote:{unsignedHash:createHash('sha256').update(row.unsigned_xdr).digest('hex'),signingHash:row.signing_hash,maxTime:expiry,offeredFeeStroops:clinicalWebFeeQuote(tx).sponsored.toString()}});
 vi.spyOn(Date,'now').mockReturnValue((expiry+120)*1000);
 m.chain.receipt.mockResolvedValue({status:'NOT_FOUND',latestLedger:100,latestLedgerCloseTime:expiry+120});
 m.chain.expiredOperationAbsent=vi.fn(async()=>({contractId:contract,author:actor.address,operationId:row.expected.operationId,observedLedger:100}));
 vi.clearAllMocks();return {...f,expiry};
}
describe('expired signed intent with no transport journal',()=>{
 it('uses a failed terminal state compatible with persisted signed-envelope constraints',async()=>{
  const f=await expiredNeverSentFixture(),query=f.client.query.getMockImplementation()!;
  f.client.query.mockImplementation(async(q,p)=>{if(q.includes("SET state='cancelled'")&&f.state.row?.signed_xdr)throw Error('clinical_web_signed_state_check');return query(q,p);});
  await reconcileClinicalOperation(actor,id);expect(f.state.row!.state).toBe('failed');expect(f.state.row!.signed_xdr).toBeTruthy();expect(f.state.row!.transaction_hash).toBeTruthy();expect(f.state.budget!.state).toBe('released');expect(m.chain.submit).not.toHaveBeenCalled();
 });

 it('accepts the decimal-string ledger close time returned by the real SDK without changing signed bytes',async()=>{
  const f=await expiredNeverSentFixture(),signed=f.state.row!.signed_xdr,hash=f.state.row!.transaction_hash;
  m.chain.receipt.mockResolvedValue({status:'NOT_FOUND',latestLedger:100,latestLedgerCloseTime:String(f.expiry+120)});
  await reconcileClinicalOperation(actor,id);expect(f.state.row!.state).toBe('failed');expect(f.state.budget!.state).toBe('released');expect(f.state.row!.signed_xdr).toBe(signed);expect(f.state.row!.transaction_hash).toBe(hash);expect(m.chain.submit).not.toHaveBeenCalled();
 });
 it.each(['','1e20','123.5',' 1794051091','1794051091 ','-1','NaN','9007199254740992'])('retains the reserve for malformed or unsafe RPC clock %s',async clock=>{
  const f=await expiredNeverSentFixture();m.chain.receipt.mockResolvedValue({status:'NOT_FOUND',latestLedger:100,latestLedgerCloseTime:clock});
  await reconcileClinicalOperation(actor,id);expect(f.state.row!.state).toBe('submitted');expect(f.state.budget!.state).toBe('reserved');expect(m.cancel).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
 });

 it('releases only the never-started reserve after later RPC and absent-nonce proof, preserving signed bytes and hash',async()=>{
  const f=await expiredNeverSentFixture(),signed=f.state.row!.signed_xdr,hash=f.state.row!.transaction_hash;
  await reconcileClinicalOperation(actor,id);
  expect(f.state.row!.state).toBe('failed');expect(f.state.row!.signed_xdr).toBe(signed);expect(f.state.row!.transaction_hash).toBe(hash);
  expect(f.state.budget!.state).toBe('released');expect(m.cancel).toHaveBeenCalledOnce();expect(m.bind).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();expect(m.sponsor).not.toHaveBeenCalled();
  expect(f.client.query).toHaveBeenCalledWith('SAVEPOINT clinical_expired_recovery');
 });
 it.each(['signed','submitted','settled','hash','digest','signedAt','charged','ledger','outcome','binding','quote'])('preserves reserve and envelope for ambiguous %s journal',async change=>{
  const f=await expiredNeverSentFixture(),r=f.state.budget!;
  if(['signed','submitted','settled'].includes(change))r.state=change;
  if(change==='hash')r.transactionHash='de'.repeat(32);if(change==='digest')r.signedInnerDigest='de'.repeat(32);if(change==='signedAt')r.signedAt=f.expiry-5;
  if(change==='charged')r.chargedStroops='1';if(change==='ledger')r.ledger=1;if(change==='outcome')r.outcome='SUCCESS';if(change==='binding')r.binding={...r.binding,patientAddress:address(23)};if(change==='quote')r.quote.maxTime++;
  const before=clone(f.state);await reconcileClinicalOperation(actor,id);
  expect(f.state.row).toEqual(before.row);expect(f.state.budget).toEqual(before.budget);expect(m.cancel).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
 });
 it.each(['stale-clock','missing-clock','present-operation','rpc-unavailable','wrong-nonce'])('keeps the same reserve when %s proof cannot establish non-submission',async change=>{
  const f=await expiredNeverSentFixture();
  if(change==='stale-clock')m.chain.receipt.mockResolvedValue({status:'NOT_FOUND',latestLedger:100,latestLedgerCloseTime:f.expiry+59});
  if(change==='missing-clock')m.chain.receipt.mockResolvedValue({status:'NOT_FOUND'});
  if(change==='present-operation'||change==='rpc-unavailable')m.chain.expiredOperationAbsent.mockRejectedValue(Error('isolated_read_unavailable'));
  if(change==='wrong-nonce')m.chain.expiredOperationAbsent.mockResolvedValue({contractId:contract,author:actor.address,operationId:'de'.repeat(32),observedLedger:100});
  await reconcileClinicalOperation(actor,id);expect(f.state.row!.state).toBe('submitted');expect(f.state.budget!.state).toBe('reserved');expect(m.cancel).not.toHaveBeenCalled();expect(m.chain.submit).not.toHaveBeenCalled();
 });
 it('rolls back reserve release if persisting the terminal state fails',async()=>{
  const f=await expiredNeverSentFixture(),before=clone(f.state.budget),query=f.client.query.getMockImplementation()!;
  f.client.query.mockImplementation(async(q,p)=>{if(q.includes("error_code='signed_expired_before_submission'"))throw Error('isolated_terminal_update_failure');return query(q,p);});
  await reconcileClinicalOperation(actor,id);expect(f.state.budget).toEqual(before);expect(f.state.row!.state).toBe('submitted');expect(f.client.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT clinical_expired_recovery');
 });
});
