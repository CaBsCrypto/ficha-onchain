import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';
import { createDoctorInvitation, listDoctorOnboarding } from '@/lib/doctor-onboarding';
import { privateBody } from '@/lib/private-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  if (error instanceof PrivateFlowError) return json({ error: error.message }, error.status);
  if ((error as {code?: string})?.code === '23505') return json({ error: 'doctor_onboarding_already_active' }, 409);
  return json({ error: 'doctor_profile_unavailable' }, 503);
}
export async function GET(request: Request) {
  const auth = await requirePrivyAdmin(request); if ('error' in auth) return auth.error;
  try {
    assertPrivateEnvironment();
    const doctors = await listDoctorOnboarding(getDb());
    return json({ count: doctors.length, doctors });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const auth = await requirePrivyAdmin(request); if ('error' in auth) return auth.error;
  if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403);
  try {
    const body = await privateBody(request, ['email', 'name', 'specialty']);
    const created = await createDoctorInvitation(getDb(), auth.user, body);
    return json({ success: true, ...created }, 201);
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  const auth = await requirePrivyAdmin(request); if ('error' in auth) return auth.error;
  if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403);
  // Only the doctor can change a submitted profile, following a review request.
  return json({ error: 'use_doctor_onboarding_review' }, 409);
}
export async function DELETE(request: Request) {
  const auth = await requirePrivyAdmin(request); if ('error' in auth) return auth.error;
  return json({ error: 'doctor_history_must_be_preserved' }, 405);
}
