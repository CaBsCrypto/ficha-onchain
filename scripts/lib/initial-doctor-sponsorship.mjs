import { createHash } from 'node:crypto';
import { FeeBumpTransaction, Keypair, Networks, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { assertClinicalWebSponsoredFee, CLINICAL_WEB_SPONSOR_BASE_FEE } from './clinical-web-fee-policy.mjs';
import { assertSponsorshipPath, loadSponsorshipConfig } from './sponsorship-config.mjs';
import { assertBinding, sha256, stroops, verifySponsorshipPrincipal } from './sponsorship-domain.mjs';
import { quoteSponsorship, signedEnvelope } from './sponsorship-quote.mjs';
import { createSponsorshipService } from './sponsorship-service.mjs';
import { SqlSponsorshipStore } from './sponsorship-sql-store.mjs';

const path = '/api/admin/doctor-authorizations';
const check = condition => { if (!condition) throw Error('initial_doctor_sponsorship_rejected'); };

function verifyOuter(principal, quote, encoded, hash, maximum) {
  const outer = TransactionBuilder.fromXDR(encoded, Networks.TESTNET);
  check(outer instanceof FeeBumpTransaction && outer.feeSource === principal.sponsorAddress &&
    outer.hash().toString('hex') === hash && outer.fee === quote.offeredFeeStroops && stroops(outer.fee) <= maximum);
  assertClinicalWebSponsoredFee(outer);
  const inner = outer.innerTransaction;
  const signed = signedEnvelope(principal, quote, inner.toXDR());
  const unsigned = inner.toEnvelope();
  unsigned.v1().signatures([]);
  check(signed.transactionHash === hash && sha256(new Transaction(unsigned, Networks.TESTNET).toXDR()) === quote.unsignedHash);
  for (const [tx, address] of [[inner, principal.sourceAddress], [outer, principal.sponsorAddress]]) {
    check(tx.signatures.length === 1 && Keypair.fromPublicKey(address).verify(tx.hash(), tx.signatures[0].signature()));
  }
  return { outer, signed };
}

function canonicalReceipt(evidence, outer, hash) {
  const success = evidence?.status === 'SUCCESS';
  check((success || evidence?.status === 'FAILED') && evidence.feeBump === true &&
    Number.isSafeInteger(evidence.ledger) && evidence.ledger > 0 && (evidence.hash === undefined || evidence.hash === hash) &&
    evidence.envelopeXdr instanceof xdr.TransactionEnvelope &&
    evidence.envelopeXdr.toXDR().equals(outer.toEnvelope().toXDR()) &&
    evidence.resultXdr instanceof xdr.TransactionResult && evidence.resultMetaXdr instanceof xdr.TransactionMeta &&
    [3, 4].includes(evidence.resultMetaXdr.switch()));
  const result = evidence.resultXdr.result();
  check(result.switch().name === (success ? 'txFeeBumpInnerSuccess' : 'txFeeBumpInnerFailed'));
  const pair = result.innerResultPair(), inner = pair.result().result();
  check(pair.transactionHash().equals(outer.innerTransaction.hash()) &&
    inner.switch().name === (success ? 'txSuccess' : 'txFailed') && inner.results().length === 1);
  if (success) {
    const operation = inner.results()[0], meta = evidence.resultMetaXdr, value = meta.value();
    check(operation.switch().name === 'opInner' && operation.tr().switch().name === 'invokeHostFunction');
    const invocation = operation.tr().invokeHostFunctionResult(), returned = evidence.returnValue;
    check(invocation.switch().name === 'invokeHostFunctionSuccess' && returned?.switch().name === 'scvVoid' &&
      value.sorobanMeta()?.returnValue().toXDR().equals(returned.toXDR()));
    const events = meta.switch() === 3 ? value.sorobanMeta().events() : value.operations()[0]?.events();
    check(Array.isArray(events));
    const preimage = new xdr.InvokeHostFunctionSuccessPreImage({ returnValue: returned, events });
    check(invocation.success().equals(createHash('sha256').update(preimage.toXDR()).digest()));
  }
  const charged = evidence.resultXdr.feeCharged().toString();
  check(stroops(charged, true) <= stroops(outer.fee));
  return { status: evidence.status, transactionHash: hash, feeChargedStroops: charged, ledger: evidence.ledger };
}

/** The runner owns the reviewed scope and cross-process locks. Only its exact
 * first authorization can reserve, sign, bind or submit through this adapter. */
export function createInitialDoctorSponsorship({ client, env, server, bindingFor, assertOpen, maxFeeStroops, now = () => Math.floor(Date.now() / 1000) }) {
  const maximum = stroops(String(maxFeeStroops));
  check(typeof client?.query === 'function' && typeof bindingFor === 'function' && typeof assertOpen === 'function');
  let attempt = null;
  const storeFor = atomic => new SqlSponsorshipStore(async () => ({
    query: (sql, values) => client.query(atomic ? (sql === 'BEGIN' ? 'SAVEPOINT initial_authorization_sponsorship' :
      sql === 'COMMIT' ? 'RELEASE SAVEPOINT initial_authorization_sponsorship' :
      sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT initial_authorization_sponsorship' : sql) : sql, values),
    release() { /* The runner owns this connection. */ },
  }));
  const serviceFor = atomic => createSponsorshipService({ store: storeFor(atomic), policy: loadSponsorshipConfig(env).policy, now });
  const principalFor = async job => {
    check(job?.action === 'authorize' && job.method === 'authorize_doctor' &&
      Number(job.expected_version) === 0 && Number(job.target_version) === 1);
    const principal = await verifySponsorshipPrincipal(() => bindingFor(job));
    check(principal.requestId === job.id && principal.network === job.network && principal.contractId === job.contract_id &&
      principal.action === job.method && principal.actorId === job.requested_by &&
      principal.encounterId === job.dossier_id && principal.intent === 'standard');
    return principal;
  };
  const active = async job => {
    const principal = await principalFor(job);
    assertSponsorshipPath(path, { method: 'POST', purpose: 'spend' }, loadSponsorshipConfig(env));
    await assertOpen(job);
    return principal;
  };
  const verifiedBound = async job => {
    const principal = await principalFor(job), reservation = await storeFor(false).get(job.id);
    check(reservation && ['submitted', 'settled'].includes(reservation.state) &&
      reservation.transactionHash === job.transaction_hash);
    assertBinding(reservation, principal);
    const { outer, signed } = verifyOuter(principal, reservation.quote, job.prepared_xdr, job.transaction_hash, maximum);
    check(signed.signedInnerDigest === reservation.signedInnerDigest);
    return outer;
  };
  return {
    assertConfigured: active,
    async reserve(job, unsigned) {
      check(attempt === null && unsigned instanceof Transaction && !job.transaction_hash && !job.prepared_xdr);
      const principal = await active(job);
      check(attempt === null);
      attempt = { id: job.id, phase: 'reserving' };
      // A previously created slot, including an uncertain one, cannot be reused for signing.
      check(!(await storeFor(false).get(job.id)));
      const preparedAt = now();
      const quote = quoteSponsorship(principal, { unsignedXdr: unsigned.toXDR(),
        sponsorBaseFeeStroops: CLINICAL_WEB_SPONSOR_BASE_FEE, preparedAt, now: preparedAt });
      check(stroops(quote.offeredFeeStroops) <= maximum);
      const reservation = await serviceFor(false).reserve(await active(job), quote);
      attempt.phase = 'reserved';
      return reservation;
    },
    async beforeSign(job) {
      check(attempt?.id === job.id && attempt.phase === 'reserved');
      attempt.phase = 'checking_sign';
      try {
        await serviceFor(false).assertReady(await active(job), 'sign');
      } catch (error) {
        attempt.phase = 'reserved';
        throw error;
      }
      // A signer invocation with an unknown result must retain the reservation.
      attempt.phase = 'signing';
    },
    async persistPrepared(job, prepared) {
      check(attempt?.id === job.id && attempt.phase === 'signing');
      const principal = await principalFor(job), reservation = await storeFor(true).get(job.id);
      check(reservation?.state === 'reserved');
      assertBinding(reservation, principal);
      const { outer } = verifyOuter(principal, reservation.quote, prepared.xdr, prepared.hash, maximum);
      const bound = await serviceFor(true).bindSubmission(principal, outer.innerTransaction.toXDR(), { signedAt: prepared.signedAt });
      check(bound.transactionHash === prepared.hash);
    },
    async beforeSubmit(job) {
      await verifiedBound(job);
      const ready = await serviceFor(false).assertReady(await active(job), 'submit');
      check(ready.transactionHash === job.transaction_hash);
    },
    async verifyBound(job) {
      await verifiedBound(job);
    },
    async reconcile(job, evidence) {
      const outer = await verifiedBound(job);
      const receipt = evidence ?? await server.getTransaction(job.transaction_hash);
      if (['UNKNOWN', 'NOT_FOUND'].includes(receipt?.status)) return;
      const verified = canonicalReceipt(receipt, outer, job.transaction_hash);
      await serviceFor(false).reconcile(job.id, async () => verified);
    },
    async cancelBeforeSigning(job) {
      if (attempt?.id !== job.id || attempt.phase !== 'reserved') return;
      const principal = await principalFor(job);
      attempt.phase = 'releasing';
      await serviceFor(false).cancelUnsigned(principal);
      attempt.phase = 'released';
    },
  };
}
