import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),sql:vi.fn(),query:vi.fn(),tx:vi.fn(),release:vi.fn(),doctor:vi.fn(),registry:vi.fn(),apply:vi.fn()}));
vi.mock('@/lib/doctor-onboarding',()=>({saveDoctorApplication:mocks.apply,isDoctorLocallyApproved:async()=>true}));
vi.mock('@/lib/auth/privy-auth',()=>({requireUser:mocks.user,unauthorized:()=>Response.json({error:'unauthorized'},{status:401})}));
vi.mock('@/lib/db',()=>({getDb:()=>Object.assign(mocks.sql,{query:mocks.query}),getDbConnection:async()=>({query:mocks.tx,release:mocks.release}),sqlForConnection:()=>Object.assign(mocks.sql,{query:mocks.query})}));
vi.mock('@/lib/api/errors',()=>({dbNotConfiguredResponse:()=>null}));
vi.mock('@/lib/doctor-authorizations',()=>({resolveDoctor:mocks.doctor,readPrivateDoctor:mocks.registry,verifiedWallet:vi.fn(),DoctorAuthorizationError:class extends Error{}}));
vi.mock('@/lib/private-config',async original=>({...await original<typeof import('@/lib/private-config')>(),assertPrivateEnvironment:vi.fn(),assertPrivateWrites:vi.fn(),PRIVY_APP:'app',RX_PRIVATE:'private-contract'}));
import { PrivateFlowError } from '@/lib/private-config';
import {GET as availability,PUT as saveAvailability} from '@/app/api/doctor/availability/route';
import {GET as slots} from '@/app/api/doctor/slots/route';
import {GET as doctors,POST as register} from '@/app/api/doctors/route';
const actor={userId:'did:privy:doctor',email:'doctor@example.test'};
const blocks=[{weekday:3,start_time:'10:00',end_time:'12:00',slot_minutes:30},{weekday:4,start_time:'10:00',end_time:'12:00',slot_minutes:30}];
const put=(body:unknown)=>new Request('http://localhost/api/doctor/availability',{method:'PUT',headers:{'Content-Type':'application/json',host:'localhost',origin:'http://localhost'},body:JSON.stringify(body)});
beforeEach(()=>{
  vi.resetAllMocks();mocks.user.mockResolvedValue(actor);mocks.sql.mockResolvedValue([]);mocks.query.mockResolvedValue([]);mocks.tx.mockResolvedValue({rows:[]});
  mocks.doctor.mockResolvedValue({userId:actor.userId,address:'doctor-wallet',doctor:{id:10,email:actor.email}});mocks.registry.mockResolvedValue({authorized:true});
});
afterEach(()=>vi.restoreAllMocks());
describe('private agenda API',()=>{
  it('requires Privy login on directory, slots, schedule and registration',async()=>{
    mocks.user.mockResolvedValue(null);
    for(const handler of [availability,slots,doctors,register])expect((await handler(new Request('http://localhost/api/test'))).status).toBe(401);
    expect((await saveAvailability(put({blocks}))).status).toBe(401);expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rejects another doctor’s schedule and forbids duplicate registration',async()=>{
    expect((await availability(new Request('http://localhost/api/doctor/availability?doctorEmail=foreign@example.test'))).status).toBe(403);
    expect((await saveAvailability(put({doctorEmail:'foreign@example.test',blocks}))).status).toBe(403);
    mocks.apply.mockRejectedValueOnce(new PrivateFlowError('onboarding_state_changed'));
    expect((await register(put({name:'Fake doctor',email:actor.email}))).status).toBe(409);
  });
  it('creates pending doctor application for authenticated self-onboarding',async()=>{
    mocks.apply.mockResolvedValue({profile:{id:10,name:'Dr. Test',status:'pending'},onboarding:{state:'submitted'}});
    const res = await register(put({name:'Dr. Test',specialty:'Medicina General',licenseNum:'12345',rut:'12.345.678-9'}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({success:true,doctor:{id:10,name:'Dr. Test',status:'pending'},onboarding:{state:'submitted'}});
    expect(mocks.apply).toHaveBeenCalledWith(expect.anything(),actor,expect.objectContaining({name:'Dr. Test'}),true);
  });
  it('rejects forged schedule bodies and overlapping blocks before mutation',async()=>{
    for(const body of [{doctorEmail:42,blocks},{blocks:[null]},{blocks:[blocks[0],blocks[0]]}])expect((await saveAvailability(put(body))).status).toBeGreaterThanOrEqual(400);
    expect(mocks.tx).not.toHaveBeenCalled();
  });
  it('requires the verified doctor and registry approval before replacing availability',async()=>{
    mocks.sql.mockResolvedValueOnce([{id:10}]);mocks.registry.mockResolvedValue({authorized:false});
    expect((await saveAvailability(put({blocks}))).status).toBe(403);
    expect(mocks.sql).toHaveBeenCalledTimes(1);expect(mocks.tx).toHaveBeenCalledWith('ROLLBACK');
  });
  it('keeps the whole previous schedule when the second insert fails',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    mocks.sql.mockResolvedValueOnce([{id:10}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('test insert failure'));
    expect((await saveAvailability(put({blocks}))).status).toBe(500);
    expect(mocks.tx).toHaveBeenCalledWith('BEGIN');expect(mocks.tx).toHaveBeenCalledWith('ROLLBACK');expect(mocks.tx).not.toHaveBeenCalledWith('COMMIT');expect(mocks.release).toHaveBeenCalled();
  });
  it('commits a verified schedule exactly once and returns the saved grid',async()=>{
    mocks.sql.mockResolvedValueOnce([{id:10}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(blocks);
    const response=await saveAvailability(put({blocks}));expect(response.status).toBe(200);expect(await response.json()).toEqual({data:blocks});
    expect(mocks.tx).toHaveBeenCalledWith('COMMIT');expect(mocks.tx).not.toHaveBeenCalledWith('ROLLBACK');
  });
  it('does not list a doctor whose database role is active but registry authorization is revoked',async()=>{
    mocks.sql.mockResolvedValue([{id:10,name:'Test doctor'}]);mocks.registry.mockResolvedValue({authorized:false});
    expect(await (await doctors(new Request('http://localhost/api/doctors'))).json()).toEqual({doctors:[]});
  });
  it('does not present a provider failure as an empty successful directory',async()=>{
    mocks.sql.mockResolvedValue([{id:10}]);mocks.registry.mockRejectedValue(new Error('RPC unavailable'));
    const response=await doctors(new Request('http://localhost/api/doctors'));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'doctor_directory_unavailable'});
  });
  it('never exposes occupied-patient data for ?all=1 and uses the selected doctor ID',async()=>{
    mocks.query.mockResolvedValue([{time:'10:00',slot_minutes:30,patient_name:'Private name'}]);
    const response=await slots(new Request('http://localhost/api/doctor/slots?doctorId=10&date=2026-09-09&all=1'));
    expect(response.status).toBe(200);expect(mocks.doctor.mock.calls[0][1]).toBe(10);
    expect((await response.json()).data.slots).toEqual([{time:'10:00',available:true}]);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
