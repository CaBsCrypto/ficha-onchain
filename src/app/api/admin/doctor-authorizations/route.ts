import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { assertPrivateRegistryConfiguration, doctorAuthorizationDetails, DoctorAuthorizationError } from '@/lib/doctor-authorizations';
import { requestReviewedDoctorAuthorization } from '@/lib/reviewed-doctor-authorization';
import { PrivateFlowError } from '@/lib/private-config';
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
    return NextResponse.json({...details,onboarding},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request){
  const auth=await requirePrivyAdmin(request);if('error' in auth)return auth.error;
  if(!isSameOrigin(request))return NextResponse.json({error:'forbidden'}, {status:403});
  let b:unknown;try{b=await request.json();}catch{return NextResponse.json({error:'invalid_json'}, {status:400});}
  if(!b||typeof b!=='object'||Array.isArray(b))return NextResponse.json({error:'invalid_request'}, {status:400});
  const v=b as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['doctorId','action','confirmed','synthetic','submissionId'].includes(k)) || (v.submissionId!==undefined && (typeof v.submissionId!=='string'||v.submissionId.length>100)) || !Number.isSafeInteger(v.doctorId)||Number(v.doctorId)<1 || !['authorize','renew','revoke'].includes(String(v.action))||v.confirmed!==true||v.synthetic!==true)return NextResponse.json({error:'explicit_synthetic_confirmation_required'}, {status:400});
  try{assertPrivateRegistryConfiguration();return NextResponse.json(await requestReviewedDoctorAuthorization(getDb(),auth.user,Number(v.doctorId),String(v.action),v.submissionId as string|undefined),{status:202});}catch(error){return failure(error);}
}
