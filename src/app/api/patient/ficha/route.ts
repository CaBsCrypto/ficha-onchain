/**
 * GET   /api/patient/ficha        — the caller's own health record
 * PATCH /api/patient/ficha        — update it
 *
 * The record is the patient's: blood type, allergies, chronic conditions,
 * vaccination history, clinical notes.
 *
 * Identity comes from the caller's verified Privy token, never from a
 * parameter. This route used to take `?email=` and trust it, so anyone who
 * could guess an address read the full record — and PATCH let them overwrite
 * someone else's allergy list, which is a patient-safety problem, not just a
 * privacy one.
 *
 * There is deliberately no way to ask for someone else's record. Doctors will
 * need patient records eventually; that needs a treating-relationship check,
 * and bolting it on here as a parameter would reopen exactly the hole this
 * closes.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthRecord {
  patient_email: string;
  blood_type: string | null;
  height_cm: string | null;
  weight_kg: string | null;
  bmi: string | null;
  allergies: string[];
  conditions: { label: string; since?: string; controlled?: boolean }[];
  vaccinations: { name: string; date: string }[];
  primary_doctor: string | null;
  primary_doctor_specialty: string | null;
  notes: string | null;
  updated_at: string;
}

function fail(err: unknown, where: string) {
  if (err instanceof DbNotConfiguredError) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  console.error(`[${where} /api/patient/ficha]`, err);
  return NextResponse.json({ error: "db_error" }, { status: 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await requireUser(request);
  if (!user) return unauthorized();
  if (!user.email) {
    return NextResponse.json({ error: "account has no email" }, { status: 403 });
  }

  try {
    const sql = getDb();
    const rows = await sql<HealthRecord>`
      SELECT * FROM patient_health_records
      WHERE LOWER(patient_email) = ${user.email}
      LIMIT 1`;
    return NextResponse.json({ data: rows[0] ?? null });
  } catch (err) {
    return fail(err, "GET");
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await requireUser(request);
  if (!user) return unauthorized();
  if (!user.email) {
    return NextResponse.json({ error: "account has no email" }, { status: 403 });
  }

  let body: Partial<HealthRecord>;
  try {
    body = (await request.json()) as Partial<HealthRecord>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const {
    blood_type = null,
    height_cm = null,
    weight_kg = null,
    bmi = null,
    allergies = [] as string[],
    conditions = [] as { label: string; since?: string; controlled?: boolean }[],
    vaccinations = [] as { name: string; date: string }[],
    primary_doctor = null,
    primary_doctor_specialty = null,
    notes = null,
  } = body;

  // patient_email is ignored if sent: the row written is always the caller's.
  const email = user.email;

  try {
    const sql = getDb();
    const rows = await sql<HealthRecord>`
      INSERT INTO patient_health_records (
        patient_email, blood_type, height_cm, weight_kg, bmi,
        allergies, conditions, vaccinations,
        primary_doctor, primary_doctor_specialty, notes, updated_at
      ) VALUES (
        ${email}, ${blood_type}, ${height_cm}, ${weight_kg}, ${bmi},
        ${JSON.stringify(allergies)}::jsonb,
        ${JSON.stringify(conditions)}::jsonb,
        ${JSON.stringify(vaccinations)}::jsonb,
        ${primary_doctor}, ${primary_doctor_specialty}, ${notes}, NOW()
      )
      ON CONFLICT (patient_email) DO UPDATE SET
        blood_type = EXCLUDED.blood_type,
        height_cm = EXCLUDED.height_cm,
        weight_kg = EXCLUDED.weight_kg,
        bmi = EXCLUDED.bmi,
        allergies = EXCLUDED.allergies,
        conditions = EXCLUDED.conditions,
        vaccinations = EXCLUDED.vaccinations,
        primary_doctor = EXCLUDED.primary_doctor,
        primary_doctor_specialty = EXCLUDED.primary_doctor_specialty,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *`;
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    return fail(err, "PATCH");
  }
}
