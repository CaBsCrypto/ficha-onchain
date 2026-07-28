/**
 * GET /api/patient/access-log — who accessed MY clinical data. OWNER-ONLY.
 * ---------------------------------------------------------------------------
 * Ley 20.584: the patient has the right to know who looked at their ficha.
 * Returns the caller's own trail, newest first — app accesses matched by their
 * email, MCP accesses matched by the HMAC of their RUT (if their health record
 * has one). There is no way to ask for someone else's log: the identity comes
 * from the verified Privy token, and the demo fallback follows the same
 * enforcement flag as every other guarded route.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { requireUser, authEnforced, unauthorized } from "@/lib/auth/privy-auth";
import { hashRut, RutError } from "@/lib/identity/rut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireUser(request);
  let email = user?.email?.toLowerCase() ?? null;
  if (!email && !authEnforced()) {
    email = new URL(request.url).searchParams.get("patientEmail")?.trim().toLowerCase() ?? null;
  }
  if (!email) return unauthorized();

  try {
    const sql = getDb();

    // MCP accesses are rut-keyed; resolve the caller's rut_hash when they have
    // a RUT on file. A missing/invalid RUT just narrows the query to email.
    let rutHash: string | null = null;
    try {
      const [phr] = await sql<{ rut: string | null }>`
        SELECT rut FROM patient_health_records WHERE LOWER(patient_email) = ${email} LIMIT 1`;
      if (phr?.rut) rutHash = hashRut(phr.rut);
    } catch (e) {
      if (!(e instanceof RutError)) throw e;
    }

    const rows = await sql`
      SELECT accessor, accessor_role, action, detail, created_at
      FROM api_access_log
      WHERE patient_email = ${email}
         OR (${rutHash}::text IS NOT NULL AND patient_rut_hash = ${rutHash})
      ORDER BY created_at DESC
      LIMIT 100`;
    return NextResponse.json({ accesses: rows });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[patient/access-log]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
