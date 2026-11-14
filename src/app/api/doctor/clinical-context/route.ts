import { clinicalApi } from '@/lib/clinical/api';
import { clinicalDoctorContext } from '@/lib/clinical/doctor-context';
import { PrivateFlowError } from '@/lib/private-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Week 3 first boundary: explicit history selection, without clinical data. */
export function GET(request: Request) {
  return clinicalApi(request, async (user, actor) => {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== 'historyId') || params.getAll('historyId').length !== 1) {
      throw new PrivateFlowError('clinical_request_invalid', 400);
    }
    return clinicalDoctorContext(user, actor, params.get('historyId') ?? '');
  });
}
