import { isApprovedDoctor } from '@/lib/doctor-access';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/auth/privy-auth';
import { assertPrivateEnvironment } from '@/lib/private-config';
import { availableAppointmentSlots, BookingPreparationError, validBookingDate } from '@/lib/prescription-booking';
import { resolveDoctor, readPrivateDoctor } from '@/lib/doctor-authorizations';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  const p=new URL(request.url).searchParams,date=p.get('date'),requestedId=p.get('doctorId');
  if(!validBookingDate(date))return NextResponse.json({error:'invalid_date'},{status:400});
  try{
    assertPrivateEnvironment();const sql=getDb();
    let id=requestedId===null?null:Number(requestedId);
    if(id===null){const [row]=await sql`SELECT id FROM doctors WHERE LOWER(email)=${p.get('doctorEmail')?.trim().toLowerCase()??''}`;id=row?.id??null;}
    if(!Number.isSafeInteger(id)||Number(id)<1)return NextResponse.json({error:'invalid_doctor'},{status:400});
    const doctor=await resolveDoctor(sql,Number(id));
    if(!(await isApprovedDoctor(sql,Number(doctor.doctor.id),{...doctor,email:String(doctor.doctor.email)})))return NextResponse.json({error:'doctor_not_authorized'},{status:403});
    // Never expose another patient's occupied slot or identity, including ?all=1.
    return NextResponse.json({data:await availableAppointmentSlots(sql,String(doctor.doctor.email),date)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof BookingPreparationError?error.code:'slots_unavailable'}, {status:error instanceof BookingPreparationError?error.status:503});}
}
