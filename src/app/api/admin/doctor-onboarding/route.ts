import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { listDoctorOnboarding, reviewDoctorOnboarding } from '@/lib/doctor-onboarding';
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';
import { privateBody } from '@/lib/private-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  return error instanceof PrivateFlowError ? json({ error: error.message }, error.status) : json({ error: 'doctor_onboarding_unavailable' }, 503);
}
export async function GET(request: Request) {
  const auth = await requirePrivyAdmin(request); if ('error' in auth) return auth.error;
  try { assertPrivateEnvironment(); return json({ doctors: await listDoctorOnboarding(getDb()) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const auth = await requirePrivyAdmin(request); if ('error' in auth) return auth.error;
  if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403);
  try {
    const value = await privateBody(request, ['id', 'action', 'note', 'submissionId']);
    if (typeof value.id !== 'string' || typeof value.action !== 'string' || typeof value.submissionId !== 'string' ||
        (value.note !== undefined && typeof value.note !== 'string')) return json({ error: 'invalid_request' }, 400);
    assertPrivateEnvironment();
    return json({ onboarding: await reviewDoctorOnboarding(getDb(), auth.user, value.id, value.action, String(value.note ?? '').trim(), value.submissionId) });
  } catch (error) { return failure(error); }
}
