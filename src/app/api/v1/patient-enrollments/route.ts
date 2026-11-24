import { pilotApi, pilotJson, pilotPartner } from '@/lib/clinical-links/api';
import { ClinicalLinksApiError } from '@/lib/clinical-links/config';
import { verifyPartnerPatient } from '@/lib/clinical-links/identity';
import { pilotBody, requireKeys } from '@/lib/clinical-links/input';
import { enrollClinicalPatient } from '@/lib/clinical-links/store';

export function POST(request: Request) {
  return pilotApi(async () => {
    const partner = await pilotPartner(request, 'clinical-links:enroll');
    const authorization = await verifyPartnerPatient(request, partner);
    const body = await pilotBody(request);
    requireKeys(body, ['authorizePrescriptionLinks']);
    if (typeof body.authorizePrescriptionLinks !== 'boolean') throw new ClinicalLinksApiError('invalid_request', 400);
    return pilotJson(await enrollClinicalPatient(partner, authorization, body.authorizePrescriptionLinks));
  });
}
