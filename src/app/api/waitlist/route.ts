/** Waitlist interest only; never creates an account, sends mail or writes to Stellar. */
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requirePrivyAdmin } from '@/lib/auth/admin';
import { checkWaitlistRateLimit } from '@/lib/auth/rate-limit';
import { normalizeWaitlistEmail, readWaitlistBody } from '@/lib/waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function POST(request: Request) {
  // Enable only after verifying the environment's database and existing schema.
  if (process.env.TRUSTLEAF_WAITLIST_ENABLED !== 'true') return reply({ error: 'waitlist_unavailable' }, 503);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'invalid_json' }, 415);
  let body: unknown;
  try { body = await readWaitlistBody(request); }
  catch (error) { return reply({ error: error instanceof Error && error.message === 'body_too_large' ? 'body_too_large' : 'invalid_json' }, error instanceof Error && error.message === 'body_too_large' ? 413 : 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'invalid_email' }, 400);
  const value = body as { email?: unknown; role?: unknown };
  const email = normalizeWaitlistEmail(value.email);
  if (!email) return reply({ error: 'invalid_email' }, 400);
  const role = value.role === 'doctor' || value.role === 'patient' ? value.role : null;
  try {
    if (!await checkWaitlistRateLimit()) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    const sql = getDb();
    await sql`INSERT INTO waitlist (email, role) VALUES (${email}, ${role}) ON CONFLICT (email) DO NOTHING`;
    // Identical response avoids disclosing whether an address was already registered.
    return reply({ success: true });
  } catch {
    return reply({ error: 'waitlist_unavailable' }, 503);
  }
}

export async function GET(request: Request) {
  const auth = await requirePrivyAdmin(request);
  if ('error' in auth) { auth.error.headers.set('Cache-Control', 'no-store'); return auth.error; }
  try {
    const sql = getDb();
    const rows = await sql`SELECT email, role, created_at FROM waitlist ORDER BY created_at DESC`;
    return reply({ count: rows.length, signups: rows });
  } catch { return reply({ error: 'waitlist_unavailable' }, 503); }
}
