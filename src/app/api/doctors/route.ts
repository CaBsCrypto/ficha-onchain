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

/**
 * POST /api/doctors — public doctor self-registration.
 * ---------------------------------------------------------------------------
 * A doctor requests access to the platform. The row is created with
 * status='pending' and does NOT appear in the public booking list (GET filters
 * to status='active') until an admin approves it from /admin/doctors. Approval
 * is a real, human step — this endpoint never grants active access on its own.
 *
 * Body: { name, email, specialty?, licenseNum?, rut? }
 * → 201 { doctor: { id, name, email, status } }
 * → 409 if the email is already registered.
 */
export async function POST(request: Request) {
  let body: { name?: unknown; email?: unknown; specialty?: unknown; licenseNum?: unknown; rut?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name  = String(body.name  ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!name || !email) {
    return NextResponse.json({ error: "name and email required" }, { status: 400 });
  }

  const specialty  = body.specialty  ? String(body.specialty).trim()  : null;
  const licenseNum = body.licenseNum ? String(body.licenseNum).trim() : null;
  const rut        = body.rut        ? String(body.rut).trim()        : null;

  try {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO doctors (name, email, specialty, license_num, rut, status)
      VALUES (${name}, ${email}, ${specialty}, ${licenseNum}, ${rut}, 'pending')
      RETURNING id, name, email, status`;
    return NextResponse.json({ success: true, doctor: row }, { status: 201 });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    if (err instanceof Error && err.message.includes("unique")) {
      return NextResponse.json({ error: "Este email ya está registrado" }, { status: 409 });
    }
    console.error("[doctors POST]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
