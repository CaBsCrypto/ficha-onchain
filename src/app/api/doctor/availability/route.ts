/**
 * GET /api/doctor/availability?doctorEmail=X
 * PUT /api/doctor/availability
 * ---------------------------------------------------------------------------
 * The doctor's recurring weekly grid — "Mondays 09:00-13:00 and 15:00-18:00,
 * 30 minute slots". Repeats every week; one-off exceptions live in
 * doctor_time_off, and actual free slots are computed by /api/doctor/slots.
 *
 * GET → { data: Block[] }
 * PUT → { data: Block[] }   body: { doctorEmail, blocks: Block[] }
 *
 * Block: { weekday: 0-6 (0=Sunday), start_time: "09:00", end_time: "13:00",
 *          slot_minutes?: number }
 *
 * PUT replaces the whole grid rather than patching single blocks: the editor is
 * a weekly view the doctor saves as a unit, and replace-all avoids drifting
 * into a half-applied state if one row fails.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Block {
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function fail(err: unknown) {
  if (err instanceof DbNotConfiguredError) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  console.error("[doctor/availability]", err);
  return NextResponse.json({ error: "db_error" }, { status: 500 });
}

/** "09:00" → 540. Lets us compare and overlap-check times as plain integers. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Identity comes from the token when present; the param is only trusted in
  // demo mode. A logged-in doctor can only read their own grid.
  const owner = await resolveOwnerEmail(request, searchParams.get("doctorEmail"));
  if ("error" in owner) return owner.error;
  const doctorEmail = owner.email;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, weekday, TO_CHAR(start_time, 'HH24:MI') AS start_time,
             TO_CHAR(end_time, 'HH24:MI') AS end_time, slot_minutes
      FROM doctor_availability
      WHERE LOWER(doctor_email) = ${doctorEmail}
      ORDER BY weekday, start_time`;
    return NextResponse.json({ data: rows });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  let body: { doctorEmail?: string; blocks?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const owner = await resolveOwnerEmail(request, body.doctorEmail);
  if ("error" in owner) return owner.error;
  const doctorEmail = owner.email;
  if (!Array.isArray(body.blocks)) {
    return NextResponse.json({ error: "blocks must be an array" }, { status: 400 });
  }

  // ── Validate before touching the database ────────────────────────────────
  const blocks: Block[] = [];
  for (const [i, raw] of body.blocks.entries()) {
    const b = raw as Record<string, unknown>;
    const weekday = Number(b.weekday);
    const start_time = String(b.start_time ?? "");
    const end_time = String(b.end_time ?? "");
    const slot_minutes = b.slot_minutes === undefined ? 30 : Number(b.slot_minutes);

    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: `blocks[${i}]: weekday must be 0-6` }, { status: 400 });
    }
    if (!TIME_RE.test(start_time) || !TIME_RE.test(end_time)) {
      return NextResponse.json({ error: `blocks[${i}]: times must be HH:MM` }, { status: 400 });
    }
    if (toMinutes(end_time) <= toMinutes(start_time)) {
      return NextResponse.json({ error: `blocks[${i}]: end_time must be after start_time` }, { status: 400 });
    }
    if (!Number.isInteger(slot_minutes) || slot_minutes < 5 || slot_minutes > 240) {
      return NextResponse.json({ error: `blocks[${i}]: slot_minutes must be 5-240` }, { status: 400 });
    }
    blocks.push({ weekday, start_time, end_time, slot_minutes });
  }

  // Overlapping blocks on the same day would generate duplicate slots.
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.weekday !== b.weekday) continue;
      if (toMinutes(a.start_time) < toMinutes(b.end_time) && toMinutes(b.start_time) < toMinutes(a.end_time)) {
        return NextResponse.json(
          { error: `blocks ${i} and ${j} overlap on weekday ${a.weekday}` },
          { status: 400 },
        );
      }
    }
  }

  try {
    const sql = getDb();
    await sql`DELETE FROM doctor_availability WHERE LOWER(doctor_email) = ${doctorEmail}`;
    for (const b of blocks) {
      await sql`
        INSERT INTO doctor_availability (doctor_email, weekday, start_time, end_time, slot_minutes)
        VALUES (${doctorEmail}, ${b.weekday}, ${b.start_time}, ${b.end_time}, ${b.slot_minutes})`;
    }
    const rows = await sql`
      SELECT id, weekday, TO_CHAR(start_time, 'HH24:MI') AS start_time,
             TO_CHAR(end_time, 'HH24:MI') AS end_time, slot_minutes
      FROM doctor_availability
      WHERE LOWER(doctor_email) = ${doctorEmail}
      ORDER BY weekday, start_time`;
    return NextResponse.json({ data: rows });
  } catch (err) {
    return fail(err);
  }
}
