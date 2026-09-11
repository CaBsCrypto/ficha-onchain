/**
 * GET /api/admin/whoami — is the caller an admin?
 * ---------------------------------------------------------------------------
 * The admin panel calls this after a Privy login to decide whether to show the
 * dashboard or an "acceso denegado" screen. 200 { admin:true, email } if the
 * caller is authorized by their Privy identity and the explicit allowlist.
 * Invalid sessions return 401, denied roles 403, and unavailable services 503.
 */
import { NextResponse } from "next/server";
import { requirePrivyAdmin } from "@/lib/auth/admin";
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';
import { accessErrorResponse } from '@/lib/auth/access-error';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePrivyAdmin(request);
  if ("error" in auth) {
    if (auth.error.status === 401) return accessErrorResponse('unauthorized', 401, 'authentication');
    if (auth.error.status === 403) return accessErrorResponse('forbidden', 403, 'authorization');
    return auth.error;
  }
  try { assertPrivateEnvironment(); }
  catch (error) {
    return accessErrorResponse(error instanceof PrivateFlowError && error.message === 'private_configuration_mismatch'
      ? 'private_configuration_mismatch' : 'private_environment_mismatch', 503, 'configuration');
  }
  return NextResponse.json({ admin: true, email: auth.user.email }, {headers:{'Cache-Control':'no-store'}});
}
