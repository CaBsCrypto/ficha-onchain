import { NextResponse } from 'next/server';
import { getDb, type Sql } from '@/lib/db';
import { requireUser, unauthorized, type AuthedUser } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { AccessServiceError } from '@/lib/auth/access-error';
import { DoctorAuthorizationError } from '@/lib/doctor-authorizations';
import { PrivateFlowError } from '@/lib/private-config';
import { WalletBindingError } from '@/lib/stellar/privy-wallet-binding';
import { BookingPreparationError, bookingTransaction, changePrivateAppointment, createPrivateAppointment, listPrivateAppointments, validBookingDate, validBookingTime,
  type AppointmentAction, type AppointmentInput } from '@/lib/prescription-booking';
import { assertPrivateRxActor, assertPrivateRxCreate, assertPrivateRxOrigin, assertPrivateRxScopeOpen, currentPrivateRxScope,
  lockHostedPrivateRxMutation, privateRxAppointmentScope, privateRxScopeConfigured, type PrivateRxAppointmentScope } from '@/lib/digital-cabs-rx';
import { canBookHostedAppointment, classifyHostedAppointment, regularAppointmentsEnabled } from '@/lib/regular-appointments';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
  if(error instanceof BookingPreparationError)return json({error:error.code},error.status);
  if(error instanceof PrivateFlowError)return json({error:error.message},error.status);
  if(error instanceof AccessServiceError)return json({error:error.code},503);
  if(error instanceof WalletBindingError)return json({error:error.message},409);
  if((error as {code?:string})?.code==='23505')return json({error:'slot_not_available'},409);
  if(error instanceof DoctorAuthorizationError)return json({error:error.message},error.status);
  return json({error:'appointments_unavailable'},503);
}
export async function GET(request:Request){
  try {
    const regular = regularAppointmentsEnabled(request);
    const scoped = privateRxScopeConfigured();
    const actor = regular || scoped ? await requireUser(request, { strict: true }) : await requireUser(request);
    if (!actor?.email) return unauthorized();
    const params = new URL(request.url).searchParams;
    const legacyDoctor = params.get('doctorEmail'), legacyPatient = params.get('patientEmail');
    if ((legacyDoctor && legacyPatient) || [legacyDoctor, legacyPatient].some(email => email !== null && email.toLowerCase() !== actor.email)) {
      return json({ error: 'forbidden' }, 403);
    }
    const role = params.get('role') ?? (legacyDoctor ? 'doctor' : legacyPatient ? 'patient' : null);
    if (role !== 'doctor' && role !== 'patient') return json({ error: 'role_required' }, 400);
    const sql = getDb();
    const appointments = await listPrivateAppointments(sql, actor, role, regular ? { existingOnly: true } : undefined);
    if (role !== 'patient' || (!regular && !scoped)) return json(appointments);
    if (regular) return json({ ...appointments, canBook: await canBookHostedAppointment(sql, actor) });
    let canBook = false;
    try {
      const scope = await currentPrivateRxScope();
      canBook = scope?.phase === 'appointment' && scope.patient.userId === actor.userId;
    } catch (error) {
      if (!(error instanceof PrivateFlowError) || error.message !== 'private_rx_scope_expired') throw error;
    }
    return json({ ...appointments, canBook });
  } catch (error) { return failure(error); }
}

type AppointmentMutation = { appointmentId: number; action: AppointmentAction } | { booking: AppointmentInput };

function assertScopedMutation(request: Request, actor: AuthedUser, mutation: AppointmentMutation, scope: PrivateRxAppointmentScope) {
  assertPrivateRxOrigin(request, scope);
  if ('booking' in mutation) {
    assertPrivateRxCreate(scope, actor, mutation.booking);
    return;
  }
  if (mutation.action !== 'attend' && mutation.action !== 'start') throw new PrivateFlowError('private_rx_scope_rejected', 403);
  assertPrivateRxActor(scope, actor, undefined, mutation.action === 'attend' ? 'patient' : 'doctor');
}

async function runAppointmentMutation(request: Request, actor: AuthedUser, mutation: AppointmentMutation, regular: boolean) {
  const run = (sql: Sql, policy?: PrivateRxAppointmentScope | 'regular') => 'booking' in mutation
    ? createPrivateAppointment(sql, actor, mutation.booking, policy)
    : changePrivateAppointment(sql, actor, mutation.appointmentId, mutation.action, policy);
  if (!regular) {
    const scope = privateRxAppointmentScope(await currentPrivateRxScope());
    if (scope) assertScopedMutation(request, actor, mutation, scope);
    return bookingTransaction(sql => run(sql, scope), scope);
  }
  return bookingTransaction(async (sql, client) => {
    const route = await classifyHostedAppointment(sql, { actor, ...mutation });
    if (route.kind === 'regular') return run(sql, 'regular');
    if (route.kind === 'protected') throw new PrivateFlowError('private_rx_scope_rejected', 403);
    const scope = route.scope;
    assertScopedMutation(request, actor, mutation, scope);
    await lockHostedPrivateRxMutation(client, scope);
    const result = await run(sql, scope);
    assertPrivateRxScopeOpen(scope);
    return result;
  }, 'regular');
}

async function mutate(request:Request,patch:boolean){
  let actor;
  let regular: boolean;
  try {
    regular = regularAppointmentsEnabled(request);
    actor = regular || privateRxScopeConfigured() ? await requireUser(request, { strict: true }) : await requireUser(request);
  } catch(error) { return failure(error); }
  if(!actor?.email)return unauthorized();
  if(!isSameOrigin(request))return json({error:'forbidden'},403);
  let body:Record<string,unknown>;
  try{body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return json({error:'invalid_json'},400);}
  if(patch){
    if(Object.keys(body).some(k=>!['id','action'].includes(k))||!Number.isSafeInteger(body.id)||Number(body.id)<1||typeof body.action!=='string'||!['attend','start','complete','cancel'].includes(body.action))return json({error:'invalid_appointment_action'},400);
    try {
      const action = body.action as AppointmentAction;
      const result = await runAppointmentMutation(request, actor, { appointmentId: Number(body.id), action }, regular);
      return json(result, action === 'cancel' ? 202 : 200);
    } catch(error) { return failure(error); }
  }
  if(Object.keys(body).some(k=>!['doctorId','date','timeSlot','type'].includes(k))||!Number.isSafeInteger(body.doctorId)||Number(body.doctorId)<1||!validBookingDate(body.date)||!validBookingTime(body.timeSlot)||(body.type!==undefined&&typeof body.type!=='string'))return json({error:'invalid_appointment'},400);
  try {
    const booking={doctorId:Number(body.doctorId),date:String(body.date),timeSlot:String(body.timeSlot),type:body.type as string|undefined};
    const result = await runAppointmentMutation(request, actor, { booking }, regular);
    return json(result,201);
  } catch(error) { return failure(error); }
}
export const POST=(request:Request)=>mutate(request,false);
export const PATCH=(request:Request)=>mutate(request,true);
export async function DELETE(){return json({error:'use_cancellation_action'},405);}
