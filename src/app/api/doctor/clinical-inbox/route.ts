import { clinicalApi } from '@/lib/clinical/api';
import { clinicalDoctorInbox } from '@/lib/clinical/doctor-inbox';
import { PrivateFlowError } from '@/lib/private-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return clinicalApi(request, (user, actor) => {
    if (new URL(request.url).searchParams.size !== 0) throw new PrivateFlowError('clinical_request_invalid', 400);
    return clinicalDoctorInbox(user, actor);
  }, { existingOnly: true });
}
