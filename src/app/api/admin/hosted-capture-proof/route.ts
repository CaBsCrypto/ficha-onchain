import { NextResponse } from 'next/server';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { getDbConnection } from '@/lib/db';
import { verifyHostedClinicalBaseline } from '@/lib/hosted-capture-proof';
import { PrivateFlowError } from '@/lib/private-config';
import { assertHostedCaptureWeb, readHostedCaptureBySha, recordHostedCaptureVerification } from '../../../../../scripts/lib/hosted-capture-store.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store', Vary: 'Authorization' };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export async function POST(request: Request) {
  let origin: string;
  try { ({ origin } = assertHostedCaptureWeb()); }
  catch { return json({ error: 'hosted_capture_unavailable' }, 404); }
  if (request.headers.get('origin') !== origin || request.headers.get('host') !== new URL(origin).host) {
    return json({ error: 'forbidden' }, 403);
  }
  const auth = await requirePrivyAdmin(request);
  if ('error' in auth) return auth.error;
  let sha256: string;
  try {
    const length = request.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > 90)) throw new Error();
    const bytes = await request.text();
    if (bytes.length > 90) throw new Error();
    const body = JSON.parse(bytes);
    if (!body || Object.keys(body).length !== 1 || typeof body.sha256 !== 'string' ||
      !/^(?!0{64}$)[a-f0-9]{64}$/.test(body.sha256)) throw new Error();
    sha256 = body.sha256;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  let client;
  try {
    client = await getDbConnection();
    await client.query('BEGIN');
    const scope = await readHostedCaptureBySha(client, sha256);
    if (!scope || !['pdf', 'appointment', 'close'].includes(scope.phase) || scope.active) {
      await client.query('ROLLBACK');
      return json({ error: 'hosted_capture_stage_unverified' }, 409);
    }
    const phase = scope.phase as 'pdf' | 'appointment' | 'close';
    const evidence = await verifyHostedClinicalBaseline(client, scope, phase);
    const current = await requirePrivyAdmin(request);
    if ('error' in current || current.user.userId !== auth.user.userId) throw new PrivateFlowError('unauthorized', 401);
    await recordHostedCaptureVerification(client, sha256);
    await client.query('COMMIT');
    return json({ status: 'verified', phase, sha256, evidence });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => undefined);
    return json({ error: error instanceof PrivateFlowError ? error.message : 'hosted_capture_verification_unavailable' },
      error instanceof PrivateFlowError ? error.status : 503);
  } finally {
    client?.release();
  }
}
