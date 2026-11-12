import { NextResponse } from 'next/server';
import { requireUser, unauthorized } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { getDb } from '@/lib/db';
import { PrivateFlowError } from '@/lib/private-config';
import { BookingPreparationError, bookingTransaction, preparePrescriptionBooking, privateBookingStatus, requestBookingCancellation } from '@/lib/prescription-booking';
import { assertPrivateRxLoopback, currentPrivateRxScope, privateRxAppointmentScope, privateRxRole, privateRxScopeConfigured } from '@/lib/digital-cabs-rx';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
  if(error instanceof BookingPreparationError)return json({error:error.code},error.status);
  if(error instanceof PrivateFlowError)return json({error:error.message},error.status);
  return json({error:'booking_unavailable'},503);
}
async function handle(request:Request,cancel:boolean){
  let actor;
  try { actor=privateRxScopeConfigured()?await requireUser(request,{strict:true}):await requireUser(request); } catch(error) { return failure(error); }
  if(!actor?.email)return unauthorized();
  if(!isSameOrigin(request))return json({error:'forbidden'},403);
  let body:Record<string,unknown>;
  try{body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return json({error:'invalid_json'},400);}
  if(Object.keys(body).some(k=>!['appointmentId','confirmRequest'].includes(k))||!Number.isSafeInteger(body.appointmentId)||Number(body.appointmentId)<1||(!cancel&&body.confirmRequest!==true))return json({error:'explicit_booking_request_required'},400);
  try {
    const scope=privateRxAppointmentScope(currentPrivateRxScope()), id=Number(body.appointmentId);
    if(scope && cancel) throw new PrivateFlowError('private_rx_scope_rejected',403);
    if(scope){assertPrivateRxLoopback(request);privateRxRole(scope,actor);}
    const result=scope ? await bookingTransaction(sql=>preparePrescriptionBooking(sql,actor,id,scope),scope)
      : await bookingTransaction<unknown>(sql=>cancel?requestBookingCancellation(sql,actor,id):preparePrescriptionBooking(sql,actor,id));
    return json(result,202);
  } catch(error) { return failure(error); }
}
export const POST=(request:Request)=>handle(request,false);
export const DELETE=(request:Request)=>handle(request,true);
export async function GET(request:Request){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  const id=Number(new URL(request.url).searchParams.get('appointmentId'));
  if(!Number.isSafeInteger(id)||id<1)return json({error:'invalid_appointment'},400);
  try{return json(await privateBookingStatus(getDb(),actor,id));}catch(error){return failure(error);}
}
