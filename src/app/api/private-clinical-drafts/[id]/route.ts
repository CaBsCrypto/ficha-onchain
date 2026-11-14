import { clinicalDraftApi } from '@/lib/clinical/drafts-api';
import { draftBody, draftObject, draftRevision } from '@/lib/clinical/drafts-input';
import { deleteClinicalDraft, getClinicalDraft, saveClinicalDraft } from '@/lib/clinical/drafts';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return clinicalDraftApi(request, async (_user, actor) => ({ draft: await getClinicalDraft(actor, (await context.params).id) }));
}
export function PUT(request: Request, context: Context) {
  return clinicalDraftApi(request, async (user, actor) => {
    const body = draftObject(await draftBody(request), ['expectedRevision', 'historyId', 'patient', 'payload']);
    return { draft: await saveClinicalDraft(user, actor, { ...body, id: (await context.params).id }) };
  });
}
export function DELETE(request: Request, context: Context) {
  return clinicalDraftApi(request, async (_user, actor) => {
    const body = draftObject(await draftBody(request), ['expectedRevision']);
    return deleteClinicalDraft(actor, (await context.params).id, draftRevision(body.expectedRevision));
  });
}
