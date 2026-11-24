import { pilotJson, pilotPartner } from '@/lib/clinical-links/api';
import { pilotBody } from '@/lib/clinical-links/input';
import { verifyPartnerActor } from '@/lib/clinical-links/identity';
import { partnerPrescriptionApi } from '@/lib/clinical-links/prescription-api';
import { parsePartnerPrescription, registerPartnerPrescription } from '@/lib/clinical-links/prescription-mint';

export const runtime = 'nodejs';

export function POST(request: Request) {
  return partnerPrescriptionApi(async () => {
    const partner = await pilotPartner(request, 'prescriptions:issue');
    const clinician = await verifyPartnerActor(request, partner);
    const prescription = await registerPartnerPrescription(partner, clinician.userId, parsePartnerPrescription(await pilotBody(request)));
    return pilotJson(prescription, prescription.state === 'confirmed' ? 200 : 202);
  });
}
