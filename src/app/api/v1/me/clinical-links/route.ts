import { pilotApi, pilotJson, pilotPatient } from '@/lib/clinical-links/api';
import { listClinicalLinks } from '@/lib/clinical-links/store';

export function GET(request: Request) {
  return pilotApi(async () => pilotJson({ links: await listClinicalLinks(await pilotPatient(request)) }));
}
