import { clinicalApi } from '@/lib/clinical/api';
import { clinicalSnapshot } from '@/lib/clinical/history';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return clinicalApi(request, (user, actor) => clinicalSnapshot(request, user, actor)); }
