/**
 * GET /api/doctor/profile   — the caller's own doctor record
 * PUT /api/doctor/profile   — update it
 * ---------------------------------------------------------------------------
 * The doctor's own profile. Identity comes from the caller's verified Privy
 * token, never from a parameter — this route used to take `?doctorEmail=` and
 * trust it, so anyone could read (and PUT could overwrite) another doctor's
 * profile just by guessing the email.
 *
 * It touches only self-service fields. `license_num`, `rut`, `name` and
 * `status` are the doctor's legal identity: they are shown here and the doctor
 * may fill them in, but `status` stays admin-only on purpose — a doctor must
 * not be able to reactivate themselves. `name` + `license_num` are what the
 * on-chain DoctorRegistry verifies against.
 *
 * Distinct from /api/admin/doctors, which is the admin CRUD behind
 * WAITLIST_ADMIN_TOKEN.
 *
 * GET → { data: DoctorProfile | null }
 * PUT → { data: DoctorProfile }
 *   body: { name?, specialty?, bio?, telemedicine?, rut?, license_num?,
 *           phone?, center_name?, center_address?, signature_url? }
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof DbNotConfiguredError) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  console.error("[doctor/profile]", err);
  return NextResponse.json({ error: "db_error" }, { status: 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await requireUser(request);
  if (!user) return unauthorized();
  if (!user.email) {
    return NextResponse.json({ error: "account has no email" }, { status: 403 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email, specialty, bio, telemedicine, license_num,
             rut, phone, center_name, center_address, signature_url, status, created_at
      FROM doctors
      WHERE LOWER(email) = ${user.email}
      LIMIT 1`;
    return NextResponse.json({ data: rows[0] ?? null });
  } catch (err) {
    return fail(err);
  }
}

/** Trim a string field, or null when the caller omits it (COALESCE keeps it). */
function optStr(v: unknown): string | null {
  return v === undefined ? null : String(v).trim();
}

export async function PUT(request: Request): Promise<NextResponse> {
  const user = await requireUser(request);
  if (!user) return unauthorized();
  if (!user.email) {
    return NextResponse.json({ error: "account has no email" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = optStr(body.name);
  const specialty = optStr(body.specialty);
  const bio = optStr(body.bio);
  const rut = optStr(body.rut);
  const licenseNum = optStr(body.license_num);
  const phone = optStr(body.phone);
  const centerName = optStr(body.center_name);
  const centerAddress = optStr(body.center_address);
  const signatureUrl = optStr(body.signature_url);
  const telemedicine =
    body.telemedicine === undefined ? null : Boolean(body.telemedicine);

  if (name !== null && name.length === 0) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }
  if (bio !== null && bio.length > 2000) {
    return NextResponse.json({ error: "bio too long (max 2000)" }, { status: 400 });
  }

  try {
    const sql = getDb();
    // COALESCE keeps a field untouched when the caller omits it, so the tab can
    // PATCH one field without sending the whole profile back. The row written is
    // always the caller's own — the WHERE is on the verified token email.
    const rows = await sql`
      UPDATE doctors SET
        name           = COALESCE(${name}, name),
        specialty      = COALESCE(${specialty}, specialty),
        bio            = COALESCE(${bio}, bio),
        telemedicine   = COALESCE(${telemedicine}, telemedicine),
        rut            = COALESCE(${rut}, rut),
        license_num    = COALESCE(${licenseNum}, license_num),
        phone          = COALESCE(${phone}, phone),
        center_name    = COALESCE(${centerName}, center_name),
        center_address = COALESCE(${centerAddress}, center_address),
        signature_url  = COALESCE(${signatureUrl}, signature_url),
        updated_at     = NOW()
      WHERE LOWER(email) = ${user.email}
      RETURNING id, name, email, specialty, bio, telemedicine, license_num,
                rut, phone, center_name, center_address, signature_url, status, created_at`;

    if (rows.length === 0) {
      // Not auto-created: a doctor exists only once an admin has registered them.
      return NextResponse.json({ error: "doctor not found" }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    return fail(err);
  }
}
