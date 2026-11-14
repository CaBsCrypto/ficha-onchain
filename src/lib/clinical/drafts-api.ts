import 'server-only';
import { requireUser } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { PrivateFlowError } from '@/lib/private-config';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import type { ClinicalActor } from '@/types/clinical';
import { clinicalJson } from './api';
import { assertClinicalEnvironment } from './config';
import { resolveClinicalActor } from './identity';

/** Draft writes are off-chain. This intentionally never checks/changes the chain write switch. */
export async function clinicalDraftApi(request: Request, work: (user: AuthedUser, actor: ClinicalActor) => Promise<unknown>) {
  try {
    const user = await requireUser(request, { strict: true });
    if (!user) return clinicalJson({ error: 'unauthorized' }, 401);
    if (request.method !== 'GET' && !isSameOrigin(request)) return clinicalJson({ error: 'forbidden' }, 403);
    assertClinicalEnvironment(false);
    const actor = await resolveClinicalActor(user);
    const result = await work(user, actor);
    const current = await requireUser(request, { strict: true });
    if (!current || current.userId !== actor.userId) return clinicalJson({ error: 'unauthorized' }, 401);
    const binding = await resolveClinicalActor(current);
    if (binding.walletId !== actor.walletId || binding.address !== actor.address) return clinicalJson({ error: 'clinical_identity_changed' }, 403);
    return clinicalJson(result);
  } catch (error) {
    return clinicalJson({ error: error instanceof PrivateFlowError ? error.message : 'clinical_drafts_unavailable' }, error instanceof PrivateFlowError ? error.status : 503);
  }
}
