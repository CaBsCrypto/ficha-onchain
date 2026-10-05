import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { encryptDossier, decryptDossier } from './private-doctor-dossier.mjs';

export const MAX_CLINICAL_CONTENT_BYTES = 3_000_000;
const HEX_32 = /^[a-f0-9]{64}$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CONTEXT_FIELDS = ['schemaVersion', 'network', 'contractId', 'historyId', 'entryId', 'author', 'patient', 'version', 'previousCommitment'];
const MAX_ENCRYPTED_PAYLOAD_BYTES = 4 * Math.ceil(MAX_CLINICAL_CONTENT_BYTES / 3) + 4096;
const CONTENT_TYPES = new Set(['application/json', 'application/pdf', 'image/png', 'image/jpeg']);

function exactFields(value, fields) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

/** Only opaque identifiers and public ledger context belong in the envelope AAD.
 * A new object is returned so an adapter cannot later mutate a checked context. */
export function validateClinicalContext(context) {
  if (!exactFields(context, CONTEXT_FIELDS) || context.schemaVersion !== 1 || context.network !== 'testnet' ||
      !StrKey.isValidContract(context.contractId) || !StrKey.isValidEd25519PublicKey(context.author) ||
      !StrKey.isValidEd25519PublicKey(context.patient) || typeof context.historyId !== 'string' || !HEX_32.test(context.historyId) ||
      typeof context.entryId !== 'string' || !HEX_32.test(context.entryId) || !Number.isInteger(context.version) || context.version < 1 ||
      context.version > 0xffff_ffff ||
      (context.version === 1 ? context.previousCommitment !== null : typeof context.previousCommitment !== 'string' || !HEX_32.test(context.previousCommitment))) {
    throw new Error('clinical_context_invalid');
  }
  return Object.freeze(Object.fromEntries(CONTEXT_FIELDS.map(field => [field, context[field]])));
}

function contextValues(context) {
  return CONTEXT_FIELDS.map(field => context[field]);
}

function sameContext(left, right) {
  return CONTEXT_FIELDS.every(field => left[field] === right[field]);
}

function validateMetadata(metadata) {
  if (!exactFields(metadata, ['mediaType', 'fileName']) || !CONTENT_TYPES.has(metadata.mediaType) ||
      typeof metadata.fileName !== 'string' || metadata.fileName.trim() !== metadata.fileName ||
      !metadata.fileName || Buffer.byteLength(metadata.fileName, 'utf8') > 255 ||
      /[\x00-\x1f\x7f/\\]/.test(metadata.fileName) || ['.', '..'].includes(metadata.fileName)) {
    throw new Error('clinical_metadata_invalid');
  }
  return { mediaType: metadata.mediaType, fileName: metadata.fileName };
}

/** Type signatures reject accidental/declared-type mismatches. This is not a
 * malware scanner or a promise that an arbitrary PDF/image is safe to render. */
function validateContent(content, mediaType) {
  if (!(content instanceof Uint8Array) || content.byteLength < 1 || content.byteLength > MAX_CLINICAL_CONTENT_BYTES) {
    throw new Error('clinical_content_invalid');
  }
  const bytes = Buffer.from(content);
  let valid = false;
  if (mediaType === 'application/json') {
    try {
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      valid = data !== null && typeof data === 'object' && !Array.isArray(data);
    } catch { /* Malformed UTF-8 or JSON is never sealed as a clinical note. */ }
  } else if (mediaType === 'application/pdf') {
    valid = /^%PDF-(1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(bytes.subarray(0, 12).toString('ascii')) &&
      /%%EOF\s*$/.test(bytes.subarray(Math.max(0, bytes.length - 1024)).toString('ascii'));
  } else if (mediaType === 'image/png') {
    valid = bytes.length >= 57 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      bytes.readUInt32BE(8) === 13 && bytes.subarray(12, 16).toString('ascii') === 'IHDR' &&
      bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 &&
      bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'));
  } else if (mediaType === 'image/jpeg') {
    valid = bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (!valid) throw new Error('clinical_content_type_mismatch');
  return bytes;
}

function serviceKey(keyring, keyId) {
  if (typeof keyId !== 'string' || !KEY_ID.test(keyId) || keyring === null || typeof keyring !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(keyring)) || !Object.hasOwn(keyring, keyId) ||
      typeof keyring[keyId] !== 'string' || !/^[a-fA-F0-9]{64}$/.test(keyring[keyId])) {
    throw new Error('clinical_key_unavailable');
  }
  return keyring[keyId];
}

function payloadAad(context) {
  return JSON.stringify(['TrustLeaf/ClinicalContentEncryption/v1', ...contextValues(context)]);
}

function wrapAad(context, keyId) {
  return JSON.stringify(['TrustLeaf/ClinicalDataKeyWrap/v1', keyId, ...contextValues(context)]);
}

function commitmentFor(context, metadata, content, blinding) {
  // A JSON tuple gives explicit field boundaries. Content bytes and the private
  // random blinding are inside the commitment; there is no public plaintext hash.
  return createHash('sha256').update(JSON.stringify([
    'TrustLeaf/ClinicalVersionCommitment/v1', ...contextValues(context),
    metadata.mediaType, metadata.fileName, content.toString('base64'), blinding,
  ]), 'utf8').digest('hex');
}

function strictBase64(value, maxBytes) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maxBytes / 3) ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('clinical_envelope_invalid');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maxBytes || bytes.toString('base64') !== value) throw new Error('clinical_envelope_invalid');
  return bytes;
}

function checkCiphertext(value, maxBytes) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maxBytes / 3) + 100) {
    throw new Error('clinical_envelope_invalid');
  }
  const parts = value.split(':');
  if (parts.length !== 5 || parts[0] !== 'dossier' || parts[1] !== 'v1' ||
      strictBase64(parts[2], 12).length !== 12 || strictBase64(parts[3], 16).length !== 16 ||
      strictBase64(parts[4], maxBytes).length === 0) throw new Error('clinical_envelope_invalid');
}

export function validateClinicalEnvelope(envelope) {
  if (!exactFields(envelope, ['schemaVersion', 'keyId', 'wrappedKey', 'payload']) ||
      envelope.schemaVersion !== 1 || typeof envelope.keyId !== 'string' || !KEY_ID.test(envelope.keyId)) {
    throw new Error('clinical_envelope_invalid');
  }
  checkCiphertext(envelope.wrappedKey, 256);
  checkCiphertext(envelope.payload, MAX_ENCRYPTED_PAYLOAD_BYTES);
  return Object.freeze({ ...envelope });
}

/** Keys must come from a trusted server-side secret provider, never the request
 * or database. Missing keys fail closed; no plaintext/development fallback. */
export function sealClinicalVersion({ context: suppliedContext, content, metadata: suppliedMetadata, keyring, activeKeyId }) {
  const context = validateClinicalContext(suppliedContext);
  const metadata = validateMetadata(suppliedMetadata);
  const bytes = validateContent(content, metadata.mediaType);
  const key = serviceKey(keyring, activeKeyId);
  const dataKey = randomBytes(32).toString('hex');
  const blinding = randomBytes(32).toString('hex');
  const commitment = commitmentFor(context, metadata, bytes, blinding);
  const payload = encryptDossier({ schemaVersion: 1, context, metadata, content: bytes.toString('base64'), blinding }, dataKey, payloadAad(context));
  const wrappedKey = encryptDossier({ schemaVersion: 1, dataKey }, key, wrapAad(context, activeKeyId));
  return { envelope: { schemaVersion: 1, keyId: activeKeyId, wrappedKey, payload }, commitment };
}

function verifyAndDecrypt({ envelope, expectedContext: suppliedContext, expectedCommitment, keyring }) {
  const context = validateClinicalContext(suppliedContext);
  if (typeof expectedCommitment !== 'string' || !HEX_32.test(expectedCommitment)) throw new Error('clinical_commitment_invalid');
  validateClinicalEnvelope(envelope);
  const wrappingKey = serviceKey(keyring, envelope.keyId);
  const wrapped = decryptDossier(envelope.wrappedKey, wrappingKey, wrapAad(context, envelope.keyId));
  if (!exactFields(wrapped, ['schemaVersion', 'dataKey']) || wrapped.schemaVersion !== 1 ||
      typeof wrapped.dataKey !== 'string' || !HEX_32.test(wrapped.dataKey)) throw new Error('clinical_envelope_invalid');
  const payload = decryptDossier(envelope.payload, wrapped.dataKey, payloadAad(context));
  if (!exactFields(payload, ['schemaVersion', 'context', 'metadata', 'content', 'blinding']) ||
      payload.schemaVersion !== 1 || !sameContext(validateClinicalContext(payload.context), context) ||
      typeof payload.blinding !== 'string' || !HEX_32.test(payload.blinding)) throw new Error('clinical_envelope_invalid');
  const metadata = validateMetadata(payload.metadata);
  const content = validateContent(strictBase64(payload.content, MAX_CLINICAL_CONTENT_BYTES), metadata.mediaType);
  const recomputed = commitmentFor(context, metadata, content, payload.blinding);
  if (!timingSafeEqual(Buffer.from(recomputed, 'hex'), Buffer.from(expectedCommitment, 'hex'))) {
    throw new Error('clinical_integrity_mismatch');
  }
  return { context, content, metadata, dataKey: wrapped.dataKey };
}

/** expectedContext and expectedCommitment must come from a verified chain
 * version plus the private identity binding, not object-store metadata. */
export function openClinicalVersion(input) {
  try {
    const { content, metadata } = verifyAndDecrypt(input);
    return { content, metadata };
  } catch {
    throw new Error('clinical_version_unavailable');
  }
}

/** Rewrap the per-version key only. Medical content, its ciphertext, and its
 * on-chain commitment stay unchanged. A backup of the previous KEK is required
 * to recover versions that have not yet been rewrapped. */
export function rewrapClinicalVersion({ newKeyring, activeKeyId, ...input }) {
  try {
    const { context, dataKey } = verifyAndDecrypt(input);
    const key = serviceKey(newKeyring, activeKeyId);
    const wrappedKey = encryptDossier({ schemaVersion: 1, dataKey }, key, wrapAad(context, activeKeyId));
    return {
      envelope: { schemaVersion: 1, keyId: activeKeyId, wrappedKey, payload: input.envelope.payload },
      commitment: input.expectedCommitment,
    };
  } catch {
    throw new Error('clinical_version_unavailable');
  }
}
