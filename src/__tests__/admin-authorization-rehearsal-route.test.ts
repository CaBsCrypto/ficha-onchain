import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),config:vi.fn(),configured:vi.fn(),gate:vi.fn(),request:vi.fn(),db:vi.fn(),details:vi.fn(),onboarding:vi.fn(),list:vi.fn()}));
vi.mock('@/lib/auth/admin',()=>({requirePrivyAdmin:m.auth}));
vi.mock('@/lib/db',()=>({getDb:m.db}));
vi.mock('../../scripts/lib/clinical-rehearsal-policy.mjs',()=>({rehearsalConfigured:m.configured}));
vi.mock('@/lib/doctor-authorizations',()=>({assertPrivateRegistryConfiguration:m.config,assertRehearsalDoctorAuthorization:m.gate,
  doctorAuthorizationDetails:m.details,DoctorAuthorizationError:class extends Error{constructor(message:string,public status=409){super(message);}}}));
vi.mock('@/lib/reviewed-doctor-authorization',()=>({requestReviewedDoctorAuthorization:m.request}));
vi.mock('@/lib/doctor-onboarding',()=>({onboardingForDoctor:m.onboarding,listDoctorOnboarding:m.list}));
import {GET,POST} from '@/app/api/admin/doctor-authorizations/route';
import {DoctorAuthorizationError} from '@/lib/doctor-authorizations';
const reviewer={userId:'did:privy:reviewer',email:'reviewer@example.test'};
const payload={doctorId:10,action:'renew',confirmed:true,synthetic:true};
const request=(body:unknown=payload,origin='http://localhost:3016')=>new Request('http://localhost:3016/api/admin/doctor-authorizations',{
  method:'POST',headers:{'Content-Type':'application/json',origin,host:'localhost:3016'},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({user:reviewer});m.configured.mockReturnValue(true);m.db.mockReturnValue('scoped-db');
  m.gate.mockImplementation((actor:any,id:number,action:string)=>{
    if(actor.userId!==reviewer.userId||actor.email!==reviewer.email||id!==10||action!=='renew')throw new DoctorAuthorizationError('clinical_rehearsal_authorization_rejected',403);
    return {};
  });m.request.mockResolvedValue({request:{id:'fixed-request',state:'pending'}});
});
it('uses the existing real admin session and server-approved rehearsal option only',async()=>{
  const response=await POST(request());expect(response.status).toBe(202);
  expect(m.gate).toHaveBeenCalledWith(reviewer,10,'renew');
  expect(m.request).toHaveBeenCalledWith('scoped-db',reviewer,10,'renew',undefined,{rehearsal:true});
});
it('retains the ordinary reviewed path when the rehearsal is not configured',async()=>{
  m.configured.mockReturnValue(false);expect((await POST(request())).status).toBe(202);
  expect(m.gate).not.toHaveBeenCalled();expect(m.request).toHaveBeenCalledWith('scoped-db',reviewer,10,'renew',undefined);
});
it.each(['validUntil','requestId','dossierId','rehearsal','wallet','reviewer'])('rejects browser-supplied policy field %s',async key=>{
  expect((await POST(request({...payload,[key]:'forged'}))).status).toBe(400);
  expect(m.request).not.toHaveBeenCalled();expect(m.gate).not.toHaveBeenCalled();
});
it.each([{...payload,doctorId:11},{...payload,action:'authorize'},{...payload,action:'revoke'}])('rejects another target or action during rehearsal',async body=>{
  expect((await POST(request(body))).status).toBe(403);expect(m.db).not.toHaveBeenCalled();expect(m.request).not.toHaveBeenCalled();
});
it('requires approval before database access',async()=>{
  m.gate.mockImplementation(()=>{throw new DoctorAuthorizationError('clinical_rehearsal_approval_required',403);});
  expect((await POST(request())).status).toBe(403);expect(m.db).not.toHaveBeenCalled();expect(m.request).not.toHaveBeenCalled();
});
it('does not accept another authenticated admin in place of the pinned reviewer',async()=>{
  m.auth.mockResolvedValue({user:{...reviewer,userId:'did:privy:other-admin'}});
  expect((await POST(request())).status).toBe(403);expect(m.db).not.toHaveBeenCalled();expect(m.request).not.toHaveBeenCalled();
});
it('retains strict authentication and same-origin checks before the rehearsal gate',async()=>{
  m.auth.mockResolvedValueOnce({error:Response.json({error:'unauthorized'},{status:401})});
  expect((await POST(request())).status).toBe(401);expect(m.gate).not.toHaveBeenCalled();
  expect((await POST(request(payload,'https://other.example.test'))).status).toBe(403);expect(m.gate).not.toHaveBeenCalled();
});

const scope={doctorId:10,doctor:{address:'G'+'D'.repeat(55),email:'doctor@example.test'},doctorValidUntil:1900000000,until:1899935200};
it('projects only exact approved renewal metadata to the matching reviewer and doctor',async()=>{
 m.gate.mockReturnValue(scope);m.details.mockResolvedValue({doctor:{id:10,email:scope.doctor.email},wallet:scope.doctor.address,syntheticOnly:true});m.onboarding.mockResolvedValue(null);
 const response=await GET(new Request('http://localhost:3016/api/admin/doctor-authorizations?doctorId=10'));
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');const body=await response.json();expect(body.rehearsal).toEqual({status:'active',action:'renew',validUntil:scope.doctorValidUntil,until:scope.until,durationHours:24});expect(m.gate).toHaveBeenCalledWith(reviewer,10,'renew');expect(m.request).not.toHaveBeenCalled();
});
it('preserves authorized historical review with no confirmation scope when the renewal gate rejects',async()=>{
 m.gate.mockImplementation(()=>{throw new DoctorAuthorizationError('clinical_rehearsal_expired',403);});m.details.mockResolvedValue({doctor:{id:11,email:'other@example.test'},wallet:'other-wallet',dossier:{fullName:'Historical synthetic doctor'}});
 const response=await GET(new Request('http://localhost:3016/api/admin/doctor-authorizations?doctorId=11'));expect(response.status).toBe(200);const body=await response.json();expect(body.rehearsal).toEqual({status:'unavailable'});expect(body.dossier.fullName).toBe('Historical synthetic doctor');expect(m.request).not.toHaveBeenCalled();
});
it('does not expose approved dates for a changed doctor wallet and keeps ordinary metadata absent outside rehearsal',async()=>{
 m.gate.mockReturnValue(scope);m.details.mockResolvedValue({doctor:{id:10,email:scope.doctor.email},wallet:'changed-wallet',syntheticOnly:true});const read=()=>GET(new Request('http://localhost:3016/api/admin/doctor-authorizations?doctorId=10'));
 expect((await (await read()).json()).rehearsal).toEqual({status:'unavailable'});m.configured.mockReturnValue(false);expect((await (await read()).json()).rehearsal).toBeUndefined();expect(m.request).not.toHaveBeenCalled();
});

it('projects the approval timing anchor only for an exact approved v2 continuation',async()=>{
 m.gate.mockReturnValue({...scope,schemaVersion:2});m.details.mockResolvedValue({doctor:{id:10,email:scope.doctor.email},wallet:scope.doctor.address,syntheticOnly:true});m.onboarding.mockResolvedValue(null);
 const body=await (await GET(new Request('http://localhost:3016/api/admin/doctor-authorizations?doctorId=10'))).json();
 expect(body.rehearsal).toEqual({status:'active',action:'renew',validUntil:scope.doctorValidUntil,until:scope.until,durationHours:24,timeAnchor:'approval'});
 expect(body.rehearsal.approvedAt).toBeUndefined();expect(m.request).not.toHaveBeenCalled();
});

it('projects seven days only for the approved schema12 completion metadata',async()=>{
 m.gate.mockReturnValue({...scope,schemaVersion:2,completionContinuation:{doctorWindowSeconds:604800}});
 m.details.mockResolvedValue({doctor:{id:10,email:scope.doctor.email},wallet:scope.doctor.address,syntheticOnly:true});m.onboarding.mockResolvedValue(null);
 const body=await (await GET(new Request('http://localhost:3016/api/admin/doctor-authorizations?doctorId=10'))).json();
 expect(body.rehearsal).toEqual({status:'active',action:'renew',validUntil:scope.doctorValidUntil,until:scope.until,durationHours:168,timeAnchor:'approval',continuationSchema:12});
 expect(body.rehearsal.approvedAt).toBeUndefined();expect(m.request).not.toHaveBeenCalled();
});
