/**
 * /api/licenses — CRUD para licencias médicas (reposo laboral)
 * ---------------------------------------------------------------------------
 * Tabla: medical_licenses
 *   id            SERIAL PRIMARY KEY
 *   doctor_email  TEXT NOT NULL
 *   patient_email TEXT
 *   patient_name  TEXT NOT NULL
 *   patient_rut   TEXT
 *   fecha_inicio  DATE NOT NULL
 *   dias          INTEGER NOT NULL
 *   cie10         TEXT NOT NULL
 *   tipo          TEXT NOT NULL   -- 'Enfermedad'|'Accidente'|'Maternidad'
 *   diagnostico   TEXT
 *   observaciones TEXT
 *   status        TEXT DEFAULT 'draft'  -- 'draft'|'signed'|'expired'
 *   tx_hash       TEXT    -- Stellar tx hash (null if draft)
 *   doc_hash      TEXT    -- SHA-256 content hash
 *   doc_id        INTEGER -- on-chain soulbound id
 *   mode          TEXT    -- 'onchain'|'simulated' (null if draft)
 *   created_at    TIMESTAMPTZ DEFAULT NOW()
 *
 * GET    /api/licenses?doctorEmail=X          → list for doctor
 * GET    /api/licenses?patientEmail=X         → list for patient
 * POST   /api/licenses                        → create draft
 * PATCH  /api/licenses                        → update (sign result)
 * DELETE /api/licenses?id=N&token=ADMIN_TOKEN → hard delete (admin)
 */

import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { resolveOwnerEmail, requireActor } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doctorParam  = searchParams.get("doctorEmail")?.trim().toLowerCase();
  const patientParam = searchParams.get("patientEmail")?.trim().toLowerCase();

  if (!doctorParam && !patientParam) {
    return NextResponse.json({ error: "doctorEmail or patientEmail required" }, { status: 400 });
  }

  // Licenses carry diagnosis + RUT — the caller may only list their own, as the
  // doctor or the patient named. Param trusted only in demo mode.
  const owner = await resolveOwnerEmail(request, doctorParam || patientParam);
  if ("error" in owner) return owner.error;
  const doctorEmail  = doctorParam  ? owner.email : undefined;
  const patientEmail = patientParam ? owner.email : undefined;

  try {
    const sql = getDb();

    const rows = doctorEmail
      ? await sql`
          SELECT * FROM medical_licenses
          WHERE LOWER(doctor_email) = ${doctorEmail}
          ORDER BY created_at DESC
          LIMIT 200
        `
      : await sql`
          SELECT * FROM medical_licenses
          WHERE LOWER(patient_email) = ${patientEmail!}
          ORDER BY created_at DESC
          LIMIT 200
        `;

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[licenses GET]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────
interface CreateBody {
  doctor_email:  string;
  patient_email?: string;
  patient_name:  string;
  patient_rut?:  string;
  fecha_inicio:  string;
  dias:          number;
  cie10:         string;
  tipo:          string;
  diagnostico?:  string;
  observaciones?: string;
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = await request.json() as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { doctor_email, patient_name, fecha_inicio, dias, cie10, tipo } = body;
  if (!doctor_email || !patient_name || !fecha_inicio || !dias || !cie10 || !tipo) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  // Issuing a license is a doctor action — the caller must be that doctor.
  const actor = await requireActor(request, [doctor_email]);
  if ("error" in actor) return actor.error;

  try {
    const sql = getDb();

    const [row] = (await sql`
      INSERT INTO medical_licenses
        (doctor_email, patient_email, patient_name, patient_rut,
         fecha_inicio, dias, cie10, tipo, diagnostico, observaciones)
      VALUES (
        ${doctor_email.toLowerCase()},
        ${body.patient_email?.toLowerCase() ?? null},
        ${patient_name},
        ${body.patient_rut ?? null},
        ${fecha_inicio},
        ${dias},
        ${cie10},
        ${tipo},
        ${body.diagnostico ?? null},
        ${body.observaciones ?? null}
      )
      RETURNING *
    `) as Record<string, unknown>[];

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    console.error("[licenses POST]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

// ── PATCH — update after signing ──────────────────────────────────────────────
interface PatchBody {
  id:       number;
  status:   string;
  tx_hash?: string;
  doc_hash?: string;
  doc_id?:  number | null;
  mode?:    string;
}

export async function PATCH(request: Request) {
  let body: PatchBody;
  try {
    body = await request.json() as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const sql = getDb();

    const [updated] = (await sql`
      UPDATE medical_licenses
      SET
        status   = ${body.status},
        tx_hash  = ${body.tx_hash  ?? null},
        doc_hash = ${body.doc_hash ?? null},
        doc_id   = ${body.doc_id   ?? null},
        mode     = ${body.mode     ?? null}
      WHERE id = ${body.id}
      RETURNING *
    `) as Record<string, unknown>[];

    if (!updated) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[licenses PATCH]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

// ── DELETE (admin) ────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id    = searchParams.get("id");
  const token = searchParams.get("token");

  if (token !== process.env.WAITLIST_ADMIN_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    await sql`DELETE FROM medical_licenses WHERE id = ${Number(id)}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[licenses DELETE]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
