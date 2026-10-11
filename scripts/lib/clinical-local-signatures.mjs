import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';

const actions = ['create_history', 'append_version', 'append_version', 'append_version', 'append_version', 'set_permissions', 'set_permissions', 'set_permissions'];
export const CLINICAL_REHEARSAL_LABELS = ['Crear historial', 'Agregar PDF sintético', 'Agregar antecedente sintético', 'Agregar imagen sintética', 'Corregir el PDF sintético', 'Conceder sólo lectura', 'Conceder sólo agregado', 'Retirar ambos permisos'];
const validNonce = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (a, b) => validNonce(a) && validNonce(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/** Memory-only, one-use capabilities. Only the trusted local driver can register
 * an API intent. The browser cannot choose a hash or start a signing request. */
export function clinicalLocalSignatures({ patient, runId, now = Date.now }) {
  if (!StrKey.isValidEd25519PublicKey(patient ?? '') || typeof runId !== 'string') throw Error('clinical_local_signing_invalid');
  const capability = randomBytes(32).toString('hex');
  const seen = new Set();
  let active = true, pending = null;
  const authorized = nonce => active && same(nonce, capability);
  function finish(error, signature) {
    if (!pending) return;
    const saved = pending; pending = null; clearTimeout(saved.timer);
    if (error) saved.reject(Error(error)); else saved.resolve({ signature });
  }
  return {
    capability,
    authorized,
    request(operation, index) {
      const s = operation?.signing;
      if (!active || pending || !Number.isSafeInteger(index) || index < 1 || index > 8 || actions[index-1] !== operation?.action ||
          !/^[a-f0-9-]{36}$/i.test(operation?.id ?? '') || seen.has(operation.id) || operation.state !== 'awaiting_signature' ||
          !s || Object.keys(s).sort().join(',') !== 'address,expiresAt,hash,network' || s.address !== patient ||
          s.network !== 'testnet' || !validNonce(s.hash) || s.expiresAt !== operation.expiresAt || !Number.isSafeInteger(s.expiresAt) ||
          s.expiresAt*1000 <= now()+5000 || s.expiresAt*1000 > now()+300000) return Promise.reject(Error('clinical_local_signing_invalid'));
      seen.add(operation.id);
      const publicRequest = Object.freeze({ nonce: randomBytes(32).toString('hex'), runId, index,
        label: CLINICAL_REHEARSAL_LABELS[index-1], operationId: operation.id, action: operation.action,
        address: patient, hash: s.hash, network: 'testnet', expiresAt: s.expiresAt });
      const promise = new Promise((resolve, reject) => {
        pending = { publicRequest, resolve, reject, timer: setTimeout(() => finish('clinical_local_signing_expired'), s.expiresAt*1000-now()) };
      });
      promise.catch(() => {});
      return promise;
    },
    poll(nonce) {
      if (!authorized(nonce)) throw Error('clinical_local_signing_forbidden');
      if (pending && now() >= pending.publicRequest.expiresAt*1000) finish('clinical_local_signing_expired');
      return pending?.publicRequest ?? null;
    },
    receive(body) {
      if (!authorized(body?.capability) || !pending || !same(body.nonce, pending.publicRequest.nonce) || body.operationId !== pending.publicRequest.operationId) throw Error('clinical_local_signing_forbidden');
      if (now() >= pending.publicRequest.expiresAt*1000) { finish('clinical_local_signing_expired'); throw Error('clinical_local_signing_expired'); }
      if (body.cancelled === true && Object.keys(body).sort().join(',') === 'cancelled,capability,nonce,operationId') { finish('clinical_local_signing_cancelled'); return; }
      if (Object.keys(body).sort().join(',') !== 'capability,nonce,operationId,signature' || typeof body.signature !== 'string' ||
          !/^0x[a-f0-9]{128}$/i.test(body.signature) || !Keypair.fromPublicKey(patient).verify(Buffer.from(pending.publicRequest.hash, 'hex'), Buffer.from(body.signature.slice(2), 'hex'))) throw Error('clinical_local_signing_invalid');
      finish(null, body.signature);
    },
    close() { active = false; finish('clinical_local_signing_closed'); },
  };
}
