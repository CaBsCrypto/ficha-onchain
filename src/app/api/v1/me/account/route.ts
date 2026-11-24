import { pilotApi, pilotJson, pilotPatient } from '@/lib/clinical-links/api';
import { readClinicalPatientAccount } from '@/lib/clinical-links/store';

export function GET(request: Request) {
  return pilotApi(async () => pilotJson(await readClinicalPatientAccount(await pilotPatient(request))));
}
