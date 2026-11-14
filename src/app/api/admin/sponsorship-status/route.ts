import { NextResponse } from 'next/server';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { assertPrivateEnvironment } from '@/lib/private-config';
import { getSponsorshipStatus } from '@/lib/sponsorship/status';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
const denied = (status: number) => json({ error: status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'sponsorship_status_unavailable' }, [401,403].includes(status) ? status : 503);
export async function GET(request: Request) {
  try {
    const auth = await requirePrivyAdmin(request);
    if ('error' in auth) return denied(auth.error.status);
    assertPrivateEnvironment();
    const result = await getSponsorshipStatus();
    const current = await requirePrivyAdmin(request);
    if ('error' in current) return denied(current.error.status);
    if (current.user.userId !== auth.user.userId) return denied(401);
    return json(result);
  } catch { return json({ error: 'sponsorship_status_unavailable' }, 503); }
}
