/**
 * GET /api/admin/stats — dashboard summary
 * Query: ?token=WAITLIST_ADMIN_TOKEN
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

    const [waitlistTotal] = await sql`SELECT COUNT(*)::int AS count FROM waitlist`;
    const [usersTotal]    = await sql`SELECT COUNT(*)::int AS count FROM registered_users`;
    const [waitlistWeek]  = await sql`SELECT COUNT(*)::int AS count FROM waitlist WHERE created_at > NOW() - INTERVAL '7 days'`;
    const [usersWeek]     = await sql`SELECT COUNT(*)::int AS count FROM registered_users WHERE created_at > NOW() - INTERVAL '7 days'`;
    const [waitlistToday] = await sql`SELECT COUNT(*)::int AS count FROM waitlist WHERE created_at > NOW() - INTERVAL '1 day'`;
    const [doctorsTotal]  = await sql`SELECT COUNT(*)::int AS count FROM doctors WHERE status = 'active'`;
    const [doctorsAll]    = await sql`SELECT COUNT(*)::int AS count FROM doctors`;

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
      doctors: {
        active: (doctorsTotal as { count: number }).count,
        total: (doctorsAll as { count: number }).count,
      },
    });
  } catch (err) {
    console.error("[admin/stats]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
