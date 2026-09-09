import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/auth/privy-auth';
import { assertPrivateEnvironment } from '@/lib/private-config';
import { DoctorAuthorizationError, resolveDoctor, readPrivateDoctor } from '@/lib/doctor-authorizations';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  try{
    assertPrivateEnvironment();const sql=getDb();
    const rows=await sql`SELECT id,name,email,specialty,telemedicine,center_name FROM doctors WHERE status='active' ORDER BY name`;
    const doctors=[];
    for(const row of rows){
      try{
        const resolved=await resolveDoctor(sql,Number(row.id));
        if((await readPrivateDoctor(resolved.address)).authorized)doctors.push(row);
      }catch(error){
        // A historical profile without a Privy account is not a bookable private doctor.
        if(error instanceof DoctorAuthorizationError&&error.message==='doctor_privy_login_required')continue;
        throw error;
      }
    }
    return NextResponse.json({doctors},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'doctor_directory_unavailable'},{status:503});}
}
export async function POST(request:Request){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  return NextResponse.json({error:'doctor_registration_requires_admin_review'},{status:409});
}
