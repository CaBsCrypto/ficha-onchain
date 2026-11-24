import { pilotApi, pilotJson, pilotPartner } from '@/lib/clinical-links/api';
import { pilotBody, requireActorRef, requireBindingCode, requireKeys } from '@/lib/clinical-links/input';
import { claimClinicalBinding } from '@/lib/clinical-links/store';

export function POST(request: Request) {
  return pilotApi(async () => {
    const partner = await pilotPartner(request, 'clinical-links:bind');
    const body = await pilotBody(request);
    requireKeys(body, ['code', 'actorRef']);
    return pilotJson(await claimClinicalBinding(partner, requireBindingCode(body.code), requireActorRef(body.actorRef)));
  });
}
