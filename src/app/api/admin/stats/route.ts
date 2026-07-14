/**
 * GET /api/admin/stats — dashboard summary
 * Query: ?token=WAITLIST_ADMIN_TOKEN
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = NeonQueryFunction<any, any>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDb() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return neon(url);
}

async function ensureTables(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL UNIQUE,
      role       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS registered_users (
      id         SERIAL PRIMARY KEY,
      privy_id   TEXT NOT NULL UNIQUE,
      email      TEXT,
      wallet     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const adminToken = process.env.WAITLIST_ADMIN_TOKEN;
  if (!adminToken || token !== adminToken) return unauthorized();

  try {
    const sql = getDb();
    await ensureTables(sql);

    const [waitlistTotal] = await sql`SELECT COUNT(*)::int AS count FROM waitlist`;
    const [usersTotal]    = await sql`SELECT COUNT(*)::int AS count FROM registered_users`;
    const [waitlistWeek]  = await sql`SELECT COUNT(*)::int AS count FROM waitlist WHERE created_at > NOW() - INTERVAL '7 days'`;
    const [usersWeek]     = await sql`SELECT COUNT(*)::int AS count FROM registered_users WHERE created_at > NOW() - INTERVAL '7 days'`;
    const [waitlistToday] = await sql`SELECT COUNT(*)::int AS count FROM waitlist WHERE created_at > NOW() - INTERVAL '1 day'`;

    return NextResponse.json({
      waitlist: {
        total: (waitlistTotal as { count: number }).count,
        thisWeek: (waitlistWeek as { count: number }).count,
        today: (waitlistToday as { count: number }).count,
      },
      users: {
        total: (usersTotal as { count: number }).count,
        thisWeek: (usersWeek as { count: number }).count,
      },
    });
  } catch (err) {
    console.error("[admin/stats]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
