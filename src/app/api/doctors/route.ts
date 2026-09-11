import { isApprovedDoctor } from '@/lib/doctor-access';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/auth/privy-auth';
import { privateApi, privateBody } from '@/lib/private-api';
import { saveDoctorApplication } from '@/lib/doctor-onboarding';
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';
import { DoctorAuthorizationError, resolveDoctor, readPrivateDoctor } from '@/lib/doctor-authorizations';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request:Request){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  try{
    assertPrivateEnvironment();const sql=getDb();
    const rows=await sql`SELECT id,name,email,specialty,telemedicine,center_name FROM doctors WHERE status='active' ORDER BY name`;
    const doctors=[];
    for(const row of rows){
      try{
        const resolved=await resolveDoctor(sql,Number(row.id));
        if((await isApprovedDoctor(sql,Number(resolved.doctor.id),{...resolved,email:String(resolved.doctor.email)})))doctors.push(row);
      }catch(error){
        // A historical profile without a Privy account is not a bookable private doctor.
        if(error instanceof DoctorAuthorizationError&&error.message==='doctor_privy_login_required')continue;
        throw error;
      }
    }
    return json({doctors});
  }catch{return json({error:'doctor_directory_unavailable'},503);}
}

// Compatibility entry shares the same identity, encrypted revision and review.
export function POST(request: Request) {
  return privateApi(request, async actor => {
    const body = await privateBody(request, ['name', 'email', 'specialty', 'licenseNum', 'rut']);
    if (body.email !== undefined && (typeof body.email !== 'string' || body.email.trim().toLowerCase() !== actor.email?.toLowerCase())) {
      throw new PrivateFlowError('invalid_doctor_profile', 400);
    }
    const result = await saveDoctorApplication(getDb(), actor, body, true);
    return { success: true, doctor: result.profile, onboarding: result.onboarding };
  });
}
