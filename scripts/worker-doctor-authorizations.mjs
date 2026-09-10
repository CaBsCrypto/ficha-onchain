import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Address, BASE_FEE, Contract, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { PRIVATE_REGISTRY_ID, readAuthorization } from './lib/private-registry.mjs';
import { commitmentFor, decryptDossier } from './lib/private-doctor-dossier.mjs';
import { assertCurrentPrivyIdentity } from './lib/private-worker-runtime.mjs';

const APP_ID = 'cmrix722m03d30clewd1fuffq';
const terminalErrors = new Set(['request_invalid', 'doctor_binding_changed', 'dossier_invalid', 'registry_state_changed',
  'authorization_expired', 'authority_signature_invalid', 'registry_configuration_invalid', 'registry_interface_mismatch', 'registry_authority_mismatch']);

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

export async function runOnce({ store, chain, writesEnabled = false, prepareEnabled = true }) {
  let job = await store.claim({ signedOnly: !writesEnabled || !prepareEnabled });
  if (!job) return { status: 'idle' };
  try {
    validateRequest(job);
    if (job.transaction_hash) {
      if (!job.prepared_xdr) throw Error('saved_envelope_missing');
      await chain.verifyEnvelope(job);
      const receipt = await chain.receipt(job.transaction_hash);
      if (receipt.status === 'SUCCESS') {
        const status = assertConfirmedState(job, await chain.authorization(job));
        await store.complete(job, status);
        return { status: 'confirmed' };
      }
      if (receipt.status === 'FAILED') {
        await store.fail(job, 'transaction_failed');
        return { status: 'failed' };
      }
      if (!writesEnabled) return { status: 'writes_paused' };
      if (await chain.expired(job.prepared_xdr)) {
        await store.note(job, 'expired_needs_reconciliation');
        return { status: 'expired_needs_reconciliation' };
      }
      // Revalidation may stop retries, but never discards an uncertain attempt.
      if (!(await store.eligible(job))) throw Error('doctor_binding_changed');
      await chain.validateIdentity(job);
      await chain.submit(job.prepared_xdr);
      return { status: 'submitted', reusedEnvelope: true };
    }
    if (!writesEnabled || !prepareEnabled) return { status: 'writes_paused' };
    if (!(await store.eligible(job))) throw Error('doctor_binding_changed');
    await chain.validateIdentity(job);
    const current = await chain.authorization(job);
    assertExpectedState(job, current);
    const prepared = await chain.prepare(job);
    if (!(await store.eligible(job))) throw Error('doctor_binding_changed');
    await chain.validateIdentity(job);
    assertExpectedState(job, await chain.authorization(job));
    job = await store.prepared(job, prepared);
    await chain.submit(job.prepared_xdr);
    return { status: 'submitted' };
  } catch (error) {
    const code = terminalErrors.has(error?.message) ? error.message : 'worker_attempt_incomplete';
    if (!job.transaction_hash && terminalErrors.has(code)) {
      await store.fail(job, code);
      return { status: 'failed', error: code };
    }
    await store.note(job, code);
    return { status: 'needs_reconciliation' };
  } finally { await store.release(job); }
}

function operation(job) {
  validateRequest(job);
  const args = [new Address(job.wallet).toScVal()];
  if (job.action !== 'revoke') args.push(nativeToScVal(Buffer.from(job.commitment, 'hex')), nativeToScVal(BigInt(job.valid_until), { type: 'u64' }));
  return new Contract(PRIVATE_REGISTRY_ID).call(job.method, ...args);
}

export function createChain({ authority, relayer, signXdr, provider, dataKey, server = new rpc.Server('https://soroban-testnet.stellar.org') }) {
  const networkPassphrase = Networks.TESTNET;
  const authorization = job => readAuthorization({ wallet: job.wallet, source: authority, registryId: job.contract_id, expectedAdmin: authority, server });
  return {
    authorization,
    receipt: hash => server.getTransaction(hash),
    expired: async envelope => {
      const tx = TransactionBuilder.fromXDR(envelope, networkPassphrase);
      return Number((tx.innerTransaction ?? tx).timeBounds?.maxTime ?? 0) <= Math.floor(Date.now() / 1000);
    },
    verifyEnvelope: async job => {
      const tx = TransactionBuilder.fromXDR(job.prepared_xdr, networkPassphrase), inner = tx.innerTransaction;
      if (!inner || tx.hash().toString('hex') !== job.transaction_hash || inner.source !== authority || tx.feeSource !== relayer.publicKey() ||
          !inner.signatures.some(s => Keypair.fromPublicKey(authority).verify(inner.hash(), s.signature())) ||
          !tx.signatures.some(s => relayer.verify(tx.hash(), s.signature())) || inner.operations.length !== 1 ||
          inner.operations[0].type !== 'invokeHostFunction' || !inner.operations[0].func.toXDR().equals(operation(job).body().invokeHostFunctionOp().hostFunction().toXDR())) throw Error('saved_envelope_invalid');
    },
    validateIdentity: async job => {
      try { await assertCurrentPrivyIdentity(provider, { userId: job.doctor_user_id, email: job.doctor_email, walletId: job.wallet_id, address: job.wallet }); }
      catch (e) { if (e.message === 'identity_changed') throw Error('doctor_binding_changed'); throw e; }
    },
    prepare: async job => {
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
      const signed = TransactionBuilder.fromXDR(await signXdr(prepared.toXDR()), networkPassphrase);
      if (!signed.hash().equals(prepared.hash()) || signed.source !== authority ||
          !signed.signatures.some(s => Keypair.fromPublicKey(authority).verify(signed.hash(), s.signature()))) throw Error('authority_signature_invalid');
      const outer = TransactionBuilder.buildFeeBumpTransaction(relayer, '2000000', signed, networkPassphrase);
      outer.sign(relayer);
      return { xdr: outer.toXDR(), hash: outer.hash().toString('hex') };
    },
    submit: async envelope => {
      const sent = await server.sendTransaction(TransactionBuilder.fromXDR(envelope, networkPassphrase));
      if (!['PENDING', 'DUPLICATE', 'TRY_AGAIN_LATER'].includes(sent.status)) throw Error('submission_not_accepted');
    },
  };
}

export function createStore(client) {
  const q = (sql, values = []) => client.query(sql, values), token = randomUUID();
  const owns = job => [job.id, token];
  const identityJoin = `JOIN doctors d ON d.id=r.doctor_id AND LOWER(d.email)=r.doctor_email
    JOIN privy_stellar_wallet_bindings b ON b.app_id='${APP_ID}' AND b.user_id=r.doctor_user_id AND b.wallet_id=r.wallet_id AND b.address=r.wallet`;
  const onboardingEligibility = `AND (r.method<>'authorize_doctor' OR EXISTS (
    SELECT 1 FROM doctor_onboarding_requests o WHERE o.authorization_request_id=r.id
      AND o.doctor_id=r.doctor_id AND o.state='authorization_pending'
      AND o.privy_user_id=r.doctor_user_id AND o.wallet_id=r.wallet_id AND o.wallet=r.wallet))`;
  return {
    claim: async ({ signedOnly = false } = {}) => {
      const { rows } = await q(`WITH candidate AS (SELECT id FROM doctor_authorization_requests
        WHERE network='testnet' AND contract_id=$1 AND state IN ('pending','submitted') AND (lease_until IS NULL OR lease_until<NOW())
          AND (NOT $3 OR transaction_hash IS NOT NULL)
        ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE doctor_authorization_requests r SET lease_token=$2,lease_until=NOW()+INTERVAL '5 minutes'
        FROM candidate WHERE r.id=candidate.id RETURNING r.*`, [PRIVATE_REGISTRY_ID, token, signedOnly]);
      const job = rows[0];
      if (job?.dossier_id) {
        const dossier = await q('SELECT encrypted_dossier FROM doctor_private_dossiers WHERE id=$1', [job.dossier_id]);
        job.encrypted_dossier = dossier.rows[0]?.encrypted_dossier;
      }
      return job;
    },
    eligible: async job => {
      const { rows } = await q(`SELECT r.id FROM doctor_authorization_requests r ${identityJoin}
        WHERE r.id=$1 AND r.lease_token=$2 AND r.lease_until>NOW() ${onboardingEligibility}`, owns(job));
      return rows.length === 1;
    },
    prepared: async (job, prepared) => {
      await q('BEGIN');
      try {
        const locked = await q(`SELECT r.id FROM doctor_authorization_requests r ${identityJoin}
          WHERE r.id=$1 AND r.lease_token=$2 AND r.lease_until>NOW() AND r.state='pending' AND r.transaction_hash IS NULL
          ${onboardingEligibility} FOR UPDATE OF r,d,b`, owns(job));
        if (locked.rows.length !== 1) throw Error('lease_or_identity_changed');
        const { rows } = await q(`UPDATE doctor_authorization_requests SET prepared_xdr=$3,transaction_hash=$4,state='submitted',error_code=NULL,updated_at=NOW()
          WHERE id=$1 AND lease_token=$2 RETURNING *`, [...owns(job), prepared.xdr, prepared.hash]);
        if (job.action !== 'revoke') await q("UPDATE doctor_private_dossiers SET status='submitted',transaction_hash=$2 WHERE id=$1", [job.dossier_id, prepared.hash]);
        await q('COMMIT');
        return rows[0];
      } catch (e) { await q('ROLLBACK'); throw e; }
    },
    complete: async (job, doctorStatus) => {
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
        if (job.action === 'revoke') {
          await q(`UPDATE doctor_onboarding_requests SET state='revoked',revoked_at=NOW(),updated_at=NOW()
            WHERE id=(SELECT id FROM doctor_onboarding_requests WHERE doctor_id=$1 AND state='authorized' ORDER BY created_at DESC LIMIT 1)`, [job.doctor_id]);
        } else {
          await q(`UPDATE doctor_onboarding_requests SET state='authorized',authorized_at=NOW(),updated_at=NOW()
            WHERE doctor_id=$1 AND authorization_request_id=$2 AND state='authorization_pending'`, [job.doctor_id, job.id]);
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
