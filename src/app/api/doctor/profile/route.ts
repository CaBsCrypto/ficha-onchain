/**
 * GET /api/doctor/profile?doctorEmail=X
 * PUT /api/doctor/profile
 * ---------------------------------------------------------------------------
 * The doctor's own profile: what patients see when choosing who to book with.
 *
 * Distinct from /api/admin/doctors, which is the admin CRUD behind
 * WAITLIST_ADMIN_TOKEN. This route lets a doctor edit their *own* record and
 * touches only the self-service fields — name, specialty, bio, telemedicine.
 * license_num, rut and status stay admin-only on purpose: a doctor must not be
 * able to reactivate themselves or edit their own credentials.
 *
 * GET  → { data: DoctorProfile | null }
 * PUT  → { data: DoctorProfile }   body: { doctorEmail, name?, specialty?, bio?, telemedicine? }
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof DbNotConfiguredError) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  console.error("[doctor/profile]", err);
  return NextResponse.json({ error: "db_error" }, { status: 500 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doctorEmail = searchParams.get("doctorEmail")?.trim().toLowerCase();
  if (!doctorEmail) {
    return NextResponse.json({ error: "doctorEmail required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email, specialty, bio, telemedicine, license_num, status, created_at
      FROM doctors
      WHERE LOWER(email) = ${doctorEmail}
      LIMIT 1`;
    return NextResponse.json({ data: rows[0] ?? null });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const doctorEmail = String(body.doctorEmail ?? "").trim().toLowerCase();
  if (!doctorEmail) {
    return NextResponse.json({ error: "doctorEmail required" }, { status: 400 });
  }

  const name = body.name === undefined ? null : String(body.name).trim();
  const specialty = body.specialty === undefined ? null : String(body.specialty).trim();
  const bio = body.bio === undefined ? null : String(body.bio).trim();
  const telemedicine = body.telemedicine === undefined ? null : Boolean(body.telemedicine);

  if (name !== null && name.length === 0) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }
  if (bio !== null && bio.length > 2000) {
    return NextResponse.json({ error: "bio too long (max 2000)" }, { status: 400 });
  }

  try {
    const sql = getDb();
    // COALESCE keeps a field untouched when the caller omits it, so the tab can
    // PATCH one field without having to send the whole profile back.
    const rows = await sql`
      UPDATE doctors SET
        name         = COALESCE(${name}, name),
        specialty    = COALESCE(${specialty}, specialty),
        bio          = COALESCE(${bio}, bio),
        telemedicine = COALESCE(${telemedicine}, telemedicine),
        updated_at   = NOW()
      WHERE LOWER(email) = ${doctorEmail}
      RETURNING id, name, email, specialty, bio, telemedicine, license_num, status, created_at`;

    if (rows.length === 0) {
      // Not auto-created: a doctor exists only once an admin has registered them.
      return NextResponse.json({ error: "doctor not found" }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    return fail(err);
  }
}
