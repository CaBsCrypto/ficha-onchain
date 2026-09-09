import { NextResponse } from 'next/server';
import { requireUser, unauthorized } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { getDb } from '@/lib/db';
import { PrivateFlowError } from '@/lib/private-config';
import { BookingPreparationError, bookingTransaction, preparePrescriptionBooking, privateBookingStatus, requestBookingCancellation } from '@/lib/prescription-booking';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
  if(error instanceof BookingPreparationError)return json({error:error.code},error.status);
  if(error instanceof PrivateFlowError)return json({error:error.message},error.status);
  return json({error:'booking_unavailable'},503);
}
async function handle(request:Request,cancel:boolean){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  if(!isSameOrigin(request))return json({error:'forbidden'},403);
  let body:Record<string,unknown>;
  try{body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return json({error:'invalid_json'},400);}
  if(Object.keys(body).some(k=>!['appointmentId','confirmRequest'].includes(k))||!Number.isSafeInteger(body.appointmentId)||Number(body.appointmentId)<1||(!cancel&&body.confirmRequest!==true))return json({error:'explicit_booking_request_required'},400);
  try{return json(await bookingTransaction<unknown>(sql=>cancel?requestBookingCancellation(sql,actor,Number(body.appointmentId)):preparePrescriptionBooking(sql,actor,Number(body.appointmentId))),202);}catch(error){return failure(error);}
}
export const POST=(request:Request)=>handle(request,false);
export const DELETE=(request:Request)=>handle(request,true);
export async function GET(request:Request){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  const id=Number(new URL(request.url).searchParams.get('appointmentId'));
  if(!Number.isSafeInteger(id)||id<1)return json({error:'invalid_appointment'},400);
  try{return json(await privateBookingStatus(getDb(),actor,id));}catch(error){return failure(error);}
}
