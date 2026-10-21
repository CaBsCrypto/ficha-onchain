import { NextResponse } from 'next/server';
import { requireUser, type AuthedUser } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { PrivateFlowError } from '@/lib/private-config';
import { assertClinicalEnvironment } from './config';
import { resolveClinicalActor } from './identity';
import type { ClinicalActor } from '@/types/clinical';

export const clinicalJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Authorization' } });
/** Auth failures and provider exceptions never carry provider payloads into the response. */
export async function clinicalApi(request: Request, work: (user: AuthedUser, actor: ClinicalActor) => Promise<unknown>) {
  try {
    const user = await requireUser(request, { strict: true });
    if (!user) return clinicalJson({ error: 'unauthorized' }, 401);
    if (request.method !== 'GET' && !isSameOrigin(request)) return clinicalJson({ error: 'forbidden' }, 403);
    assertClinicalEnvironment(request.method !== 'GET');
    const actor = await resolveClinicalActor(user);
    const result = await work(user, actor);
    // Do not deliver content after a changed/expired session or wallet association.
    const current = await requireUser(request, { strict: true });
    if (!current || current.userId !== actor.userId) return clinicalJson({ error: 'unauthorized' }, 401);
    const binding = await resolveClinicalActor(current);
    if (binding.walletId !== actor.walletId || binding.address !== actor.address) return clinicalJson({ error: 'clinical_identity_changed' }, 403);
    return result instanceof Response ? result : clinicalJson(result);
  } catch (error) {
    return clinicalJson({ error: error instanceof PrivateFlowError ? error.message : 'clinical_service_unavailable' }, error instanceof PrivateFlowError ? error.status : 503);
  }
}
