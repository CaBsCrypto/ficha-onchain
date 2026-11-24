import { pilotJson } from '@/lib/clinical-links/api';
import { pilotBody, requireLinkRef } from '@/lib/clinical-links/input';
import { partnerPrescriptionActor, partnerPrescriptionApi } from '@/lib/clinical-links/prescription-api';
import { actorPartnerPrescription, parsePartnerPrescriptionCommand } from '@/lib/clinical-links/prescription-mint';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context) {
  return partnerPrescriptionApi(async () => {
    const actor = await partnerPrescriptionActor(request);
    return pilotJson(await actorPartnerPrescription(actor, requireLinkRef((await params).id)));
  });
}

export function POST(request: Request, { params }: Context) {
  return partnerPrescriptionApi(async () => {
    const actor = await partnerPrescriptionActor(request);
    const command = parsePartnerPrescriptionCommand(await pilotBody(request));
    return pilotJson(await actorPartnerPrescription(actor, requireLinkRef((await params).id), command));
  });
}
