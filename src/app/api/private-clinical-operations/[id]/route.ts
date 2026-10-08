import { clinicalApi } from '@/lib/clinical/api';
import { reconcileClinicalOperation } from '@/lib/clinical/operations';
import { uuid } from '@/lib/private-api';
import { PrivateFlowError } from '@/lib/private-config';
export const runtime = 'nodejs';
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return clinicalApi(request, async (_user, actor) => {
    const { id } = await context.params;
    if (!uuid(id)) throw new PrivateFlowError('clinical_request_invalid', 400);
    return reconcileClinicalOperation(actor, id);
  });
}
