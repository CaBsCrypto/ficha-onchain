import { clinicalApi } from '@/lib/clinical/api';
import { signClinicalOperation } from '@/lib/clinical/operations';
import { uuid, privateBody } from '@/lib/private-api';
import { PrivateFlowError } from '@/lib/private-config';
export const runtime = 'nodejs';
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return clinicalApi(request, async (user, actor) => {
    const { id } = await context.params, body = await privateBody(request, ['confirmed', 'signature']);
    if (!uuid(id) || body.confirmed !== true || typeof body.signature !== 'string' || !/^(?:0x)?[a-f0-9]{128}$/i.test(body.signature)) throw new PrivateFlowError('clinical_confirmation_required', 400);
    return signClinicalOperation(user, actor, id, body.signature);
  });
}
