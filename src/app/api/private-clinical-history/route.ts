import { clinicalApi } from '@/lib/clinical/api';
import { clinicalReadQuery, clinicalSnapshot } from '@/lib/clinical/history';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return clinicalApi(request, (user, actor, trace) => {
    const { historyId, appointmentId } = clinicalReadQuery(request);
    return clinicalSnapshot(request, user, actor, historyId, trace, appointmentId);
  }, { hostedView: true });
}
