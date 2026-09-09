import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT } from '@/app/api/doctor/profile/route';
import { PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';

const mocks=vi.hoisted(()=>({actor:vi.fn(),sql:vi.fn(),db:vi.fn(),wallet:vi.fn(),doctor:vi.fn()}));
vi.mock('@/lib/auth/privy-auth',()=>({requireUser:mocks.actor,unauthorized:()=>Response.json({error:'unauthorized'},{status:401})}));
vi.mock('@/lib/db',()=>({getDb:mocks.db}));
vi.mock('@/lib/doctor-authorizations',()=>({verifiedWallet:mocks.wallet,resolveDoctor:mocks.doctor,
  DoctorAuthorizationError:class extends Error{constructor(message:string,public status=409){super(message);}}}));

const actor={userId:'did:privy:doctor',email:'doctor@example.test'};
const profile={id:21,email:actor.email,name:'Synthetic doctor',status:'pending'};
const wallet={walletId:'doctor-wallet',address:'verified-stellar-address'};
const req=(method='GET',body:unknown={bio:'Updated synthetic profile'},origin='http://localhost:3002')=>new Request('http://localhost:3002/api/doctor/profile',{
  method,headers:{host:'localhost:3002',origin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
beforeEach(()=>{
  vi.resetAllMocks();
  const env={TRUSTLEAF_ENV:'local',TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',
    DATABASE_URL:'postgresql://test:test@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test',PRIVY_APP_ID:PRIVY_APP,NEXT_PUBLIC_PRIVY_APP_ID:PRIVY_APP,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:REGISTRY_PRIVATE,PRESCRIPTION_PRIVATE_CONTRACT_ID:RX_PRIVATE,DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:PRIVATE_ADMIN,
    BOOKING_AUTHORITY_PUBLIC_KEY:PRIVATE_ADMIN,TRUSTLEAF_PRIVATE_WRITES_ENABLED:'true',VERCEL_ENV:'',TRUSTLEAF_REQUIRE_AUTH:'false'};
  for(const [key,value]of Object.entries(env))vi.stubEnv(key,value);
  mocks.actor.mockResolvedValue(actor);mocks.db.mockReturnValue(mocks.sql);mocks.sql.mockResolvedValue([profile]);
  mocks.wallet.mockResolvedValue(wallet);mocks.doctor.mockResolvedValue({doctor:profile,userId:actor.userId,...wallet});
});
afterEach(()=>vi.unstubAllEnvs());

describe('private doctor profile boundary',()=>{
  it('requires a Privy session even with the historical auth switch off',async()=>{
    mocks.actor.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);expect((await PUT(req('PUT'))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects another database or Privy application before touching data',async()=>{
    for(const [key,value]of [['DATABASE_URL','postgresql://test:test@production.example.test/test'],['PRIVY_APP_ID','other-app']]) {
      const previous=process.env[key];vi.stubEnv(key,value);
      expect((await GET(req())).status).toBe(503);expect((await PUT(req('PUT'))).status).toBe(503);
      vi.stubEnv(key,previous);
    }
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('permits own pending-profile reading while writes are paused, without requiring on-chain approval',async()=>{
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false');
    const response=await GET(req());expect(response.status).toBe(200);expect(await response.json()).toEqual({data:profile});
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.wallet).toHaveBeenCalledWith(mocks.sql,actor.userId,actor.email);
    expect((await PUT(req('PUT'))).status).toBe(503);
    expect(mocks.sql.mock.calls.some(([query])=>query.join('').startsWith('UPDATE'))).toBe(false);
  });
  it.each(['https://foreign.example.test',''])('rejects PUT from a foreign or missing Origin: %s',async origin=>{
    expect((await PUT(req('PUT',{},origin))).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([{userId:'did:privy:other'},{walletId:'changed-wallet'},{address:'changed-address'},{doctor:{...profile,email:'other@example.test'}}])('rejects mismatched owner/binding %#',async patch=>{
    mocks.doctor.mockResolvedValue({doctor:profile,userId:actor.userId,...wallet,...patch});
    expect((await GET(req())).status).toBe(403);expect((await PUT(req('PUT'))).status).toBe(403);
    expect(mocks.sql.mock.calls.some(([query])=>query.join('').startsWith('UPDATE'))).toBe(false);
  });
  it.each(['email','userId','wallet','walletId','status','id'])('never lets profile editing change %s',async key=>{
    expect((await PUT(req('PUT',{[key]:'caller-selected'}))).status).toBe(400);expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([null,[],{}, {bio:42},{name:' '},{bio:'x'.repeat(2001)},{telemedicine:'false'}])('rejects malformed profile body %#',async body=>{
    expect((await PUT(req('PUT',body))).status).toBe(400);expect(mocks.db).not.toHaveBeenCalled();
  });
  it('updates permitted fields only under the resolved ID and verified email, without changing pending status',async()=>{
    const response=await PUT(req('PUT',{bio:' synthetic ',telemedicine:false}));
    expect(response.status).toBe(200);expect(await response.json()).toEqual({data:profile});
    const update=mocks.sql.mock.calls.find(([query])=>query.join('').startsWith('UPDATE'))!;
    expect(update[0].join('')).toContain('WHERE id=');expect(update[0].join('')).toContain('AND LOWER(email)=');
    expect(update.slice(-2)).toEqual([21,actor.email]);expect(update).toContain('synthetic');expect(update).toContain(false);
    expect(update[0].join('')).not.toMatch(/SET\s+status|,\s*status\s*=/);
  });
  it('returns no profile for an unregistered participant and never creates one via PUT',async()=>{
    mocks.sql.mockResolvedValue([]);
    expect(await (await GET(req())).json()).toEqual({data:null});expect((await PUT(req('PUT'))).status).toBe(404);
    expect(mocks.doctor).not.toHaveBeenCalled();
  });
});
