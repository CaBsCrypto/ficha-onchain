/**
 * GET  /api/admin/users?token=X  — list registered users
 * POST /api/admin/users           — track user login (called from client on auth)
 */
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT privy_id, email, wallet, created_at
      FROM registered_users
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ count: rows.length, users: rows });
  } catch (err) {
    console.error("[admin/users GET]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { privyId?: unknown; email?: unknown; wallet?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const privyId = String(body.privyId ?? "").trim();
  if (!privyId) return NextResponse.json({ error: "privyId required" }, { status: 400 });

  const email  = body.email  ? String(body.email).trim().toLowerCase()  : null;
  const wallet = body.wallet ? String(body.wallet).trim()               : null;

  try {
    const sql = getDb();
    await sql`
      INSERT INTO registered_users (privy_id, email, wallet)
      VALUES (${privyId}, ${email}, ${wallet})
      ON CONFLICT (privy_id) DO UPDATE
        SET email  = EXCLUDED.email,
            wallet = EXCLUDED.wallet
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/users POST]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users  — update email or wallet for a user (admin only)
 * Body: { token, privyId, email?, wallet? }
 */
export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: { privyId?: unknown; email?: unknown; wallet?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const privyId = String(body.privyId ?? "").trim();
  if (!privyId) return NextResponse.json({ error: "privyId required" }, { status: 400 });

  try {
    const sql = getDb();
    if (body.email !== undefined) {
      const email = body.email ? String(body.email).trim().toLowerCase() : null;
      await sql`UPDATE registered_users SET email = ${email} WHERE privy_id = ${privyId}`;
    }
    if (body.wallet !== undefined) {
      const wallet = body.wallet ? String(body.wallet).trim() : null;
      await sql`UPDATE registered_users SET wallet = ${wallet} WHERE privy_id = ${privyId}`;
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/users PATCH]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users  — remove a user from registered_users (admin only)
 * Body: { token, privyId }
 */
export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: { privyId?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const privyId = String(body.privyId ?? "").trim();
  if (!privyId) return NextResponse.json({ error: "privyId required" }, { status: 400 });

  try {
    const sql = getDb();
    await sql`DELETE FROM registered_users WHERE privy_id = ${privyId}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/users DELETE]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
