import { timingSafeEqual } from 'node:crypto';
import { pilotApi, pilotJson } from '@/lib/clinical-links/api';
import { runClinicalLinkAnchor } from '@/lib/clinical-links/anchor';

export const runtime = 'nodejs';
export const maxDuration = 60;

export function POST(request: Request) {
  return pilotApi(async () => {
    const secret = process.env.TRUSTLEAF_CLINICAL_LINK_WORKER_TOKEN ?? '';
    const header = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${secret}`;
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret) || Buffer.byteLength(header) !== expected.length ||
        !timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
      return pilotJson({ error: 'unauthorized' }, 401);
    }
    return pilotJson({ status: await runClinicalLinkAnchor() });
  });
}
