import { pilotJson } from '@/lib/clinical-links/api';
import { partnerPrescriptionActor, partnerPrescriptionApi } from '@/lib/clinical-links/prescription-api';
import { listActorPartnerPrescriptions } from '@/lib/clinical-links/prescription-mint';

export const runtime = 'nodejs';

export function GET(request: Request) {
  return partnerPrescriptionApi(async () => pilotJson(await listActorPartnerPrescriptions(await partnerPrescriptionActor(request))));
}
