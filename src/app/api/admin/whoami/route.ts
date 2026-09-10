/**
 * GET /api/admin/whoami — is the caller an admin?
 * ---------------------------------------------------------------------------
 * The admin panel calls this after a Privy login to decide whether to show the
 * dashboard or an "acceso denegado" screen. 200 { admin:true, email } if the
 * caller is authorized (Privy email on the allowlist, or the legacy token);
 * 401/403 otherwise.
 */
import { NextResponse } from "next/server";
import { requirePrivyAdmin } from "@/lib/auth/admin";
import { assertPrivateEnvironment } from '@/lib/private-config';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePrivyAdmin(request);
  if ("error" in auth) return auth.error;
  try { assertPrivateEnvironment(); } catch { return NextResponse.json({error:'private_environment_mismatch'},{status:503}); }
  return NextResponse.json({ admin: true, email: auth.user.email }, {headers:{'Cache-Control':'no-store'}});
}
