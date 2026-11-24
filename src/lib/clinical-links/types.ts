export type ClinicalPartnerScope = 'clinical-links:bind' | 'clinical-links:enroll' | 'clinical-links:write' | 'clinical-links:read' | 'proofs:verify' | 'prescriptions:issue';
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

export type ClinicalAssociationStatus = 'active' | 'not_authorized' | 'revoked' | 'expired';

export type ClinicalPatientAccount = {
  accountStatus: 'active' | 'not_enrolled';
  recordStatus: 'ready' | 'not_created';
  hasNativeWallet: boolean;
  sources: Array<{
    partnerId: string;
    source: string;
    associationStatus: ClinicalAssociationStatus;
    bindingId: string;
  }>;
};
