import { createHash } from 'node:crypto';
// Reuse the authenticated encrypted envelope; no second implementation of encryption.
export { encryptDossier as encryptPrescription, decryptDossier as decryptPrescription } from './private-doctor-dossier.mjs';

function canonical(value) {
  if(value===null || typeof value==='string' || typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number' && Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  throw new Error('Prescription content must be JSON data');
}
export function prescriptionCommitment(d) {
  const fields=['schemaVersion','network','contractId','doctor','patient','issuanceId','expiresAt','document','blinding'];
  if(Object.keys(d).length!==fields.length || fields.some(k=>!Object.hasOwn(d,k)) || d.schemaVersion!==1)throw new Error('Unexpected prescription schema');
  for(const field of ['network','contractId','doctor','patient'])if(typeof d[field]!=='string'||!d[field])throw new Error('Missing prescription context');
  if(!/^[a-f0-9]{64}$/.test(d.blinding)||!/^[a-f0-9]{64}$/.test(d.issuanceId)||!Number.isSafeInteger(d.expiresAt)||d.expiresAt<=0)throw new Error('Invalid private prescription');
  return createHash('sha256').update(canonical(['TrustLeaf/PrivatePrescription/v1',d.network,d.contractId,d.doctor,d.patient,d.issuanceId,d.expiresAt,d.document,d.blinding])).digest('hex');
}
