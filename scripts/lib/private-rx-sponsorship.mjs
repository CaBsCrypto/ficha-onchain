import { createHash } from 'node:crypto';
import { Address, Contract, FeeBumpTransaction, Keypair, Networks, Transaction, TransactionBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { assertPrivateRxScopeOpen } from './digital-cabs-rx-scope.mjs';
import { clinicalSimulationIsLive } from './clinical-live-read.mjs';
import { assertBinding, assertPolicy, CLINICAL_QUOTE_MAX_AGE_SECONDS, quoteExpiresAt, sha256, stroops, verifySponsorshipPrincipal } from './sponsorship-domain.mjs';
import { quoteSponsorship, signedEnvelope } from './sponsorship-quote.mjs';
import { createSponsorshipService } from './sponsorship-service.mjs';
import { SqlSponsorshipStore } from './sponsorship-sql-store.mjs';

export const PRIVATE_RX_SPONSOR_BASE_FEE = '100000';
const MAX_TOTAL_FEE = 10_000_000n;
const STEPS = ['attest', 'consent', 'mint'];
const METHODS = { attest: 'attest_booking', consent: 'authorize_prescriber', mint: 'mint_prescription' };
const epoch = () => Math.floor(Date.now() / 1000);
const fail = (code = 'private_rx_sponsorship_rejected') => { throw Error(code); };
const check = (condition, code) => { if (!condition) fail(code); };

export function privateRxInvocation(scope, step, expected) {
  check(scope?.phase === 'issuance' && STEPS.includes(step));
  const doctor = new Address(scope.doctor.address).toScVal();
  const patient = new Address(scope.patient.address).toScVal();
  const issuance = nativeToScVal(Buffer.from(scope.issuanceId, 'hex'));
  const validUntil = nativeToScVal(BigInt(scope.bookingValidUntil), { type: 'u64' });
  if (step === 'attest') return new Contract(scope.contractId).call(METHODS.attest, doctor, patient, issuance, validUntil);
  check(expected?.doctor === scope.doctor.address && expected.patient === scope.patient.address &&
    expected.issuanceId === scope.issuanceId && expected.validUntil === scope.bookingValidUntil);
  if (step === 'consent') return new Contract(scope.contractId).call(METHODS.consent, patient, doctor, issuance, validUntil);
  check(/^[a-f0-9]{64}$/.test(expected.commitment ?? '') && Number.isSafeInteger(expected.expiresAt) && expected.expiresAt > scope.openedAt);
  return new Contract(scope.contractId).call(METHODS.mint, doctor, patient, issuance,
    nativeToScVal(Buffer.from(expected.commitment, 'hex')), nativeToScVal(BigInt(expected.expiresAt), { type: 'u64' }));
}

function actorFor(scope, step) {
  if (step === 'attest') return { address: scope.authority, userId: scope.doctor.userId, walletId: 'booking-authority:' + scope.authority };
  return step === 'consent' ? scope.patient : scope.doctor;
}

async function principalFor(scope, step, unsignedXdr, expected) {
  const method = METHODS[step], actor = actorFor(scope, step), operation = privateRxInvocation(scope, step, expected);
  const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
  check(tx instanceof Transaction && tx.source === actor.address && tx.signatures.length === 0 && tx.operations.length === 1 &&
    Number(tx.timeBounds?.minTime) === 0 && Number.isSafeInteger(Number(tx.timeBounds?.maxTime)) &&
    Number(tx.timeBounds?.maxTime) <= Math.min(scope.until, scope.bookingValidUntil));
  const op = tx.operations[0];
  const host = operation.body().invokeHostFunctionOp().hostFunction();
  check(op.type === 'invokeHostFunction' && op.source === undefined && op.func.toXDR().equals(host.toXDR()));
  const ext = tx.toEnvelope().v1().tx().ext();
  check(ext.switch() === 1 && clinicalSimulationIsLive({ transactionData: { build: () => ext.sorobanData() } }));
  const auth = op.auth ?? [];
  check(auth.length <= 1 && auth.every(entry => {
    const root = entry.rootInvocation(), fn = root.function();
    return entry.credentials().switch().name === 'sorobanCredentialsSourceAccount' && root.subInvocations().length === 0 &&
      fn.switch().name === 'sorobanAuthorizedFunctionTypeContractFn' && fn.contractFn().toXDR().equals(host.invokeContract().toXDR());
  }));
  const principal = await verifySponsorshipPrincipal(async () => ({
    requestId: scope.steps[step].requestId, network: 'testnet', sourceAddress: actor.address, sponsorAddress: scope.relayer,
    patientAddress: scope.patient.address, actorId: actor.userId, walletId: actor.walletId, contractId: scope.contractId,
    action: method, encounterId: scope.issuanceId, intent: 'standard', operationFingerprint: sha256(host.toXDR('base64')),
  }));
  return { principal, tx };
}

function capped(scope, step, fee) {
  const total = stroops(scope.maxTotalFeeStroops), stepCap = stroops(scope.steps[step].maxFeeStroops), offered = stroops(fee);
  check(total <= MAX_TOTAL_FEE && stepCap <= total && offered <= stepCap, 'private_rx_fee_budget_exceeded');
}

/** Produces verified quote data only. The unapproved preview cannot reserve or sign. */
export async function privateRxQuote(scope, step, unsignedXdr, expected, { preparedAt = epoch(), now = epoch() } = {}) {
  const { principal, tx } = await principalFor(scope, step, unsignedXdr, expected);
  const quote = quoteSponsorship(principal, { unsignedXdr, sponsorBaseFeeStroops: PRIVATE_RX_SPONSOR_BASE_FEE, preparedAt, now,
    validUntil: Math.min(preparedAt + CLINICAL_QUOTE_MAX_AGE_SECONDS, Number(tx.timeBounds.maxTime)) });
  capped(scope, step, quote.offeredFeeStroops);
  return quote;
}

function policyFor(scope, step, env) {
  const path = step === 'attest' ? '/api/prescription-bookings' : '/api/private-operations';
  check(env.TRUSTLEAF_SPONSORSHIP_ENABLED === 'true' && env.TRUSTLEAF_SPONSORSHIP_PATHS === path &&
    env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'false', 'private_rx_sponsorship_disabled');
  const minimum = (left, right) => (stroops(left) < stroops(right) ? left : right);
  const policy = { enabled: true, sponsorDailyLimitStroops: env.TRUSTLEAF_SPONSORSHIP_SPONSOR_DAILY_LIMIT_STROOPS,
    patientDailyLimitStroops: env.TRUSTLEAF_SPONSORSHIP_PATIENT_DAILY_LIMIT_STROOPS,
    maxFeeStroops: minimum(scope.maxTotalFeeStroops, env.TRUSTLEAF_SPONSORSHIP_MAX_FEE_STROOPS),
    encounterLimitStroops: minimum(scope.maxTotalFeeStroops, env.TRUSTLEAF_SPONSORSHIP_ENTRY_LIMIT_STROOPS),
    emergencyReserveStroops: env.TRUSTLEAF_SPONSORSHIP_EMERGENCY_RESERVE_STROOPS ?? '0' };
  assertPolicy(policy);
  return policy;
}

function assertSignature(tx, address) {
  const key = Keypair.fromPublicKey(address);
  const [signature] = tx.signatures;
  check(tx.signatures.length === 1 && signature.hint().equals(key.signatureHint()) && key.verify(tx.hash(), signature.signature()));
}

function verifiedOuter(principal, reservation, encoded, hash) {
  const outer = TransactionBuilder.fromXDR(encoded, Networks.TESTNET);
  check(outer instanceof FeeBumpTransaction && outer.hash().toString('hex') === hash && outer.feeSource === principal.sponsorAddress &&
    outer.fee === reservation.quote.offeredFeeStroops && reservation.quote.sponsorBaseFeeStroops === PRIVATE_RX_SPONSOR_BASE_FEE);
  const inner = outer.innerTransaction;
  assertSignature(inner, principal.sourceAddress);
  assertSignature(outer, principal.sponsorAddress);
  const { signedInnerDigest, transactionHash } = signedEnvelope(principal, reservation.quote, inner.toXDR());
  const unsigned = inner.toEnvelope();
  unsigned.v1().signatures([]);
  check(transactionHash === hash && sha256(new Transaction(unsigned, Networks.TESTNET).toXDR()) === reservation.quote.unsignedHash);
  return { outer, signedInnerDigest };
}

/** Only exact RPC envelope, result and committed return metadata can settle the reserve. */
export function verifyPrivateRxReceipt(receipt, outer, hash) {
  const success = receipt?.status === 'SUCCESS';
  check((success || receipt?.status === 'FAILED') && receipt.feeBump === true &&
    (receipt.hash === undefined || receipt.hash === hash) && Number.isSafeInteger(receipt.ledger) && receipt.ledger > 0 &&
    receipt.envelopeXdr instanceof xdr.TransactionEnvelope && receipt.envelopeXdr.toXDR().equals(outer.toEnvelope().toXDR()) &&
    receipt.resultXdr instanceof xdr.TransactionResult && receipt.resultMetaXdr instanceof xdr.TransactionMeta && [3, 4].includes(receipt.resultMetaXdr.switch()),
  'private_rx_receipt_mismatch');
  const result = receipt.resultXdr.result();
  check(result.switch().name === (success ? 'txFeeBumpInnerSuccess' : 'txFeeBumpInnerFailed'), 'private_rx_receipt_mismatch');
  const pair = result.innerResultPair(), inner = pair.result().result();
  check(pair.transactionHash().equals(outer.innerTransaction.hash()) && inner.switch().name === (success ? 'txSuccess' : 'txFailed') &&
    inner.results().length === 1, 'private_rx_receipt_mismatch');
  if (success) {
    const operation = inner.results()[0], meta = receipt.resultMetaXdr, value = meta.value();
    check(operation.switch().name === 'opInner' && operation.tr().switch().name === 'invokeHostFunction', 'private_rx_receipt_mismatch');
    const invocation = operation.tr().invokeHostFunctionResult(), returned = receipt.returnValue;
    check(invocation.switch().name === 'invokeHostFunctionSuccess' && returned instanceof xdr.ScVal &&
      value.sorobanMeta()?.returnValue().toXDR().equals(returned.toXDR()), 'private_rx_receipt_mismatch');
    const events = meta.switch() === 3 ? value.sorobanMeta().events() : value.operations()[0]?.events();
    check(Array.isArray(events), 'private_rx_receipt_mismatch');
    const preimage = new xdr.InvokeHostFunctionSuccessPreImage({ returnValue: returned, events });
    check(invocation.success().equals(createHash('sha256').update(preimage.toXDR()).digest()), 'private_rx_receipt_mismatch');
  }
  const charged = receipt.resultXdr.feeCharged().toString();
  check(stroops(charged, true) <= stroops(outer.fee), 'private_rx_receipt_mismatch');
  return { status: receipt.status, transactionHash: hash, feeChargedStroops: charged, ledger: receipt.ledger };
}

export function createPrivateRxSponsorship({ scope, client, connect, env = process.env, now = epoch }) {
  check(typeof client?.query === 'function');
  const storeFor = atomic => new SqlSponsorshipStore(atomic ? async () => ({
    query: (sql, values) => client.query(sql === 'BEGIN' ? 'SAVEPOINT private_rx_sponsorship' :
      sql === 'COMMIT' ? 'RELEASE SAVEPOINT private_rx_sponsorship' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT private_rx_sponsorship' : sql, values),
    release() { /* Existing operation owns its transaction. */ },
  }) : connect ?? (async () => ({ query: (sql, values) => client.query(sql, values), release() {} })));
  const open = step => {
    assertPrivateRxScopeOpen(scope, { step, env, now: now() });
    return policyFor(scope, step, env);
  };
  const serviceFor = (atomic, policy = null) => createSponsorshipService({ store: storeFor(atomic), policy, now });
  const details = async (step, unsignedXdr, expected, atomic) => {
    const { principal, tx } = await principalFor(scope, step, unsignedXdr, expected);
    const reservation = await storeFor(atomic).get(principal.requestId);
    check(reservation && reservation.quote.unsignedHash === sha256(unsignedXdr) && reservation.quote.signingHash === tx.hash().toString('hex') &&
      reservation.quote.maxTime === Number(tx.timeBounds.maxTime) && reservation.quote.sponsorBaseFeeStroops === PRIVATE_RX_SPONSOR_BASE_FEE);
    assertBinding(reservation, principal);
    capped(scope, step, reservation.quote.offeredFeeStroops);
    return { principal, reservation, tx };
  };
  const bound = async (step, unsignedXdr, expected, encoded, hash, atomic) => {
    const detail = await details(step, unsignedXdr, expected, atomic);
    const verified = verifiedOuter(detail.principal, detail.reservation, encoded, hash);
    check(['submitted', 'settled'].includes(detail.reservation.state) && detail.reservation.transactionHash === hash &&
      detail.reservation.signedInnerDigest === verified.signedInnerDigest);
    return { ...detail, ...verified };
  };
  const signOuter = (principal, inner) => {
    const relayer = Keypair.fromSecret(env.RELAYER_SECRET ?? '');
    check(relayer.publicKey() === principal.sponsorAddress);
    const outer = TransactionBuilder.buildFeeBumpTransaction(relayer, PRIVATE_RX_SPONSOR_BASE_FEE, inner, Networks.TESTNET);
    outer.sign(relayer);
    return { xdr: outer.toXDR(), hash: outer.hash().toString('hex') };
  };
  let reservedAuthorityXdr;
  return {
    assertConfigured: open,
    async reserve(step, unsignedXdr, expected, { atomic = true, preparedAt = now(), pinnedQuoteId } = {}) {
      open(step);
      const { principal } = await principalFor(scope, step, unsignedXdr, expected), store = storeFor(atomic);
      check(!(await store.get(principal.requestId)), 'private_rx_sponsorship_attempt_exists');
      for (const previous of STEPS.slice(0, STEPS.indexOf(step))) {
        const prior = await store.get(scope.steps[previous].requestId), actor = actorFor(scope, previous);
        check(prior?.state === 'settled' && prior.outcome === 'SUCCESS' && prior.binding.action === METHODS[previous] &&
          prior.binding.contractId === scope.contractId && prior.binding.encounterId === scope.issuanceId && prior.binding.patientAddress === scope.patient.address &&
          prior.binding.sponsorAddress === scope.relayer && prior.binding.sourceAddress === actor.address && prior.binding.actorId === actor.userId &&
          prior.binding.walletId === actor.walletId, 'private_rx_predecessor_unconfirmed');
      }
      const quote = await privateRxQuote(scope, step, unsignedXdr, expected, { preparedAt, now: now() });
      if (step === 'attest') check(pinnedQuoteId === quote.quoteId, 'private_rx_attestation_quote_mismatch');
      const reservation = await serviceFor(atomic, open(step)).reserve(principal, quote);
      if (step === 'attest') reservedAuthorityXdr = unsignedXdr;
      return reservation;
    },
    async signAuthority(unsignedXdr, signXdr) {
      const step = 'attest';
      const { principal, tx, reservation } = await details(step, unsignedXdr, undefined, false);
      check(reservedAuthorityXdr === unsignedXdr);
      await serviceFor(false, open(step)).assertReady(principal, 'sign');
      reservedAuthorityXdr = undefined;
      const signed = TransactionBuilder.fromXDR(await signXdr(unsignedXdr), Networks.TESTNET);
      check(signed instanceof Transaction && signed.hash().equals(tx.hash()));
      assertSignature(signed, principal.sourceAddress);
      open(step);
      check(now() < quoteExpiresAt(reservation.quote), 'sponsorship_quote_expired');
      return { ...signOuter(principal, signed), unsignedXdr, signedAt: now() };
    },
    async cancelAuthorityBeforeSigning() {
      if (!reservedAuthorityXdr) return;
      const { principal } = await details('attest', reservedAuthorityXdr, undefined, false);
      await serviceFor(false).cancelUnsigned(principal);
      reservedAuthorityXdr = undefined;
    },
    async persistAuthority(prepared) {
      const step = 'attest';
      const { principal, reservation } = await details(step, prepared.unsignedXdr, undefined, true);
      const { outer } = verifiedOuter(principal, reservation, prepared.xdr, prepared.hash);
      const result = await serviceFor(true, open(step)).bindSubmission(principal, outer.innerTransaction.toXDR(), { signedAt: prepared.signedAt });
      check(result.transactionHash === prepared.hash);
    },
    async signOwner(step, unsignedXdr, expected, signature) {
      check(step === 'consent' || step === 'mint');
      const { principal, tx } = await details(step, unsignedXdr, expected, true);
      const hex = signature.replace(/^0x/, '');
      check(/^[a-f0-9]{128}$/i.test(hex) && Keypair.fromPublicKey(principal.sourceAddress).verify(tx.hash(), Buffer.from(hex, 'hex')), 'owner_signature_invalid');
      await serviceFor(true, open(step)).assertReady(principal, 'sign');
      tx.addSignature(principal.sourceAddress, Buffer.from(hex, 'hex').toString('base64'));
      const signed = signOuter(principal, tx);
      const result = await serviceFor(true, open(step)).bindSubmission(principal, tx.toXDR(), { signedAt: now() });
      check(result.transactionHash === signed.hash);
      return signed;
    },
    async assertCanSubmit(step, unsignedXdr, expected, encoded, hash) {
      const { principal, outer } = await bound(step, unsignedXdr, expected, encoded, hash, false);
      const reservation = await serviceFor(false, open(step)).assertReady(principal, 'submit');
      check(reservation.transactionHash === hash);
      open(step);
      return outer;
    },
    async verifyBound(step, unsignedXdr, expected, encoded, hash) {
      return (await bound(step, unsignedXdr, expected, encoded, hash, false)).outer;
    },
    async reconcile(step, unsignedXdr, expected, encoded, hash, receipt, { atomic = false, readOnly = false } = {}) {
      const { outer } = await bound(step, unsignedXdr, expected, encoded, hash, atomic);
      if (['UNKNOWN', 'NOT_FOUND'].includes(receipt?.status)) return null;
      const verified = verifyPrivateRxReceipt(receipt, outer, hash);
      if (!readOnly) {
        assertPrivateRxScopeOpen(scope, { step, env, now: now() });
        await serviceFor(atomic).reconcile(scope.steps[step].requestId, async () => verified);
      }
      return verified;
    },
    async quoteView(step, unsignedXdr, expected, { atomic = false } = {}) {
      const { reservation } = await details(step, unsignedXdr, expected, atomic);
      check(reservation.state === 'reserved');
      const quote = reservation.quote;
      return { maxFeeStroops: quote.offeredFeeStroops, quotePreparedAt: quote.preparedAt, quoteExpiresAt: quoteExpiresAt(quote),
        ...(quote.validUntil === undefined ? {} : { quoteValidUntil: quote.validUntil }) };
    },
    async cancelUnsigned(step, unsignedXdr, expected) {
      const { principal } = await details(step, unsignedXdr, expected, true);
      open(step);
      return serviceFor(true).cancelUnsigned(principal);
    },
  };
}
