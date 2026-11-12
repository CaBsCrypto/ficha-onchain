import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Address, BASE_FEE, Contract, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { PRIVATE_REGISTRY_ID, readAuthorization } from './lib/private-registry.mjs';
import { commitmentFor, decryptDossier } from './lib/private-doctor-dossier.mjs';
import { assertCurrentPrivyIdentity } from './lib/private-worker-runtime.mjs';
import { clinicalSimulationIsLive } from './lib/clinical-live-read.mjs';
import { assertUnintegratedSponsorship } from './lib/sponsorship-write-gate.mjs';

const APP_ID = 'cmrix722m03d30clewd1fuffq';
const terminalErrors = new Set(['request_invalid', 'doctor_binding_changed', 'dossier_invalid', 'registry_state_changed',
  'authorization_expired', 'authorization_fee_budget_exceeded', 'authorization_window_expired', 'authorization_scope_rejected', 'authority_signature_invalid', 'registry_configuration_invalid', 'registry_interface_mismatch', 'registry_authority_mismatch']);
// Diagnostics never promote a recoverable error into a terminal SQL state.
const diagnosticErrors = new Set([...terminalErrors, 'secure_signing_failed', 'registry_read_failed',
  'saved_envelope_missing', 'saved_envelope_invalid', 'submission_not_accepted', 'lease_or_identity_changed',
  'lease_lost_before_confirmation', 'lease_lost_before_failure']);

export function validateRequest(job) {
  const before = Number(job.expected_version), after = Number(job.target_version);
  if (job.network !== 'testnet' || job.contract_id !== PRIVATE_REGISTRY_ID || !StrKey.isValidEd25519PublicKey(job.wallet) ||
      !/^[a-f0-9]{64}$/.test(job.commitment) || /^0+$/.test(job.commitment) || !Number.isSafeInteger(Number(job.valid_until)) ||
      Number(job.valid_until) < 1 || !Number.isInteger(before) || !Number.isInteger(after) || after > 4294967295) throw Error('request_invalid');
  const initial = job.action === 'authorize' && job.method === 'authorize_doctor' && before === 0 && after === 1;
  const renewal = job.action === 'renew' && ['renew_authorization', 'reauthorize_doctor'].includes(job.method) && before >= 1 && after === before + 1;
  const revocation = job.action === 'revoke' && job.method === 'revoke_doctor' && before >= 1 && after === before;
  if (!initial && !renewal && !revocation) throw Error('request_invalid');
}

export function assertExpectedState(job, state, now = Math.floor(Date.now() / 1000)) {
  validateRequest(job);
  const a = state.authorization;
  if (job.method === 'authorize_doctor') {
    if (a) throw Error('registry_state_changed');
  } else if (!a || a.version !== Number(job.expected_version)) throw Error('registry_state_changed');
  if (job.method === 'renew_authorization' && (!state.authorized || a.revoked || a.valid_until <= now)) throw Error('registry_state_changed');
  if (job.method === 'reauthorize_doctor' && !a.revoked && a.valid_until > now) throw Error('registry_state_changed');
  if (job.method === 'revoke_doctor' && (a.revoked || a.commitment !== job.commitment || a.valid_until !== Number(job.valid_until))) throw Error('registry_state_changed');
  if (job.action !== 'revoke' && Number(job.valid_until) <= now) throw Error('authorization_expired');
}

export function assertConfirmedState(job, state) {
  const a = state.authorization;
  if (!a || a.version !== Number(job.target_version) || a.schema_version !== 1 || a.commitment !== job.commitment ||
      a.valid_until !== Number(job.valid_until) || a.revoked !== (job.action === 'revoke')) throw Error('registry_state_changed');
  return state.authorized ? 'active' : a.revoked ? 'blocked' : 'pending';
}

function validateRequestId(requestId) {
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))) throw Error('authorization_scope_rejected');
}
function assertRequestScope(job, requestId) {
  if (requestId !== undefined && job?.id !== requestId) throw Error('authorization_scope_rejected');
}

export async function runOnce({ store, chain, writesEnabled = false, prepareEnabled = true, requestId }) {
  validateRequestId(requestId);
  let phase = 'claim';
  let job = await store.claim({ signedOnly: !writesEnabled || !prepareEnabled, ...(requestId === undefined ? {} : { requestId }) });
  if (!job) return { status: 'idle' };
  // A scoped runner must never note/release or sign a different queue item.
  assertRequestScope(job, requestId);
  try {
    phase = 'validation';
    validateRequest(job);
    if (job.transaction_hash) {
      if (!job.prepared_xdr) throw Error('saved_envelope_missing');
      phase = 'reconcile';
      await chain.verifyEnvelope(job);
      phase = 'reconcile';
      const receipt = await chain.receipt(job.transaction_hash);
      if (chain.reconcileSponsorship) await chain.reconcileSponsorship(job, receipt);
      if (receipt.status === 'SUCCESS') {
        phase = 'authorization';
        const status = assertConfirmedState(job, await chain.authorization(job));
        phase = 'persist';
        await store.complete(job, status);
        return { status: 'confirmed' };
      }
      if (receipt.status === 'FAILED') {
        phase = 'persist';
        await store.fail(job, 'transaction_failed');
        return { status: 'failed' };
      }
      if (!writesEnabled) return { status: 'writes_paused' };
      phase = 'reconcile';
      if (await chain.expired(job.prepared_xdr)) {
        phase = 'persist';
        await store.note(job, 'expired_needs_reconciliation');
        return { status: 'expired_needs_reconciliation' };
      }
      // Revalidation may stop retries, but never discards an uncertain attempt.
      phase = 'eligibility';
      if (!(await store.eligible(job))) throw Error('doctor_binding_changed');
      phase = 'identity';
      await chain.validateIdentity(job);
      phase = 'submit';
      await chain.submit(job.prepared_xdr, job);
      return { status: 'submitted', reusedEnvelope: true };
    }
    if (!writesEnabled || !prepareEnabled) return { status: 'writes_paused' };
    phase = 'eligibility';
    if (!(await store.eligible(job))) throw Error('doctor_binding_changed');
    phase = 'identity';
    await chain.validateIdentity(job);
    phase = 'authorization';
    const current = await chain.authorization(job);
    assertExpectedState(job, current);
    phase = 'prepare';
    const prepared = await chain.prepare(job);
    phase = 'eligibility';
    if (!(await store.eligible(job))) throw Error('doctor_binding_changed');
    phase = 'identity';
    await chain.validateIdentity(job);
    phase = 'authorization';
    assertExpectedState(job, await chain.authorization(job));
    phase = 'persist';
    const persisted = await store.prepared(job, prepared);
    assertRequestScope(persisted, requestId);
    job = persisted;
    phase = 'submit';
    await chain.submit(job.prepared_xdr, job);
    return { status: 'submitted' };
  } catch (error) {
    const failedPhase = phase;
    const reason = diagnosticErrors.has(error?.message) ? error.message : 'worker_attempt_incomplete';
    const code = terminalErrors.has(error?.message) ? error.message : 'worker_attempt_incomplete';
    if (!job.transaction_hash && chain.cancelUnsignedSponsorship) await chain.cancelUnsignedSponsorship(job);
    if (!job.transaction_hash && terminalErrors.has(code)) {
      phase = 'persist';
      await store.fail(job, code);
      return { status: 'failed', error: code, phase: failedPhase, reason };
    }
    phase = 'persist';
    await store.note(job, code);
    return { status: 'needs_reconciliation', phase: failedPhase, reason };
  } finally { phase = 'release'; await store.release(job); }
}

function operation(job) {
  validateRequest(job);
  const args = [new Address(job.wallet).toScVal()];
  if (job.action !== 'revoke') args.push(nativeToScVal(Buffer.from(job.commitment, 'hex')), nativeToScVal(BigInt(job.valid_until), { type: 'u64' }));
  return new Contract(PRIVATE_REGISTRY_ID).call(job.method, ...args);
}

export function createChain({ authority, relayer, signXdr, provider, dataKey, requestId, maxFeeStroops, until, assertJob, sponsorship, assertSponsorship = assertUnintegratedSponsorship, server = new rpc.Server('https://soroban-testnet.stellar.org') }) {
  validateRequestId(requestId);
  if (maxFeeStroops !== undefined && (!/^[1-9][0-9]*$/.test(String(maxFeeStroops)) || BigInt(maxFeeStroops) > BigInt('9223372036854775807'))) throw Error('authorization_fee_budget_exceeded');
  if (until !== undefined && (!Number.isSafeInteger(until) || until < 1)) throw Error('authorization_window_expired');
  const networkPassphrase = Networks.TESTNET;
  const scope = async (job, phase) => { assertRequestScope(job, requestId); if (assertJob) { if (!job) throw Error('authorization_scope_rejected'); await assertJob(job, phase); } };
  function checkInner(inner, active = false) {
    const ext = inner.toEnvelope().v1().tx().ext();
    if (requestId !== undefined && ext.switch() !== 1) throw Error('request_invalid');
    if (ext.switch() !== 0 && (ext.switch() !== 1 || !clinicalSimulationIsLive({ transactionData: { build: () => ext.sorobanData() } }))) throw Error('registry_read_failed');
    if (until !== undefined && (!inner.timeBounds || Number(inner.timeBounds.maxTime) > until || (active && Math.floor(Date.now()/1000) >= until))) throw Error('authorization_window_expired');
    let quote;
    try { quote = TransactionBuilder.buildFeeBumpTransaction(relayer.publicKey(), '2000000', inner, networkPassphrase); }
    catch { throw Error('authorization_fee_budget_exceeded'); }
    if (maxFeeStroops !== undefined && BigInt(quote.fee) > BigInt(maxFeeStroops)) throw Error('authorization_fee_budget_exceeded');
  }
  function checkOuter(outer, active = false) {
    if (!outer.innerTransaction || outer.feeSource !== relayer.publicKey() || outer.innerTransaction.source !== authority) throw Error('saved_envelope_invalid');
    checkInner(outer.innerTransaction, active);
    if (maxFeeStroops !== undefined && BigInt(outer.fee) > BigInt(maxFeeStroops)) throw Error('authorization_fee_budget_exceeded');
  }
  const liveServer = { getAccount: (...args) => server.getAccount(...args), simulateTransaction: async (...args) => {
    const sim = await server.simulateTransaction(...args);
    if ('restorePreamble' in sim || (rpc.Api.isSimulationSuccess(sim) && (!clinicalSimulationIsLive(sim) || !Array.isArray(sim.result?.auth) || sim.result.auth.length))) throw Error('registry_read_failed');
    return sim;
  } };
  const authorization = async job => { await scope(job, 'read'); return readAuthorization({ wallet: job.wallet, source: authority, registryId: job.contract_id, expectedAdmin: authority, server: liveServer }); };
  return {
    authorization,
    ...(sponsorship ? { reconcileSponsorship: (job, evidence) => sponsorship.reconcile(job, evidence),
      cancelUnsignedSponsorship: job => sponsorship.cancelBeforeSigning(job) } : {}),
    receipt: hash => server.getTransaction(hash),
    expired: async envelope => {
      const tx = TransactionBuilder.fromXDR(envelope, networkPassphrase);
      return Number((tx.innerTransaction ?? tx).timeBounds?.maxTime ?? 0) <= Math.floor(Date.now() / 1000);
    },
    verifyEnvelope: async job => {
      await scope(job, 'verify');
      if (sponsorship) await sponsorship.verifyBound(job);
      const tx = TransactionBuilder.fromXDR(job.prepared_xdr, networkPassphrase), inner = tx.innerTransaction;
      checkOuter(tx);
      if (!inner || tx.hash().toString('hex') !== job.transaction_hash || inner.source !== authority || tx.feeSource !== relayer.publicKey() ||
          !inner.signatures.some(s => Keypair.fromPublicKey(authority).verify(inner.hash(), s.signature())) ||
          !tx.signatures.some(s => relayer.verify(tx.hash(), s.signature())) || inner.operations.length !== 1 ||
          inner.operations[0].type !== 'invokeHostFunction' || !inner.operations[0].func.toXDR().equals(operation(job).body().invokeHostFunctionOp().hostFunction().toXDR())) throw Error('saved_envelope_invalid');
    },
    validateIdentity: async job => {
      await scope(job, 'identity');
      try { await assertCurrentPrivyIdentity(provider, { userId: job.doctor_user_id, email: job.doctor_email, walletId: job.wallet_id, address: job.wallet }); }
      catch (e) { if (e.message === 'identity_changed') throw Error('doctor_binding_changed'); throw e; }
    },
    prepare: async job => {
      if (sponsorship) await sponsorship.assertConfigured(job); else await assertSponsorship();
      await scope(job, 'prepare');
      assertExpectedState(job, await authorization(job));
      if (job.action !== 'revoke') {
        try {
          const d = decryptDossier(job.encrypted_dossier, dataKey, job.dossier_id);
          if (commitmentFor(d) !== job.commitment || d.wallet !== job.wallet || d.network !== 'testnet' || d.contractId !== PRIVATE_REGISTRY_ID ||
              d.version !== Number(job.target_version) || d.validUntil !== Number(job.valid_until) || d.reviewedBy !== job.requested_by) throw Error();
        } catch { throw Error('dossier_invalid'); }
      }
      const unsigned = new TransactionBuilder(await server.getAccount(authority), { fee: BASE_FEE, networkPassphrase })
        .addOperation(operation(job)).setTimeout(180).build();
      const prepared = await server.prepareTransaction(unsigned);
      if (prepared.source !== authority || prepared.operations.length !== 1 || prepared.operations[0].type !== 'invokeHostFunction' ||
          !prepared.operations[0].func.toXDR().equals(operation(job).body().invokeHostFunctionOp().hostFunction().toXDR())) throw Error('request_invalid');
      // Check the offered total and restoration footprint before either signer.
      checkInner(prepared, true);
      await scope(job, 'sign');
      checkInner(prepared, true);
      if (sponsorship) { await sponsorship.reserve(job, prepared); await sponsorship.beforeSign(job); }
      const signedAt = Math.floor(Date.now()/1000);
      const signed = TransactionBuilder.fromXDR(await signXdr(prepared.toXDR()), networkPassphrase);
      if (!signed.hash().equals(prepared.hash()) || signed.source !== authority ||
          !signed.signatures.some(s => Keypair.fromPublicKey(authority).verify(signed.hash(), s.signature()))) throw Error('authority_signature_invalid');
      const outer = TransactionBuilder.buildFeeBumpTransaction(relayer, '2000000', signed, networkPassphrase);
      checkOuter(outer, true);
      outer.sign(relayer);
      return { xdr: outer.toXDR(), hash: outer.hash().toString('hex'), ...(sponsorship ? { signedAt } : {}) };
    },
    submit: async (envelope, job) => {
      if (sponsorship) await sponsorship.beforeSubmit(job); else await assertSponsorship();
      await scope(job, 'submit');
      const tx = TransactionBuilder.fromXDR(envelope, networkPassphrase);
      checkOuter(tx, true);
      const sent = await server.sendTransaction(tx);
      if (!['PENDING', 'DUPLICATE', 'TRY_AGAIN_LATER'].includes(sent.status)) throw Error('submission_not_accepted');
    },
  };
}

export function createStore(client, { requestId, sponsorship } = {}) {
  validateRequestId(requestId);
  const q = (sql, values = []) => client.query(sql, values), token = randomUUID();
  const owns = job => { assertRequestScope(job, requestId); return [job.id, token]; };
  const identityJoin = `JOIN doctors d ON d.id=r.doctor_id AND LOWER(d.email)=r.doctor_email
    JOIN privy_stellar_wallet_bindings b ON b.app_id='${APP_ID}' AND b.user_id=r.doctor_user_id AND b.wallet_id=r.wallet_id AND b.address=r.wallet`;
  const reviewed = async (job, lock = false) => {
    const { rows } = await q(`SELECT o.*,s.privy_user_id AS submission_user,s.wallet_id AS submission_wallet_id,
      s.wallet AS submission_wallet,s.email AS submission_email
      FROM doctor_onboarding_requests o LEFT JOIN doctor_onboarding_submissions s ON s.id=o.current_submission_id AND s.onboarding_id=o.id
      WHERE o.doctor_id=$1 ORDER BY o.created_at DESC,o.id DESC LIMIT 1${lock ? ' FOR UPDATE OF o' : ''}`, [job.doctor_id]);
    const current = rows[0];
    if (!current) {
      if (job.onboarding_submission_id) return false;
      const profile = await q('SELECT status FROM doctors WHERE id=$1', [job.doctor_id]);
      return ['active', 'blocked', 'revoked', 'expired'].includes(profile.rows[0]?.status);
    }
    if (!job.onboarding_submission_id || current.current_submission_id !== job.onboarding_submission_id ||
        current.submission_user !== job.doctor_user_id || current.submission_wallet_id !== job.wallet_id ||
        current.submission_wallet !== job.wallet || current.submission_email !== job.doctor_email ||
        current.privy_user_id !== job.doctor_user_id || current.wallet_id !== job.wallet_id || current.wallet !== job.wallet) return false;
    if (current.state === 'authorization_pending') return current.authorization_request_id === job.id && job.action !== 'revoke';
    return ['authorized', 'revoked'].includes(current.state) && ['renew', 'revoke'].includes(job.action);
  };
  return {
    claim: async ({ signedOnly = false, requestId: selectedId = requestId } = {}) => {
      validateRequestId(selectedId);
      if (requestId !== undefined && selectedId !== requestId) throw Error('authorization_scope_rejected');
      const { rows } = await q(`WITH candidate AS (SELECT id FROM doctor_authorization_requests
        WHERE network='testnet' AND contract_id=$1 AND state IN ('pending','submitted') AND (lease_until IS NULL OR lease_until<NOW())
          AND (NOT $3 OR transaction_hash IS NOT NULL) AND ($4::uuid IS NULL OR id=$4::uuid)
        ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE doctor_authorization_requests r SET lease_token=$2,lease_until=NOW()+INTERVAL '5 minutes'
        FROM candidate WHERE r.id=candidate.id RETURNING r.*`, [PRIVATE_REGISTRY_ID, token, signedOnly, selectedId ?? null]);
      const job = rows[0];
      if (job) assertRequestScope(job, selectedId);
      if (job?.dossier_id) {
        const dossier = await q('SELECT encrypted_dossier FROM doctor_private_dossiers WHERE id=$1', [job.dossier_id]);
        job.encrypted_dossier = dossier.rows[0]?.encrypted_dossier;
      }
      return job;
    },
    eligible: async job => {
      const { rows } = await q(`SELECT r.id FROM doctor_authorization_requests r ${identityJoin}
        WHERE r.id=$1 AND r.lease_token=$2 AND r.lease_until>NOW()`, owns(job));
      return rows.length === 1 && await reviewed(job);
    },
    prepared: async (job, prepared) => {
      owns(job);
      await q('BEGIN');
      try {
        const locked = await q(`SELECT r.id FROM doctor_authorization_requests r ${identityJoin}
          WHERE r.id=$1 AND r.lease_token=$2 AND r.lease_until>NOW() AND r.state='pending' AND r.transaction_hash IS NULL FOR UPDATE OF r,d,b`, owns(job));
        if (locked.rows.length !== 1) throw Error('lease_or_identity_changed');
        if (!(await reviewed(job, true))) throw Error('doctor_binding_changed');
        const { rows } = await q(`UPDATE doctor_authorization_requests SET prepared_xdr=$3,transaction_hash=$4,state='submitted',error_code=NULL,updated_at=NOW()
          WHERE id=$1 AND lease_token=$2 RETURNING *`, [...owns(job), prepared.xdr, prepared.hash]);
        if (job.action !== 'revoke') await q("UPDATE doctor_private_dossiers SET status='submitted',transaction_hash=$2 WHERE id=$1", [job.dossier_id, prepared.hash]);
        if (sponsorship) await sponsorship.persistPrepared(job, prepared);
        await q('COMMIT');
        return rows[0];
      } catch (e) { await q('ROLLBACK'); throw e; }
    },
    complete: async (job, doctorStatus) => {
      owns(job);
      await q('BEGIN');
      try {
        const result = await q(`UPDATE doctor_authorization_requests SET state='confirmed',error_code=NULL,confirmed_at=NOW(),updated_at=NOW()
          WHERE id=$1 AND lease_token=$2 AND lease_until>NOW() AND state='submitted' AND transaction_hash IS NOT NULL`, owns(job));
        if (result.rowCount !== 1) throw Error('lease_lost_before_confirmation');
        if (job.action === 'revoke') {
          // A historical authorization can have no dossier_id in this request.
          // Preserve its original authorization receipt; the revoke receipt is
          // retained on the confirmed request itself.
          await q(`UPDATE doctor_private_dossiers SET status='revoked'
            WHERE network=$1 AND contract_id=$2 AND wallet=$3 AND version=$4 AND commitment=$5`,
          [job.network, job.contract_id, job.wallet, job.target_version, job.commitment]);
        } else {
          await q("UPDATE doctor_private_dossiers SET status='confirmed',transaction_hash=$2 WHERE id=$1", [job.dossier_id, job.transaction_hash]);
        }
        await q('UPDATE doctors SET status=$2,updated_at=NOW() WHERE id=$1', [job.doctor_id, doctorStatus]);
        if (job.onboarding_submission_id) {
          // A confirmed receipt is reconciled even if eligibility changed after submission.
          // Only the exact reviewed revision may inherit that receipt.
          const updated = await q(`UPDATE doctor_onboarding_requests SET state=$3,authorization_request_id=$4,updated_at=NOW()
            WHERE doctor_id=$1 AND current_submission_id=$2 AND privy_user_id=$5 AND wallet_id=$6 AND wallet=$7
              AND (authorization_request_id=$4 OR state IN ('authorized','revoked')) RETURNING id`,
          [job.doctor_id, job.onboarding_submission_id, job.action === 'revoke' ? 'revoked' : 'authorized', job.id,
            job.doctor_user_id, job.wallet_id, job.wallet]);
          if (updated.rows.length === 1) await q(`INSERT INTO doctor_onboarding_events(id,onboarding_id,actor_user_id,actor_email,state,note)
            VALUES($1,$2,$3,$4,$5,$6)`, [randomUUID(), updated.rows[0].id, job.requested_by, job.requested_email,
            job.action === 'revoke' ? 'revoked' : 'authorized', 'Confirmed Stellar Testnet receipt']);
        }
        await q('COMMIT');
      } catch (e) { await q('ROLLBACK'); throw e; }
    },
    fail: async (job, code) => {
      const result = await q(`UPDATE doctor_authorization_requests SET state='failed',error_code=$3,updated_at=NOW()
        WHERE id=$1 AND lease_token=$2 AND lease_until>NOW()`, [...owns(job), code]);
      if (result.rowCount !== 1) throw Error('lease_lost_before_failure');
    },
    note: async (job, code) => { await q('UPDATE doctor_authorization_requests SET error_code=$3,updated_at=NOW() WHERE id=$1 AND lease_token=$2', [...owns(job), code]); },
    release: async job => { await q('UPDATE doctor_authorization_requests SET lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE id=$1 AND lease_token=$2', owns(job)); },
  };
}

export { acquireSignerLock } from './lib/private-worker-runtime.mjs';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  import('./worker-private-portal.mjs').then(({ main }) => main({ queue: 'admin' })).catch(() => {
    console.error('Doctor authorization worker stopped; configuration or reconciliation required.'); process.exitCode = 1;
  });
}
