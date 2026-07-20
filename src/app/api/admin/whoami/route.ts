/**
 * GET /api/admin/whoami — is the caller an admin?
 * ---------------------------------------------------------------------------
 * The admin panel calls this after a Privy login to decide whether to show the
 * dashboard or an "acceso denegado" screen. 200 { admin:true, email } if the
 * caller is authorized (Privy email on the allowlist, or the legacy token);
 * 401/403 otherwise.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ admin: true, email: auth.email });
}
