/**
 * /api/pain-diary
 *
 * GET  ?privyId=X&days=30   → last N days of entries for user
 * POST { privyId, date, entries } → upsert a day's pain entries
 *
 * Auth: caller must be authenticated (privyId from client, no extra secret needed
 * because the data is per-user and non-sensitive health info).
 */
import { getDb, type Sql } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS pain_diary (
      id         SERIAL PRIMARY KEY,
      privy_id   TEXT NOT NULL,
      date       TEXT NOT NULL,
      entries    JSONB NOT NULL DEFAULT '[]',
      saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (privy_id, date)
    )
  `;
}

export async function GET(request: Request) {
  const url  = new URL(request.url);
  const privyId = url.searchParams.get("privyId");
  const days = Math.min(parseInt(url.searchParams.get("days") ?? "90"), 365);

  if (!privyId) return NextResponse.json({ error: "privyId required" }, { status: 400 });

  try {
    const sql = getDb();
    await ensureTable(sql);
    const rows = await sql`
      SELECT date, entries, saved_at
      FROM pain_diary
      WHERE privy_id = ${privyId}
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

  const privyId = String(body.privyId ?? "").trim();
  const date    = String(body.date ?? "").trim();
  const entries = body.entries;

  if (!privyId || !date || !Array.isArray(entries)) {
    return NextResponse.json({ error: "privyId, date, and entries[] required" }, { status: 400 });
  }

  // Basic date format check YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
    const sql = getDb();
    await ensureTable(sql);
    await sql`
      INSERT INTO pain_diary (privy_id, date, entries, saved_at)
      VALUES (${privyId}, ${date}, ${JSON.stringify(entries)}, NOW())
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
