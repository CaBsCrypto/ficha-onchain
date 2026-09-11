import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import type { Sql } from '@/lib/db';
const mocks=vi.hoisted(()=>({user:vi.fn(),sql:vi.fn(),query:vi.fn(),connectionQuery:vi.fn(),release:vi.fn(),wallet:vi.fn(),doctor:vi.fn(),registry:vi.fn()}));
vi.mock('@/lib/auth/privy-auth',()=>({requireUser:mocks.user,unauthorized:()=>Response.json({error:'unauthorized'},{status:401})}));
vi.mock('@/lib/db',()=>({getDb:()=>Object.assign(mocks.sql,{query:mocks.query}),getDbConnection:async()=>({query:mocks.connectionQuery,release:mocks.release}),sqlForConnection:()=>Object.assign(mocks.sql,{query:mocks.query})}));
vi.mock('@/lib/doctor-authorizations',()=>({verifiedWallet:mocks.wallet,resolveDoctor:mocks.doctor,readPrivateDoctor:mocks.registry}));
import { POST,DELETE,GET } from '@/app/api/prescription-bookings/route';
import { POST as create, PATCH as change, GET as list, DELETE as remove } from '@/app/api/appointments/route';
import { availableAppointmentSlots,changePrivateAppointment,createPrivateAppointment,preparePrescriptionBooking,requestBookingCancellation,validBookingDate } from '@/lib/prescription-booking';
import { RX_PRIVATE,REGISTRY_PRIVATE,PRIVY_APP,PRIVATE_ADMIN } from '@/lib/private-config';
import { createWalletChallenge,completeWalletChallenge } from '@/lib/stellar-wallet-binding';
import { POST as challengePOST,PUT as challengePUT } from '@/app/api/stellar-wallet-binding/route';

const patient={userId:'did:privy:patient',email:'patient@example.test'}, doctor={userId:'did:privy:doctor',email:'doctor@example.test'};
const patientAddress=Keypair.random().publicKey(),doctorAddress=Keypair.random().publicKey();
const sql=()=>Object.assign(mocks.sql,{query:mocks.query}) as unknown as Sql;
const request=(body:unknown={},method='POST',headers:Record<string,string>={})=>new Request('http://localhost/api/appointments',{method,headers:{'Content-Type':'application/json',host:'localhost',origin:'http://localhost',...headers},body:JSON.stringify(body)});
const appt=(extra:Record<string,unknown>={})=>({id:11,doctor_id:10,doctor_email:doctor.email,doctor_user_id:doctor.userId,doctor_wallet_id:'doctor-wallet',doctor_wallet:doctorAddress,
  patient_email:patient.email,patient_user_id:patient.userId,patient_wallet_id:'patient-wallet',patient_wallet:patientAddress,patient_name:'Synthetic patient',
  date:'2026-09-09',time_slot:'10:00',type:'Telemedicina',status:'in_progress',attendance_user_id:patient.userId,attendance_at:'2026-09-09T13:00:00Z',started_by:doctor.userId,started_at:'2026-09-09T13:00:00Z',booking:null,...extra});
const booking=(extra:Record<string,unknown>={})=>({appointment_id:11,issuance_id:'ab'.repeat(32),state:'prepared',valid_until:2_000_000_000,patient_wallet:patientAddress,doctor_wallet:doctorAddress,contract_id:RX_PRIVATE,...extra});
beforeEach(()=>{
  vi.resetAllMocks();
  const env={NEXT_PUBLIC_STELLAR_NETWORK:'testnet',NEXT_PUBLIC_SOROBAN_RPC_URL:'https://soroban-testnet.stellar.org',TRUSTLEAF_ENV:'local',TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',
    DATABASE_URL:'postgres://test:test@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test',PRIVY_APP_ID:PRIVY_APP,NEXT_PUBLIC_PRIVY_APP_ID:PRIVY_APP,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:REGISTRY_PRIVATE,PRESCRIPTION_PRIVATE_CONTRACT_ID:RX_PRIVATE,DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:PRIVATE_ADMIN,BOOKING_AUTHORITY_PUBLIC_KEY:PRIVATE_ADMIN,
    TRUSTLEAF_PRIVATE_WRITES_ENABLED:'true',TRUSTLEAF_REQUIRE_AUTH:'false',VERCEL_ENV:''};
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  mocks.user.mockResolvedValue(patient);mocks.sql.mockResolvedValue([]);mocks.query.mockResolvedValue([]);mocks.connectionQuery.mockResolvedValue({rows:[]});
  mocks.wallet.mockImplementation(async(_sql,id)=>id===patient.userId?{walletId:'patient-wallet',address:patientAddress}:{walletId:'doctor-wallet',address:doctorAddress});
  mocks.doctor.mockResolvedValue({userId:doctor.userId,walletId:'doctor-wallet',address:doctorAddress,doctor:{id:10,email:doctor.email}});
  mocks.registry.mockResolvedValue({authorized:true});
});
afterEach(()=>vi.unstubAllEnvs());

describe('strict appointment and booking boundaries',()=>{
  it('rejects missing sessions even with historical demo mode enabled',async()=>{
    mocks.user.mockResolvedValue(null);
    for(const handler of [POST,DELETE,create,change,challengePOST,challengePUT])expect((await handler(request({appointmentId:11,confirmRequest:true}))).status).toBe(401);
    expect((await GET(new Request('http://localhost/api/prescription-bookings?appointmentId=11'))).status).toBe(401);
    expect((await list(new Request('http://localhost/api/appointments?role=patient'))).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('requires explicit preparation and rejects caller-selected participants',async()=>{
    expect((await POST(request({appointmentId:11}))).status).toBe(400);
    expect((await POST(request({appointmentId:11,confirmRequest:true,patient:doctorAddress}))).status).toBe(400);
    expect((await create(request({doctorId:10,date:'2026-09-09',timeSlot:'10:00',patientEmail:'other@example.test'}))).status).toBe(400);
    expect(mocks.connectionQuery).not.toHaveBeenCalled();
  });
  it('blocks arbitrary status updates and destructive appointment deletion',async()=>{
    expect((await change(request({id:11,status:'in_progress'},'PATCH'))).status).toBe(400);
    expect((await remove()).status).toBe(405);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rejects a foreign origin before database access',async()=>{
    expect((await create(request({doctorId:10,date:'2026-09-09',timeSlot:'10:00'},'POST',{origin:'https://other.test'}))).status).toBe(403);
    expect((await POST(request({appointmentId:11,confirmRequest:true},'POST',{origin:''}))).status).toBe(403);
    expect(mocks.connectionQuery).not.toHaveBeenCalled();
  });
  it('fails closed for a paused write gate or wrong contract',async()=>{
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false');
    expect((await POST(request({appointmentId:11,confirmRequest:true}))).status).toBe(503);
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','true');vi.stubEnv('PRESCRIPTION_PRIVATE_CONTRACT_ID','legacy-contract');
    expect((await POST(request({appointmentId:11,confirmRequest:true}))).status).toBe(503);
    expect(mocks.connectionQuery).not.toHaveBeenCalled();
  });
  it('scopes listing to the authenticated role and rejects foreign email aliases',async()=>{
    expect((await list(new Request('http://localhost/api/appointments?patientEmail=foreign@example.test'))).status).toBe(403);
    mocks.query.mockResolvedValue([appt()]);
    const response=await list(new Request('http://localhost/api/appointments?role=patient'));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.query.mock.calls[0][1]).toEqual([patient.userId,patient.email,'patient-wallet',patientAddress]);
    expect((await response.json()).appointments[0]).not.toHaveProperty('patient_user_id');
  });
  it('does not return another participant’s booking',async()=>{
    expect((await GET(new Request('http://localhost/api/prescription-bookings?appointmentId=11'))).status).toBe(404);
    expect(mocks.query.mock.calls[0][1]).toEqual([11,patient.userId,patient.email]);
  });
});

describe('native Stellar booking preparation',()=>{
  it('returns the same issuance and expiry after a retry without claiming consent',async()=>{
    mocks.query.mockResolvedValue([appt()]);mocks.sql.mockResolvedValue([booking()]);
    const one=await preparePrescriptionBooking(sql(),patient,11),two=await preparePrescriptionBooking(sql(),patient,11);
    expect(one.issuanceId).toBe(two.issuanceId);expect(one.validUntil).toBe(two.validUntil);
    expect(one).toMatchObject({submitted:false,onchainConfirmed:false,consentVerified:false});
    const statement=mocks.sql.mock.calls[0][0].join(' ');
    expect(statement).toContain('privy_stellar_wallet_bindings');expect(statement).not.toContain('stellar_verified_bindings');
  });
  it.each([{attendance_at:null},{attendance_user_id:doctor.userId},{started_by:patient.userId},{status:'cancel_requested'}])('requires separate genuine attendance and doctor start %#',async extra=>{
    mocks.query.mockResolvedValue([appt(extra)]);
    await expect(preparePrescriptionBooking(sql(),patient,11)).rejects.toThrow('booking_not_eligible');
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rejects replaced wallet ownership before enqueueing',async()=>{
    mocks.query.mockResolvedValue([appt()]);mocks.wallet.mockResolvedValue({walletId:'new-wallet',address:patientAddress});
    await expect(preparePrescriptionBooking(sql(),patient,11)).rejects.toThrow('appointment_wallet_changed');expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('blocks an unapproved doctor before enqueueing',async()=>{
    mocks.query.mockResolvedValue([appt()]);mocks.registry.mockResolvedValue({authorized:false});
    await expect(preparePrescriptionBooking(sql(),patient,11)).rejects.toThrow('doctor_not_authorized');expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('retains a consumed issuance on retries rather than creating a second one',async()=>{
    mocks.query.mockResolvedValue([appt()]);mocks.sql.mockResolvedValue([booking({state:'consumed'})]);
    expect((await preparePrescriptionBooking(sql(),patient,11)).state).toBe('consumed');
  });
  it('rolls back the whole route on enqueue failure and never reports success',async()=>{
    mocks.query.mockResolvedValue([appt()]);mocks.sql.mockRejectedValue(new Error('DB unavailable'));
    const response=await POST(request({appointmentId:11,confirmRequest:true}));
    expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'booking_unavailable'});
    expect(mocks.connectionQuery).toHaveBeenCalledWith('ROLLBACK');expect(mocks.connectionQuery).not.toHaveBeenCalledWith('COMMIT');expect(mocks.release).toHaveBeenCalled();
  });
});

describe('attendance, consultation and cancellation transitions',()=>{
  it('records attendance without starting consultation or granting consent',async()=>{
    const waiting=appt({status:'scheduled',attendance_at:null,attendance_user_id:null,started_at:null,started_by:null});
    const attended={...waiting,attendance_at:'2026-09-09T13:00:00Z',attendance_user_id:patient.userId};
    mocks.query.mockResolvedValueOnce([waiting]).mockResolvedValueOnce([attended]);mocks.sql.mockResolvedValueOnce([attended]);
    const result=await changePrivateAppointment(sql(),patient,11,'attend');
    expect(result.appointment.status).toBe('scheduled');expect(result.appointment.started_at).toBeNull();
    expect(mocks.sql).toHaveBeenCalledTimes(1);expect(mocks.sql.mock.calls[0][0].join(' ')).not.toContain('consent');
  });
  it('enqueues exactly one booking when the doctor starts an attended consultation',async()=>{
    const waiting=appt({status:'scheduled',started_at:null,started_by:null});
    mocks.query.mockResolvedValueOnce([waiting]).mockResolvedValueOnce([appt()]).mockResolvedValueOnce([appt({booking:booking()})]);
    mocks.sql.mockResolvedValueOnce([appt()]).mockResolvedValueOnce([booking()]);
    const result=await changePrivateAppointment(sql(),doctor,11,'start');
    expect(result.appointment.status).toBe('in_progress');expect('bookingPending' in result&&result.bookingPending).toBe(true);
    expect(mocks.sql.mock.calls.filter(call=>call[0].join(' ').includes('INSERT INTO prescription_booking_requests'))).toHaveLength(1);
  });
  it.each([[doctor,'attend'],[patient,'start'],[patient,'complete']] as const)('rejects the wrong actor for %s %s',async(actor,action)=>{
    mocks.query.mockResolvedValue([appt()]);
    await expect(changePrivateAppointment(sql(),actor,11,action)).rejects.toThrow('wrong_consultation_role');expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('does not succeed when the check-in window predicate updates no rows',async()=>{
    mocks.query.mockResolvedValue([appt({attendance_at:null})]);mocks.sql.mockResolvedValue([]);
    await expect(changePrivateAppointment(sql(),patient,11,'attend')).rejects.toThrow('consultation_outside_checkin_window');
  });
  it('records cancellation as pending until the worker reconciles its attestation',async()=>{
    mocks.query.mockResolvedValueOnce([appt()]).mockResolvedValueOnce([appt({status:'cancel_requested',booking:booking({state:'cancel_requested'})})]);
    mocks.sql.mockResolvedValueOnce([booking({state:'confirmed'})]).mockResolvedValueOnce([booking({state:'cancel_requested'})]).mockResolvedValueOnce([]);
    const result=await requestBookingCancellation(sql(),patient,11);
    expect(result.state).toBe('cancel_requested');expect(result.onchainRevoked).toBe(false);expect(result.appointment.status).toBe('cancel_requested');
  });
  it('can cancel a reservation that has never acquired a chain booking',async()=>{
    mocks.query.mockResolvedValue([appt({status:'scheduled',started_at:null,booking:null})]);mocks.sql.mockResolvedValue([]);
    const result=await requestBookingCancellation(sql(),patient,11);expect(result.state).toBe('cancelled');expect(result.onchainRevoked).toBe(false);
  });
  it('refuses cancellation after issuance consumed the booking',async()=>{
    mocks.query.mockResolvedValue([appt()]);mocks.sql.mockResolvedValueOnce([booking({state:'consumed'})]);
    await expect(requestBookingCancellation(sql(),patient,11)).rejects.toThrow('booking_already_consumed');expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it('does not complete a consultation before its issuance is confirmed',async()=>{
    mocks.query.mockResolvedValue([appt()]);mocks.sql.mockResolvedValueOnce([booking({state:'confirmed'})]);
    await expect(changePrivateAppointment(sql(),doctor,11,'complete')).rejects.toThrow('complete_requires_issued_prescription');
  });
});

describe('server-validated agenda',()=>{
  it.each(['2026-02-30','2026-13-01','09/09/2026','2026-09-09; DROP TABLE appointments'])('rejects invalid calendar dates: %s',value=>expect(validBookingDate(value)).toBe(false));
  it('accepts a real leap day',()=>expect(validBookingDate('2028-02-29')).toBe(true));
  it('uses the Santiago database clock and never returns occupied patient identities',async()=>{
    mocks.query.mockResolvedValue([{time:'10:00',slot_minutes:30,patient_name:'DO NOT EXPOSE'}]);
    const slots=await availableAppointmentSlots(sql(),doctor.email,'2026-09-09');
    expect(slots.slots).toEqual([{time:'10:00',available:true}]);
    expect(mocks.query.mock.calls[0][0]).toContain("NOW() AT TIME ZONE 'America/Santiago'");
  });
  it('rejects a stale or already booked slot instead of inserting it',async()=>{
    mocks.sql.mockResolvedValueOnce([{id:10}]);mocks.query.mockResolvedValueOnce([]);
    await expect(createPrivateAppointment(sql(),patient,{doctorId:10,date:'2026-09-09',timeSlot:'10:00'})).rejects.toThrow('slot_not_available');
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it('rejects a self-consultation and a doctor without registry approval',async()=>{
    await expect(createPrivateAppointment(sql(),doctor,{doctorId:10,date:'2026-09-09',timeSlot:'10:00'})).rejects.toThrow('distinct_participants_required');
    mocks.registry.mockResolvedValue({authorized:false});
    await expect(createPrivateAppointment(sql(),patient,{doctorId:10,date:'2026-09-09',timeSlot:'10:00'})).rejects.toThrow('doctor_not_authorized');
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});

describe('historical verified ownership challenge remains strict',()=>{
  it('accepts only the exact challenge signature and preserves issuer identity',async()=>{
    const wallet=Keypair.random();mocks.sql.mockResolvedValue([]);
    const challenge=await createWalletChallenge(sql(),patient,wallet.publicKey(),'patient');
    expect(JSON.parse(challenge.message)).toMatchObject({userId:patient.userId,email:patient.email,network:'testnet',wallet:wallet.publicKey()});
    mocks.sql.mockResolvedValueOnce([{id:challenge.challengeId,wallet:wallet.publicKey(),message:challenge.message}]).mockResolvedValueOnce([{wallet:wallet.publicKey(),role:'patient'}]);
    expect(await completeWalletChallenge(sql(),patient,challenge.challengeId,wallet.sign(Buffer.from(challenge.message)).toString('base64'))).toMatchObject({verified:true,wallet:wallet.publicKey()});
  });
  it('rejects another key or altered message before consuming the challenge',async()=>{
    const wallet=Keypair.random();mocks.sql.mockResolvedValue([{wallet:wallet.publicKey(),message:'expected'}]);
    for(const signature of [Keypair.random().sign(Buffer.from('expected')),wallet.sign(Buffer.from('altered'))])await expect(completeWalletChallenge(sql(),patient,'11111111-1111-4111-8111-111111111111',signature.toString('base64'))).rejects.toMatchObject({code:'invalid_signature'});
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
  it('rejects expired/replayed or concurrently consumed challenges',async()=>{
    const wallet=Keypair.random(),signature=wallet.sign(Buffer.from('message')).toString('base64'),id='11111111-1111-4111-8111-111111111111';
    mocks.sql.mockResolvedValueOnce([]);await expect(completeWalletChallenge(sql(),patient,id,signature)).rejects.toMatchObject({code:'challenge_expired_or_used'});
    mocks.sql.mockResolvedValueOnce([{wallet:wallet.publicKey(),message:'message'}]).mockResolvedValueOnce([]);
    await expect(completeWalletChallenge(sql(),patient,id,signature)).rejects.toMatchObject({code:'challenge_used_or_binding_conflict'});
  });
});
