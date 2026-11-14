import { clinicalApi } from '@/lib/clinical/api';
import { clinicalPrescriptionOptions } from '@/lib/clinical/prescriptions';
import { PrivateFlowError } from '@/lib/private-config';
import { uuid } from '@/lib/private-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export function GET(request: Request) {
  return clinicalApi(request, (user, actor) => {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => !['historyId', 'prescriptionId'].includes(key)) ||
        query.getAll('historyId').length > 1 || query.getAll('prescriptionId').length > 1 ||
        (query.has('historyId') && !/^[a-f0-9]{64}$/.test(query.get('historyId')!)) ||
        (query.has('prescriptionId') && !uuid(query.get('prescriptionId')))) {
      throw new PrivateFlowError('clinical_request_invalid', 400);
    }
    const historyId = query.get('historyId') ?? undefined;
    return query.has('prescriptionId')
      ? clinicalPrescriptionOptions(user, actor, historyId, query.get('prescriptionId')!.toLowerCase())
      : clinicalPrescriptionOptions(user, actor, historyId);
  });
}
