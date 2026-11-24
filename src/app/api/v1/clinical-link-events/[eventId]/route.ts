import { pilotApi, pilotJson, pilotPartner } from '@/lib/clinical-links/api';
import { requireEventId } from '@/lib/clinical-links/input';
import { readClinicalLinkEvent } from '@/lib/clinical-links/store';

export function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  return pilotApi(async () => {
    const partner = await pilotPartner(request, 'clinical-links:read');
    return pilotJson(await readClinicalLinkEvent(partner, requireEventId((await params).eventId)));
  });
}
