import { isApprovedDoctor } from '@/lib/doctor-access';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/auth/privy-auth';
import { assertPrivateEnvironment, PRIVY_APP } from '@/lib/private-config';
import { availableAppointmentSlots, BookingPreparationError, privateRxOneTimeSlotAvailable, validBookingDate } from '@/lib/prescription-booking';
import { resolveDoctor, readPrivateDoctor } from '@/lib/doctor-authorizations';
import { assertPrivateRxActor, currentPrivateRxScope } from '@/lib/digital-cabs-rx';
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
    const next=p.get('nextAvailable')==='true', doctorEmail=String(doctor.doctor.email);
    let data=await availableAppointmentSlots(sql,doctorEmail,date,next);
    // Other users keep the normal availability view; a stale/closed scope adds nothing.
    try {
      const scope=currentPrivateRxScope();
      if(scope?.phase==='appointment'&&scope.slot.oneTime===true&&scope.patient.userId===actor.userId&&scope.doctorId===id&&scope.slot.date===date&&
        /^(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?$/.test(request.headers.get('host')??'')&&(!data.date||data.date>=date)) {
        assertPrivateRxActor(scope,{userId:doctor.userId,email:doctorEmail},doctor,'doctor');
        const time=scope.slot.timeSlot;
        if(data.date===date)data={...data,slots:data.slots.filter(slot=>slot.time!==time)};
        const rows=await sql.query('SELECT 1 FROM privy_stellar_wallet_bindings WHERE app_id=$1 AND user_id=$2 AND wallet_id=$3 AND address=$4 LIMIT 2',
          [PRIVY_APP,scope.patient.userId,scope.patient.walletId,scope.patient.address]);
        if(rows.length===1&&await privateRxOneTimeSlotAvailable(sql,scope,doctorEmail)) {
          const old=data.date===date?data.slots:[];
          const slots=[...old,{time,available:true}].sort((a,b)=>String(a.time).localeCompare(String(b.time)));
          if (typeof data.weekday === 'number' && old.length === 0) {
            data = { ...data, date, slots, slot_minutes: 30 };
          } else {
            data = { ...data, date, slots };
          }
        }
      }
    }catch { /* An unavailable proof cannot advertise an extra slot. */ }
    return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof BookingPreparationError?error.code:'slots_unavailable'}, {status:error instanceof BookingPreparationError?error.status:503});}
}
