import { pilotApi, pilotJson, pilotPartner } from '@/lib/clinical-links/api';
import { pilotBody, requireActorRef, requireBindingId, requireKeys } from '@/lib/clinical-links/input';
import { readClinicalBinding } from '@/lib/clinical-links/store';

export function POST(request: Request) {
  return pilotApi(async () => {
    const partner = await pilotPartner(request, 'clinical-links:bind');
    const body = await pilotBody(request);
    requireKeys(body, ['bindingId', 'actorRef']);
    return pilotJson(await readClinicalBinding(partner, requireBindingId(body.bindingId), requireActorRef(body.actorRef)));
  });
}
