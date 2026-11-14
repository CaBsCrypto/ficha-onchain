import { clinicalDraftApi } from '@/lib/clinical/drafts-api';
import { draftBody, draftListOptions } from '@/lib/clinical/drafts-input';
import { listClinicalDrafts, saveClinicalDraft } from '@/lib/clinical/drafts';
export const runtime = 'nodejs';
export function GET(request: Request) { return clinicalDraftApi(request, async (_user, actor) => listClinicalDrafts(actor, draftListOptions(request))); }
export function POST(request: Request) { return clinicalDraftApi(request, async (user, actor) => ({ draft: await saveClinicalDraft(user, actor, await draftBody(request)) })); }
