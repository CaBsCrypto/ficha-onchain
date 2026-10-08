import { clinicalApi, clinicalJson } from '@/lib/clinical/api';
import { ownClinicalHistory, clinicalDocument } from '@/lib/clinical/history';
import { PrivateFlowError } from '@/lib/private-config';
import { clinicalNote } from '@/lib/clinical/input';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return clinicalApi(request, async (_user, actor) => {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(k => !['entryId','version'].includes(k)) || params.getAll('entryId').length !== 1 || params.getAll('version').length !== 1) throw new PrivateFlowError('clinical_request_invalid', 400);
    const entryId = params.get('entryId') ?? '', versionText = params.get('version') ?? '';
    if (!/^[a-f0-9]{64}$/.test(entryId) || !/^[1-9][0-9]*$/.test(versionText) || Number(versionText) > 0xffff_ffff) throw new PrivateFlowError('clinical_request_invalid', 400);
    const own = await ownClinicalHistory(actor);
    if (!own) throw new PrivateFlowError('clinical_history_required', 404);
    const doc = await clinicalDocument(request, actor, own.history.id, entryId, Number(versionText));
    if (doc.metadata.mediaType === 'application/json') return clinicalJson({ note: clinicalNote(JSON.parse(Buffer.from(doc.content).toString('utf8'))) });
    return new Response(new Uint8Array(doc.content), { headers: {
      'Cache-Control': 'no-store', 'Vary': 'Authorization', 'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="archivo-clinico"; filename*=UTF-8''${encodeURIComponent(doc.metadata.fileName).replace(/'/g, '%27')}`,
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  });
}
