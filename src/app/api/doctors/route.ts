/**
 * GET /api/doctors — public list of active doctors a patient can book with.
 * ---------------------------------------------------------------------------
 * Only the fields a patient needs to choose who to see: no RUT, no license, no
 * status of blocked doctors. Blocked/inactive doctors are filtered out so they
 * never appear in the booking picker.
 *
 * Distinct from /api/admin/doctors, which is the full CRUD behind
 * WAITLIST_ADMIN_TOKEN and returns every doctor with their private fields.
 *
 * → { doctors: PublicDoctor[] }
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT name, email, specialty, telemedicine, center_name
      FROM doctors
      WHERE status = 'active'
      ORDER BY name ASC`;
    return NextResponse.json({ doctors: rows });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[doctors]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
