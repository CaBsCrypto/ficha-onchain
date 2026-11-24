import { pilotJson, pilotPartner } from '@/lib/clinical-links/api';
import { requireLinkRef } from '@/lib/clinical-links/input';
import { partnerPrescriptionApi } from '@/lib/clinical-links/prescription-api';
import { partnerPrescriptionStatus } from '@/lib/clinical-links/prescription-mint';

export const runtime = 'nodejs';

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return partnerPrescriptionApi(async () => {
    const partner = await pilotPartner(request, 'prescriptions:issue');
    return pilotJson(await partnerPrescriptionStatus(partner, requireLinkRef((await params).id)));
  });
}
