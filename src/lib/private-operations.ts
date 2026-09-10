import { randomUUID } from 'node:crypto';
import { Keypair, Networks, Transaction, TransactionBuilder, scValToNative } from '@stellar/stellar-sdk';
import { getDbConnection } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { readPrivateDoctor } from '@/lib/doctor-authorizations';
import { assertPrivateEnvironment, assertPrivateWrites, PrivateFlowError, RX_PRIVATE } from '@/lib/private-config';
import { ACTION_METHODS, assertUnsignedOperation, createPrivateChain, sponsorOwnerSignature, type ExpectedOperation, type PrivateAction } from '@/lib/stellar/private-chain';
import { assertBookingReady, expectedBooking, loadPrivateContext, privateActorWallet, publicOperation, verifyParticipants, type PrivateRow } from '@/lib/private-prescriptions';
import type { PoolClient } from '@neondatabase/serverless';

async function operationContext(client:PoolClient,actor:AuthedUser,action:PrivateAction,appointmentId:number,prescriptionId:string|null) {
  const context=await loadPrivateContext(client,actor,appointmentId,true);
  const {appointment,booking,prescription}=context;
  if(!booking)throw new PrivateFlowError('booking_not_ready');
  const patientAction=action==='consent'||action==='withdraw_consent';
  if(actor.userId!==(patientAction?booking.patient_requested_by:booking.doctor_user_id)||actor.email!==(patientAction?booking.patient_email:booking.doctor_email))throw new PrivateFlowError('forbidden',403);
  if(!patientAction && (!prescription||prescription.id!==prescriptionId))throw new PrivateFlowError('prescription_not_found',404);
  return context;
}
async function assertEligible(client:PoolClient,actor:AuthedUser,action:PrivateAction,context:Awaited<ReturnType<typeof loadPrivateContext>>,chain=createPrivateChain(),resubmitting=false) {
  const {appointment,booking:b,prescription:p}=context;
  await verifyParticipants(client,b);await chain.verifyDeployment();
  const expected:ExpectedOperation={...expectedBooking(b),...(p?{commitment:p.commitment,expiresAt:Number(p.expires_at),rxId:p.rx_id?String(p.rx_id):undefined}:{})};
  if(action==='consent'||action==='mint') {
    await assertBookingReady(appointment,b,chain);
    const consent=await chain.consent(expected);
    if(action==='consent'&&consent!==null&&consent>Date.now()/1000)throw new PrivateFlowError('consent_already_active');
    if(action==='mint'&&(consent===null||consent<=Date.now()/1000||consent!==Number(b.valid_until)))throw new PrivateFlowError('consent_required');
    if(action==='mint'&&(!(resubmitting?['prepared','submitted']:['prepared']).includes(p.state)||Number(p.expires_at)<=Date.now()/1000))throw new PrivateFlowError('prescription_not_ready');
  }else if(action==='withdraw_consent') {
    const [current,consent]=await Promise.all([chain.booking(b.issuance_id),chain.consent(expected)]);
    if(current?.status==='Consumed')throw new PrivateFlowError('consent_already_consumed');
    if(consent===null)throw new PrivateFlowError('consent_not_available');
  }else {
    if(!(await readPrivateDoctor(b.doctor_wallet)).authorized)throw new PrivateFlowError('doctor_not_authorized',403);
    if(p.state!=='confirmed'||!p.rx_id)throw new PrivateFlowError('prescription_not_confirmed');
    const rx=await chain.prescription(String(p.rx_id));
    if(!rx||rx.id!==String(p.rx_id)||rx.schemaVersion!==1||rx.doctor!==b.doctor_wallet||rx.patient!==b.patient_wallet||rx.commitment!==p.commitment||rx.expiresAt!==Number(p.expires_at))throw new PrivateFlowError('prescription_integrity_unavailable',503);
    if(action==='activate'&&(rx.status!=='Registered'||rx.expiresAt<=Date.now()/1000))throw new PrivateFlowError('prescription_not_activatable');
    if(action==='revoke'&&!['Registered','Active'].includes(rx.status))throw new PrivateFlowError('prescription_not_revocable');
  }
  return expected;
}
export async function preparePrivateOperation(actor:AuthedUser,action:PrivateAction,resource:{appointmentId?:number;prescriptionId?:string}) {
  assertPrivateWrites();
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`private-user:${wallet.address}`]);
    let appointmentId=resource.appointmentId;
    if(resource.prescriptionId)appointmentId=(await client.query('SELECT appointment_id FROM private_prescriptions WHERE id=$1',[resource.prescriptionId])).rows[0]?.appointment_id;
    if(!appointmentId)throw new PrivateFlowError('resource_not_found',404);
    await client.query("UPDATE private_operations SET state='cancelled',error_code='signature_request_expired',updated_at=NOW() WHERE source_wallet=$1 AND state='awaiting_signature' AND signed_xdr IS NULL AND expires_at<=EXTRACT(EPOCH FROM NOW())",[wallet.address]);
    const pending=(await client.query("SELECT * FROM private_operations WHERE source_wallet=$1 AND state IN ('awaiting_signature','submitted') FOR UPDATE",[wallet.address])).rows[0];
    if(pending) {
      if(pending.actor_user_id!==actor.userId||pending.wallet_id!==wallet.walletId||pending.action!==action||Number(pending.appointment_id)!==Number(appointmentId)||(pending.prescription_id??null)!==(resource.prescriptionId??null))throw new PrivateFlowError('another_operation_pending');
      await client.query('COMMIT');return {operation:publicOperation(pending)};
    }
    const context=await operationContext(client,actor,action,appointmentId,resource.prescriptionId??null);
    const chain=createPrivateChain(),expected=await assertEligible(client,actor,action,context,chain);
    const source=action==='consent'||action==='withdraw_consent'?expected.patient:expected.doctor;
    if(source!==wallet.address)throw new PrivateFlowError('wallet_binding_changed',403);
    const tx=await chain.prepare(source,action,expected);
    const row=(await client.query(`INSERT INTO private_operations(id,actor_user_id,actor_email,wallet_id,source_wallet,action,appointment_id,prescription_id,
      contract_id,method,expected,state,unsigned_xdr,signing_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'awaiting_signature',$12,$13,$14) RETURNING *`,
      [randomUUID(),actor.userId,actor.email,wallet.walletId,source,action,appointmentId,resource.prescriptionId??null,RX_PRIVATE,ACTION_METHODS[action],JSON.stringify(expected),tx.toXDR(),tx.hash().toString('hex'),Number(tx.timeBounds!.maxTime)])).rows[0];
    await client.query('COMMIT');return {operation:publicOperation(row)};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export function assertSavedEnvelope(row:PrivateRow) {
  if(row.contract_id!==RX_PRIVATE||row.method!==ACTION_METHODS[row.action as PrivateAction])throw new PrivateFlowError('saved_operation_invalid',503);
  const unsigned=TransactionBuilder.fromXDR(row.unsigned_xdr,Networks.TESTNET);
  if(!(unsigned instanceof Transaction)||unsigned.hash().toString('hex')!==row.signing_hash)throw new PrivateFlowError('saved_operation_invalid',503);
  assertUnsignedOperation(unsigned,row.source_wallet,row.action,row.expected);
  if(row.signed_xdr) {
    const outer=TransactionBuilder.fromXDR(row.signed_xdr,Networks.TESTNET);
    if(outer instanceof Transaction||!process.env.RELAYER_SECRET||outer.feeSource!==Keypair.fromSecret(process.env.RELAYER_SECRET).publicKey()||outer.hash().toString('hex')!==row.transaction_hash||!outer.innerTransaction.hash().equals(unsigned.hash())||
      !outer.innerTransaction.signatures.some(s=>Keypair.fromPublicKey(row.source_wallet).verify(unsigned.hash(),s.signature()))||
      !outer.signatures.some(s=>Keypair.fromPublicKey(outer.feeSource).verify(outer.hash(),s.signature())))throw new PrivateFlowError('saved_operation_invalid',503);
  }
}
export async function confirmPrivateOperation(actor:AuthedUser,id:string,signature:string) {
  assertPrivateEnvironment();
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  let row:PrivateRow;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`private-user:${wallet.address}`]);
    const selected=(await client.query('SELECT * FROM private_operations WHERE id=$1 AND actor_user_id=$2',[id,actor.userId])).rows[0];
    if(!selected||selected.source_wallet!==wallet.address||selected.wallet_id!==wallet.walletId)throw new PrivateFlowError('operation_not_found',404);
    if(selected.state!=='awaiting_signature') {
      row=selected;
      await client.query('COMMIT');
    }else {
    assertPrivateWrites();assertSavedEnvelope(selected);
    const context=await operationContext(client,actor,selected.action,selected.appointment_id,selected.prescription_id);
    row=(await client.query('SELECT * FROM private_operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
    const expected=await assertEligible(client,actor,row.action,context);
    if(JSON.stringify(expected)!==JSON.stringify(row.expected)) {
      // JSONB object order is not significant; compare every bound field.
      if(Object.keys(expected).some(k=>expected[k as keyof ExpectedOperation]!==row.expected[k])||Object.keys(row.expected).some(k=>!(k in expected)))throw new PrivateFlowError('operation_context_changed');
    }
    const sponsored=sponsorOwnerSignature(row.unsigned_xdr,row.source_wallet,signature,row.action,row.expected);
    row=(await client.query("UPDATE private_operations SET signed_xdr=$2,transaction_hash=$3,state='submitted',updated_at=NOW() WHERE id=$1 AND state='awaiting_signature' RETURNING *",[id,sponsored.xdr,sponsored.hash])).rows[0];
    if(row.action==='mint')await client.query("UPDATE private_prescriptions SET state='submitted',transaction_hash=$2 WHERE id=$1 AND state='prepared'",[row.prescription_id,sponsored.hash]);
    await client.query('COMMIT');
    }
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  // Release this connection before reconciliation; the signed attempt is durable.
  return reconcilePrivateOperation(actor,id);
}
export async function reconcilePrivateOperation(actor:AuthedUser,id:string) {
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`private-user:${wallet.address}`]);
    const first=(await client.query('SELECT * FROM private_operations WHERE id=$1 AND actor_user_id=$2',[id,actor.userId])).rows[0];
    if(!first||first.wallet_id!==wallet.walletId||first.source_wallet!==wallet.address)throw new PrivateFlowError('operation_not_found',404);
    const context=await loadPrivateContext(client,actor,first.appointment_id,true);
    let row=(await client.query('SELECT * FROM private_operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(row.state==='awaiting_signature'&&Number(row.expires_at)<=Date.now()/1000)row=(await client.query("UPDATE private_operations SET state='cancelled',error_code='signature_request_expired',updated_at=NOW() WHERE id=$1 RETURNING *",[id])).rows[0];
    if(row.state!=='submitted'){await client.query('COMMIT');return {operation:publicOperation(row)};}
    assertSavedEnvelope(row);
    const chain=createPrivateChain(),receipt=await chain.receipt(row.transaction_hash);
    if(receipt.status==='SUCCESS') {
      await chain.verifyDeployment();
      const e=row.expected as ExpectedOperation;
      if(row.action==='mint') {
        if(!receipt.returnValue)throw new PrivateFlowError('receipt_return_value_unavailable',503);
        const rxId=String(scValToNative(receipt.returnValue));
        if(!/^[1-9][0-9]*$/.test(rxId))throw new PrivateFlowError('receipt_mismatch',503);
        const [rx,booking]=await Promise.all([chain.prescription(rxId),chain.booking(e.issuanceId)]);
        if(!rx||rx.id!==rxId||rx.doctor!==e.doctor||rx.patient!==e.patient||rx.commitment!==e.commitment||rx.expiresAt!==e.expiresAt||rx.schemaVersion!==1||
          booking?.status!=='Consumed'||booking.doctor!==e.doctor||booking.patient!==e.patient||booking.validUntil!==e.validUntil)throw new PrivateFlowError('receipt_mismatch',503);
        await client.query("UPDATE private_prescriptions SET state='confirmed',rx_id=$2,transaction_hash=$3 WHERE id=$1",[row.prescription_id,rxId,row.transaction_hash]);
        // A competing signed cancellation still owns the authority sequence.
        // Its worker must reconcile that exact receipt before closing the booking.
        await client.query("UPDATE prescription_booking_requests SET state='consumed',updated_at=NOW() WHERE appointment_id=$1 AND transaction_hash IS NULL",[row.appointment_id]);
        await client.query("UPDATE appointments SET status='in_progress' WHERE id=$1 AND status='cancel_requested'",[row.appointment_id]);
      }else if(row.action==='activate'||row.action==='revoke') {
        const rx=await chain.prescription(e.rxId!);
        if(!rx||rx.id!==e.rxId||rx.schemaVersion!==1||rx.doctor!==e.doctor||rx.patient!==e.patient||rx.commitment!==e.commitment||rx.expiresAt!==e.expiresAt)throw new PrivateFlowError('receipt_mismatch',503);
        // A later operation can advance state; a successful exact envelope remains a receipt.
        if(row.action==='revoke'&&rx.status!=='Revoked')throw new PrivateFlowError('receipt_mismatch',503);
        if(row.action==='activate'&&rx.status==='Registered')throw new PrivateFlowError('receipt_mismatch',503);
      }
      // Consent/withdraw receipts describe this exact historical invocation.
      // Current permission is always read separately, never inferred from this receipt.
      row=(await client.query("UPDATE private_operations SET state='confirmed',confirmed_at=NOW(),updated_at=NOW(),error_code=NULL WHERE id=$1 RETURNING *",[id])).rows[0];
    }else if(receipt.status==='FAILED') {
      row=(await client.query("UPDATE private_operations SET state='failed',error_code='transaction_failed',updated_at=NOW() WHERE id=$1 RETURNING *",[id])).rows[0];
      if(row.action==='mint')await client.query("UPDATE private_prescriptions SET state='prepared' WHERE id=$1 AND state='submitted'",[row.prescription_id]);
    }else {
      const expired=Number(row.expires_at)<=Date.now()/1000;
      let errorCode:string|null=expired?'awaiting_receipt_reconciliation':row.error_code??null;
      // Never reconstruct signed unknown attempts. Only retry the exact envelope while valid.
      if(!expired&&process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED==='true') {
        let eligible=true;
        try {
          await assertEligible(client,actor,row.action,context,chain,true);
          assertPrivateWrites();
        }catch(error) {
          eligible=false;
          errorCode=error instanceof PrivateFlowError?error.message:'operation_revalidation_unavailable';
        }
        if(eligible) {
          try {
            const status=await chain.submit(row.signed_xdr);
            errorCode=status==='PENDING'||status==='DUPLICATE'?null:status==='TRY_AGAIN_LATER'?'relay_retry_pending':'relay_submission_rejected';
          }catch {errorCode='relay_response_unavailable';}
        }
      }
      await client.query('UPDATE private_operations SET error_code=$2,updated_at=NOW() WHERE id=$1',[id,errorCode]);
      row={...row,error_code:errorCode};
    }
    await client.query('COMMIT');return {operation:publicOperation(row)};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
