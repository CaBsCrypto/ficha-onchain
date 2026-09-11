import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getDb: vi.fn(), sql: vi.fn(), config: vi.fn(), details: vi.fn(),
  request: vi.fn(), wallet: vi.fn(), read: vi.fn(), view: vi.fn(), latest: vi.fn(), legacySigner: vi.fn(), legacySend: vi.fn(),query:vi.fn(),onboarding:vi.fn(),list:vi.fn(),invite:vi.fn(),approved:vi.fn() }));
vi.mock('@/lib/reviewed-doctor-authorization',()=>({requestReviewedDoctorAuthorization:mocks.request}));
vi.mock('@/lib/doctor-onboarding',()=>({onboardingForDoctor:mocks.onboarding,listDoctorOnboarding:mocks.list,createDoctorInvitation:mocks.invite,isDoctorLocallyApproved:mocks.approved}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: mocks.requireUser,
  isDoctor: vi.fn(), authEnforced: () => false,
  unauthorized: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
  forbidden: () => Response.json({ error: 'forbidden' }, { status: 403 }) }));
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/lib/stellar/client', () => ({ server: {}, isDoctorAuthorized: vi.fn(), getPrescription: vi.fn() }));
vi.mock('@/lib/stellar/server', () => ({ getDemoDoctorSecret: mocks.legacySigner, feeBumpAndSend: mocks.legacySend }));
vi.mock('@/lib/doctor-authorizations', () => ({
  assertPrivateRegistryConfiguration: mocks.config, doctorAuthorizationDetails: mocks.details,
  requestDoctorAuthorization: mocks.request, verifiedWallet: mocks.wallet, readPrivateDoctor: mocks.read,
  authorizationView: mocks.view, latestDoctorRequest: mocks.latest,
  DoctorAuthorizationError: class extends Error { constructor(message: string, public status = 409) { super(message); } },
}));
import { GET, POST } from '@/app/api/admin/doctor-authorizations/route';
import { GET as doctorGET } from '@/app/api/doctor-status/route';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { DoctorAuthorizationError } from '@/lib/doctor-authorizations';
import { RX_PRIVATE,REGISTRY_PRIVATE,PRIVY_APP,PRIVATE_ADMIN,assertPrivateWrites } from '@/lib/private-config';
import { GET as profilesGET,POST as profilesPOST,PATCH as profilesPATCH,DELETE as profilesDELETE } from '@/app/api/admin/doctors/route';
import { POST as migratePOST } from '@/app/api/admin/migrate/route';
import { GET as whoamiGET } from '@/app/api/admin/whoami/route';

const admin = { userId: 'did:privy:admin', email: 'admin@example.test' };
const doctor = { userId: 'did:privy:doctor', email: 'doctor@example.test' };
const body = { doctorId: 21, action: 'authorize', confirmed: true, synthetic: true };
function post(payload: unknown = body, extraHeaders: Record<string, string> = {}) {
  return new Request('http://localhost:3002/api/admin/doctor-authorizations', {
    method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:3002', origin: 'http://localhost:3002', ...extraHeaders },
    body: JSON.stringify(payload),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAILS', 'admin@example.test');
  vi.stubEnv('WAITLIST_ADMIN_TOKEN', 'old-admin-token');
  vi.stubEnv('TRUSTLEAF_REQUIRE_AUTH', 'false');
  vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
  vi.stubEnv('NEXT_PUBLIC_SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
  const env={TRUSTLEAF_PRIVATE_WRITES_ENABLED:'true',TRUSTLEAF_ENV:'local',TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',
    DATABASE_URL:'postgres://test:test@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test',VERCEL_ENV:'',PRIVY_APP_ID:PRIVY_APP,NEXT_PUBLIC_PRIVY_APP_ID:PRIVY_APP,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:REGISTRY_PRIVATE,PRESCRIPTION_PRIVATE_CONTRACT_ID:RX_PRIVATE,DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:PRIVATE_ADMIN,BOOKING_AUTHORITY_PUBLIC_KEY:PRIVATE_ADMIN};
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  mocks.requireUser.mockResolvedValue(admin);
  mocks.getDb.mockReturnValue(Object.assign(mocks.sql,{query:mocks.query}));
  mocks.query.mockResolvedValue([]);
  mocks.sql.mockResolvedValue([{ id: 21, email: doctor.email }]);
  mocks.request.mockResolvedValue({ request: { id: 'request-1', state: 'pending', transactionHash: null } });
  mocks.wallet.mockResolvedValue({ walletId: 'doctor-wallet', address: 'expected-stellar-wallet' });
  mocks.read.mockResolvedValue({ authorized: true, authorization: { version: 1 } });
  mocks.view.mockReturnValue({ status: 'authorized', version: 1 });
  mocks.latest.mockResolvedValue(null);
  mocks.onboarding.mockResolvedValue(null);mocks.list.mockResolvedValue([]);mocks.approved.mockResolvedValue(true);
  mocks.invite.mockImplementation(async (_sql,_actor,profile)=>{assertPrivateWrites();return {doctor:{id:21,...profile,status:'pending'},onboarding:{state:'invited'}};});
});
afterEach(() => vi.unstubAllEnvs());

describe('strict private admin authorization', () => {
  it('accepts the allowlisted Privy identity without a shared token', async () => {
    expect(await requirePrivyAdmin(post())).toEqual({ user: admin });
  });
  it.each(['header', 'query'])('does not accept a legacy token from %s without a valid session', async placement => {
    mocks.requireUser.mockResolvedValue(null);
    const req = new Request(`http://localhost/api/admin/doctor-authorizations${placement === 'query' ? '?token=old-admin-token' : ''}`,
      { headers: placement === 'header' ? { 'x-admin-token': 'old-admin-token' } : {} });
    const result = await requirePrivyAdmin(req);
    expect(result.error?.status).toBe(401);
  });
  it.each([doctor, { userId: 'did:privy:patient', email: 'patient@example.test' }])('denies another authenticated role even with the legacy token: $email', async actor => {
    mocks.requireUser.mockResolvedValue(actor);
    expect((await POST(post(body, { 'x-admin-token': 'old-admin-token' }))).status).toBe(403);
    expect((await GET(new Request('http://localhost/api/admin/doctor-authorizations'))).status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('rejects missing or invalid sessions even while legacy demo mode is enabled', async () => {
    mocks.requireUser.mockResolvedValue(null);
    expect((await POST(post())).status).toBe(401);
    expect((await GET(new Request('http://localhost/api/admin/doctor-authorizations'))).status).toBe(401);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe('private admin request boundary', () => {
  it.each(['xdr', 'hash', 'wallet', 'contractId', 'method'])('rejects caller-supplied %s before preparing anything', async key => {
    expect((await POST(post({ ...body, [key]: 'caller-selected' }))).status).toBe(400);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([
    { ...body, confirmed: false }, { ...body, confirmed: undefined },
    { ...body, synthetic: false }, { ...body, synthetic: undefined },
    { ...body, doctorId: '21' }, { ...body, doctorId: -1 }, { ...body, doctorId: 2.5 },
    { ...body, action: 'mint_prescription' },
  ])('requires a valid resource, supported action and explicit synthetic confirmation %#', async payload => {
    expect((await POST(post(payload))).status).toBe(400);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([null, [], 'authorize'])('rejects a non-object body %#', async payload => {
    expect((await POST(post(payload))).status).toBe(400);
  });
  it('rejects malformed JSON', async () => {
    const req = new Request('http://localhost:3002/api/admin/doctor-authorizations', {
      method: 'POST', headers: { origin: 'http://localhost:3002', host: 'localhost:3002', 'content-type': 'application/json' }, body: '{',
    });
    expect((await POST(req)).status).toBe(400);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(['https://other.example.test', 'http://localhost:4444', ''])('rejects a foreign or missing origin: %s', async origin => {
    expect((await POST(post(body, { origin }))).status).toBe(403);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('acknowledges only the durable pending request, never an authorization success', async () => {
    const response = await POST(post());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ request: { id: 'request-1', state: 'pending', transactionHash: null } });
    expect(mocks.request).toHaveBeenCalledWith(mocks.sql, admin, 21, 'authorize', undefined);
  });
  it.each(['config', 'database', 'provider'])('reports a %s failure without a simulated success or internal details', async dependency => {
    const secretError = new Error('sensitive provider or connection details');
    if (dependency === 'config') mocks.config.mockImplementation(() => { throw secretError; });
    if (dependency === 'database') mocks.getDb.mockImplementation(() => { throw secretError; });
    if (dependency === 'provider') mocks.request.mockRejectedValue(secretError);
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'private_registry_unavailable' });
  });
  it('preserves a recoverable pending-action conflict as HTTP 409', async () => {
    mocks.request.mockRejectedValue(new DoctorAuthorizationError('another_action_pending', 409));
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'another_action_pending' });
  });
  it('protects private review from caching and does not return another doctor for an invalid ID', async () => {
    mocks.details.mockResolvedValue({ doctor: { id: 21 }, dossier: { fullName: 'Synthetic doctor' } });
    const response = await GET(new Request('http://localhost/api/admin/doctor-authorizations?doctorId=21'));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.details).toHaveBeenCalledWith(mocks.sql, 21);
    mocks.details.mockClear();
    expect((await GET(new Request('http://localhost/api/admin/doctor-authorizations?doctorId=-1'))).status).toBe(400);
    expect(mocks.details).not.toHaveBeenCalled();
  });
});

describe('doctor entry authorization against the private registry', () => {
  const req = () => new Request('http://localhost/api/doctor-status');
  beforeEach(() => mocks.requireUser.mockResolvedValue(doctor));
  it('rejects unauthenticated access without a demo doctor', async () => {
    mocks.requireUser.mockResolvedValue(null);
    expect((await doctorGET(req())).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects a query selecting somebody else’s wallet', async () => {
    const response = await doctorGET(new Request('http://localhost/api/doctor-status?wallet=foreign-wallet'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ authorized: false, error: 'wallet_owner_mismatch' });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('checks the authenticated doctor’s verified wallet and returns a noncached registry result', async () => {
    const response = await doctorGET(req());
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.wallet).toHaveBeenCalledWith(mocks.sql, doctor.userId, doctor.email);
    expect(mocks.read).toHaveBeenCalledWith('expected-stellar-wallet');
    expect(await response.json()).toMatchObject({ authorized: true, source: 'private_registry', wallet: 'expected-stellar-wallet' });
  });
  it('does not grant doctor access to a patient without a doctor record', async () => {
    mocks.sql.mockResolvedValue([]);
    expect(await (await doctorGET(req())).json()).toMatchObject({ authorized: false, doctor: null });
  });
  it.each(['unregistered', 'expired', 'revoked', 'paused'])('keeps a %s doctor unauthorized', async status => {
    mocks.read.mockResolvedValue({ authorized: false, authorization: null });
    mocks.view.mockReturnValue({ status });
    expect(await (await doctorGET(req())).json()).toMatchObject({ authorized: false, authorization: { status } });
  });
  it.each(['wallet', 'rpc', 'database'])('fails closed when %s is unavailable', async failure => {
    if (failure === 'wallet') mocks.wallet.mockRejectedValue(new Error('wallet_binding_changed'));
    if (failure === 'rpc') mocks.read.mockRejectedValue(new Error('RPC unavailable'));
    if (failure === 'database') mocks.getDb.mockImplementation(() => { throw new Error('database unavailable'); });
    const response = await doctorGET(req());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ authorized: false, source: 'private_registry', error: 'private_registry_unavailable' });
  });
});

describe('private portal blocks legacy authorization and issuance', () => {
  beforeEach(() => vi.stubEnv('TRUSTLEAF_PRIVATE_PORTAL_ENABLED', 'true'));
  it.each(['simulated', 'testnet-demo'])('blocks legacy mint in %s mode before signing or database writes', async mode => {
    const { POST: mint } = await import('@/app/api/mint/route');
    const response = await mint(post({ mode, patient: 'foreign-wallet', medication: 'SYNTHETIC' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'private_prescription_flow_not_enabled' });
    expect(mocks.legacySigner).not.toHaveBeenCalled();
    expect(mocks.legacySend).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('blocks legacy activation instead of returning a simulated success', async () => {
    const { POST: activate } = await import('@/app/api/prescriptions/activate/route');
    const response = await activate(post({ rxId: '1' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'private_prescription_flow_not_enabled' });
    expect(mocks.legacySigner).not.toHaveBeenCalled();
    expect(mocks.legacySend).not.toHaveBeenCalled();
  });
  it('prevents the legacy doctor status update from bypassing a confirmed registry request', async () => {
    const { PATCH } = await import('@/app/api/admin/doctors/route');
    const response = await PATCH(post({ id: 21, status: 'active' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'use_doctor_onboarding_review' });
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});

describe('strict private admin profile and migration routes',()=>{
  const profile={name:'Synthetic doctor',email:'doctor@example.test',specialty:'Test only'};
  it('rejects the old token on every active admin entrypoint',async()=>{
    mocks.requireUser.mockResolvedValue(null);
    for(const handler of [profilesGET,profilesPOST,profilesPATCH,profilesDELETE,migratePOST,whoamiGET]){
      expect((await handler(post(profile,{'x-admin-token':'old-admin-token'}))).status).toBe(401);
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it('rejects a patient even when they supply the old shared token',async()=>{
    mocks.requireUser.mockResolvedValue({userId:'did:privy:patient',email:'patient@example.test'});
    expect((await profilesPOST(post(profile,{'x-admin-token':'old-admin-token'}))).status).toBe(403);
    expect((await migratePOST(post({confirm:'MIGRATE'},{'x-admin-token':'old-admin-token'}))).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each(['true','false'])('forbids status bypass and deletion regardless of the old flag=%s',async flag=>{
    vi.stubEnv('TRUSTLEAF_PRIVATE_PORTAL_ENABLED',flag);
    const response=await profilesPATCH(post({id:21,status:'active'}));
    expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'use_doctor_onboarding_review'});
    expect((await profilesDELETE(post({id:21}))).status).toBe(405);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each(['wallet','walletId','userId','source_wallet','doctor_user_id','contractId'])('rejects caller-selected identity %s on creation and editing',async key=>{
    expect((await profilesPOST(post({...profile,[key]:'forged'}))).status).toBe(400);
    expect((await profilesPATCH(post({id:21,name:'Test',[key]:'forged'}))).status).toBe(409);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('creates only a pending profile with no wallet or authority supplied',async()=>{
    mocks.sql.mockResolvedValue([{id:21,...profile,status:'pending'}]);
    const response=await profilesPOST(post(profile));
    expect(response.status).toBe(201);expect((await response.json()).doctor.status).toBe('pending');
    expect(mocks.invite).toHaveBeenCalledWith(mocks.sql,admin,profile);
    expect((await profilesGET(new Request('http://localhost/api/admin/doctors'))).status).toBe(200);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('does not reassign an existing doctor to another email',async()=>{
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:21}]);
    const response=await profilesPATCH(post({id:21,name:'Test',email:'another@example.test'}));
    expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'use_doctor_onboarding_review'});
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rejects legacy editing even for an absent profile',async()=>{
    mocks.sql.mockResolvedValue([]);
    expect((await profilesPATCH(post({id:123,name:'Test'}))).status).toBe(409);
  });
  it('blocks new profiles while leaving private profile reads available when writes are paused',async()=>{
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false');
    expect((await profilesPOST(post(profile))).status).toBe(503);expect(mocks.sql).not.toHaveBeenCalled();
    expect((await profilesGET(new Request('http://localhost/api/admin/doctors'))).status).toBe(200);
  });
  it('uses the real environment guard and does not touch another database',async()=>{
    vi.stubEnv('TRUSTLEAF_DB_HOST','production.example.test');
    for(const handler of [profilesGET,profilesPOST,migratePOST,whoamiGET])expect((await handler(post({confirm:'MIGRATE',...profile}))).status).toBeGreaterThanOrEqual(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it('requires same origin and exact migration confirmation before executing SQL',async()=>{
    expect((await migratePOST(post({confirm:'MIGRATE'},{origin:'https://foreign.example.test'}))).status).toBe(403);
    expect((await migratePOST(post({confirm:'MIGRATE',database:'foreign'}))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('allows a reviewed schema migration while application writes are paused',async()=>{
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false');
    mocks.sql.mockResolvedValue([{table_name:'doctors'}]);
    const response=await migratePOST(post({confirm:'MIGRATE'}));
    expect(response.status).toBe(200);expect((await response.json()).ok).toBe(true);
    expect(mocks.query).toHaveBeenCalled();
  });
  it('returns failure without provider details when a migration statement fails',async()=>{
    mocks.query.mockRejectedValueOnce(new Error('private connection details'));
    const response=await migratePOST(post({confirm:'MIGRATE'}));
    expect(response.status).toBe(503);const result=await response.json();expect(result.ok).toBe(false);
    expect(result.failed[0].error).toBe('migration_step_failed');expect(JSON.stringify(result)).not.toContain('private connection details');
  });
});
