/**
 * GET /api/doctor/slots?doctorEmail=X&date=YYYY-MM-DD
 * ---------------------------------------------------------------------------
 * What the patient actually sees: the bookable times for one doctor on one day.
 *
 * Computed, never stored:
 *
 *   weekly grid (doctor_availability)
 *     − days off        (doctor_time_off)
 *     − taken slots     (appointments, excluding cancelled)
 *     − times in the past
 *     = free slots
 *
 * Deriving this instead of persisting a slot table means a doctor editing their
 * grid can never leave stale bookable times behind.
 *
 * → { data: { date, weekday, slot_minutes, slots: Slot[], time_off: string|null } }
 *   Slot: { time: "09:30", available: boolean, patient_name?: string }
 *
 * Passing ?all=1 also returns taken slots (available:false) — the doctor's own
 * agenda view. Patients get free ones only.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(err: unknown) {
  if (err instanceof DbNotConfiguredError) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  console.error("[doctor/slots]", err);
  return NextResponse.json({ error: "db_error" }, { status: 500 });
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doctorEmail = searchParams.get("doctorEmail")?.trim().toLowerCase();
  const date = searchParams.get("date")?.trim();
  const includeTaken = searchParams.get("all") === "1";

  if (!doctorEmail) {
    return NextResponse.json({ error: "doctorEmail required" }, { status: 400 });
  }
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  }

  // Parse as UTC noon: constructing from the plain string would shift the day
  // backwards for negative-offset timezones and give the wrong weekday.
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }
  const weekday = parsed.getUTCDay(); // 0=Sunday, matches doctor_availability

  try {
    const sql = getDb();

    const [blocks, timeOff, taken] = await Promise.all([
      sql`SELECT TO_CHAR(start_time, 'HH24:MI') AS start_time,
                 TO_CHAR(end_time,   'HH24:MI') AS end_time, slot_minutes
          FROM doctor_availability
          WHERE LOWER(doctor_email) = ${doctorEmail} AND weekday = ${weekday}
          ORDER BY start_time`,
      sql`SELECT reason FROM doctor_time_off
          WHERE LOWER(doctor_email) = ${doctorEmail} AND date = ${date}
          LIMIT 1`,
      sql`SELECT time_slot, patient_name FROM appointments
          WHERE LOWER(doctor_email) = ${doctorEmail} AND date = ${date}
            AND status <> 'cancelled'`,
    ]);

    // A day off short-circuits the whole grid.
    if (timeOff.length > 0) {
      return NextResponse.json({
        data: {
          date, weekday, slot_minutes: null, slots: [],
          time_off: (timeOff[0].reason as string) ?? "No disponible",
        },
      });
    }

    const takenBy = new Map<string, string>();
    for (const r of taken) {
      takenBy.set(r.time_slot as string, (r.patient_name as string) || "Reservado");
    }

    const nowMin = (() => {
      const today = new Date().toISOString().slice(0, 10);
      if (date > today) return -1;          // future day: nothing is past
      if (date < today) return 24 * 60 + 1; // past day: everything is
      const n = new Date();
      return n.getHours() * 60 + n.getMinutes();
    })();

    const slots: Array<{ time: string; available: boolean; patient_name?: string }> = [];
    let slotMinutes: number | null = null;

    for (const b of blocks) {
      const step = Number(b.slot_minutes);
      slotMinutes ??= step;
      const end = toMinutes(b.end_time as string);
      // Only whole slots that finish inside the block: a 30-min slot must not
      // spill past 13:00 just because the block started at 12:45.
      for (let t = toMinutes(b.start_time as string); t + step <= end; t += step) {
        const time = toHHMM(t);
        const isTaken = takenBy.has(time);
        if (t < nowMin) continue; // already gone
        if (isTaken && !includeTaken) continue;
        slots.push(
          isTaken
            ? { time, available: false, patient_name: takenBy.get(time) }
            : { time, available: true },
        );
      }
    }

    return NextResponse.json({
      data: { date, weekday, slot_minutes: slotMinutes, slots, time_off: null },
    });
  } catch (err) {
    return fail(err);
  }
}
