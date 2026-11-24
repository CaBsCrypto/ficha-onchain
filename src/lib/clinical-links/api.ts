import { NextResponse } from 'next/server';
import { requirePrivySession } from '@/lib/auth/privy-auth';
import { isSameOrigin } from '@/lib/auth/same-origin';
import {
  assertClinicalLinksPilot,
  ClinicalLinksApiError,
  isClinicalLinksPilotPatient,
} from './config';
import { authenticateClinicalPartner, PilotStoreError } from './store';
import type { ClinicalPartnerScope } from './types';

export function pilotJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', Vary: 'Authorization', 'Referrer-Policy': 'no-referrer' },
  });
}

export async function pilotApi(work: () => Promise<Response>) {
  try {
    assertClinicalLinksPilot();
    return await work();
  } catch (error) {
    if (error instanceof ClinicalLinksApiError || error instanceof PilotStoreError) {
      return pilotJson({ error: error.message }, error.status);
    }
    return pilotJson({ error: 'clinical_links_unavailable' }, 503);
  }
}

export async function pilotPatient(request: Request) {
  if (request.method !== 'GET' && !isSameOrigin(request)) throw new ClinicalLinksApiError('forbidden', 403);
  const session = await requirePrivySession(request);
  if (!session) throw new ClinicalLinksApiError('unauthorized', 401);
  if (!isClinicalLinksPilotPatient(session.userId)) throw new ClinicalLinksApiError('not_found', 404);
  return session.userId;
}

export async function pilotPartner(request: Request, scope: ClinicalPartnerScope) {
  return authenticateClinicalPartner(request, scope);
}
