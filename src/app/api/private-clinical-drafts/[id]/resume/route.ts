import { clinicalDraftApi } from '@/lib/clinical/drafts-api';
import { draftBody } from '@/lib/clinical/drafts-input';
import { resumeClinicalDraft } from '@/lib/clinical/drafts-resume';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export function POST(request: Request, context: Context) {
  return clinicalDraftApi(request, async (user, actor) => ({
    draft: await resumeClinicalDraft(user, actor, (await context.params).id, await draftBody(request)),
  }));
}
