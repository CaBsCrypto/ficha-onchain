import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { assertPrivateEnvironment,assertPrivateWrites,PrivateFlowError } from '@/lib/private-config';
import { createDoctorInvitation } from '@/lib/doctor-onboarding';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
  if(error instanceof PrivateFlowError)return json({error:error.message},error.status);
  if((error as {code?:string})?.code==='23505')return json({error:'doctor_email_already_exists'},409);
  return json({error:'doctor_profile_unavailable'},503);
}
export async function GET(request:Request){
  const auth=await requirePrivyAdmin(request);if('error' in auth)return auth.error;
  try{assertPrivateEnvironment();const sql=getDb();
    const doctors=await sql`SELECT id,name,email,specialty,license_num,rut,status,created_at FROM doctors ORDER BY created_at DESC`;
    return json({count:doctors.length,doctors});
  }catch(error){return failure(error);}
}
const limits:Record<string,number>={name:160,email:254,specialty:200,licenseNum:80,rut:30};
async function mutate(request:Request,edit:boolean){
  const auth=await requirePrivyAdmin(request);if('error' in auth)return auth.error;
  if(!isSameOrigin(request))return json({error:'forbidden'},403);
  let body:Record<string,unknown>;
  try{body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return json({error:'invalid_json'},400);}
  if('status' in body)return json({error:'use_private_registry_authorization'},409);
  if(Object.keys(body).some(k=>!(k in limits)&&!(edit&&k==='id'))||Object.entries(body).some(([k,v])=>k!=='id'&&(typeof v!=='string'||v.length>limits[k])))return json({error:'invalid_doctor_profile'},400);
  if(edit&&(!Number.isSafeInteger(body.id)||Number(body.id)<1))return json({error:'invalid_doctor'},400);
  const name=typeof body.name==='string'?body.name.trim():null,email=typeof body.email==='string'?body.email.trim().toLowerCase():null;
  if((!edit&&(!name||!email))||(name!==null&&!name)||(email!==null&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return json({error:'invalid_doctor_profile'},400);
  if(edit&&Object.keys(body).length===1)return json({error:'empty_doctor_update'},400);
  const specialty=typeof body.specialty==='string'?body.specialty.trim()||null:null;
  const license=typeof body.licenseNum==='string'?body.licenseNum.trim()||null:null;
  const rut=typeof body.rut==='string'?body.rut.trim()||null:null;
  try{
    assertPrivateWrites();const sql=getDb();
    if(!edit){
      const invitation=await createDoctorInvitation(sql,auth.user,{name,email,specialty,licenseNum:license,rut});
      return json({success:true,...invitation},201);
    }
    // Profile editing cannot reassign a Privy identity or manufacture chain authorization.
    const [doctor]=await sql`UPDATE doctors SET name=COALESCE(${name},name),
      specialty=CASE WHEN ${'specialty' in body} THEN ${specialty} ELSE specialty END,
      license_num=CASE WHEN ${'licenseNum' in body} THEN ${license} ELSE license_num END,
      rut=CASE WHEN ${'rut' in body} THEN ${rut} ELSE rut END,updated_at=NOW()
      WHERE id=${Number(body.id)} AND (${email}::text IS NULL OR LOWER(email)=${email})
      RETURNING id,name,email,specialty,license_num,rut,status,created_at`;
    if(!doctor){const [exists]=await sql`SELECT id FROM doctors WHERE id=${Number(body.id)}`;
      return json({error:exists?'doctor_identity_change_not_allowed':'doctor_not_found'},exists?409:404);}
    return json({success:true,doctor});
  }catch(error){return failure(error);}
}
export const POST=(request:Request)=>mutate(request,false);
export const PATCH=(request:Request)=>mutate(request,true);
export async function DELETE(request:Request){
  const auth=await requirePrivyAdmin(request);if('error' in auth)return auth.error;
  return json({error:'doctor_history_must_be_preserved'},405);
}
