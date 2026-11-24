import { requireUser } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { DoctorAuthorizationError } from '@/lib/doctor-authorizations';
import { PrivateFlowError } from '@/lib/private-config';
import { pilotApi, pilotJson } from './api';
import { ClinicalLinksApiError } from './config';

export function partnerPrescriptionApi(work: () => Promise<Response>) {
  return pilotApi(async () => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof PrivateFlowError || error instanceof DoctorAuthorizationError) return pilotJson({ error: error.message }, error.status);
      throw error;
    }
  });
}

export async function partnerPrescriptionActor(request: Request) {
  if (request.method !== 'GET' && !isSameOrigin(request)) throw new ClinicalLinksApiError('forbidden', 403);
  const actor = await requireUser(request, { strict: true });
  if (!actor?.email) throw new ClinicalLinksApiError('unauthorized', 401);
  return actor;
}
