export type ClinicalPartnerScope = 'clinical-links:bind' | 'clinical-links:write' | 'clinical-links:read' | 'proofs:verify';
export type ClinicalLinkIntegrity = 'pending' | 'verified' | 'unavailable';

type ClinicalLinkEventFields = {
  schemaVersion: 1;
  eventId: string;
  partnerPatientRef: string;
  resourceRef: string;
  category: 'cannabis.prescription';
  revision: number;
  occurredAt: string;
  documentRevision: number;
};

export type ClinicalLinkEvent = ClinicalLinkEventFields & (
  | { eventType: 'clinical-link.issued'; clinicalStatus: 'active'; commitment: string }
  | { eventType: 'clinical-link.revoked'; clinicalStatus: 'revoked'; commitment?: never }
);

export type ClinicalLinkProof = {
  linkRef: string;
  revision: number;
  integrityStatus: ClinicalLinkIntegrity;
  commitment: string | null;
};
