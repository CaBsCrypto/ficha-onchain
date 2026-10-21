import { StrKey } from '@stellar/stellar-sdk';
import { openClinicalVersion, validateClinicalContext } from './clinical-crypto.mjs';

const HEX_32 = /^[a-f0-9]{64}$/;
const unavailable = () => new Error('clinical_version_unavailable');

function validText(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function checkAbort(signal) {
  if (signal?.aborted) throw unavailable();
}

async function identity(credential, adapters) {
  const actor = await adapters.authenticate(credential);
  if (!actor || !validText(actor.userId) || !validText(actor.sessionId)) throw unavailable();
  const checkedActor = { userId: actor.userId, sessionId: actor.sessionId };
  const binding = await adapters.findBinding(checkedActor);
  if (!binding || binding.userId !== checkedActor.userId || !validText(binding.bindingId) ||
      !['patient', 'doctor'].includes(binding.role) || !StrKey.isValidEd25519PublicKey(binding.wallet) ||
      binding.revokedAt !== null || typeof binding.verifiedAt !== 'string' ||
      !Number.isFinite(Date.parse(binding.verifiedAt)) || Date.parse(binding.verifiedAt) > Date.now()) throw unavailable();
  return { ...checkedActor, bindingId: binding.bindingId, wallet: binding.wallet, role: binding.role };
}

function equalIdentity(left, right) {
  return ['userId', 'sessionId', 'bindingId', 'wallet', 'role'].every(field => left[field] === right[field]);
}

async function access(deployment, historyId, actor, adapters) {
  const result = await adapters.readAccess({ deployment, historyId, reader: actor.wallet });
  if (!result || result.historyId !== historyId || result.reader !== actor.wallet ||
      !StrKey.isValidEd25519PublicKey(result.patient) || result.canRead !== true ||
      !Number.isSafeInteger(result.grantRevision) || result.grantRevision < 0 ||
      (actor.role === 'patient' ? result.patient !== actor.wallet : result.doctorAuthorized !== true)) throw unavailable();
  return { patient: result.patient, grantRevision: result.grantRevision };
}

async function versionEvidence(deployment, request, patient, adapters) {
  const row = await adapters.readVersion({ deployment, historyId: request.historyId, entryId: request.entryId, version: request.version });
  if (!row || row.state !== 'confirmed' || typeof row.commitment !== 'string' || !HEX_32.test(row.commitment)) throw unavailable();
  const context = validateClinicalContext(row.context);
  if (context.contractId !== deployment.contractId || context.network !== deployment.network ||
      context.historyId !== request.historyId || context.entryId !== request.entryId ||
      context.version !== request.version || context.patient !== patient) throw unavailable();
  return { context, commitment: row.commitment };
}

/** Private clinical read boundary. Every adapter is trusted server-side code:
 * authenticate verifies the live credential/session; findBinding verifies its
 * current wallet ownership; readAccess/readVersion query the configured chain,
 * including current medical registry authorization. They must not use cached
 * permission assertions or caller-provided wallets/commitments as evidence.
 *
 * loadEnvelope retrieves only ciphertext for this exact context+commitment.
 * getKeyring resolves KEKs from a separate secret provider. No object-store URL,
 * private blinding or encryption key leaves this service. Grant and identity
 * are rechecked after IO, so a revoked permission or changed session cannot
 * turn an earlier successful check into a later private delivery. */
export async function readClinicalVersion({ credential, historyId, entryId, version, signal }, adapters) {
  try {
    const configured = adapters.deployment;
    if (!configured || configured.network !== 'testnet' || !StrKey.isValidContract(configured.contractId) ||
        typeof historyId !== 'string' || !HEX_32.test(historyId) || typeof entryId !== 'string' || !HEX_32.test(entryId) ||
        !Number.isInteger(version) || version < 1 || version > 0xffff_ffff) throw unavailable();
    const deployment = Object.freeze({ network: configured.network, contractId: configured.contractId });
    const request = Object.freeze({ historyId, entryId, version });
    checkAbort(signal);
    const actor = await identity(credential, adapters);
    const permission = await access(deployment, historyId, actor, adapters);
    const evidence = await versionEvidence(deployment, request, permission.patient, adapters);
    checkAbort(signal);
    const envelope = await adapters.loadEnvelope({ context: evidence.context, commitment: evidence.commitment, reader: actor.wallet });
    const keyring = await adapters.getKeyring();
    checkAbort(signal);
    const document = openClinicalVersion({ envelope, expectedContext: evidence.context, expectedCommitment: evidence.commitment, keyring });
    const currentActor = await identity(credential, adapters);
    if (!equalIdentity(actor, currentActor)) throw unavailable();
    const currentVersion = await versionEvidence(deployment, request, permission.patient, adapters);
    if (currentVersion.commitment !== evidence.commitment ||
        JSON.stringify(currentVersion.context) !== JSON.stringify(evidence.context)) throw unavailable();
    const currentPermission = await access(deployment, historyId, currentActor, adapters);
    if (currentPermission.patient !== permission.patient || currentPermission.grantRevision !== permission.grantRevision) throw unavailable();
    checkAbort(signal);
    return { historyId, entryId, version, content: document.content, metadata: document.metadata };
  } catch {
    // Provider exceptions can contain queries, object names or credentials.
    // Expose one recoverable error and never a previous/cached document.
    throw unavailable();
  }
}
