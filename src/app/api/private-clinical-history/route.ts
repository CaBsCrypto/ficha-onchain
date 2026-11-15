import { clinicalApi, clinicalJson } from '@/lib/clinical/api';
import { ClinicalRecordArchiveEvidence } from '@/lib/clinical/chain';
import { clinicalReadQuery, clinicalSnapshot } from '@/lib/clinical/history';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return clinicalApi(request, async (user, actor, trace) => {
    const { historyId, appointmentId } = clinicalReadQuery(request);
    try { return await clinicalSnapshot(request, user, actor, historyId, trace, appointmentId); }
    catch (error) {
      if (historyId === undefined && error instanceof ClinicalRecordArchiveEvidence) {
        // Return through clinicalApi so final session and wallet checks still run.
        return clinicalJson({ error: 'clinical_record_archived' }, 503);
      }
      throw error;
    }
  }, { hostedView: true });
}
