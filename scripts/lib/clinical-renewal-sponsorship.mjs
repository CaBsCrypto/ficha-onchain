/** Scoped schema12 Node adapter to the same persistent sponsorship ledger as Next.
 * Callers hold the approved run/source locks. RPC finishes before bucket locks.
 * No fallback signer or permissive gate exists here. */
import { Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { assertRehearsalAggregateBudget } from './clinical-rehearsal-policy.mjs';
import { assertRehearsalAggregateExposure, rehearsalAuthorizationBinding, inspectRehearsalAuthorizationReservation, verifiedRehearsalAuthorizationReceipt } from './clinical-rehearsal-budget.mjs';
import { clinicalWebFeeQuote, CLINICAL_WEB_SPONSOR_BASE_FEE } from './clinical-web-fee-policy.mjs';
import { verifySponsorshipPrincipal } from './sponsorship-domain.mjs';
import { quoteSponsorship } from './sponsorship-quote.mjs';
import { SqlSponsorshipStore } from './sponsorship-sql-store.mjs';
import { createSponsorshipService } from './sponsorship-service.mjs';
import { assertSponsorshipPath, loadSponsorshipConfig } from './sponsorship-config.mjs';
const path = '/api/admin/doctor-authorizations';
const fail = () => Error('clinical_rehearsal_authorization_sponsorship_rejected');
export function createRehearsalRenewalSponsorship({ plan, env, client, server, assertOpen, now = () => Math.floor(Date.now()/1000) }) {
  const step = plan.steps.find(s => s.key === 'renew');
  let signingStarted = false, ownsUnsignedReservation = false;
  const config = () => loadSponsorshipConfig(env);
  const active = async job => {
    if (!plan.completionContinuation || !step || step.actor !== 'admin' || step.maxFeeStroops !== '10000000' || typeof assertOpen !== 'function') throw fail();
    assertRehearsalAggregateBudget(plan, { step, now: now() });
    rehearsalAuthorizationBinding(plan, job);
    assertSponsorshipPath(path, { method: 'POST', purpose: 'spend' }, config());
    await assertOpen();
  };
  const storeFor = atomic => new SqlSponsorshipStore(async () => ({
    query: (sql, values) => client.query(atomic ? (sql === 'BEGIN' ? 'SAVEPOINT renewal_sponsorship' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT renewal_sponsorship' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT renewal_sponsorship' : sql) : sql, values),
    release() { /* The runner owns its guarded connection and session locks. */ },
  }));
  const serviceFor = atomic => createSponsorshipService({ store: storeFor(atomic), policy: config().policy, now });
  const principal = job => verifySponsorshipPrincipal(async () => rehearsalAuthorizationBinding(plan, job));
  return {
    assertConfigured: active,
    async reserve(job, unsigned) {
      await active(job);
      if (!(unsigned instanceof Transaction)) throw fail();
      const ids = plan.steps.filter(s => s.actor !== 'admin').map(s => s.requestId);
      const rows = (await client.query('SELECT id,state,action,method,source_wallet,actor_user_id,wallet_id,contract_id,network,expected,unsigned_xdr,signed_xdr,transaction_hash,signing_hash,error_code,expires_at FROM clinical_web_operations WHERE id=ANY($1::uuid[])', [ids])).rows;
      const authorizationRows = (await client.query('SELECT * FROM doctor_authorization_requests WHERE id=$1::uuid', [step.requestId])).rows;
      const authorizationReservations = (await client.query('SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1::uuid', [step.requestId])).rows;
      // Never build/sign a replacement for an earlier unsigned or uncertain reservation.
      if (authorizationReservations.length) throw Error('clinical_rehearsal_order_conflict');
      await assertRehearsalAggregateExposure(plan, { step, rows, authorizationRows, authorizationReservations,
        candidate: { unsignedXdr: unsigned.toXDR(), offeredFeeStroops: clinicalWebFeeQuote(unsigned).sponsored },
        receipt: hash => server.getTransaction(hash), now: now() });
      const p = await principal(job), preparedAt = now();
      const quote = quoteSponsorship(p, { unsignedXdr: unsigned.toXDR(), sponsorBaseFeeStroops: CLINICAL_WEB_SPONSOR_BASE_FEE, preparedAt, now: preparedAt });
      if (BigInt(quote.offeredFeeStroops) > 10000000n) throw fail();
      await active(job);
      const reserved = await serviceFor(false).reserve(p, quote);
      ownsUnsignedReservation = true; return reserved;
    },
    async beforeSign(job) {
      await active(job);
      await serviceFor(false).assertReady(await principal(job), 'sign');
      // Once the signer was invoked, even a lost return value cannot release its reserve.
      signingStarted = true;
    },
    async persistPrepared(job, prepared) {
      if (!signingStarted) throw fail();
      const outer = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
      if (!outer.innerTransaction || outer.hash().toString('hex') !== prepared.hash) throw fail();
      const bound = await serviceFor(true).bindSubmission(await principal(job), outer.innerTransaction.toXDR(), { signedAt: prepared.signedAt });
      if (bound.transactionHash !== prepared.hash) throw fail();
    },
    async beforeSubmit(job) {
      await active(job);
      const r = await serviceFor(false).assertReady(await principal(job), 'submit');
      if (r.transactionHash !== job.transaction_hash) throw fail();
    },
    async verifyBound(job) {
      const rows = (await client.query('SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1::uuid', [step.requestId])).rows;
      if (rows.length !== 1) throw fail();
      const r = inspectRehearsalAuthorizationReservation(plan, job, rows[0]);
      if (!['submitted','settled'].includes(r.state) || r.transactionHash !== job.transaction_hash) throw fail();
    },
    async reconcile(job, evidence) {
      await this.verifyBound(job);
      if (!['SUCCESS','FAILED'].includes(evidence?.status)) return;
      const receipt = verifiedRehearsalAuthorizationReceipt(plan, job, evidence);
      await serviceFor(false).reconcile(job.id, async () => receipt);
    },
    async cancelBeforeSigning(job) {
      if (signingStarted || !ownsUnsignedReservation) return;
      const existing = await storeFor(false).get(job.id);
      if (existing?.state === 'reserved') await serviceFor(false).cancelUnsigned(await principal(job));
    },
  };
}
