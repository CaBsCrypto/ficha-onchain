import { NextResponse } from 'next/server';
import { requireUser, type AuthedUser } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { PrivateFlowError } from '@/lib/private-config';
import { assertClinicalEnvironment } from './config';
import { resolveClinicalActor } from './identity';
import type { ClinicalActor } from '@/types/clinical';
import { assertClinicalWriteScope, clinicalCreateOnceConfigured } from './create-once';
import { rehearsalConfigured, currentClinicalRehearsal } from './rehearsal';
import { clinicalCaptureConfigured, loadClinicalCapture, assertClinicalCaptureActor } from './capture';
import { CLINICAL_PREPARE_CAPABILITY_HEADER, CLINICAL_PREPARE_CAPABILITY_VERSION } from './client-contract';
import { createServerClinicalReadTrace } from './read-trace-server';
import { clinicalReadStage, emitClinicalReadTrace, type ClinicalReadTrace } from './read-trace';

export const clinicalJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Authorization' } });
/** Auth failures and provider exceptions never carry provider payloads into the response. */
export async function clinicalApi(request: Request, work: (user: AuthedUser, actor: ClinicalActor, trace?: ClinicalReadTrace) => Promise<unknown>, options: { allowCreateOnce?: boolean; offchainOnly?: boolean; requirePrepareClient?: boolean } = {}) {
  const diagnostic = createServerClinicalReadTrace(request), trace = diagnostic?.trace;
  const respond = (response: Response) => { emitClinicalReadTrace(trace, 'respond', 'ok'); return response; };
  emitClinicalReadTrace(trace, 'ingress', 'start');
  try {
    const user = await clinicalReadStage(trace, 'auth', () => requireUser(request, { strict: true }));
    if (!user) return respond(clinicalJson({ error: 'unauthorized' }, 401));
    if (request.method !== 'GET' && !isSameOrigin(request)) return respond(clinicalJson({ error: 'forbidden' }, 403));
    // Reject a stale preparation client before body parsing, RPC, inserts or reservations.
    // Existing operations keep their read/reconcile/cancel/sign routes available.
    if (options.requirePrepareClient && request.headers.get(CLINICAL_PREPARE_CAPABILITY_HEADER) !== CLINICAL_PREPARE_CAPABILITY_VERSION) {
      return respond(clinicalJson({ error: 'clinical_client_update_required' }, 409));
    }
    const scoped = request.method === 'POST' && options.allowCreateOnce === true && clinicalCreateOnceConfigured();
    assertClinicalEnvironment(request.method !== 'GET' && !scoped && !options.offchainOnly);
    const actor = await clinicalReadStage(trace, 'bind', () => resolveClinicalActor(user));
    // Only opted-in clinical routes may reach their action/intent policy while
    // general writes are off. They recheck the actual action before mutation.
    if (scoped && !options.offchainOnly) {
      if (clinicalCaptureConfigured()) {
        const plan = loadClinicalCapture();
        if (!plan) throw new PrivateFlowError('clinical_rehearsal_scope_rejected', 403);
        assertClinicalCaptureActor(plan, actor);
      } else if (rehearsalConfigured()) currentClinicalRehearsal(actor);
      else assertClinicalWriteScope('create_history', actor.address);
    }
    const result = await clinicalReadStage(trace, 'work', () => trace ? work(user, actor, trace) : work(user, actor));
    // Do not deliver content after a changed/expired session or wallet association.
    const current = await clinicalReadStage(trace, 'final_auth', () => requireUser(request, { strict: true }));
    if (!current || current.userId !== actor.userId) return respond(clinicalJson({ error: 'unauthorized' }, 401));
    const binding = await clinicalReadStage(trace, 'final_bind', () => resolveClinicalActor(current));
    if (binding.walletId !== actor.walletId || binding.address !== actor.address) return respond(clinicalJson({ error: 'clinical_identity_changed' }, 403));
    return respond(result instanceof Response ? result : clinicalJson(result));
  } catch (error) {
    emitClinicalReadTrace(trace, 'ingress', 'error');
    return respond(clinicalJson({ error: error instanceof PrivateFlowError ? error.message : 'clinical_service_unavailable' }, error instanceof PrivateFlowError ? error.status : 503));
  } finally { diagnostic?.close(); }
}
