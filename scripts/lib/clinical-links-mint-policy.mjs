import { StrKey } from '@stellar/stellar-sdk';
import { clinicalLinksMigrationConnection } from './clinical-links-migration.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const PARTNER_PRESCRIPTION_SCOPE_PATH = '/api/v1/me/partner-prescriptions';
export const PARTNER_PRESCRIPTION_CUSTODY = 'cannabis-external-custody:v1';
const unavailable = () => new Error('partner_prescriptions_unavailable');

export function partnerPrescriptionAppointment(consultationRef, env = process.env) {
  clinicalLinksMigrationConnection(env);
  if (env.TRUSTLEAF_PARTNER_RX_ENABLED !== 'true' || env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'false' ||
      !StrKey.isValidEd25519PublicKey(env.TRUSTLEAF_PARTNER_RX_RELAYER_ADDRESS ?? '')) throw unavailable();
  let mapping;
  try { mapping = JSON.parse(env.TRUSTLEAF_PARTNER_RX_CONSULTATIONS ?? ''); } catch { throw unavailable(); }
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw unavailable();
  const fixtures = Object.entries(mapping);
  if (fixtures.length === 0 || fixtures.length > 20 || fixtures.some(([ref, id]) => !uuid.test(ref) || !Number.isSafeInteger(id) || id < 1) ||
      new Set(Object.values(mapping)).size !== fixtures.length) throw unavailable();
  return Object.hasOwn(mapping, consultationRef) ? mapping[consultationRef] : null;
}
