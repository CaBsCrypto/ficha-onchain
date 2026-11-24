import { pilotApi, pilotJson, pilotPatient } from '@/lib/clinical-links/api';
import { pilotBody, requireBindingId, requireConfirmationCode, requireKeys } from '@/lib/clinical-links/input';
import { confirmClinicalBinding } from '@/lib/clinical-links/store';

export function POST(request: Request) {
  return pilotApi(async () => {
    const userId = await pilotPatient(request);
    const body = await pilotBody(request);
    requireKeys(body, ['bindingId', 'confirmationCode']);
    return pilotJson(await confirmClinicalBinding(userId, requireBindingId(body.bindingId), requireConfirmationCode(body.confirmationCode)));
  });
}
