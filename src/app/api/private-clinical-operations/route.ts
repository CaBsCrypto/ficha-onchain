import { clinicalApi } from '@/lib/clinical/api';
import { clinicalBody } from '@/lib/clinical/input';
import { prepareClinicalOperation } from '@/lib/clinical/operations';
export const runtime = 'nodejs';
export function POST(request: Request) { return clinicalApi(request, async (user, actor) => prepareClinicalOperation(user, actor, await clinicalBody(request))); }
