/**
 * GET    /api/appointments?doctorEmail=X   — list appointments for a doctor
 * GET    /api/appointments?patientEmail=X  — list appointments for a patient
 * POST   /api/appointments                 — create appointment
 * PATCH  /api/appointments                 — update status / notes
 * DELETE /api/appointments                 — delete appointment
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

async function ensureTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS appointments (
      id            SERIAL PRIMARY KEY,
      doctor_email  TEXT NOT NULL,
      patient_email TEXT NOT NULL,
      patient_name  TEXT NOT NULL DEFAULT '',
      date          DATE NOT NULL,
      time_slot     TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'Presencial',
      motivo        TEXT,
      notes         TEXT,
      status        TEXT NOT NULL DEFAULT 'scheduled',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const url = new URL(request.url);
  const doctorEmail  = url.searchParams.get("doctorEmail")?.toLowerCase()  ?? "";
  const patientEmail = url.searchParams.get("patientEmail")?.toLowerCase() ?? "";

  if (!doctorEmail && !patientEmail) {
    return NextResponse.json({ error: "doctorEmail or patientEmail required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    await ensureTable(sql);

    const rows = doctorEmail
      ? await sql`
          SELECT id, doctor_email, patient_email, patient_name, date, time_slot, type, motivo, notes, status, created_at
          FROM appointments
          WHERE doctor_email = ${doctorEmail}
          ORDER BY date ASC, time_slot ASC
        `
      : await sql`
          SELECT id, doctor_email, patient_email, patient_name, date, time_slot, type, motivo, notes, status, created_at
          FROM appointments
          WHERE patient_email = ${patientEmail}
          ORDER BY date ASC, time_slot ASC
        `;

    return NextResponse.json({ count: rows.length, appointments: rows });
  } catch (err) {
    console.error("[appointments GET]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// ── POST: create ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let body: {
    doctorEmail?: unknown; patientEmail?: unknown; patientName?: unknown;
    date?: unknown; timeSlot?: unknown; type?: unknown; motivo?: unknown; notes?: unknown;
  };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const doctorEmail  = String(body.doctorEmail  ?? "").trim().toLowerCase();
  const patientEmail = String(body.patientEmail ?? "").trim().toLowerCase();
  const patientName  = String(body.patientName  ?? "").trim();
  const date         = String(body.date         ?? "").trim();
  const timeSlot     = String(body.timeSlot     ?? "").trim();
  const type         = String(body.type         ?? "Presencial").trim();
  const motivo       = body.motivo ? String(body.motivo).trim() : null;
  const notes        = body.notes  ? String(body.notes).trim()  : null;

  if (!doctorEmail || !patientEmail || !date || !timeSlot) {
    return NextResponse.json({ error: "doctorEmail, patientEmail, date, timeSlot required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    await ensureTable(sql);
    const [row] = await sql`
      INSERT INTO appointments (doctor_email, patient_email, patient_name, date, time_slot, type, motivo, notes)
      VALUES (${doctorEmail}, ${patientEmail}, ${patientName}, ${date}, ${timeSlot}, ${type}, ${motivo}, ${notes})
      RETURNING *
    `;
    return NextResponse.json({ success: true, appointment: row }, { status: 201 });
  } catch (err) {
    // uniq_appt_slot (migrate.mjs) rejects a second booking for the same
    // doctor/date/time. Postgres raises 23505 (unique_violation); surface it as
    // a 409 with a clear message instead of a generic 500 the UI can't explain.
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json(
        { error: "Ese horario ya fue reservado. Elige otro." },
        { status: 409 },
      );
    }
    console.error("[appointments POST]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// ── PATCH: update ─────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  let body: { id?: unknown; status?: unknown; notes?: unknown; motivo?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const sql = getDb();
    await ensureTable(sql);
    if (body.status !== undefined) await sql`UPDATE appointments SET status = ${String(body.status)} WHERE id = ${id}`;
    if (body.notes  !== undefined) await sql`UPDATE appointments SET notes  = ${body.notes ? String(body.notes) : null} WHERE id = ${id}`;
    if (body.motivo !== undefined) await sql`UPDATE appointments SET motivo = ${body.motivo ? String(body.motivo) : null} WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[appointments PATCH]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  let body: { id?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const sql = getDb();
    await sql`DELETE FROM appointments WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[appointments DELETE]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
