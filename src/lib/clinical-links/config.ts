import { assertPrivateEnvironment } from '@/lib/private-config';
import { clinicalLinksMigrationConnection } from '../../../scripts/lib/clinical-links-migration.mjs';

export class ClinicalLinksApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function assertClinicalLinksPilot() {
  if (process.env.TRUSTLEAF_CLINICAL_LINKS_PILOT_ENABLED !== 'true') {
    throw new ClinicalLinksApiError('pilot_disabled', 404);
  }
  try {
    clinicalLinksMigrationConnection(process.env);
    assertPrivateEnvironment();
    getClinicalLinksPilotPartnerOrigin();
  } catch {
    throw new ClinicalLinksApiError('pilot_configuration_invalid', 503);
  }
}

export function getClinicalLinksPilotPartnerOrigin() {
  const raw = process.env.TRUSTLEAF_CLINICAL_LINKS_PARTNER_ORIGIN ?? '';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.origin !== raw || url.hostname === 'cannabis.trustleaf.org') {
    throw new ClinicalLinksApiError('pilot_configuration_invalid', 503);
  }
  return url.origin;
}

export function isClinicalLinksPilotPatient(userId: string) {
  return !!userId && (process.env.TRUSTLEAF_CLINICAL_LINKS_PATIENT_IDS ?? '').split(',').map(id => id.trim()).includes(userId);
}

export function clinicalLinksPilotEnabled(userId: string) {
  if (!isClinicalLinksPilotPatient(userId)) return false;
  try {
    assertClinicalLinksPilot();
    return true;
  } catch {
    return false;
  }
}
