/**
 * GET    /api/admin/doctors?token=X  — list doctors
 * POST   /api/admin/doctors           — create doctor
 * PATCH  /api/admin/doctors           — update / block doctor
 * DELETE /api/admin/doctors           — delete doctor
 */
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkToken(token: string | null) {
  const adminToken = process.env.WAITLIST_ADMIN_TOKEN;
  return adminToken && token === adminToken;
}

// ── GET: list all doctors ─────────────────────────────────────────────────────
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!checkToken(url.searchParams.get("token"))) return unauthorized();

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, email, specialty, license_num, rut, status, created_at
      FROM doctors
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ count: rows.length, doctors: rows });
  } catch (err) {
    console.error("[admin/doctors GET]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// ── POST: create doctor ───────────────────────────────────────────────────────
export async function POST(request: Request) {
  let body: { token?: unknown; name?: unknown; email?: unknown; specialty?: unknown; licenseNum?: unknown; rut?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!checkToken(String(body.token ?? ""))) return unauthorized();

  const name  = String(body.name  ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!name || !email) return NextResponse.json({ error: "name and email required" }, { status: 400 });

  const specialty  = body.specialty  ? String(body.specialty).trim()  : null;
  const licenseNum = body.licenseNum ? String(body.licenseNum).trim() : null;
  const rut        = body.rut        ? String(body.rut).trim()        : null;

  try {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO doctors (name, email, specialty, license_num, rut)
      VALUES (${name}, ${email}, ${specialty}, ${licenseNum}, ${rut})
      RETURNING id, name, email, specialty, license_num, rut, status, created_at
    `;
    return NextResponse.json({ success: true, doctor: row }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("unique")) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    console.error("[admin/doctors POST]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// ── PATCH: update / block ─────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  let body: { token?: unknown; id?: unknown; name?: unknown; email?: unknown; specialty?: unknown; licenseNum?: unknown; rut?: unknown; status?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!checkToken(String(body.token ?? ""))) return unauthorized();

  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const sql = getDb();
    if (body.name      !== undefined) await sql`UPDATE doctors SET name        = ${String(body.name).trim()} WHERE id = ${id}`;
    if (body.email     !== undefined) await sql`UPDATE doctors SET email       = ${String(body.email).trim().toLowerCase()} WHERE id = ${id}`;
    if (body.specialty !== undefined) await sql`UPDATE doctors SET specialty   = ${body.specialty ? String(body.specialty).trim() : null} WHERE id = ${id}`;
    if (body.licenseNum !== undefined) await sql`UPDATE doctors SET license_num = ${body.licenseNum ? String(body.licenseNum).trim() : null} WHERE id = ${id}`;
    if (body.rut       !== undefined) await sql`UPDATE doctors SET rut         = ${body.rut ? String(body.rut).trim() : null} WHERE id = ${id}`;
    if (body.status    !== undefined) await sql`UPDATE doctors SET status      = ${String(body.status)} WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/doctors PATCH]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// ── DELETE: remove doctor ─────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  let body: { token?: unknown; id?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!checkToken(String(body.token ?? ""))) return unauthorized();

  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const sql = getDb();
    await sql`DELETE FROM doctors WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/doctors DELETE]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
