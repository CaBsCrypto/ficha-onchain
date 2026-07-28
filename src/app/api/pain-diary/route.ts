/**
 * /api/pain-diary — the patient's pain diary. OWNER-ONLY.
 *
 * GET  ?days=30           → last N days of the CALLER's entries
 * POST { date, entries }  → upsert a day of the CALLER's diary
 *
 * The owner is resolved from the verified Privy token — never from the client.
 * The previous version took `privyId` as a plain parameter and its header
 * comment claimed the data was "non-sensitive health info": anyone who knew or
 * guessed a privyId could read and WRITE someone else's pain history. A pain
 * diary is precisely sensitive health data (Ley 19.628), and a fabricated
 * entry in it can steer a clinical decision.
 *
 * Demo mode (auth not enforced): a client-supplied privyId is still accepted so
 * local flow tests and scripts/seed-pain-journey.mjs keep working — the same
 * enforcement pattern as every other guarded route. With a token present, the
 * client-supplied id is IGNORED, not cross-checked: the token IS the identity.
 */
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireUser, authEnforced, unauthorized } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve the diary's owner: token first, demo fallback, else null (→ 401). */
async function resolveOwner(request: Request, claimed: string | null): Promise<string | null> {
  const user = await requireUser(request);
  if (user) return user.userId;
  if (!authEnforced() && claimed) return claimed;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(parseInt(url.searchParams.get("days") ?? "90"), 365);
  const owner = await resolveOwner(request, url.searchParams.get("privyId"));
  if (!owner) return unauthorized();

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT date, entries, saved_at
      FROM pain_diary
      WHERE privy_id = ${owner}
        AND date >= (CURRENT_DATE - INTERVAL '1 day' * ${days})::text
      ORDER BY date DESC
    `;
    return NextResponse.json({ days: rows });
  } catch (err) {
    console.error("[pain-diary GET]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { privyId?: unknown; date?: unknown; entries?: unknown };
  try { body = (await request.json()) as typeof body; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const claimed = String(body.privyId ?? "").trim() || null;
  const owner = await resolveOwner(request, claimed);
  if (!owner) return unauthorized();

  const date = String(body.date ?? "").trim();
  const entries = body.entries;
  if (!date || !Array.isArray(entries)) {
    return NextResponse.json({ error: "date and entries[] required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
    const sql = getDb();
    await sql`
      INSERT INTO pain_diary (privy_id, date, entries, saved_at)
      VALUES (${owner}, ${date}, ${JSON.stringify(entries)}, NOW())
      ON CONFLICT (privy_id, date) DO UPDATE
        SET entries  = EXCLUDED.entries,
            saved_at = NOW()
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pain-diary POST]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
