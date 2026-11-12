import * as closure from '../../scripts/lib/clinical-rehearsal-closure.mjs';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/db';
const m = vi.hoisted(() => ({ resolve: vi.fn(), request: vi.fn(), gate: vi.fn(), initial: vi.fn(), approve: vi.fn(), transaction: vi.fn(), submission: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: m.resolve, requestDoctorAuthorization: m.request, assertRehearsalDoctorAuthorization: m.gate, assertInitialDoctorAuthorization: m.initial }));
vi.mock('@/lib/doctor-onboarding', () => ({ approveDoctorOnboarding: m.approve, onboardingTransaction: m.transaction, readDoctorSubmission: m.submission }));
import { requestReviewedDoctorAuthorization } from '@/lib/reviewed-doctor-authorization';
const sql = { query: m.query } as unknown as Sql;
const actor = { userId: 'admin-test', email: 'admin@example.test' };
const owner = { userId: 'doctor-test', walletId: 'wallet-test', address: 'stellar-test' };
beforeEach(() => {
  vi.resetAllMocks();
  m.resolve.mockResolvedValue({ ...owner, doctor: { id: 1, email: 'doctor@example.test' } });
  m.transaction.mockImplementation(async (_email, run) => run(sql));
  m.query.mockResolvedValue([]);
});
it('does not authorize a pending legacy profile without a reviewed submission', async () => {
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, status: 'pending' }]).mockResolvedValueOnce([]);
  await expect(requestReviewedDoctorAuthorization(sql, actor, 1, 'authorize')).rejects.toThrow('onboarding_submission_required');
  expect(m.request).not.toHaveBeenCalled();
});
it.each(['draft', 'changes_requested', 'rejected', 'invited'])('blocks %s even when a chain authorization already exists', async state => {
  m.query.mockResolvedValueOnce([{ state }]).mockResolvedValueOnce([{ id: 1, status: 'active' }]).mockResolvedValueOnce([{ state, current_submission_id: 'revision-1' }]);
  await expect(requestReviewedDoctorAuthorization(sql, actor, 1, 'renew', 'revision-1')).rejects.toThrow('onboarding_state_changed');
  expect(m.request).not.toHaveBeenCalled();
});
it('routes a submitted revision through the transactional approval gate', async () => {
  const snapshot = { id: 'revision-1', owner };
  m.query.mockResolvedValueOnce([{ state: 'submitted' }]);
  m.approve.mockImplementation(async (_sql, _actor, _id, revision, prepare) => {
    expect(revision).toBe('revision-1');
    return prepare(sql, snapshot);
  });
  await requestReviewedDoctorAuthorization(sql, actor, 1, 'renew', 'revision-1');
  expect(m.request).toHaveBeenCalledWith(sql, actor, 1, 'renew', { submission: snapshot, transactional: true });
});
it('rejects a stale reviewed revision before renewal', async () => {
  m.query.mockResolvedValueOnce([{ state: 'authorized' }]).mockResolvedValueOnce([{ id: 1, status: 'active' }]).mockResolvedValueOnce([{ state: 'authorized', current_submission_id: 'revision-2' }]);
  await expect(requestReviewedDoctorAuthorization(sql, actor, 1, 'renew', 'revision-1')).rejects.toThrow('onboarding_state_changed');
  expect(m.request).not.toHaveBeenCalled();
});
it.each(['active','blocked'])('preserves renewal for a previously approved %s profile without onboarding', async status => {
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, status }]).mockResolvedValueOnce([]);
  await requestReviewedDoctorAuthorization(sql, actor, 1, 'renew');
  expect(m.request).toHaveBeenCalledWith(sql, actor, 1, 'renew', { transactional: true });
});

it('rechecks the internal approved rehearsal gate while retaining the reviewed transaction path',async()=>{
  const policy={reviewer:actor,doctorId:1,authorization:{requestId:'fixed-request'}};
  const gate=m.gate.mockReturnValue(policy);
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:1,status:'active'}]).mockResolvedValueOnce([]);
  m.transaction.mockImplementation(async(_email,run,options)=>{await options.rehearsalWriteScope();return run(sql);});
  await requestReviewedDoctorAuthorization(sql,actor,1,'renew',undefined,{rehearsal:true});
  expect(gate).toHaveBeenCalledTimes(3);
  expect(m.request).toHaveBeenCalledWith(sql,actor,1,'renew',{rehearsal:true,transactional:true});
});

it('rechecks the exact initial authorization scope under the legacy profile lock', async () => {
  const plan = { policyHash: 'approved', authorization: { requestId: 'fixed-initial-request' } };
  m.initial.mockReturnValue(plan);
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, status: 'active' }]).mockResolvedValueOnce([]);
  m.transaction.mockImplementation(async (_email, run, options) => {
    await options.rehearsalWriteScope();
    return run(sql);
  });
  await requestReviewedDoctorAuthorization(sql, actor, 1, 'authorize', undefined, { initial: true });
  expect(m.initial).toHaveBeenCalledTimes(3);
  expect(m.approve).not.toHaveBeenCalled();
  expect(m.request).toHaveBeenCalledWith(sql, actor, 1, 'authorize', { initial: true, transactional: true });
});

it('blocks an initial authorization if an onboarding revision appears after review', async () => {
  m.initial.mockReturnValue({ policyHash: 'approved' });
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, status: 'active' }]).mockResolvedValueOnce([{ state: 'submitted' }]);
  await expect(requestReviewedDoctorAuthorization(sql, actor, 1, 'authorize', undefined, { initial: true })).rejects.toThrow('onboarding_state_changed');
  expect(m.approve).not.toHaveBeenCalled();
  expect(m.request).not.toHaveBeenCalled();
});

it('does not accept a submission id under the exact legacy initial scope', async () => {
  await expect(requestReviewedDoctorAuthorization(sql, actor, 1, 'authorize', 'supplied', { initial: true })).rejects.toThrow('initial_doctor_authorization_rejected');
  expect(m.transaction).not.toHaveBeenCalled();
  expect(m.request).not.toHaveBeenCalled();
});

it('stops rehearsal renewal before the transaction when current onboarding has not been reviewed',async()=>{
  m.gate.mockReturnValue({policyHash:'same'});m.query.mockResolvedValueOnce([{state:'submitted'}]);
  await expect(requestReviewedDoctorAuthorization(sql,actor,1,'renew','revision-1',{rehearsal:true})).rejects.toThrow('onboarding_state_changed');
  expect(m.approve).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();expect(m.request).not.toHaveBeenCalled();
});
it('does not prepare a rehearsal renewal when approval is withdrawn while the transaction scope is rechecked',async()=>{
  m.gate.mockReturnValueOnce({policyHash:'same'}).mockReturnValueOnce({policyHash:'same'})
    .mockImplementationOnce(()=>{throw Error('clinical_rehearsal_approval_required');});
  m.query.mockResolvedValueOnce([]);
  m.transaction.mockImplementation(async(_email,_run,options)=>{await options.rehearsalWriteScope();});
  await expect(requestReviewedDoctorAuthorization(sql,actor,1,'renew',undefined,{rehearsal:true})).rejects.toThrow('clinical_rehearsal_approval_required');
  expect(m.request).not.toHaveBeenCalled();
});

it.each([false,true])('checks continuation closure under the transaction run lock before enqueue (closed=%s)',async closed=>{
  const revokeId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const policy={schemaVersion:2,runId:'11111111-2222-4333-8444-555555555555',policyHash:'same',reviewer:actor,doctorId:1,authorization:{requestId:'new-renewal'},steps:[{key:'revoke',requestId:revokeId}]};
  m.gate.mockReturnValue(policy);
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:1,status:'active'}]).mockResolvedValueOnce([]);
  const client={query:vi.fn(async(statement:string)=>({rows:statement.startsWith('SELECT id FROM clinical_web_operations')&&closed?[{id:revokeId}]:[]}))};
  m.transaction.mockImplementation(async(_email,run,options)=>{await options.rehearsalWriteScope();await client.query('BEGIN');await options.rehearsalWriteScope(client);return run(sql);});
  const result=requestReviewedDoctorAuthorization(sql,actor,1,'renew',undefined,{rehearsal:true});
  if(closed){await expect(result).rejects.toMatchObject({message:'clinical_rehearsal_order_conflict',status:409});expect(m.request).not.toHaveBeenCalled();}
  else {await result;expect(m.request).toHaveBeenCalledWith(sql,actor,1,'renew',{rehearsal:true,transactional:true});}
  expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))',['clinical-rehearsal:'+policy.runId]);
  expect(client.query).toHaveBeenCalledWith('SELECT id FROM clinical_web_operations WHERE id=$1',[revokeId]);
});

it('passes only the exact schema12 renewal step to the transaction closure before enqueue',async()=>{
 const renew={key:'renew',requestId:'11111111-2222-4333-8444-555555555555',actor:'admin',action:'renew',maxFeeStroops:'10000000'};
 const policy={schemaVersion:2,runId:'22222222-3333-4444-8555-666666666666',policyHash:'same',completionContinuation:{doctorWindowSeconds:604800},authorization:{requestId:renew.requestId},steps:[renew]};
 m.gate.mockReturnValue(policy);m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:1,status:'active'}]).mockResolvedValueOnce([]);
 const client={query:vi.fn(async()=>({rows:[]}))},open=vi.spyOn(closure,'assertRehearsalOpen').mockResolvedValue(undefined);
 try{
  m.transaction.mockImplementation(async(_email,run,options)=>{await options.rehearsalWriteScope(client);return run(sql);});
  await requestReviewedDoctorAuthorization(sql,actor,1,'renew',undefined,{rehearsal:true});
  expect(open).toHaveBeenCalledExactlyOnceWith(client,policy,{step:renew});
  expect(open.mock.invocationCallOrder[0]).toBeLessThan(m.request.mock.invocationCallOrder[0]);
 }finally{open.mockRestore();}
});
