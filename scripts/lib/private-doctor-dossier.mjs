import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Fixed-order v1 encoding. Never hash arbitrary JSON with caller-defined field order.
export function commitmentFor(d) {
  const fields = ['schemaVersion','network','contractId','wallet','version','validUntil','fullName','license','specialty','verificationSource','reviewedBy','reviewedAt','blinding'];
  if (Object.keys(d).length !== fields.length || fields.some(k => !Object.hasOwn(d,k))) throw new Error('Unexpected dossier fields');
  for (const field of fields.filter(k => !['schemaVersion','version','validUntil'].includes(k))) {
    if (typeof d[field] !== 'string') throw new Error('Invalid dossier field type');
  }
  if (!Number.isSafeInteger(d.version) || d.version < 1 || !Number.isSafeInteger(d.validUntil) || d.validUntil < 1) throw new Error('Invalid dossier version or expiry');
  if (!/^[a-f0-9]{64}$/.test(d.blinding) || d.schemaVersion !== 1) throw new Error('Invalid dossier schema');
  const encoded = JSON.stringify(['TrustLeaf/DoctorDossier/v1', d.network, d.contractId,
    d.wallet, d.version, d.validUntil, d.fullName, d.license, d.specialty,
    d.verificationSource, d.reviewedBy, d.reviewedAt, d.blinding]);
  return createHash('sha256').update(encoded, 'utf8').digest('hex');
}
function keyBuffer(key) {
  if (!/^[a-fA-F0-9]{64}$/.test(key ?? '')) throw new Error('Private dossier encryption key missing or invalid');
  return Buffer.from(key, 'hex');
}
export function encryptDossier(dossier, key, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(key), iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(JSON.stringify(dossier), 'utf8'), cipher.final()]);
  return ['dossier:v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
export function decryptDossier(encoded, key, context) {
  const [prefix, version, iv, tag, ct, extra] = encoded.split(':');
  if (prefix !== 'dossier' || version !== 'v1' || extra !== undefined) throw new Error('Invalid encrypted dossier');
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer(key), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8'));
}
