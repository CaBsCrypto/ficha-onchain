import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireUser, unauthorized } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { PrivateFlowError } from '@/lib/private-config';
import { BookingPreparationError, bookingTransaction, changePrivateAppointment, createPrivateAppointment, listPrivateAppointments } from '@/lib/prescription-booking';
import { assertPrivateRxActor, assertPrivateRxCreate, assertPrivateRxLoopback, currentPrivateRxScope, privateRxAppointmentScope, privateRxScopeConfigured } from '@/lib/digital-cabs-rx';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
  if(error instanceof BookingPreparationError)return json({error:error.code},error.status);
  if(error instanceof PrivateFlowError)return json({error:error.message},error.status);
  if((error as {code?:string})?.code==='23505')return json({error:'slot_not_available'},409);
  return json({error:'appointments_unavailable'},503);
}
export async function GET(request:Request){
  const actor=await requireUser(request);if(!actor?.email)return unauthorized();
  const params=new URL(request.url).searchParams;
  const legacyDoctor=params.get('doctorEmail'),legacyPatient=params.get('patientEmail');
  if((legacyDoctor&&legacyPatient)||[legacyDoctor,legacyPatient].some(email=>email!==null&&email.toLowerCase()!==actor.email))return json({error:'forbidden'},403);
  const role=params.get('role')??(legacyDoctor?'doctor':legacyPatient?'patient':null);
  if(!['doctor','patient'].includes(role??''))return json({error:'role_required'},400);
  try{return json(await listPrivateAppointments(getDb(),actor,role as 'doctor'|'patient'));}catch(error){return failure(error);}
}
async function mutate(request:Request,patch:boolean){
  let actor;
  try { actor=privateRxScopeConfigured()?await requireUser(request,{strict:true}):await requireUser(request); } catch(error) { return failure(error); }
  if(!actor?.email)return unauthorized();
  if(!isSameOrigin(request))return json({error:'forbidden'},403);
  let body:Record<string,unknown>;
  try{body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return json({error:'invalid_json'},400);}
  if(patch){
    if(Object.keys(body).some(k=>!['id','action'].includes(k))||!Number.isSafeInteger(body.id)||Number(body.id)<1||!['attend','start','complete','cancel'].includes(String(body.action)))return json({error:'invalid_appointment_action'},400);
    try {
      const scope=privateRxAppointmentScope(currentPrivateRxScope()), action=body.action as 'attend'|'start'|'complete'|'cancel';
      if(scope) {
        assertPrivateRxLoopback(request);
        if(action!=='attend'&&action!=='start')throw new PrivateFlowError('private_rx_scope_rejected',403);
        assertPrivateRxActor(scope,actor,undefined,action==='attend'?'patient':'doctor');
      }
      const result=scope ? await bookingTransaction(sql=>changePrivateAppointment(sql,actor,Number(body.id),action,scope),scope)
        : await bookingTransaction(sql=>changePrivateAppointment(sql,actor,Number(body.id),action));
      return json(result,action==='cancel'?202:200);
    } catch(error) { return failure(error); }
  }
  if(Object.keys(body).some(k=>!['doctorId','date','timeSlot','type'].includes(k))||!Number.isSafeInteger(body.doctorId)||Number(body.doctorId)<1||typeof body.date!=='string'||typeof body.timeSlot!=='string'||(body.type!==undefined&&typeof body.type!=='string'))return json({error:'invalid_appointment'},400);
  try {
    const scope=privateRxAppointmentScope(currentPrivateRxScope());
    const input={doctorId:Number(body.doctorId),date:String(body.date),timeSlot:String(body.timeSlot),type:body.type as string|undefined};
    if(scope){assertPrivateRxLoopback(request);assertPrivateRxCreate(scope,actor,input);}
    const result=scope ? await bookingTransaction(sql=>createPrivateAppointment(sql,actor,input,scope),scope)
      : await bookingTransaction(sql=>createPrivateAppointment(sql,actor,input));
    return json(result,201);
  } catch(error) { return failure(error); }
}
export const POST=(request:Request)=>mutate(request,false);
export const PATCH=(request:Request)=>mutate(request,true);
export async function DELETE(){return json({error:'use_cancellation_action'},405);}
