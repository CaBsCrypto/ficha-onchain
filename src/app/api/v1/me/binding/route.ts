import { pilotApi, pilotJson, pilotPatient } from '@/lib/clinical-links/api';
import { getClinicalLinksPilotPartnerOrigin } from '@/lib/clinical-links/config';
import { pilotBody, requireBindingId, requireKeys } from '@/lib/clinical-links/input';
import { getClinicalBinding, revokeClinicalBinding, startClinicalBinding } from '@/lib/clinical-links/store';

export function GET(request: Request) {
  return pilotApi(async () => pilotJson({ binding: await getClinicalBinding(await pilotPatient(request)) }));
}

export function POST(request: Request) {
  return pilotApi(async () => {
    const binding = await startClinicalBinding(await pilotPatient(request));
    return pilotJson({ ...binding, href: new URL('/pilot/ficha', getClinicalLinksPilotPartnerOrigin()).href }, 201);
  });
}

export function DELETE(request: Request) {
  return pilotApi(async () => {
    const userId = await pilotPatient(request);
    const body = await pilotBody(request);
    requireKeys(body, ['bindingId']);
    await revokeClinicalBinding(userId, requireBindingId(body.bindingId));
    return pilotJson({ status: 'revoked' });
  });
}
