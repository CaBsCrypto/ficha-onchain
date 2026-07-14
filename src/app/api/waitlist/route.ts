/**
 * POST /api/waitlist — join the launch waitlist.
 * ---------------------------------------------------------------------------
 * Persists signups to Neon Postgres (Vercel Storage). The DATABASE_URL env
 * var is injected automatically by Vercel when a Neon database is linked to
 * the project (Storage → Connect Database).
 *
 * The table is created on first request if it doesn't exist (idempotent).
 *
 * Body (JSON): { email: string, role?: "doctor" | "patient" }
 * Responses:
 *   200 { success: true, alreadyRegistered?: true }
 *   400 { error }   — malformed / missing email
 *   500 { error }   — database error
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = NeonQueryFunction<any, any>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;

function getDb() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Link a Neon database in Vercel → Storage.");
  return neon(url);
}

async function ensureTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
      id         SERIAL PRIMARY KEY,
      email      TEXT    NOT NULL UNIQUE,
      role       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function POST(request: Request) {
  let body: { email?: unknown; role?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const role =
    body.role === "doctor" || body.role === "patient" ? body.role : null;

  try {
    const sql = getDb();
    await ensureTable(sql);

    await sql`
      INSERT INTO waitlist (email, role)
      VALUES (${email}, ${role})
      ON CONFLICT (email) DO NOTHING
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[waitlist] db error:", err);
    return NextResponse.json({ error: "Could not save your signup" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  // Simple admin endpoint — list all signups.
  // Protect with a secret token: GET /api/waitlist?token=<WAITLIST_ADMIN_TOKEN>
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const adminToken = process.env.WAITLIST_ADMIN_TOKEN;

  if (!adminToken || token !== adminToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = getDb();
    await ensureTable(sql);
    const rows = await sql`SELECT email, role, created_at FROM waitlist ORDER BY created_at DESC`;
    return NextResponse.json({ count: rows.length, signups: rows });
  } catch (err) {
    console.error("[waitlist] db error:", err);
    return NextResponse.json({ error: "Could not fetch signups" }, { status: 500 });
  }
}
