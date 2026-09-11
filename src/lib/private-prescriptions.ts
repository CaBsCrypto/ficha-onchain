import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { getDb, getDbConnection, sqlForConnection } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { verifiedWallet, readPrivateDoctor } from '@/lib/doctor-authorizations';
import { isApprovedDoctor } from '@/lib/doctor-access';
import { assertPrivateEnvironment, assertPrivateWrites, PrivateFlowError, RX_PRIVATE } from '@/lib/private-config';
import { createPrivateChain, type ExpectedOperation } from '@/lib/stellar/private-chain';
import { encryptPrescription, decryptPrescription, prescriptionCommitment } from '../../scripts/lib/private-prescription.mjs';

// Rows stay inside the server boundary; only explicit view models leave it.
export type PrivateRow = Record<string, any>;
export function encryptionKey() {
  const key=process.env.TRUSTLEAF_DATA_KEY;
  if(!key||!/^[a-f0-9]{64}$/i.test(key))throw new PrivateFlowError('private_storage_unavailable',503);
  return key;
}
export function storageContext(id:string) {return JSON.stringify(['TrustLeaf/PrivatePrescriptionStorage/v1',id,'testnet',RX_PRIVATE]);}
export async function privateActorWallet(actor:AuthedUser) {
  assertPrivateEnvironment();
  if(!actor.email)throw new PrivateFlowError('verified_email_required',403);
  return verifiedWallet(getDb(),actor.userId,actor.email);
}
export async function loadPrivateContext(client:PoolClient,actor:AuthedUser,appointmentId:number,lock=false) {
  const {rows}=await client.query(`SELECT a.*,d.name AS doctor_name,d.id AS doctor_id FROM appointments a
    JOIN doctors d ON LOWER(d.email)=LOWER(a.doctor_email)
    WHERE a.id=$1 AND (a.patient_email=$2 OR a.doctor_email=$2) ${lock?'FOR UPDATE OF a':''}`,[appointmentId,actor.email]);
  const appointment=rows[0];
  if(!appointment)throw new PrivateFlowError('consultation_not_found',404);
  const role=actor.email===appointment.doctor_email?'doctor':'patient';
  if(appointment[`${role}_user_id`]!==actor.userId)throw new PrivateFlowError('consultation_not_found',404);
  const booking=(await client.query(`SELECT * FROM prescription_booking_requests WHERE appointment_id=$1 ${lock?'FOR UPDATE':''}`,[appointmentId])).rows[0];
  const prescription=(await client.query(`SELECT * FROM private_prescriptions WHERE appointment_id=$1 ${lock?'FOR UPDATE':''}`,[appointmentId])).rows[0];
  return {appointment,booking,prescription};
}
export function expectedBooking(b:PrivateRow):ExpectedOperation {
  return {doctor:b.doctor_wallet,patient:b.patient_wallet,issuanceId:b.issuance_id,validUntil:Number(b.valid_until)};
}
export async function verifyParticipants(client:PoolClient,b:PrivateRow) {
  if(!b.doctor_user_id||!b.patient_requested_by||!b.doctor_wallet_id||!b.patient_wallet_id||b.contract_id!==RX_PRIVATE||b.network!=='testnet')throw new PrivateFlowError('booking_identity_unverified');
  const sql=sqlForConnection(client);
  const doctor=await verifiedWallet(sql,b.doctor_user_id,b.doctor_email);
  const patient=await verifiedWallet(sql,b.patient_requested_by,b.patient_email);
  if(doctor.address!==b.doctor_wallet||doctor.walletId!==b.doctor_wallet_id||patient.address!==b.patient_wallet||patient.walletId!==b.patient_wallet_id)throw new PrivateFlowError('booking_identity_changed');
}
export async function assertReviewedPrescriber(client:PoolClient,appointment:PrivateRow,b:PrivateRow) {
  if (!await isApprovedDoctor(sqlForConnection(client),Number(appointment.doctor_id),{
    userId:b.doctor_user_id,email:b.doctor_email,walletId:b.doctor_wallet_id,address:b.doctor_wallet,
  })) throw new PrivateFlowError('doctor_not_authorized',403);
}
export async function assertBookingReady(appointment:PrivateRow,b:PrivateRow|undefined,chain=createPrivateChain()) {
  if(!b||b.state!=='confirmed'||!b.attestation_hash||b.cancellation_requested_at||Number(b.valid_until)<=Date.now()/1000||
      appointment.status!=='in_progress'||!appointment.started_at||!appointment.attendance_at||!appointment.attendance_user_id||
      appointment.attendance_user_id!==b.patient_requested_by||appointment.started_by!==b.doctor_user_id||
      appointment.patient_user_id!==b.patient_requested_by||appointment.doctor_user_id!==b.doctor_user_id||
      appointment.patient_wallet!==b.patient_wallet||appointment.doctor_wallet!==b.doctor_wallet||
      appointment.patient_wallet_id!==b.patient_wallet_id||appointment.doctor_wallet_id!==b.doctor_wallet_id||
      appointment.patient_email!==b.patient_email||appointment.doctor_email!==b.doctor_email)throw new PrivateFlowError('booking_not_ready');
  const booking=await chain.booking(b.issuance_id);
  if(!booking||booking.status!=='Active'||booking.doctor!==b.doctor_wallet||booking.patient!==b.patient_wallet||booking.validUntil!==Number(b.valid_until)||booking.validUntil<=Date.now()/1000)throw new PrivateFlowError('booking_not_ready');
  if(!(await readPrivateDoctor(b.doctor_wallet)).authorized)throw new PrivateFlowError('doctor_not_authorized',403);
}
export function publicOperation(row:PrivateRow) {
  return {id:row.id,action:row.action,state:row.state,address:row.source_wallet,expiresAt:Number(row.expires_at),
    signingHash:row.state==='awaiting_signature'?`0x${row.signing_hash}`:undefined,
    transactionHash:row.transaction_hash??null,errorCode:row.error_code??null};
}
export async function prescriptionView(row:PrivateRow,appointment:PrivateRow,chain=createPrivateChain()) {
  let status='Pending';
  if(row.state==='confirmed') {
    const rx=await chain.prescription(String(row.rx_id));
    if(!rx||rx.id!==String(row.rx_id)||rx.patient!==row.patient_wallet||rx.doctor!==row.doctor_wallet||rx.commitment!==row.commitment||rx.expiresAt!==Number(row.expires_at)||rx.schemaVersion!==1)throw new PrivateFlowError('prescription_integrity_unavailable',503);
    status=rx.status;
  }
  return {id:row.id,rxId:row.rx_id?String(row.rx_id):null,appointmentId:row.appointment_id,status,
    expired:Number(row.expires_at)<=Date.now()/1000,doctorName:appointment.doctor_name??'Médico de prueba',patientName:appointment.patient_name??'Paciente de prueba',
    expiresAt:Number(row.expires_at),transactionHash:row.transaction_hash??null,operation:row.operation?publicOperation(row.operation):null};
}
export async function readPrivateConsultation(actor:AuthedUser,id:number) {
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  try {
    const {appointment,booking,prescription}=await loadPrivateContext(client,actor,id);
    const actorRole=actor.email===appointment.doctor_email?'doctor':'patient';
    if(appointment[`${actorRole}_wallet`]!==wallet.address||appointment[`${actorRole}_wallet_id`]!==wallet.walletId)throw new PrivateFlowError('appointment_wallet_changed',403);
    const chain=createPrivateChain();await chain.verifyDeployment();
    if(booking && (actor.userId===(actor.email===appointment.doctor_email?booking.doctor_user_id:booking.patient_requested_by))===false)throw new PrivateFlowError('booking_identity_changed',403);
    if(booking && wallet.address!==(actor.email===appointment.doctor_email?booking.doctor_wallet:booking.patient_wallet))throw new PrivateFlowError('booking_identity_changed',403);
    let consent:{status:string;validUntil:number|null}={status:'absent',validUntil:null};
    let publicBooking:PrivateRow|null=null;
    if(booking) {
      const [current,until]=await Promise.all([chain.booking(booking.issuance_id),chain.consent(expectedBooking(booking))]);
      consent={status:current?.status==='Consumed'?'consumed':until===null?'absent':until<=Date.now()/1000?'expired':'active',validUntil:until};
      publicBooking={state:current?.status==='Consumed'?'consumed':current?.status==='Revoked'?'revoked':booking.state,
        valid_until:Number(booking.valid_until),issuance_id:booking.issuance_id,transaction_hash:booking.attestation_hash,
        cancellation_requested_at:booking.cancellation_requested_at};
    }
    const operationRows=(await client.query('SELECT * FROM private_operations WHERE appointment_id=$1 AND actor_user_id=$2 ORDER BY created_at DESC LIMIT 20',[id,actor.userId])).rows;
    const operations=operationRows.map(publicOperation);
    if(prescription)prescription.operation=operationRows.find(o=>o.prescription_id===prescription.id);
    return {appointment:{...appointment,attended_at:appointment.attendance_at},booking:publicBooking,consent,
      prescription:prescription?await prescriptionView(prescription,appointment,chain):null,operations};
  } finally {client.release();}
}
export async function listPrivatePrescriptions(actor:AuthedUser,role:string) {
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  try {
    const column=role==='doctor'?'doctor_wallet':'patient_wallet';
    const identity=role==='doctor'?'doctor_user_id':'patient_requested_by';
    const rows=(await client.query(`SELECT p.*,a.patient_name,d.name AS doctor_name,
      (SELECT jsonb_build_object('id',o.id,'action',o.action,'state',o.state,'source_wallet',o.source_wallet,
        'expires_at',o.expires_at,'signing_hash',o.signing_hash,'transaction_hash',o.transaction_hash,'error_code',o.error_code)
        FROM private_operations o WHERE o.prescription_id=p.id AND o.actor_user_id=$2 ORDER BY o.created_at DESC LIMIT 1) AS operation FROM private_prescriptions p
      JOIN prescription_booking_requests b ON b.appointment_id=p.appointment_id JOIN appointments a ON a.id=p.appointment_id
      JOIN doctors d ON LOWER(d.email)=LOWER(a.doctor_email) WHERE p.${column}=$1 AND b.${identity}=$2 AND p.contract_id=$3
      ${role==='patient'?"AND p.state='confirmed'":''} ORDER BY p.created_at DESC`,[wallet.address,actor.userId,RX_PRIVATE])).rows;
    const chain=createPrivateChain();await chain.verifyDeployment();
    const prescriptions=[];
    for(const row of rows)prescriptions.push(await prescriptionView(row,row,chain));
    return {prescriptions};
  }finally{client.release();}
}
export async function preparePrescription(actor:AuthedUser,appointmentId:number,document:unknown) {
  assertPrivateWrites();const wallet=await privateActorWallet(actor);
  if(!document||typeof document!=='object'||Array.isArray(document))throw new PrivateFlowError('invalid_prescription_document',400);
  const d=document as Record<string,unknown>;
  if(Object.keys(d).some(k=>!['medication','dosage','instructions'].includes(k))||['medication','dosage','instructions'].some(k=>typeof d[k]!=='string'||!(d[k] as string).trim()||(d[k] as string).length>2000))throw new PrivateFlowError('invalid_prescription_document',400);
  const clean={medication:(d.medication as string).trim(),dosage:(d.dosage as string).trim(),instructions:(d.instructions as string).trim()};
  const client=await getDbConnection();
  try {
    await client.query('BEGIN');
    const {appointment,booking,prescription}=await loadPrivateContext(client,actor,appointmentId,true);
    if(actor.email!==appointment.doctor_email||!booking||actor.userId!==booking.doctor_user_id||wallet.address!==booking.doctor_wallet)throw new PrivateFlowError('forbidden',403);
    const chain=createPrivateChain();await chain.verifyDeployment();await verifyParticipants(client,booking);
    await assertReviewedPrescriber(client,appointment,booking);
    await assertBookingReady(appointment,booking,chain);
    if(prescription) {
      const plain=decryptPrescription(prescription.ciphertext,encryptionKey(),storageContext(prescription.id));
      if(JSON.stringify(plain.document)!==JSON.stringify(clean))throw new PrivateFlowError('private_prescription_already_prepared');
      await client.query('COMMIT');return {prescription:await prescriptionView(prescription,appointment,chain)};
    }
    const id=randomUUID(),expiresAt=Math.floor(Date.now()/1000)+30*86400;
    const payload={schemaVersion:1,network:'testnet',contractId:RX_PRIVATE,doctor:booking.doctor_wallet,patient:booking.patient_wallet,
      issuanceId:booking.issuance_id,expiresAt,document:clean,blinding:randomBytes(32).toString('hex')};
    const commitment=prescriptionCommitment(payload),ciphertext=encryptPrescription(payload,encryptionKey(),storageContext(id));
    const row=(await client.query(`INSERT INTO private_prescriptions (id,network,contract_id,appointment_id,issuance_id,doctor_wallet,patient_wallet,expires_at,commitment,ciphertext,state)
      VALUES($1,'testnet',$2,$3,$4,$5,$6,$7,$8,$9,'prepared') RETURNING *`,[id,RX_PRIVATE,appointmentId,booking.issuance_id,booking.doctor_wallet,booking.patient_wallet,expiresAt,commitment,ciphertext])).rows[0];
    await client.query('COMMIT');return {prescription:await prescriptionView(row,appointment,chain)};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function readPrivateDocument(actor:AuthedUser,id:string) {
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  try {
    const row=(await client.query(`SELECT p.*,b.doctor_user_id,b.patient_requested_by FROM private_prescriptions p
      JOIN prescription_booking_requests b ON b.appointment_id=p.appointment_id WHERE p.id=$1 AND p.contract_id=$2
      AND ((p.state='confirmed' AND p.patient_wallet=$3 AND b.patient_requested_by=$4) OR (p.doctor_wallet=$3 AND b.doctor_user_id=$4))`,[id,RX_PRIVATE,wallet.address,actor.userId])).rows[0];
    if(!row)throw new PrivateFlowError('private_prescription_unavailable',404);
    const chain=createPrivateChain();await chain.verifyDeployment();
    if(row.state==='confirmed')await prescriptionView(row,{},chain);
    const plain=decryptPrescription(row.ciphertext,encryptionKey(),storageContext(row.id));
    if(prescriptionCommitment(plain)!==row.commitment||plain.patient!==row.patient_wallet||plain.doctor!==row.doctor_wallet||plain.issuanceId!==row.issuance_id||plain.expiresAt!==Number(row.expires_at)||plain.contractId!==RX_PRIVATE||plain.network!=='testnet')throw new PrivateFlowError('private_prescription_unavailable',503);
    return {id:row.id,rxId:row.state==='confirmed'?String(row.rx_id):null,document:plain.document};
  }finally{client.release();}
}
