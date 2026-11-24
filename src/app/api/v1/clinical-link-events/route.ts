import { pilotApi, pilotJson, pilotPartner } from '@/lib/clinical-links/api';
import { parseClinicalLinkEvent, pilotBody } from '@/lib/clinical-links/input';
import { recordClinicalLinkEvent } from '@/lib/clinical-links/store';

export function POST(request: Request) {
  return pilotApi(async () => {
    const partner = await pilotPartner(request, 'clinical-links:write');
    return pilotJson(await recordClinicalLinkEvent(partner, parseClinicalLinkEvent(await pilotBody(request))), 202);
  });
}
