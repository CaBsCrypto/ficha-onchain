import { readClinicalLinkAnchor } from '@/lib/clinical-links/anchor';
import { pilotApi, pilotJson, pilotPartner, pilotPatient } from '@/lib/clinical-links/api';
import { readRevision, requireLinkRef } from '@/lib/clinical-links/input';
import { hasClinicalPartnerCredential, readClinicalLinkProof } from '@/lib/clinical-links/store';
import type { ClinicalLinkProof } from '@/lib/clinical-links/types';

export function GET(request: Request, { params }: { params: Promise<{ linkRef: string }> }) {
  return pilotApi(async () => {
    const actor = hasClinicalPartnerCredential(request)
      ? { partner: await pilotPartner(request, 'proofs:verify') }
      : { patientUserId: await pilotPatient(request) };
    const linkRef = requireLinkRef((await params).linkRef);
    const revision = readRevision(request);
    const proof = await readClinicalLinkProof(actor, linkRef, revision);
    let result: ClinicalLinkProof = { linkRef, revision, integrityStatus: 'unavailable', commitment: null };
    if (proof.state === 'pending') result = { ...result, integrityStatus: 'pending' };
    if (proof.state === 'confirmed' && proof.commitment) {
      const outcome = await readClinicalLinkAnchor(proof.commitment);
      const current = await readClinicalLinkProof(actor, linkRef, revision);
      if (outcome === 'verified' && current.state === 'confirmed' && current.commitment === proof.commitment) {
        result = { ...result, integrityStatus: 'verified', commitment: proof.commitment };
      }
    }
    return pilotJson(result);
  });
}
