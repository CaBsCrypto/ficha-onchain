import { createHash } from 'node:crypto';
import { Address, Contract, FeeBumpTransaction, Keypair, Networks, Transaction, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { assertRehearsalAggregateBudget, assertRehearsalMaintenanceBudget, assertRehearsalResumeBudget, assertRehearsalFee, payloadHash } from './clinical-rehearsal-policy.mjs';
import { clinicalWebFeeQuote, assertClinicalWebSponsoredFee } from './clinical-web-fee-policy.mjs';
import { clinicalSimulationIsLive } from './clinical-live-read.mjs';
import { bindingDigest } from './sponsorship-domain.mjs';
import { resolveRehearsalReceipt } from './clinical-receipt-retention.mjs';
import { decodeSponsorshipReservation } from './sponsorship-sql-store.mjs';

const HASH = /^[a-f0-9]{64}$/;
const STATES = new Set(['awaiting_signature', 'submitted', 'confirmed', 'failed', 'cancelled']);
const FUTURE = new Set(['append_pdf', 'correct_note', 'revoke']);
const unavailable = () => new Error('clinical_rehearsal_budget_unavailable');
const conflict = () => new Error('clinical_rehearsal_order_conflict');
const check = value => { if (!value) throw unavailable(); };
const sha = value => createHash('sha256').update(value).digest();
const hex = value => { check(value instanceof Uint8Array && value.length === 32); return Buffer.from(value).toString('hex'); };
const equal = (a, b) => Buffer.from(a).equals(Buffer.from(b));
function amount(value, zero = false) {
  const text = typeof value === 'bigint' ? value.toString() : value;
  check(typeof text === 'string' && (zero ? /^(?:0|[1-9][0-9]{0,15})$/ : /^[1-9][0-9]{0,15}$/).test(text));
  return BigInt(text);
}
function number(value, min = 1) {
  check((typeof value === 'number' || typeof value === 'bigint') && Number.isSafeInteger(Number(value)) && Number(value) >= min);
  return Number(value);
}
function exact(value, names) {
  check(value && typeof value === 'object' && Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key)));
}
function actor(policy, step) {
  if (step.actor === 'admin') { check(policy.completionContinuation && step.key === 'renew'); return { address: policy.admin }; }
  check(step.actor === 'patient' || step.actor === 'doctor');
  const selected = policy[step.actor]; check(selected && typeof selected.address === 'string'); return selected;
}
function signature(tx, address) {
  const key = Keypair.fromPublicKey(address);
  check(tx.signatures.length === 1 && equal(tx.signatures[0].hint(), key.signatureHint()) && key.verify(tx.hash(), tx.signatures[0].signature()));
}
function entryId(policy, operationId) {
  return sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'), nativeToScVal(sha(Networks.TESTNET)),
    new Address(policy.contractId).toScVal(), nativeToScVal(Buffer.from(policy.historyId, 'hex')),
    new Address(policy.doctor.address).toScVal(), nativeToScVal(Buffer.from(operationId, 'hex'))]).toXDR()).toString('hex');
}
/** Validate the public invocation without plaintext or an application SQL adapter. */
function unsigned(policy, step, encoded) {
  check(typeof encoded === 'string' && encoded.length > 0 && encoded.length <= 1_000_000);
  const tx = TransactionBuilder.fromXDR(encoded, Networks.TESTNET), expectedActor = actor(policy, step);
  check(tx instanceof Transaction && tx.networkPassphrase === Networks.TESTNET && tx.signatures.length === 0 &&
    tx.source === expectedActor.address && tx.operations.length === 1 && BigInt(tx.sequence) > 0n);
  const body = tx.toEnvelope().v1().tx(), operation = tx.operations[0];
  check(body.memo().switch().name === 'memoNone' && body.cond().switch().name === 'precondTime' &&
    Number(tx.timeBounds?.minTime) === 0 && Number.isSafeInteger(Number(tx.timeBounds?.maxTime)) &&
    Number(tx.timeBounds.maxTime) > 0 && Number(tx.timeBounds.maxTime) <= policy.until &&
    operation.type === 'invokeHostFunction' && operation.source === undefined &&
    operation.func.switch().name === 'hostFunctionTypeInvokeContract' && (operation.auth?.length ?? 0) <= 1);
  const call = operation.func.invokeContract();
  let value;
  if (step.actor === 'admin') {
    check(policy.completionContinuation && step.key === 'renew' && step.action === 'renew' &&
      Address.fromScAddress(call.contractAddress()).toString() === policy.registryId &&
      call.functionName().toString() === policy.authorization.method && call.args().length === 3);
    value = { wallet: scValToNative(call.args()[0]), commitment: hex(scValToNative(call.args()[1])), validUntil: Number(scValToNative(call.args()[2])) };
    check(value.wallet === policy.doctor.address && value.validUntil === policy.authorization.validUntil && !/^0+$/.test(value.commitment));
  } else {
    check(Address.fromScAddress(call.contractAddress()).toString() === policy.contractId &&
      call.functionName().toString() === step.action && call.args().length === 1);
    value = scValToNative(call.args()[0]);
    check(hex(value.history_id) === policy.historyId && hex(value.operation_id) === step.operationId);
  }
  if (step.actor === 'admin') { /* Exact registry invocation was verified above. */
  } else if (step.action === 'append_version') {
    exact(value, ['history_id','entry_id','author','commitment','expected_version','expected_grant_revision','operation_id']);
    check(step.actor === 'doctor' && value.author === policy.doctor.address &&
      hex(value.entry_id) === (step.input.entryId ?? entryId(policy, step.operationId)) &&
      number(value.expected_version, 0) === (step.input.expectedVersion ?? 0) &&
      number(value.expected_grant_revision) === (step.key === 'append_note' ? 5 : 6));
    hex(value.commitment);
  } else {
    check(step.action === 'set_permissions' && step.actor === 'patient');
    exact(value, ['history_id','doctor','can_read','can_append','expected_revision','operation_id']);
    check(value.doctor === policy.doctor.address && value.can_read === step.input.canRead &&
      value.can_append === step.input.canAppend && number(value.expected_revision) === step.input.expectedRevision);
  }
  for (const auth of operation.auth ?? []) {
    const root = auth.rootInvocation();
    check(auth.credentials().switch().name === 'sorobanCredentialsSourceAccount' && root.subInvocations().length === 0 &&
      root.function().switch().name === 'sorobanAuthorizedFunctionTypeContractFn' &&
      equal(root.function().contractFn().toXDR(), call.toXDR()));
  }
  const extension = body.ext();
  check(extension.switch() === 1 && clinicalSimulationIsLive({ transactionData: { build: () => extension.sorobanData() } }));
  const quote = clinicalWebFeeQuote(tx);
  check(quote.sponsored <= amount(step.maxFeeStroops));
  return { tx, invocation: value, offered: quote.sponsored, maxTime: Number(tx.timeBounds.maxTime) };
}
function saved(policy, step, row) {
  const selected = actor(policy, step);
  check(row.id === step.requestId && STATES.has(row.state) && row.action === step.action &&
    row.source_wallet === selected.address && row.contract_id === policy.contractId && row.network === 'testnet');
  if (row.method !== undefined) check(row.method === step.action);
  if (row.actor_user_id !== undefined) check(row.actor_user_id === selected.userId);
  if (row.wallet_id !== undefined) check(row.wallet_id === selected.walletId);
  const prepared = unsigned(policy, step, row.unsigned_xdr);
  check(typeof row.signing_hash === 'string' && HASH.test(row.signing_hash) && prepared.tx.hash().toString('hex') === row.signing_hash);
  const expected = row.expected;
  check(expected && expected.historyId === policy.historyId && expected.patient === policy.patient.address && expected.operationId === step.operationId);
  if (step.action === 'append_version') {
    check(expected.author === policy.doctor.address && expected.entryId === hex(prepared.invocation.entry_id) &&
      expected.commitment === hex(prepared.invocation.commitment) && expected.expectedVersion === Number(prepared.invocation.expected_version) &&
      expected.expectedGrantRevision === Number(prepared.invocation.expected_grant_revision) &&
      (expected.expectedVersion === 0 ? expected.previousCommitment === null : typeof expected.previousCommitment === 'string' && HASH.test(expected.previousCommitment)));
  } else {
    check(expected.doctor === policy.doctor.address && expected.doctorId === policy.doctorId &&
      expected.canRead === prepared.invocation.can_read && expected.canAppend === prepared.invocation.can_append &&
      expected.expectedRevision === Number(prepared.invocation.expected_revision));
  }
  const hasSigned = typeof row.signed_xdr === 'string' && row.signed_xdr.length > 0;
  const hasHash = typeof row.transaction_hash === 'string' && HASH.test(row.transaction_hash);
  check((row.signed_xdr === null || hasSigned) && (row.transaction_hash === null || hasHash) && hasSigned === hasHash);
  if (!hasSigned) {
    check(row.state !== 'submitted' && row.state !== 'confirmed');
    if (row.state === 'failed' || row.state === 'cancelled') check(typeof row.error_code === 'string' && /^[a-z][a-z0-9_]{1,79}$/.test(row.error_code));
    return { ...prepared, outer: null, hash: null };
  }
  check(row.signed_xdr.length <= 1_000_000);
  const outer = TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET);
  check(outer instanceof FeeBumpTransaction && outer.feeSource === policy.relayer &&
    outer.hash().toString('hex') === row.transaction_hash && outer.innerTransaction.hash().equals(prepared.tx.hash()));
  assertClinicalWebSponsoredFee(outer);
  check(BigInt(outer.fee) === prepared.offered);
  signature(outer, policy.relayer); signature(outer.innerTransaction, selected.address);
  return { ...prepared, outer, hash: row.transaction_hash };
}
/** Pure scope for a renewal ledger binding; called only after authoritative policy checks. */
export function rehearsalAuthorizationBinding(policy, job) {
  const a = policy.authorization;
  check(policy.completionContinuation && a && job && job.id === a.requestId && job.dossier_id === a.dossierId &&
    job.action === 'renew' && job.method === a.method && job.network === 'testnet' && job.contract_id === policy.registryId &&
    Number(job.doctor_id) === policy.doctorId && job.doctor_user_id === policy.doctor.userId && job.wallet_id === policy.doctor.walletId &&
    job.wallet === policy.doctor.address && (policy.doctor.email === undefined || job.doctor_email === policy.doctor.email) &&
    job.requested_by === policy.reviewer.userId && job.requested_email === policy.reviewer.email &&
    Number(job.expected_version) === a.expectedVersion && Number(job.target_version) === a.targetVersion &&
    Number(job.valid_until) === a.validUntil && typeof job.commitment === 'string' && HASH.test(job.commitment) && !/^0+$/.test(job.commitment));
  const op = new Contract(policy.registryId).call(a.method, new Address(policy.doctor.address).toScVal(),
    nativeToScVal(Buffer.from(job.commitment, 'hex')), nativeToScVal(BigInt(a.validUntil), { type: 'u64' }));
  return { requestId: a.requestId, network: 'testnet', sourceAddress: policy.admin, sponsorAddress: policy.relayer,
    patientAddress: policy.patient.address, actorId: policy.reviewer.userId, walletId: 'registry-admin:' + policy.admin,
    contractId: policy.registryId, action: a.method, operationFingerprint: sha(op.body().invokeHostFunctionOp().hostFunction().toXDR('base64')).toString('hex'),
    encounterId: a.dossierId, intent: 'standard' };
}
export function inspectRehearsalAuthorizationReservation(policy, job, row) {
  const r = decodeSponsorshipReservation(row);
  check(bindingDigest(r.binding) === bindingDigest(rehearsalAuthorizationBinding(policy, job)) &&
    amount(r.quote.offeredFeeStroops) <= 10000000n && r.quote.maxTime <= policy.until &&
    r.quote.preparedAt >= policy.completionContinuation.approvedAt);
  if (job.prepared_xdr !== null && job.prepared_xdr !== undefined) {
    const step = policy.steps.find(s => s.key === 'renew'); check(step);
    const recorded = savedAuthorization(policy, step, job), inner = recorded.outer.innerTransaction;
    check(r.quote.unsignedHash === sha(recorded.tx.toXDR()).toString('hex') &&
      r.quote.signingHash === recorded.tx.hash().toString('hex') && r.quote.maxTime === recorded.maxTime &&
      r.quote.offeredFeeStroops === recorded.offered.toString() && r.quote.sponsorBaseFeeStroops === '2000000' &&
      r.quote.resourceFeeStroops === recorded.tx.toEnvelope().v1().tx().ext().sorobanData().resourceFee().toString() &&
      r.signedInnerDigest === sha(inner.toXDR()).toString('hex') && r.transactionHash === recorded.hash);
  }
  return r;
}
function savedAuthorization(policy, step, row) {
  rehearsalAuthorizationBinding(policy, row);
  check(['pending','submitted','confirmed','failed'].includes(row.state));
  const hasEnvelope = typeof row.prepared_xdr === 'string' && row.prepared_xdr.length > 0;
  const hasHash = typeof row.transaction_hash === 'string' && HASH.test(row.transaction_hash);
  check((row.prepared_xdr === null || hasEnvelope) && (row.transaction_hash === null || hasHash) && hasEnvelope === hasHash);
  if (!hasEnvelope) { check(['pending','failed'].includes(row.state)); return { outer: null, hash: null, offered: null }; }
  const outer = TransactionBuilder.fromXDR(row.prepared_xdr, Networks.TESTNET);
  check(outer instanceof FeeBumpTransaction && outer.feeSource === policy.relayer && outer.hash().toString('hex') === row.transaction_hash);
  const innerEnvelope = outer.innerTransaction.toEnvelope(); innerEnvelope.v1().signatures([]);
  const prepared = unsigned(policy, step, new Transaction(innerEnvelope, Networks.TESTNET).toXDR());
  check(prepared.invocation.commitment === row.commitment && BigInt(outer.fee) === prepared.offered);
  assertClinicalWebSponsoredFee(outer); signature(outer, policy.relayer); signature(outer.innerTransaction, policy.admin);
  return { ...prepared, outer, hash: row.transaction_hash };
}

/** Fee evidence is accepted only for the exact persisted, signed envelope. */
function canonicalCost(step, row, recorded, evidence) {
  check(evidence && ['SUCCESS','FAILED'].includes(evidence.status) && evidence.feeBump === true &&
    Number.isSafeInteger(evidence.ledger) && evidence.ledger > 0 &&
    (evidence.hash === undefined || evidence.hash === recorded.hash) &&
    evidence.envelopeXdr instanceof xdr.TransactionEnvelope && equal(evidence.envelopeXdr.toXDR(), recorded.outer.toEnvelope().toXDR()) &&
    evidence.resultXdr instanceof xdr.TransactionResult && evidence.resultMetaXdr instanceof xdr.TransactionMeta &&
    [3,4].includes(evidence.resultMetaXdr.switch()));
  const outerResult = evidence.resultXdr.result(), successful = evidence.status === 'SUCCESS';
  check(outerResult.switch().name === (successful ? 'txFeeBumpInnerSuccess' : 'txFeeBumpInnerFailed'));
  const pair = outerResult.innerResultPair(), innerResult = pair.result().result();
  check(equal(pair.transactionHash(), recorded.outer.innerTransaction.hash()) &&
    innerResult.switch().name === (successful ? 'txSuccess' : 'txFailed') && innerResult.results().length === 1);
  const operation = innerResult.results()[0];
  if (successful) {
    check(operation.switch().name === 'opInner' && operation.tr().switch().name === 'invokeHostFunction' &&
      operation.tr().invokeHostFunctionResult().switch().name === 'invokeHostFunctionSuccess' && evidence.returnValue);
    const meta = evidence.resultMetaXdr, value = meta.value(), soroban = value.sorobanMeta();
    check(soroban && equal(soroban.returnValue().toXDR(), evidence.returnValue.toXDR()));
    const events = meta.switch() === 3 ? soroban.events() : value.operations()[0]?.events();
    check(Array.isArray(events));
    const preimage = new xdr.InvokeHostFunctionSuccessPreImage({ returnValue: evidence.returnValue, events });
    check(equal(operation.tr().invokeHostFunctionResult().success(), sha(preimage.toXDR())));
    const returned = scValToNative(evidence.returnValue), expected = row.expected;
    if (step.actor === 'admin') {
      check(evidence.returnValue.switch().name === 'scvVoid');
    } else if (step.action === 'append_version') {
      exact(returned, ['author','commitment','previous_commitment','version','created_at']);
      check(returned.author === expected.author && hex(returned.commitment) === expected.commitment &&
        Number(returned.version) === expected.expectedVersion + 1 &&
        (returned.previous_commitment === null ? null : hex(returned.previous_commitment)) === expected.previousCommitment);
      number(returned.created_at);
    } else {
      exact(returned, ['can_read','can_append','revision']);
      check(returned.can_read === expected.canRead && returned.can_append === expected.canAppend &&
        Number(returned.revision) === expected.expectedRevision + 1);
    }
  }
  const paid = amount(evidence.resultXdr.feeCharged().toString(), true);
  check(paid <= recorded.offered);
  return { paid, successful, ledger: evidence.ledger };
}
export function verifiedRehearsalAuthorizationReceipt(policy, job, evidence) {
  const step = policy.steps.find(s => s.key === 'renew'); check(step);
  const recorded = savedAuthorization(policy, step, job); check(recorded.outer);
  const cost = canonicalCost(step, job, recorded, evidence);
  return { status: cost.successful ? 'SUCCESS' : 'FAILED', transactionHash: recorded.hash,
    feeChargedStroops: cost.paid.toString(), ledger: cost.ledger };
}
/** Non-authoritative pure crypto inspector for isolated tests. A successful
 * inspection grants no preparation, signature, submission or SQL authority. */
export function inspectRehearsalConfirmedOperationSnapshot(policy, { step, row, evidence }) {
  try {
    const declared=selectedStep(policy,step);check(FUTURE.has(declared.key));
    const owner=actor(policy,declared);
    check(row?.state==='confirmed'&&row.method===declared.action&&row.actor_user_id===owner.userId&&row.wallet_id===owner.walletId);
    const recorded=saved(policy,declared,row);check(recorded.outer&&recorded.hash);
    const cost=canonicalCost(declared,row,recorded,evidence);check(cost.successful);
    return Object.freeze({status:'SUCCESS',key:declared.key,requestId:declared.requestId,operationId:declared.operationId,
      transactionHash:recorded.hash,ledger:cost.ledger,feeChargedStroops:cost.paid.toString(),offeredFeeStroops:recorded.offered.toString(),
      ...(declared.action==='append_version'?{entryId:row.expected.entryId,version:row.expected.expectedVersion+1}:{revision:row.expected.expectedRevision+1}),
      actorAndPayerSignaturesVerified:true,expectedInvocationAndReturnedOutcomeVerified:true,typedMetaAndSuccessEventPreimageVerified:true,
      durableRecordedOperationReadPending:true});
  } catch(error) {throw safeError(error);}
}
/** Inspect a single already confirmed C4/C5/C6 with the exact approved plan.
 * No candidate, quote, RPC, SQL adapter or mutation capability is accepted.
 * Durable get_operation/version readback remains a separate existing getter. */
export function inspectRehearsalConfirmedOperation(policy, options) {
  const now=options?.now??Math.floor(Date.now()/1000);
  assertRehearsalAggregateBudget(policy,{now,step:options?.step});
  return inspectRehearsalConfirmedOperationSnapshot(policy,options);
}
function selectedStep(policy, step) {
  const declared = policy.steps?.find(item => item.requestId === step?.requestId);
  check(declared && (FUTURE.has(declared.key) || (policy.completionContinuation && declared.key === 'renew' && declared.actor === 'admin')) && payloadHash(declared) === payloadHash(step));
  return declared;
}
function afterIo(now, startedAt) {
  const finishedAt = Date.now();
  check(Number.isSafeInteger(finishedAt) && finishedAt >= startedAt);
  const checked = now + Math.floor(finishedAt / 1000) - Math.floor(startedAt / 1000);
  check(Number.isSafeInteger(checked)); return checked;
}
function safeError(error) {
  if (error instanceof Error && ['clinical_rehearsal_budget_exceeded','clinical_rehearsal_order_conflict','clinical_rehearsal_expired','signature_request_expired'].includes(error.message)) return error;
  return unavailable();
}

/** Non-authoritative, read-only historical proof inspector for isolated tests.
 * Production maintenance callers MUST use assertRehearsalHistoricalCharges. */
export async function inspectRehearsalHistoricalCharges(policy, { rows, receipt, now = Math.floor(Date.now()/1000) }, aggregate) {
  const startedAt = Date.now();
  try {
    check(policy.maintenanceContinuation && aggregate.maintenanceMaxFeeStroops === '20000000' &&
      aggregate.aggregateMaxFeeStroops === '400000000' && Array.isArray(rows) && rows.length === 2 &&
      Array.isArray(aggregate.confirmedSteps) && aggregate.confirmedSteps.length === 2 && typeof receipt === 'function' &&
      Number.isSafeInteger(now) && now > 0 && now < policy.until);
    const ids = new Set(), snapshots = aggregate.confirmedSteps.map((proof, index) => {
      check(proof && proof.key === ['append_note','grant_both'][index] && !ids.has(proof.requestId)); ids.add(proof.requestId);
      const step = policy.steps.find(item => item.requestId === proof.requestId && item.key === proof.key);
      const matching = rows.filter(row => row?.id === proof.requestId);
      check(step && step.operationId === proof.operationId && matching.length === 1);
      // Snapshot all persisted values before external IO. Actor/method fields are
      // mandatory here even though older aggregate callers can omit SQL columns.
      const original = matching[0], selected = actor(policy, step);
      check(original.state === 'confirmed' && original.method === step.action &&
        original.actor_user_id === selected.userId && original.wallet_id === selected.walletId);
      const row = Object.freeze({ ...original, expected: Object.freeze({ ...original.expected }) });
      const recorded = saved(policy, step, row);
      check(recorded.outer && recorded.hash === proof.transactionHash && HASH.test(proof.transactionHash));
      return { step, row, recorded, proof: Object.freeze({ ...proof }) };
    });
    let paid = 0n;
    for (const { step, row, recorded, proof } of snapshots) {
      const evidence = await receipt(recorded.hash);
      const cost = canonicalCost(step, row, recorded, evidence);
      check(cost.successful && cost.ledger === proof.ledger && cost.paid === amount(proof.feeChargedStroops, true));
      paid += cost.paid;
    }
    check(paid === 93618202n);
    if (afterIo(now, startedAt) >= policy.until) throw new Error('clinical_rehearsal_expired');
    return Object.freeze({ paidStroops: paid.toString() });
  } catch (error) { throw safeError(error); }
}

/** Validate schema13 provenance/time before touching the receipt adapter, then
 * prove the exact original C2/C3 charges before any maintenance spend. */
export async function assertRehearsalHistoricalCharges(policy, options) {
  const startedAt = Date.now(), now = options?.now ?? Math.floor(startedAt/1000);
  if(policy.resumeContinuation)assertRehearsalResumeBudget(policy,{now});
  else assertRehearsalMaintenanceBudget(policy, { now });
  const aggregate = assertRehearsalAggregateBudget(policy, { now });
  const receipt=policy.resumeContinuation?hash=>resolveRehearsalReceipt(policy,hash,{receipt:options.receipt,now}):options.receipt;
  const result = await inspectRehearsalHistoricalCharges(policy, { ...options, receipt, now }, aggregate);
  const checkedNow = afterIo(now, startedAt);
  if(policy.resumeContinuation)assertRehearsalResumeBudget(policy,{now:checkedNow});
  else assertRehearsalMaintenanceBudget(policy, { now: checkedNow });
  assertRehearsalAggregateBudget(policy, { now: checkedNow });
  return result;
}

/** Non-authoritative read-only inspector used by isolated crypto/math tests.
 * It never grants policy approval and is not an execution permission boundary.
 * Production callers MUST use assertRehearsalAggregateExposure below. */
export async function inspectRehearsalBudgetExposure(policy, { step, rows, authorizationRows = [], authorizationReservations = [], candidate, receipt, now = Math.floor(Date.now()/1000) }, aggregate) {
  const startedAt = Date.now();
  try {
    const declared = selectedStep(policy, step);
    check(Array.isArray(rows) && rows.length <= 5 && typeof receipt === 'function' &&
      Number.isSafeInteger(now) && now > 0 && now < policy.until);
    const candidateTx = unsigned(policy, declared, candidate?.unsignedXdr);
    const candidateOffered = amount(candidate?.offeredFeeStroops);
    check(candidateOffered === candidateTx.offered && candidateTx.maxTime > now);
    const limit = amount(aggregate.aggregateMaxFeeStroops), cleanupReserve = amount(aggregate.withdrawalReserveStroops);
    check(limit === 400000000n && cleanupReserve === 60000000n && aggregate.withdrawalMaxFeeStroops === '60000000' &&
      aggregate.pdfMaxFeeStroops === '150000000' && aggregate.correctionMaxFeeStroops === '150000000' &&
      Array.isArray(aggregate.confirmedSteps) && aggregate.confirmedSteps.length === 2);
    check(Array.isArray(authorizationRows) && Array.isArray(authorizationReservations) &&
      authorizationRows.length <= (policy.completionContinuation ? 1 : 0) && authorizationReservations.length <= (policy.completionContinuation ? 1 : 0));
    if (policy.completionContinuation) check(aggregate.renewalMaxFeeStroops === '10000000');
    // Maintenance is a separately bounded, single-attempt transaction. Hold its
    // entire approved ceiling for the whole run, including after a cheaper
    // SUCCESS or an uncertain receipt; it can never consume the withdrawal reserve.
    let maintenanceReserve = 0n;
    if (policy.maintenanceContinuation !== undefined || aggregate.maintenanceMaxFeeStroops !== undefined) {
      const maintenance = policy.maintenanceContinuation;
      check(policy.completionContinuation && maintenance && aggregate.maintenanceMaxFeeStroops === '20000000' &&
        maintenance.maxFeeStroops === aggregate.maintenanceMaxFeeStroops && maintenance.source === policy.relayer);
      if(policy.restoredCompletion){const r=policy.restoredCompletion;
        check(maintenance.approvedAt===r.priorCreatedAt&&maintenance.approvedAt===r.priorCompletionApprovedAt&&maintenance.until===r.priorMaintenanceUntil&&
          aggregate.recoveryMaintenanceMaxFeeStroops==='20000000'&&r.restoration.maxFeeStroops==='20000000'&&
          aggregate.priorRenewalReserveStroops==='10000000'&&r.priorRenewalReserveStroops==='10000000');
      }else check(maintenance.approvedAt===policy.createdAt&&maintenance.approvedAt===policy.completionContinuation.approvedAt&&maintenance.until===(policy.resumeContinuation?.previousUntil??policy.until));
      maintenanceReserve = amount(aggregate.maintenanceMaxFeeStroops);
    }

    const ids = new Set(), mapped = [];
    for (const row of rows) {
      check(row && !ids.has(row.id)); ids.add(row.id);
      const planned = policy.steps.find(item => item.requestId === row.id);
      check(planned && planned.actor !== 'admin');
      mapped.push({ row, step: planned, recorded: saved(policy, planned, row) });
    }
    if (policy.completionContinuation) {
      const renew = policy.steps.find(s => s.key === 'renew'); check(renew);
      if (authorizationReservations.length) check(authorizationRows.length === 1);
      for (const row of authorizationRows) {
        check(!ids.has(row.id)); ids.add(row.id);
        const recorded = savedAuthorization(policy, renew, row);
        const reservationRow = authorizationReservations.find(r => r.request_id === row.id);
        const reservation = reservationRow ? inspectRehearsalAuthorizationReservation(policy, row, reservationRow) : null;
        if (recorded.outer) check(reservation && ['submitted','settled'].includes(reservation.state) && reservation.transactionHash === recorded.hash);
        else if (reservation) check(reservation.state === 'reserved' || reservation.state === 'released');
        mapped.push({ row, step: renew, recorded: { ...recorded, offered: recorded.offered ?? (reservation?.state === 'reserved' ? amount(reservation.quote.offeredFeeStroops) : 0n) }, reservation });
      }
    }
    if (declared.actor === 'admin') check(authorizationRows.length === 1 && authorizationRows[0].id === declared.requestId);
    const candidateRow = mapped.find(item => item.row.id === declared.requestId);
    if (candidateRow) {
      if (!['awaiting_signature','submitted', ...(declared.actor === 'admin' ? ['pending'] : [])].includes(candidateRow.row.state)) throw conflict();
      if (declared.actor === 'admin') {
        check(candidateTx.invocation.commitment === candidateRow.row.commitment);
        if (candidateRow.recorded.outer) check(candidateRow.recorded.tx.hash().equals(candidateTx.tx.hash()) && candidateRow.recorded.offered === candidateOffered);
        if (candidateRow.reservation) check(candidateRow.reservation.quote.unsignedHash === sha(candidate.unsignedXdr).toString('hex') && candidateRow.reservation.quote.offeredFeeStroops === candidateOffered.toString());
      } else check(candidateRow.row.unsigned_xdr === candidate.unsignedXdr && candidateRow.recorded.offered === candidateOffered);
    }
    const withdrawal = policy.steps.find(item => item.key === 'revoke'); check(withdrawal);
    if (declared.key !== 'revoke' && mapped.some(item => item.row.id === withdrawal.requestId)) throw conflict();
    const proofById = new Map();
    for (const [index, proof] of aggregate.confirmedSteps.entries()) {
      check(proof.key === ['append_note','grant_both'][index] && !proofById.has(proof.requestId));
      const existing = mapped.find(item => item.row.id === proof.requestId);
      check(existing && existing.step.key === proof.key && existing.step.operationId === proof.operationId &&
        existing.row.state === 'confirmed' && existing.recorded.hash === proof.transactionHash);
      proofById.set(proof.requestId, proof);
    }
    if (policy.closingContinuation) {
      for (const [key, proof] of [
        ['append_pdf', policy.closingContinuation.confirmedPdf],
        ['renew', policy.closingContinuation.confirmedRenewal],
      ]) {
        const existing = mapped.find(item => item.row.id === proof.requestId && item.step.key === key);
        check(existing?.row.state === 'confirmed' && existing.recorded.hash === proof.transactionHash);
        proofById.set(proof.requestId, proof);
      }
    }
    let paid = 0n, reserved = 0n;
    let currentRenewalExposure = declared.key === 'renew' ? candidateOffered : 0n;
    for (const item of mapped) {
      if (item.row.id === declared.requestId) continue;
      const proof = proofById.get(item.row.id);
      const currentRenewal = !!policy.restoredCompletion && item.step.key === 'renew';
      if (!item.recorded.outer) {
        check(!proof);
        if (item.row.state === 'awaiting_signature' || item.reservation?.state === 'reserved') {reserved += item.recorded.offered;if(currentRenewal)currentRenewalExposure=item.recorded.offered;}
        continue;
      }
      let evidence, transportFailed = false;
      try { evidence = await receipt(item.recorded.hash); } catch { transportFailed = true; }
      const unknown = transportFailed || ['NOT_FOUND','UNKNOWN'].includes(evidence?.status);
      if (unknown) {
        check(!proof);
        reserved += item.recorded.offered;if(currentRenewal)currentRenewalExposure=item.recorded.offered; continue;
      }
      const cost = canonicalCost(item.step, item.row, item.recorded, evidence);
      if (proof) check(cost.successful && cost.ledger === proof.ledger && cost.paid === amount(proof.feeChargedStroops, true));
      if (item.row.state === 'confirmed') check(cost.successful);
      if (item.row.state === 'failed') check(!cost.successful);
      paid += cost.paid;if(currentRenewal)currentRenewalExposure=cost.paid;
    }
    const reserve = declared.key === 'revoke' ? 0n : cleanupReserve;
    const recoveryMaintenanceReserve = policy.restoredCompletion ? amount(aggregate.recoveryMaintenanceMaxFeeStroops) : 0n;
    const priorRenewalReserve = policy.restoredCompletion ? amount(aggregate.priorRenewalReserveStroops) : 0n;
    // Schema19 keeps the complete new renewal allocation, including after a
    // cheap canonical result. Only its uncounted remainder is added, so pending,
    // unknown, candidate and confirmed renewal exposure can never be counted twice.
    const renewalCeiling = policy.restoredCompletion ? amount(aggregate.renewalMaxFeeStroops) : 0n;
    if(policy.restoredCompletion)check(currentRenewalExposure<=renewalCeiling);
    const renewalCeilingRemainder = policy.restoredCompletion ? renewalCeiling-currentRenewalExposure : 0n;
    const total = paid + reserved + candidateOffered + reserve + maintenanceReserve + recoveryMaintenanceReserve + priorRenewalReserve + renewalCeilingRemainder;
    const checkedNow = afterIo(now, startedAt);
    if (checkedNow >= policy.until) throw new Error('clinical_rehearsal_expired');
    if (candidateTx.maxTime <= checkedNow) throw new Error('signature_request_expired');
    if (total > limit) throw new Error('clinical_rehearsal_budget_exceeded');
    return Object.freeze({
      paidStroops: paid.toString(), reservedOfferedStroops: reserved.toString(),
      candidateOfferedStroops: candidateOffered.toString(), withdrawalReserveStroops: reserve.toString(),
      ...(maintenanceReserve ? { maintenanceReservedStroops: maintenanceReserve.toString() } : {}),
      ...(policy.restoredCompletion ? {recoveryMaintenanceReservedStroops:recoveryMaintenanceReserve.toString(),priorRenewalReservedStroops:priorRenewalReserve.toString(),renewalCeilingRemainderStroops:renewalCeilingRemainder.toString()} : {}),
      totalExposureStroops: total.toString(), remainingStroops: (limit - total).toString(),
    });
  } catch (error) { throw safeError(error); }
}

/** The sole production authority boundary: validate approved provenance and time
 * BEFORE any receipt adapter is called, then inspect exact immutable snapshots. */
export async function assertRehearsalAggregateExposure(policy, options) {
  const startedAt = Date.now();
  const now = options?.now ?? Math.floor(startedAt/1000);
  const aggregate = assertRehearsalAggregateBudget(policy, { now, step: options?.step });
  try {
    const parsed = unsigned(policy, options.step, options.candidate?.unsignedXdr);
    assertRehearsalFee(policy, options.step, { source: parsed.tx.source, maxTime: parsed.maxTime,
      feeStroops: options.candidate?.offeredFeeStroops, now });
    const receipt=policy.resumeContinuation?hash=>resolveRehearsalReceipt(policy,hash,{receipt:options.receipt,now}):options.receipt;
    const result = await inspectRehearsalBudgetExposure(policy, { ...options, receipt, now }, aggregate);
    const checkedNow = afterIo(now, startedAt);
    assertRehearsalAggregateBudget(policy, { now: checkedNow, step: options.step });
    assertRehearsalFee(policy, options.step, { source: parsed.tx.source, maxTime: parsed.maxTime,
      feeStroops: options.candidate.offeredFeeStroops, now: checkedNow });
    return result;
  } catch (error) {
    if (error instanceof Error && ['clinical_rehearsal_expired','signature_request_expired','clinical_rehearsal_fee_exceeded'].includes(error.message)) throw error;
    throw safeError(error);
  }
}


/** Read-only binding check. The prior renewal holds its entire one-XLM ceiling;
 * this snapshot never substitutes for canonical fee evidence or releases money. */
export function inspectPriorRehearsalRenewal(policy,{job,reservationRow}) {
  try {
  const r=policy.restoredCompletion;check(r&&r.priorRenewalReserveStroops==='10000000');
  const historical={...policy,authorization:r.priorAuthorization,steps:policy.steps.map(s=>s.key==='renew'?r.priorRenewalStep:s),completionContinuation:{...policy.completionContinuation,approvedAt:r.priorCompletionApprovedAt}};
  check(job?.state==='confirmed'&&job.transaction_hash===r.priorRenewalTransactionHash&&job.id===r.priorAuthorization.requestId);
  const recorded=savedAuthorization(historical,r.priorRenewalStep,job),reservation=inspectRehearsalAuthorizationReservation(historical,job,reservationRow);
  check(recorded.outer&&recorded.hash===r.priorRenewalTransactionHash&&recorded.offered<=10000000n&&reservation.state==='settled'&&reservation.transactionHash===recorded.hash&&amount(reservation.chargedStroops,true)<=recorded.offered);
  return Object.freeze({requestId:job.id,transactionHash:recorded.hash,heldStroops:'10000000',canonicalFeeReaudited:false});
  } catch(error) { throw safeError(error); }
}
