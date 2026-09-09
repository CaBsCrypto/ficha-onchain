// Explicit one-shot Testnet worker. No patient keys; booking attestation is not consent.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Address, BASE_FEE, Contract, Keypair, Networks, StrKey, TransactionBuilder, rpc, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { PRIVATE_REGISTRY_ID, readAuthorization } from './lib/private-registry.mjs';
import { PRIVATE_PRESCRIPTION_ID, PRIVY_APP_ID, assertCurrentPrivyIdentity } from './lib/private-worker-runtime.mjs';

export function validateBookingJob(job) {
  if (job.network !== 'testnet' || job.contract_id !== PRIVATE_PRESCRIPTION_ID || !/^[a-f0-9]{64}$/.test(job.issuance_id) ||
      /^0+$/.test(job.issuance_id) || !StrKey.isValidEd25519PublicKey(job.patient_wallet) || !StrKey.isValidEd25519PublicKey(job.doctor_wallet) ||
      !Number.isSafeInteger(Number(job.valid_until)) || Number(job.valid_until) <= 0) throw Error('booking_request_invalid');
}

export function assertBookingMatches(job, booking) {
  if (!booking || booking.doctor !== job.doctor_wallet || booking.patient !== job.patient_wallet ||
      Number(booking.valid_until) !== Number(job.valid_until)) throw Error('booking_state_mismatch');
  return Array.isArray(booking.status) ? booking.status[0] : booking.status;
}

/** All effects injected for deterministic recovery tests. A store lease is mandatory.
 * Unknown submission outcomes retain the same signed XDR/hash; never rebuild them.
 */
export async function runOnce({ store, chain, writesEnabled = false, prepareEnabled = true }) {
  let job=await store.claim({ signedOnly: !writesEnabled || !prepareEnabled });
  if (!job) return { status:'idle' };
  try {
    validateBookingJob(job);
    if (job.transaction_hash) {
      if (!job.prepared_xdr) throw Error('pending_transaction_missing_envelope');
      await chain.verifyEnvelope(job);
      const receipt=await chain.receipt(job.transaction_hash);
      if (receipt.status==='SUCCESS') {
        const state=assertBookingMatches(job,await chain.booking(job));
        if (!['Active','Revoked','Consumed'].includes(state) || (job.tx_kind==='revoke' && state!=='Revoked')) throw Error('booking_state_mismatch');
        await store.complete(job,state==='Consumed'?'consumed':state==='Revoked'?'revoked':'confirmed');
        return {status:'confirmed',kind:job.tx_kind};
      }
      if (receipt.status==='FAILED') {
        if(job.tx_kind==='revoke' && assertBookingMatches(job,await chain.booking(job))==='Consumed') {
          await store.complete(job,'consumed',{failedAttempt:true});return {status:'already_consumed'};
        }
        await store.fail(job,'transaction_failed');return {status:'failed'};
      }
      if (!writesEnabled) return { status: 'writes_paused' };
      // A cancellation racing an unconfirmed attestation cannot safely assert
      // revocation. Reconcile that exact transaction first; do not submit it anew.
      if (job.cancellation_requested_at && job.tx_kind==='attest') return {status:'pending_cancellation'};
      if (job.tx_kind==='attest' && !(await store.eligible(job))) return {status:'pending_eligibility_changed'};
      if (job.tx_kind==='attest') await chain.validateIdentity(job);
      if (await chain.expired(job.prepared_xdr)) return {status:'expired_needs_reconciliation'};
      await chain.submit(job.prepared_xdr);
      return {status:'pending',reusedEnvelope:true};
    }
    if (!writesEnabled || !prepareEnabled) return { status: 'writes_paused' };
    const cancelled=Boolean(job.cancellation_requested_at);
    if (!cancelled && !(await store.eligible(job))) throw Error('booking_no_longer_eligible');
    if (!cancelled) await chain.validateIdentity(job);
    if (cancelled && !job.attestation_hash) {
      // No persisted submission ever existed. Record local withdrawal, not an
      // on-chain revocation receipt. API callers can distinguish the absent hash.
      await store.fail(job,'cancelled_before_attestation');return {status:'cancelled_unsent'};
    }
    if (cancelled) {
      const state=assertBookingMatches(job,await chain.booking(job));
      if (state==='Consumed') {await store.complete(job,'consumed');return {status:'already_consumed'};}
      if (state!=='Active') throw Error('booking_not_active');
    }
    const kind=cancelled?'revoke':'attest';
    const prepared=await chain.prepare(job,kind);
    // Recheck after RPC/signing delay. Persistence must also check cancellation
    // under the row lock; a later cancellation is reconciled via the saved hash.
    if (!cancelled && !(await store.eligible(job))) throw Error('booking_no_longer_eligible');
    if (!cancelled) await chain.validateIdentity(job);
    job=await store.prepared(job,kind,prepared);
    await chain.submit(job.prepared_xdr);
    return {status:'pending',kind};
  } catch (error) {
    // Never expose provider errors, database details, or signed envelopes in logs.
    if (!job.transaction_hash && ['booking_request_invalid','identity_changed','booking_no_longer_eligible','doctor_or_booking_expired'].includes(error?.message)) {
      await store.fail(job,error.message);
      return {status:'failed'};
    }
    await store.note(job,'worker_attempt_incomplete');
    return {status:'needs_reconciliation'};
  } finally { await store.release(job); }
}

export function createChain({authority,relayer,signXdr,provider,server=new rpc.Server('https://soroban-testnet.stellar.org')}) {
  const networkPassphrase=Networks.TESTNET;
  async function read(job,method,args=[]) {
    validateBookingJob(job);
    const tx=new TransactionBuilder(await server.getAccount(authority),{fee:BASE_FEE,networkPassphrase})
      .addOperation(new Contract(job.contract_id).call(method,...args)).setTimeout(60).build();
    const sim=await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) throw Error('contract_read_failed');
    return scValToNative(sim.result.retval);
  }
  async function configuration(job) {
    if (Number(await read(job,'interface_version'))!==2 || await read(job,'get_booking_authority')!==authority ||
        await read(job,'get_admin')!==authority || await read(job,'get_registry')!==PRIVATE_REGISTRY_ID) throw Error('wrong_contract_authority_or_version');
  }
  function operation(job,kind) {
    validateBookingJob(job);
    if (!['attest','revoke'].includes(kind)) throw Error('invalid_booking_method');
    const nonce=nativeToScVal(Buffer.from(job.issuance_id,'hex'));
    const args=kind==='revoke'?[nonce]:[new Address(job.doctor_wallet).toScVal(),new Address(job.patient_wallet).toScVal(),nonce,nativeToScVal(BigInt(job.valid_until),{type:'u64'})];
    return new Contract(PRIVATE_PRESCRIPTION_ID).call(kind==='revoke'?'revoke_booking':'attest_booking',...args);
  }
  return {
    receipt: hash=>server.getTransaction(hash),
    booking: async job=>{await configuration(job);return read(job,'get_booking',[nativeToScVal(Buffer.from(job.issuance_id,'hex'))]);},
    validateIdentity: async job=>{
      await assertCurrentPrivyIdentity(provider,{userId:job.doctor_user_id,email:job.doctor_email,walletId:job.doctor_wallet_id,address:job.doctor_wallet});
      await assertCurrentPrivyIdentity(provider,{userId:job.patient_requested_by,email:job.patient_email,walletId:job.patient_wallet_id,address:job.patient_wallet});
    },
    verifyEnvelope: async job=>{
      const tx=TransactionBuilder.fromXDR(job.prepared_xdr,networkPassphrase),inner=tx.innerTransaction;
      if(!inner || tx.hash().toString('hex')!==job.transaction_hash || inner.source!==authority || tx.feeSource!==relayer.publicKey() ||
        !inner.signatures.some(s=>Keypair.fromPublicKey(authority).verify(inner.hash(),s.signature())) ||
        !tx.signatures.some(s=>relayer.verify(tx.hash(),s.signature())) || inner.operations.length!==1 || inner.operations[0].type!=='invokeHostFunction' ||
        !inner.operations[0].func.toXDR().equals(operation(job,job.tx_kind).body().invokeHostFunctionOp().hostFunction().toXDR()))throw Error('saved_envelope_invalid');
    },
    expired: async envelope=>{
      const tx=TransactionBuilder.fromXDR(envelope,networkPassphrase);
      const inner=tx.innerTransaction??tx;
      return Number(inner.timeBounds?.maxTime??0)<=Math.floor(Date.now()/1000);
    },
    submit: async envelope=>{
      const sent=await server.sendTransaction(TransactionBuilder.fromXDR(envelope,networkPassphrase));
      if (!['PENDING','DUPLICATE','TRY_AGAIN_LATER'].includes(sent.status)) throw Error('submission_not_accepted');
    },
    prepare: async (job,kind)=>{
      await configuration(job);
      if (kind==='attest') {
        const doctor=await readAuthorization({wallet:job.doctor_wallet,source:authority,registryId:PRIVATE_REGISTRY_ID,expectedAdmin:authority,server});
        if(!doctor.authorized || Number(job.valid_until)<=Math.floor(Date.now()/1000)) throw Error('doctor_or_booking_expired');
      }
      const unsigned=new TransactionBuilder(await server.getAccount(authority),{fee:BASE_FEE,networkPassphrase})
        .addOperation(operation(job,kind)).setTimeout(180).build();
      const prepared=await server.prepareTransaction(unsigned);
      if(prepared.source!==authority || prepared.operations.length!==1 || prepared.operations[0].type!=='invokeHostFunction' ||
        !prepared.operations[0].func.toXDR().equals(operation(job,kind).body().invokeHostFunctionOp().hostFunction().toXDR()))throw Error('booking_preparation_changed');
      const signed=TransactionBuilder.fromXDR(await signXdr(prepared.toXDR()),networkPassphrase);
      if (!signed.hash().equals(prepared.hash()) || signed.source!==authority ||
          !signed.signatures.some(s=>Keypair.fromPublicKey(authority).verify(signed.hash(),s.signature()))) throw Error('authority_signature_invalid');
      const outer=TransactionBuilder.buildFeeBumpTransaction(relayer,'2000000',signed,networkPassphrase);outer.sign(relayer);
      return {xdr:outer.toXDR(),hash:outer.hash().toString('hex')};
    },
  };
}

/** Connected PostgreSQL session required. Caller holds a global authority lock
 * for the full run so parallel worker processes cannot compete for its sequence.
 */
export function createStore(client,contractId) {
  if(contractId!==PRIVATE_PRESCRIPTION_ID)throw Error('private_contract_required');
  const q=(text,values=[])=>client.query(text,values);
  const token=randomUUID();
  const owns=(job)=>[job.appointment_id,token];
  const identities=`JOIN appointments a ON a.id=r.appointment_id
    JOIN privy_stellar_wallet_bindings p ON p.app_id='${PRIVY_APP_ID}' AND p.user_id=r.patient_requested_by
      AND p.wallet_id=r.patient_wallet_id AND p.address=r.patient_wallet
    JOIN privy_stellar_wallet_bindings d ON d.app_id='${PRIVY_APP_ID}' AND d.user_id=r.doctor_user_id
      AND d.wallet_id=r.doctor_wallet_id AND d.address=r.doctor_wallet`;
  const eligibility=`r.cancellation_requested_at IS NULL AND r.valid_until>EXTRACT(EPOCH FROM NOW())
    AND a.status='in_progress' AND a.started_at<=NOW() AND a.started_at>NOW()-INTERVAL '24 hours'
    AND a.date=(NOW() AT TIME ZONE 'America/Santiago')::date
    AND a.patient_email=r.patient_email AND a.doctor_email=r.doctor_email
    AND a.patient_user_id=r.patient_requested_by AND a.doctor_user_id=r.doctor_user_id
    AND a.patient_wallet_id=r.patient_wallet_id AND a.doctor_wallet_id=r.doctor_wallet_id
    AND a.patient_wallet=r.patient_wallet AND a.doctor_wallet=r.doctor_wallet
    AND a.attendance_at<=NOW() AND a.attendance_user_id=r.patient_requested_by AND a.started_by=r.doctor_user_id`;
  return {
    claim:async({signedOnly=false}={})=>{
      const {rows}=await q(`WITH candidate AS (SELECT appointment_id FROM prescription_booking_requests
        WHERE network='testnet' AND contract_id=$1 AND state IN ('prepared','submitted','cancel_requested')
          AND (lease_until IS NULL OR lease_until<NOW()) AND (NOT $3 OR transaction_hash IS NOT NULL)
          ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE prescription_booking_requests r SET lease_token=$2,lease_until=NOW()+INTERVAL '5 minutes'
        FROM candidate WHERE r.appointment_id=candidate.appointment_id RETURNING r.*`,[contractId,token,signedOnly]);return rows[0];
    },
    eligible:async job=>{
      const {rows}=await q(`SELECT 1 FROM prescription_booking_requests r ${identities}
        WHERE r.appointment_id=$1 AND r.lease_token=$2 AND r.lease_until>NOW() AND ${eligibility}`,owns(job));return rows.length===1;
    },
    prepared:async(job,kind,p)=>{
      await q('BEGIN');
      try {
        await q('SELECT id FROM appointments WHERE id=$1 FOR UPDATE',[job.appointment_id]);
        if(kind==='attest') {
          const locked=await q(`SELECT r.appointment_id FROM prescription_booking_requests r ${identities}
            WHERE r.appointment_id=$1 AND r.lease_token=$2 AND r.lease_until>NOW() AND ${eligibility} FOR UPDATE OF r,a,p,d`,owns(job));
          if(locked.rows.length!==1)throw Error('lease_or_cancellation_changed');
        }
        const attempt=JSON.stringify([{kind,xdr:p.xdr,hash:p.hash,preparedAt:new Date().toISOString()}]);
        const {rows}=await q(`UPDATE prescription_booking_requests SET tx_kind=$3,prepared_xdr=$4,transaction_hash=$5,state='submitted',
          attempts=attempts || $6::jsonb,updated_at=NOW()
          WHERE appointment_id=$1 AND lease_token=$2 AND lease_until>NOW() AND transaction_hash IS NULL
          AND ($3='revoke' OR cancellation_requested_at IS NULL) RETURNING *`,[...owns(job),kind,p.xdr,p.hash,attempt]);
        if(rows.length!==1)throw Error('lease_or_cancellation_changed');
        await q('COMMIT');return rows[0];
      }catch(error){await q('ROLLBACK');throw error;}
    },
    complete:async(job,state,{failedAttempt=false}={})=>{
      await q('BEGIN');
      try {
      await q('SELECT id FROM appointments WHERE id=$1 FOR UPDATE',[job.appointment_id]);
      const result=await q(`UPDATE prescription_booking_requests SET
        attestation_hash=CASE WHEN tx_kind='attest' AND NOT $4 THEN transaction_hash ELSE attestation_hash END,
        revocation_hash=CASE WHEN tx_kind='revoke' AND NOT $4 THEN transaction_hash ELSE revocation_hash END,
        state=CASE WHEN $3='confirmed' AND cancellation_requested_at IS NOT NULL THEN 'cancel_requested' ELSE $3 END,
        transaction_hash=NULL,prepared_xdr=NULL,tx_kind=NULL,last_error=CASE WHEN $4 THEN 'cancellation_lost_to_issuance' ELSE NULL END,updated_at=NOW()
        WHERE appointment_id=$1 AND lease_token=$2 AND lease_until>NOW()`,[...owns(job),state,failedAttempt]);
      if (result.rowCount!==1) throw Error('lease_lost_before_confirmation');
      if(state==='revoked')await q("UPDATE appointments SET status='cancelled' WHERE id=$1",[job.appointment_id]);
      await q('COMMIT');
      }catch(error){await q('ROLLBACK');throw error;}
    },
    fail:async(job,error)=>{
      await q('BEGIN');
      try{
      await q('SELECT id FROM appointments WHERE id=$1 FOR UPDATE',[job.appointment_id]);
      const result=await q(`UPDATE prescription_booking_requests SET state='failed',last_error=$3,updated_at=NOW()
      WHERE appointment_id=$1 AND lease_token=$2 AND lease_until>NOW()
        AND ($3<>'cancelled_before_attestation' OR (transaction_hash IS NULL AND attestation_hash IS NULL AND attempts='[]'::jsonb))`,[...owns(job),error]);
      if(result.rowCount!==1)throw Error('lease_lost_before_failure');
      if(error==='cancelled_before_attestation')await q(`UPDATE appointments SET status='cancelled' WHERE id=$1
        AND EXISTS(SELECT 1 FROM prescription_booking_requests r WHERE r.appointment_id=$1 AND r.transaction_hash IS NULL AND r.attestation_hash IS NULL AND r.attempts='[]'::jsonb)`,[job.appointment_id]);
      await q('COMMIT');
      }catch(e){await q('ROLLBACK');throw e;}
    },
    note:async(job,error)=>{await q('UPDATE prescription_booking_requests SET last_error=$3 WHERE appointment_id=$1 AND lease_token=$2',[...owns(job),error]);},
    release:async job=>{await q('UPDATE prescription_booking_requests SET lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE appointment_id=$1 AND lease_token=$2',owns(job));},
  };
}

export { secureStoreSigner } from './lib/private-worker-runtime.mjs';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  import('./worker-private-portal.mjs').then(({ main }) => main({ queue: 'bookings' })).catch(() => {
    console.error('Booking worker stopped; configuration or reconciliation required.'); process.exitCode = 1;
  });
}
