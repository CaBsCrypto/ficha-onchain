import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { assertPrivateRegistryConfiguration, doctorAuthorizationDetails, DoctorAuthorizationError, resolveDoctor, assertInitialDoctorAuthorization } from '@/lib/doctor-authorizations';
import { requestReviewedDoctorAuthorization } from '@/lib/reviewed-doctor-authorization';
import { PrivateFlowError } from '@/lib/private-config';
import { rehearsalConfigured } from '../../../../../scripts/lib/clinical-rehearsal-policy.mjs';
import { initialDoctorScopeConfigured } from '../../../../../scripts/lib/initial-doctor-scope.mjs';
import { assertRehearsalDoctorAuthorization } from '@/lib/doctor-authorizations';
import { onboardingForDoctor, listDoctorOnboarding } from '@/lib/doctor-onboarding';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function failure(error:unknown){const known=error instanceof DoctorAuthorizationError || error instanceof PrivateFlowError;return NextResponse.json({error:known?error.message:'private_registry_unavailable'}, {status:known?error.status:503});}
export async function GET(request:Request){
  const auth=await requirePrivyAdmin(request);if('error' in auth)return auth.error;
  try{
    assertPrivateRegistryConfiguration();const sql=getDb();
    const value=new URL(request.url).searchParams.get('doctorId');
    if(value===null){return NextResponse.json({doctors:await listDoctorOnboarding(sql),syntheticOnly:true},{headers:{'Cache-Control':'no-store'}});}
    const id=Number(value);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'invalid_doctor'}, {status:400});
    const onboarding=await onboardingForDoctor(sql,id);
    const details=await doctorAuthorizationDetails(sql,id);
    if (initialDoctorScopeConfigured()) {
      let initialAuthorization;
      try {
        if (onboarding || rehearsalConfigured()) throw new Error();
        const plan = assertInitialDoctorAuthorization(auth.user, id, 'authorize', await resolveDoctor(sql, id));
        if (details.wallet !== plan.doctor.address ||
            (details.request && details.request.id !== plan.authorization.requestId) ||
            (details.authorization.version !== 0 && details.request?.id !== plan.authorization.requestId)) throw new Error();
        initialAuthorization = { status: 'active' as const, action: 'authorize' as const,
          validUntil: plan.authorization.validUntil, until: plan.until, maxFeeStroops: plan.maxFeeStroops };
      } catch { initialAuthorization = { status: 'unavailable' as const }; }
      return NextResponse.json({...details,onboarding,initialAuthorization},{headers:{'Cache-Control':'no-store'}});
    }
    let rehearsal;
    if(rehearsalConfigured()){
      try{
        const plan=assertRehearsalDoctorAuthorization(auth.user,id,'renew');
        if(details.wallet!==plan.doctor.address || Number(details.doctor.id)!==plan.doctorId || String(details.doctor.email).toLowerCase()!==plan.doctor.email)throw new Error('scope_binding_changed');
        rehearsal={status:'active' as const,action:'renew' as const,validUntil:plan.doctorValidUntil,until:plan.until,durationHours:plan.completionContinuation ? 168 as const : 24 as const,...(plan.completionContinuation ? {continuationSchema:12 as const} : {}),...(plan.schemaVersion === 2 ? {timeAnchor:'approval' as const} : {})};
      }catch{
        // Keep authorized historical review available, without falling back to a normal write scope.
        rehearsal={status:'unavailable' as const};
      }
    }
    return NextResponse.json({...details,onboarding,...(rehearsal?{rehearsal}:{})},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request){
  const auth=await requirePrivyAdmin(request);if('error' in auth)return auth.error;
  if(!isSameOrigin(request))return NextResponse.json({error:'forbidden'}, {status:403});
  let b:unknown;try{b=await request.json();}catch{return NextResponse.json({error:'invalid_json'}, {status:400});}
  if(!b||typeof b!=='object'||Array.isArray(b))return NextResponse.json({error:'invalid_request'}, {status:400});
  const v=b as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['doctorId','action','confirmed','synthetic','submissionId'].includes(k)) || (v.submissionId!==undefined && (typeof v.submissionId!=='string'||v.submissionId.length>100)) || !Number.isSafeInteger(v.doctorId)||Number(v.doctorId)<1 || !['authorize','renew','revoke'].includes(String(v.action))||v.confirmed!==true||v.synthetic!==true)return NextResponse.json({error:'explicit_synthetic_confirmation_required'}, {status:400});
  try{
    assertPrivateRegistryConfiguration();
    const rehearsal = rehearsalConfigured();
    if (initialDoctorScopeConfigured()) {
      if (rehearsal || v.submissionId !== undefined) throw new DoctorAuthorizationError('initial_doctor_authorization_rejected',403);
      assertInitialDoctorAuthorization(auth.user, Number(v.doctorId), String(v.action));
      const result = await requestReviewedDoctorAuthorization(getDb(),auth.user,Number(v.doctorId),String(v.action),undefined,{initial:true});
      return NextResponse.json(result,{status:202});
    }
    if (rehearsal) assertRehearsalDoctorAuthorization(auth.user,Number(v.doctorId),String(v.action));
    const result = rehearsal
      ? await requestReviewedDoctorAuthorization(getDb(),auth.user,Number(v.doctorId),String(v.action),v.submissionId as string|undefined,{rehearsal:true})
      : await requestReviewedDoctorAuthorization(getDb(),auth.user,Number(v.doctorId),String(v.action),v.submissionId as string|undefined);
    return NextResponse.json(result,{status:202});
  }catch(error){return failure(error);}
}
