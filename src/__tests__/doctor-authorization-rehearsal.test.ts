import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/db';
import { commitmentFor, decryptDossier, encryptDossier } from '../../scripts/lib/private-doctor-dossier.mjs';
const m = vi.hoisted(() => ({ load: vi.fn(), loadInitial: vi.fn(), initialJob: vi.fn(), byEmail: vi.fn(), user: vi.fn(), wallet: vi.fn(), read: vi.fn() }));
vi.mock('../../scripts/lib/clinical-rehearsal-policy.mjs', () => ({ loadRehearsalPolicy: m.load }));
vi.mock('../../scripts/lib/initial-doctor-scope.mjs', () => ({ loadInitialDoctorScope: m.loadInitial, assertInitialDoctorJob: m.initialJob }));
vi.mock('@privy-io/server-auth', () => ({ PrivyClient: class { getUserByEmail=m.byEmail; getUser=m.user; walletApi={}; } }));
vi.mock('@/lib/stellar/privy-wallet-binding', () => ({ resolveStellarWallet: m.wallet }));
vi.mock('../../scripts/lib/private-registry.mjs', () => ({ readAuthorization: m.read, PRIVATE_REGISTRY_ID: 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2' }));
import { assertRehearsalDoctorAuthorization, requestDoctorAuthorization, REGISTRY_ADMIN, PRIVATE_REGISTRY } from '@/lib/doctor-authorizations';
import { RX_PRIVATE } from '@/lib/private-config';
const now=1_900_000_000, key='ab'.repeat(32), wallet='synthetic-doctor-wallet';
const actor={userId:'did:privy:reviewer',email:'reviewer@example.test'};
const doctor={id:10,email:'doctor@example.test',status:'active'};
const auth={requestId:'11111111-2222-4333-8444-555555555555',dossierId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',validUntil:now+86400,expectedVersion:3,targetVersion:4,method:'reauthorize_doctor'};
let plan:any;
function sqlFixture(pending?:any, stored?:any) {
  const query=vi.fn(async(..._args:unknown[])=>[{id:plan.authorization.requestId,state:'pending',action:'renew',method:plan.authorization.method}]);
  const tag=vi.fn(async(strings:TemplateStringsArray)=>{
    const text=strings.join('?');
    if(text.includes('FROM doctors'))return [doctor];
    if(text.includes('FROM doctor_authorization_requests WHERE contract_id'))return pending?[pending]:[];
    if(text.includes('doctor_private_dossiers'))return stored?[stored]:[];
    return [];
  });
  return {sql:Object.assign(tag,{query}) as unknown as Sql,tag,query};
}
beforeEach(()=>{
  vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(now*1000);
  for(const [name,value] of Object.entries({TRUSTLEAF_ENV:'local',TRUSTLEAF_PRIVATE_WRITES_ENABLED:'false',VERCEL_ENV:'',
    TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',DATABASE_URL:'postgres://test:test@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test',
    PRIVY_APP_ID:'cmrix722m03d30clewd1fuffq',NEXT_PUBLIC_PRIVY_APP_ID:'cmrix722m03d30clewd1fuffq',PRIVY_APP_SECRET:'synthetic',TRUSTLEAF_DATA_KEY:key,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:REGISTRY_ADMIN,BOOKING_AUTHORITY_PUBLIC_KEY:REGISTRY_ADMIN,DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:PRIVATE_REGISTRY,
    PRESCRIPTION_PRIVATE_CONTRACT_ID:RX_PRIVATE,NEXT_PUBLIC_STELLAR_NETWORK:'testnet',NEXT_PUBLIC_SOROBAN_RPC_URL:'https://soroban-testnet.stellar.org'}))vi.stubEnv(name,value);
  plan={createdAt:now,doctorValidUntil:now+86400,doctorId:10,admin:REGISTRY_ADMIN,registryId:PRIVATE_REGISTRY,reviewer:actor,
    doctor:{userId:'did:privy:doctor',walletId:'verified-wallet',address:wallet},authorization:auth};
  m.load.mockImplementation(()=>structuredClone(plan));m.byEmail.mockResolvedValue({id:plan.doctor.userId});
  m.user.mockResolvedValue({email:{address:doctor.email}});m.wallet.mockResolvedValue({walletId:plan.doctor.walletId,address:wallet});
  m.read.mockResolvedValue({authorized:false,authorization:{version:3,revoked:false,valid_until:now-1},admin:REGISTRY_ADMIN});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('builds only the approved fixed24h encrypted dossier and request IDs, leaving general writes off',async()=>{
  const {sql,query}=sqlFixture();
  await requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true});
  expect(query).toHaveBeenCalledOnce();const params=query.mock.calls[0][1] as unknown[];
  const dossier=decryptDossier(String(params[6]),key,auth.dossierId);
  expect(dossier).toMatchObject({wallet,version:4,validUntil:now+86400,reviewedBy:actor.userId});
  expect(commitmentFor(dossier)).toBe(params[5]);expect(params[0]).toBe(auth.dossierId);expect(params[7]).toBe(auth.requestId);
  expect(params[4]).toBe(now+86400);expect(m.load).toHaveBeenCalledWith({requireApproval:true});
  expect(process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED).toBe('false');expect(m.wallet).toHaveBeenCalledTimes(2);
});

it('enqueues the exact initial authorization with version 0→1 and no general writes', async () => {
  const authorization = { ...auth, method: 'authorize_doctor', expectedVersion: 0, targetVersion: 1, validUntil: now + 30 * 86400 };
  m.loadInitial.mockReturnValue({ ...plan, policyHash: 'initial', doctor: { ...plan.doctor, email: doctor.email }, authorization });
  m.read.mockResolvedValue({ authorization: null, authorized: false, admin: REGISTRY_ADMIN });
  const { sql, query } = sqlFixture();
  query.mockResolvedValueOnce([]);
  await requestDoctorAuthorization(sql, actor, doctor.id, 'authorize', { initial: true, transactional: true });
  expect(query).toHaveBeenCalledTimes(2);
  const params = query.mock.calls[1][1] as unknown[];
  expect(params.slice(0, 5)).toEqual([authorization.dossierId, PRIVATE_REGISTRY, wallet, 1, authorization.validUntil]);
  expect(params[7]).toBe(authorization.requestId);
  expect(params.slice(14)).toEqual(['authorize', 'authorize_doctor', 0, null]);
  expect(decryptDossier(String(params[6]), key, authorization.dossierId)).toMatchObject({
    wallet, version: 1, validUntil: authorization.validUntil, reviewedBy: actor.userId,
  });
  expect(process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED).toBe('false');
});

it('rejects an alternate request before creating an initial dossier', async () => {
  m.loadInitial.mockReturnValue({ ...plan, policyHash: 'initial', doctor: { ...plan.doctor, email: doctor.email } });
  const { sql, query } = sqlFixture();
  query.mockResolvedValueOnce([{ id: 'alternate' }]);
  await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize', { initial: true, transactional: true }))
    .rejects.toThrow('initial_doctor_authorization_requires_reconciliation');
  expect(query).toHaveBeenCalledTimes(1);
  expect(m.read).not.toHaveBeenCalled();
});
it('does not bypass general writes without the internal rehearsal option',async()=>{
  const {sql,tag,query}=sqlFixture();await expect(requestDoctorAuthorization(sql,actor,10,'renew')).rejects.toMatchObject({message:'private_writes_paused'});
  expect(tag).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
});
it.each(['authorize','revoke','mint'])('rejects another action %s before any SQL',async action=>{
  const {sql,tag,query}=sqlFixture();await expect(requestDoctorAuthorization(sql,actor,10,action,{rehearsal:true})).rejects.toMatchObject({status:403});
  expect(tag).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
});
it.each([{userId:'did:privy:other',email:actor.email},{...actor,email:'other@example.test'}])('requires the exact authenticated reviewer',async other=>{
  const {sql,tag}=sqlFixture();await expect(requestDoctorAuthorization(sql,other,10,'renew',{rehearsal:true})).rejects.toMatchObject({status:403});expect(tag).not.toHaveBeenCalled();
});
it('requires the exact target doctor and current verified wallet',async()=>{
  expect(()=>assertRehearsalDoctorAuthorization(actor,11,'renew')).toThrow('clinical_rehearsal_authorization_rejected');
  const {sql,query}=sqlFixture();m.wallet.mockResolvedValue({walletId:'changed',address:wallet});
  await expect(requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true})).rejects.toMatchObject({status:403});expect(query).not.toHaveBeenCalled();
});
it.each([null,new Error('clinical_rehearsal_approval_required'),new Error('clinical_rehearsal_expired')])('requires approved live policy before SQL',async value=>{
  m.load.mockImplementation(()=>{if(value instanceof Error)throw value;return value;});
  const {sql,tag,query}=sqlFixture();await expect(requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true})).rejects.toMatchObject({status:403});
  expect(tag).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
});
it('rejects a pending authorization outside the approved request rather than accepting its longer lifetime',async()=>{
  const {sql,query}=sqlFixture({id:'other-request',action:'renew',onboarding_submission_id:null});
  await expect(requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true})).rejects.toMatchObject({status:403});expect(query).not.toHaveBeenCalled();
});
it('does not reuse an unrelated or failed unsigned dossier for the scoped request',async()=>{
  const {sql,query}=sqlFixture(undefined,{id:'failed-request'});
  await expect(requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true})).rejects.toMatchObject({message:'clinical_rehearsal_authorization_requires_reconciliation'});
  expect(query).not.toHaveBeenCalled();
});
it('rechecks approval and current binding immediately before storing the encrypted request',async()=>{
  const {sql,query}=sqlFixture();let calls=0;
  m.load.mockImplementation(()=>{if(++calls===3)throw new Error('clinical_rehearsal_approval_required');return structuredClone(plan);});
  await expect(requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true})).rejects.toMatchObject({status:403});expect(query).not.toHaveBeenCalled();
});
it('accepts the same pending request only when its fixed scope and encrypted dossier still match',async()=>{
  const dossier={schemaVersion:1,network:'testnet',contractId:PRIVATE_REGISTRY,wallet,version:4,validUntil:auth.validUntil,fullName:'Synthetic',license:'TEST',specialty:'Test',verificationSource:'Synthetic',reviewedBy:actor.userId,reviewedAt:new Date(now*1000).toISOString(),blinding:'cd'.repeat(32)};
  const commitment=commitmentFor(dossier), encrypted=encryptDossier(dossier,key,auth.dossierId);
  const pending={id:auth.requestId,dossier_id:auth.dossierId,method:auth.method,action:'renew',state:'pending',expected_version:3,target_version:4,
    valid_until:auth.validUntil,requested_by:actor.userId,requested_email:actor.email,doctor_id:10,doctor_user_id:plan.doctor.userId,doctor_email:doctor.email,wallet_id:plan.doctor.walletId,wallet,network:'testnet',contract_id:PRIVATE_REGISTRY,commitment,onboarding_submission_id:null};
  const stored={wallet,network:'testnet',contract_id:PRIVATE_REGISTRY,version:4,valid_until:auth.validUntil,commitment,encrypted_dossier:encrypted};
  const {sql,query}=sqlFixture(pending,stored);
  expect((await requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true})).request).toMatchObject({id:auth.requestId,state:'pending'});
  expect(query).not.toHaveBeenCalled();
});

it('continues from registry v4 to v5 with the expiry frozen at approval rather than request time',async()=>{
  const approvedAt=now-60;
  plan={...plan,schemaVersion:2,createdAt:approvedAt,doctorValidUntil:approvedAt+86400,
    authorization:{...auth,requestId:'22222222-3333-4444-8555-666666666666',dossierId:'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',expectedVersion:4,targetVersion:5,validUntil:approvedAt+86400}};
  vi.setSystemTime((now+300)*1000);
  m.read.mockResolvedValue({authorized:false,authorization:{version:4,revoked:false,valid_until:now-1},admin:REGISTRY_ADMIN});
  const {sql,query}=sqlFixture();
  await requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true});
  expect(query).toHaveBeenCalledOnce();const params=query.mock.calls[0][1] as unknown[];
  const dossier=decryptDossier(String(params[6]),key,plan.authorization.dossierId);
  expect(dossier).toMatchObject({wallet,version:5,validUntil:approvedAt+86400,reviewedBy:actor.userId});
  expect(params[0]).toBe(plan.authorization.dossierId);expect(params[7]).toBe(plan.authorization.requestId);
  expect(params[3]).toBe(5);expect(params[4]).toBe(approvedAt+86400);expect(params[16]).toBe(4);
  expect(params[4]).not.toBe(now+300+86400);expect(process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED).toBe('false');
});
it('rejects a changed registry baseline in a continuation without creating a v5 request',async()=>{
  plan={...plan,schemaVersion:2,authorization:{...auth,expectedVersion:4,targetVersion:5}};
  const {sql,query}=sqlFixture();
  await expect(requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true})).rejects.toMatchObject({message:'clinical_rehearsal_authorization_rejected'});
  expect(query).not.toHaveBeenCalled();
});
it('rejects a moved approval-derived expiry during the final scope recheck',async()=>{
  plan={...plan,schemaVersion:2,authorization:{...auth,expectedVersion:4,targetVersion:5}};
  m.read.mockResolvedValue({authorized:false,authorization:{version:4,revoked:false,valid_until:now-1},admin:REGISTRY_ADMIN});
  let loads=0;m.load.mockImplementation(()=>++loads===3?{...structuredClone(plan),createdAt:now+1,doctorValidUntil:now+86401,authorization:{...plan.authorization,validUntil:now+86401}}:structuredClone(plan));
  const {sql,query}=sqlFixture();
  await expect(requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true})).rejects.toMatchObject({message:'clinical_rehearsal_authorization_rejected'});
  expect(query).not.toHaveBeenCalled();
});

it('schema12 freezes the exact seven-day v5 to v6 renewal at its own approval',async()=>{
 const approvedAt=now-60;
 plan={...plan,schemaVersion:2,createdAt:approvedAt,until:approvedAt+14400,doctorValidUntil:approvedAt+604800,
  authorization:{...auth,expectedVersion:5,targetVersion:6,validUntil:approvedAt+604800},
  completionContinuation:{approvedAt,executionUntil:approvedAt+14400,doctorWindowSeconds:604800}};
 m.read.mockResolvedValue({authorized:false,authorization:{version:5,revoked:false,valid_until:now-1},admin:REGISTRY_ADMIN});
 const {sql,query}=sqlFixture();await requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true,transactional:true});
 const params=query.mock.calls[0][1] as unknown[],dossier=decryptDossier(String(params[6]),key,auth.dossierId);
 expect(dossier).toMatchObject({wallet,version:6,validUntil:approvedAt+604800,reviewedBy:actor.userId});
 expect(params[3]).toBe(6);expect(params[16]).toBe(5);expect(params[4]).toBe(approvedAt+604800);
 expect(process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED).toBe('false');
});
it.each(['withoutMetadata','wrongDuration','movedAnchor','movedWindow'])('does not extend renewal lifetime through %s',async variation=>{
 plan={...plan,schemaVersion:2,until:now+14400,doctorValidUntil:now+604800,authorization:{...auth,expectedVersion:5,targetVersion:6,validUntil:now+604800},
  completionContinuation:{approvedAt:now,executionUntil:now+14400,doctorWindowSeconds:604800}};
 if(variation==='withoutMetadata')delete plan.completionContinuation;
 if(variation==='wrongDuration')plan.completionContinuation.doctorWindowSeconds=86400;
 if(variation==='movedAnchor')plan.completionContinuation.approvedAt=now+1;
 if(variation==='movedWindow')plan.completionContinuation.executionUntil++;
 const {sql,tag,query}=sqlFixture();await expect(requestDoctorAuthorization(sql,actor,10,'renew',{rehearsal:true})).rejects.toMatchObject({status:403});
 expect(tag).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
});
