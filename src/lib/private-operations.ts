import { randomUUID } from 'node:crypto';
import { Keypair, Networks, Transaction, TransactionBuilder, scValToNative } from '@stellar/stellar-sdk';
import { getDbConnection } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { readPrivateDoctor } from '@/lib/doctor-authorizations';
import { assertPrivateEnvironment, assertPrivateWrites, PrivateFlowError, RX_PRIVATE } from '@/lib/private-config';
import { ACTION_METHODS, assertUnsignedOperation, createPrivateChain, sponsorOwnerSignature, type ExpectedOperation, type PrivateAction } from '@/lib/stellar/private-chain';
import { assertBookingReady, assertReviewedPrescriber, expectedBooking, loadPrivateContext, privateActorWallet, publicOperation, verifyParticipants, type PrivateRow } from '@/lib/private-prescriptions';
import type { PoolClient } from '@neondatabase/serverless';
import { assertPrivateRxActor, assertPrivateRxContext, assertPrivateRxOperationIntent, assertPrivateRxConfirmationIntent,
  assertPrivateRxScopeOpen, currentPrivateRxScope, type PrivateRxIssuanceScope } from '@/lib/digital-cabs-rx';
import { createPrivateRxSponsorship } from '../../scripts/lib/private-rx-sponsorship.mjs';
import { canonicalJSON } from '../../scripts/lib/clinical-rehearsal-policy.mjs';

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
  if (['mint','activate','revoke'].includes(action)) await assertReviewedPrescriber(client,appointment,b);
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
type RxOperationStep = 'consent' | 'mint';
type RxResource = { appointmentId?: number; prescriptionId?: string };
type PrivateWallet = Awaited<ReturnType<typeof privateActorWallet>>;

function rxError(error: unknown): never {
  if (error instanceof PrivateFlowError) throw error;
  const code = error instanceof Error ? error.message : '';
  if (code === 'owner_signature_invalid') throw new PrivateFlowError(code,403);
  if (['private_rx_fee_budget_exceeded','sponsorship_price_blocked','sponsorship_daily_limit'].includes(code)) {
    throw new PrivateFlowError('private_rx_fee_budget_exceeded');
  }
  if (['private_rx_scope_expired','private_rx_predecessor_unconfirmed','private_rx_sponsorship_attempt_exists','private_rx_receipt_mismatch',
    'sponsorship_quote_expired','sponsorship_envelope_expired'].includes(code)) throw new PrivateFlowError(code);
  throw new PrivateFlowError('private_rx_sponsorship_unavailable',503);
}

function rxSponsorship(scope: PrivateRxIssuanceScope, client: PoolClient) {
  return createPrivateRxSponsorship({scope,client,connect:getDbConnection});
}

function assertScopedRow(scope: PrivateRxIssuanceScope, step: RxOperationStep, actor: AuthedUser, wallet: PrivateWallet, row: PrivateRow | undefined): asserts row is PrivateRow {
  const role = step === 'consent' ? 'patient' : 'doctor';
  assertPrivateRxActor(scope,actor,wallet,role);
  if (!row || row.id !== scope.steps[step].requestId || row.action !== step || row.method !== ACTION_METHODS[step] ||
    row.contract_id !== scope.contractId || Number(row.appointment_id) !== scope.appointmentId ||
    (row.prescription_id ?? null) !== (step === 'mint' ? scope.prescriptionId : null) ||
    row.actor_user_id !== actor.userId || row.actor_email !== actor.email || row.wallet_id !== wallet.walletId || row.source_wallet !== wallet.address ||
    row.expected?.rxScopeSha256 !== scope.policyHash || row.expected.issuanceId !== scope.issuanceId || row.expected.validUntil !== scope.bookingValidUntil ||
    row.expected.patient !== scope.patient.address || row.expected.doctor !== scope.doctor.address ||
    Number(row.expires_at) > Math.min(scope.until,scope.bookingValidUntil)) throw new PrivateFlowError('operation_not_found',404);
}

async function scopedContext(client: PoolClient, scope: PrivateRxIssuanceScope, actor: AuthedUser, step: RxOperationStep) {
  const context = await operationContext(client,actor,step,scope.appointmentId,step === 'mint' ? scope.prescriptionId : null);
  assertPrivateRxContext(scope,context.appointment,context.booking,context.prescription);
  return context;
}

async function scopedExpected(client: PoolClient, scope: PrivateRxIssuanceScope, actor: AuthedUser, step: RxOperationStep,
  context: Awaited<ReturnType<typeof scopedContext>>, chain = createPrivateChain(), resubmitting = false) {
  const eligible = await assertEligible(client,actor,step,context,chain,resubmitting);
  assertPrivateRxScopeOpen(scope,step);
  return { ...expectedBooking(context.booking), ...(step === 'mint' ? {commitment:eligible.commitment,expiresAt:eligible.expiresAt} : {}),
    rxScopeSha256:scope.policyHash };
}

async function scopedOperationView(scope: PrivateRxIssuanceScope, step: RxOperationStep, row: PrivateRow, client: PoolClient) {
  const operation = publicOperation(row);
  if (row.state !== 'awaiting_signature' || row.signed_xdr || row.transaction_hash) return {operation};
  const sponsorship = await rxSponsorship(scope,client).quoteView(step,row.unsigned_xdr,row.expected,{atomic:true});
  return {operation:{...operation,sponsorship}};
}

async function withScopedWallet<T>(actor: AuthedUser, scope: PrivateRxIssuanceScope, step: RxOperationStep,
  work:(client:PoolClient,wallet:PrivateWallet)=>Promise<T>):Promise<T> {
  assertPrivateRxScopeOpen(scope,step);
  const wallet = await privateActorWallet(actor);
  assertPrivateRxActor(scope,actor,wallet,step === 'consent' ? 'patient' : 'doctor');
  const client = await getDbConnection();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`private-user:${wallet.address}`]);
    const result = await work(client,wallet);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    return rxError(error);
  } finally { client.release(); }
}

async function prepareScopedOperation(actor: AuthedUser, action: PrivateAction, resource: RxResource, scope: PrivateRxIssuanceScope) {
  assertPrivateRxOperationIntent(scope,actor,action,resource);
  if (action !== 'consent' && action !== 'mint') throw new PrivateFlowError('private_rx_scope_rejected',403);
  return withScopedWallet(actor,scope,action,async (client,wallet) => {
    const sponsorship = rxSponsorship(scope,client), id = scope.steps[action].requestId;
    sponsorship.assertConfigured(action);
    const context = await scopedContext(client,scope,actor,action);
    const saved = (await client.query('SELECT * FROM private_operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if (saved) {
      assertScopedRow(scope,action,actor,wallet,saved);
      return scopedOperationView(scope,action,saved,client);
    }
    for (const [table,states] of [['private_operations',"'awaiting_signature','submitted'"],['clinical_web_operations',"'awaiting_signature','submitted'"],
      ['clinical_transaction_attempts',"'prepared','submitted'"]] as const) {
      const present = (await client.query('SELECT to_regclass($1) AS relation',[`public.${table}`])).rows[0]?.relation;
      if (present && (await client.query(`SELECT 1 FROM ${table} WHERE source_wallet=$1 AND state IN (${states}) LIMIT 1`,[wallet.address])).rows.length) {
        throw new PrivateFlowError('another_operation_pending');
      }
    }
    const chain = createPrivateChain(), expected = await scopedExpected(client,scope,actor,action,context,chain);
    const tx = await chain.prepare(wallet.address,action,expected,scope);
    const unsigned = tx.toXDR();
    await sponsorship.reserve(action,unsigned,expected);
    const row = (await client.query(`INSERT INTO private_operations(id,actor_user_id,actor_email,wallet_id,source_wallet,action,appointment_id,prescription_id,
      contract_id,method,expected,state,unsigned_xdr,signing_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'awaiting_signature',$12,$13,$14) RETURNING *`,
      [id,actor.userId,actor.email,wallet.walletId,wallet.address,action,scope.appointmentId,action === 'mint' ? scope.prescriptionId : null,
        scope.contractId,ACTION_METHODS[action],JSON.stringify(expected),unsigned,tx.hash().toString('hex'),Number(tx.timeBounds!.maxTime)])).rows[0];
    assertScopedRow(scope,action,actor,wallet,row);
    return scopedOperationView(scope,action,row,client);
  });
}

async function confirmScopedOperation(actor: AuthedUser, id: string, signature: string, scope: PrivateRxIssuanceScope) {
  const step = assertPrivateRxConfirmationIntent(scope,actor,id);
  const newlySigned = await withScopedWallet(actor,scope,step,async (client,wallet) => {
    const sponsorship = rxSponsorship(scope,client);
    const context = await scopedContext(client,scope,actor,step);
    const row = (await client.query('SELECT * FROM private_operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
    assertScopedRow(scope,step,actor,wallet,row);
    if (row.state !== 'awaiting_signature') return false;
    assertSavedEnvelope(row,scope.relayer);
    const expected = await scopedExpected(client,scope,actor,step,context);
    if (canonicalJSON(JSON.parse(JSON.stringify(expected))) !== canonicalJSON(row.expected)) throw new PrivateFlowError('operation_context_changed');
    const signed = await sponsorship.signOwner(step,row.unsigned_xdr,expected,signature);
    const updated = await client.query("UPDATE private_operations SET signed_xdr=$2,transaction_hash=$3,state='submitted',updated_at=NOW() WHERE id=$1 AND state='awaiting_signature' RETURNING id",[id,signed.xdr,signed.hash]);
    if (updated.rows.length !== 1) throw new PrivateFlowError('operation_context_changed');
    if (step === 'mint') {
      const result = await client.query("UPDATE private_prescriptions SET state='submitted',transaction_hash=$2 WHERE id=$1 AND state='prepared' RETURNING id",[scope.prescriptionId,signed.hash]);
      if (result.rows.length !== 1) throw new PrivateFlowError('operation_context_changed');
    }
    return true;
  });
  return reconcileScopedOperation(actor,id,scope,newlySigned);
}

async function reconcileScopedOperation(actor: AuthedUser, id: string, scope: PrivateRxIssuanceScope, submit = false) {
  const step = assertPrivateRxConfirmationIntent(scope,actor,id);
  return withScopedWallet(actor,scope,step,async (client,wallet) => {
    const context = await scopedContext(client,scope,actor,step), sponsorship = rxSponsorship(scope,client);
    const row = (await client.query('SELECT * FROM private_operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
    assertScopedRow(scope,step,actor,wallet,row);
    if (row.state === 'awaiting_signature' && !row.signed_xdr && !row.transaction_hash && Number(row.expires_at) <= Date.now()/1000) {
      await sponsorship.cancelUnsigned(step,row.unsigned_xdr,row.expected);
      const cancelled = (await client.query("UPDATE private_operations SET state='cancelled',error_code='signature_request_expired',updated_at=NOW() WHERE id=$1 AND state='awaiting_signature' RETURNING *",[id])).rows[0];
      return {operation:publicOperation(cancelled)};
    }
    if (row.state !== 'submitted') return scopedOperationView(scope,step,row,client);
    assertSavedEnvelope(row,scope.relayer);
    const chain = createPrivateChain(), receipt = await chain.receipt(row.transaction_hash);
    if (receipt.status === 'SUCCESS' || receipt.status === 'FAILED') {
      let rxId: string | undefined;
      if (receipt.status === 'SUCCESS') {
        await chain.verifyDeployment();
        if (step === 'mint') {
          const e = row.expected as ExpectedOperation;
          rxId = receipt.returnValue ? String(scValToNative(receipt.returnValue)) : '';
          if (!/^[1-9][0-9]*$/.test(rxId)) throw new PrivateFlowError('receipt_mismatch',503);
          const [rx,booking] = await Promise.all([chain.prescription(rxId),chain.booking(scope.issuanceId)]);
          if (!rx || rx.id !== rxId || rx.doctor !== e.doctor || rx.patient !== e.patient || rx.commitment !== e.commitment ||
            rx.expiresAt !== e.expiresAt || rx.schemaVersion !== 1 || booking?.status !== 'Consumed' || booking.doctor !== e.doctor ||
            booking.patient !== e.patient || booking.validUntil !== e.validUntil) throw new PrivateFlowError('receipt_mismatch',503);
        }
      }
      await sponsorship.reconcile(step,row.unsigned_xdr,row.expected,row.signed_xdr,row.transaction_hash,receipt,{atomic:true});
      if (receipt.status === 'SUCCESS' && step === 'mint') {
        const updated = await client.query("UPDATE private_prescriptions SET state='confirmed',rx_id=$2 WHERE id=$1 AND state='submitted' AND transaction_hash=$3 RETURNING id",[scope.prescriptionId,rxId,row.transaction_hash]);
        if (updated.rows.length !== 1) throw new PrivateFlowError('operation_context_changed');
        await client.query("UPDATE prescription_booking_requests SET state='consumed',updated_at=NOW() WHERE appointment_id=$1 AND transaction_hash IS NULL",[scope.appointmentId]);
      } else if (receipt.status === 'FAILED' && step === 'mint') {
        const restored = await client.query("UPDATE private_prescriptions SET state='prepared',transaction_hash=NULL WHERE id=$1 AND state='submitted' AND transaction_hash=$2 RETURNING id",[scope.prescriptionId,row.transaction_hash]);
        if (restored.rows.length !== 1) throw new PrivateFlowError('operation_context_changed');
      }
      const terminal = (await client.query(`UPDATE private_operations SET state=$2,error_code=$3,
        confirmed_at=CASE WHEN $2='confirmed' THEN NOW() ELSE confirmed_at END,updated_at=NOW() WHERE id=$1 AND state='submitted' RETURNING *`,
        [id,receipt.status === 'SUCCESS' ? 'confirmed' : 'failed',receipt.status === 'SUCCESS' ? null : 'transaction_failed'])).rows[0];
      return {operation:publicOperation(terminal)};
    }
    if (submit) {
      await scopedExpected(client,scope,actor,step,context,chain,true);
      const outer = await sponsorship.assertCanSubmit(step,row.unsigned_xdr,row.expected,row.signed_xdr,row.transaction_hash);
      assertPrivateRxScopeOpen(scope,step);
      try { await chain.server.sendTransaction(outer); } catch { /* The durable hash remains pending. */ }
    }
    return {operation:publicOperation(row)};
  });
}

export async function preparePrivateOperation(actor:AuthedUser,action:PrivateAction,resource:RxResource,scope?:PrivateRxIssuanceScope) {
  if (scope) return prepareScopedOperation(actor,action,resource,scope);
  assertPrivateWrites();
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`private-user:${wallet.address}`]);
    // Clinical and prescription intents share the wallet's Stellar sequence.
    // The clinical schema is opt-in; existing deployments may not have it yet.
    const clinicalSchema=(await client.query("SELECT to_regclass('public.clinical_transaction_attempts') AS relation")).rows[0]?.relation;
    if(clinicalSchema && (await client.query("SELECT 1 FROM clinical_transaction_attempts WHERE source_wallet=$1 AND state IN ('prepared','submitted') LIMIT 1",[wallet.address])).rows.length) {
      throw new PrivateFlowError('another_operation_pending');
    }
    const clinicalWeb=(await client.query("SELECT to_regclass('public.clinical_web_operations') AS relation")).rows[0]?.relation;
    if(clinicalWeb) await client.query("UPDATE clinical_web_operations SET state='cancelled',error_code='signature_request_expired',updated_at=NOW() WHERE source_wallet=$1 AND state='awaiting_signature' AND signed_xdr IS NULL AND expires_at<=EXTRACT(EPOCH FROM NOW())",[wallet.address]);
    if(clinicalWeb && (await client.query("SELECT 1 FROM clinical_web_operations WHERE source_wallet=$1 AND state IN ('awaiting_signature','submitted') LIMIT 1",[wallet.address])).rows.length) {
      throw new PrivateFlowError('another_operation_pending');
    }
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
export function assertSavedEnvelope(row:PrivateRow, scopedRelayer?:string) {
  if(row.contract_id!==RX_PRIVATE||row.method!==ACTION_METHODS[row.action as PrivateAction])throw new PrivateFlowError('saved_operation_invalid',503);
  const unsigned=TransactionBuilder.fromXDR(row.unsigned_xdr,Networks.TESTNET);
  if(!(unsigned instanceof Transaction)||unsigned.hash().toString('hex')!==row.signing_hash)throw new PrivateFlowError('saved_operation_invalid',503);
  assertUnsignedOperation(unsigned,row.source_wallet,row.action,row.expected);
  if(row.signed_xdr) {
    const outer=TransactionBuilder.fromXDR(row.signed_xdr,Networks.TESTNET);
    const relayer = scopedRelayer ?? (process.env.RELAYER_SECRET ? Keypair.fromSecret(process.env.RELAYER_SECRET).publicKey() : undefined);
    if(outer instanceof Transaction||!relayer||outer.feeSource!==relayer||outer.hash().toString('hex')!==row.transaction_hash||!outer.innerTransaction.hash().equals(unsigned.hash())||
      !outer.innerTransaction.signatures.some(s=>Keypair.fromPublicKey(row.source_wallet).verify(unsigned.hash(),s.signature()))||
      !outer.signatures.some(s=>Keypair.fromPublicKey(outer.feeSource).verify(outer.hash(),s.signature())))throw new PrivateFlowError('saved_operation_invalid',503);
  }
}
export async function confirmPrivateOperation(actor:AuthedUser,id:string,signature:string,scope?:PrivateRxIssuanceScope) {
  if (scope) return confirmScopedOperation(actor,id,signature,scope);
  assertPrivateEnvironment();
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  let row:PrivateRow;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`private-user:${wallet.address}`]);
    const selected=(await client.query('SELECT * FROM private_operations WHERE id=$1 AND actor_user_id=$2',[id,actor.userId])).rows[0];
    if(!selected||selected.source_wallet!==wallet.address||selected.wallet_id!==wallet.walletId)throw new PrivateFlowError('operation_not_found',404);
    if(selected.expected?.rxScopeSha256)throw new PrivateFlowError('private_rx_scope_rejected',403);
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
export async function reconcilePrivateOperation(actor:AuthedUser,id:string,scope?:PrivateRxIssuanceScope) {
  if (!scope) {
    let current;
    try { current = currentPrivateRxScope(); } catch { /* Stored rows remain readable after scope closure. */ }
    if (current?.phase === 'issuance' && [current.steps.consent.requestId,current.steps.mint.requestId].includes(id)) scope = current;
  }
  if (scope) return reconcileScopedOperation(actor,id,scope);
  const wallet=await privateActorWallet(actor),client=await getDbConnection();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`private-user:${wallet.address}`]);
    const first=(await client.query('SELECT * FROM private_operations WHERE id=$1 AND actor_user_id=$2',[id,actor.userId])).rows[0];
    if(!first||first.wallet_id!==wallet.walletId||first.source_wallet!==wallet.address)throw new PrivateFlowError('operation_not_found',404);
    if(first.expected?.rxScopeSha256) {await client.query('COMMIT');return {operation:publicOperation(first)};}
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
