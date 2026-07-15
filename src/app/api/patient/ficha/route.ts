import { NextResponse } from "next/server";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<any, any>;

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

function getDb(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

async function ensureTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS patient_health_records (
      patient_email TEXT PRIMARY KEY,
      blood_type TEXT,
      height_cm TEXT,
      weight_kg TEXT,
      bmi TEXT,
      allergies JSONB DEFAULT '[]',
      conditions JSONB DEFAULT '[]',
      vaccinations JSONB DEFAULT '[]',
      primary_doctor TEXT,
      primary_doctor_specialty TEXT,
      notes TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const sql = getDb();
    await ensureTable(sql);

    const rows = (await sql`
      SELECT * FROM patient_health_records
      WHERE patient_email = ${email}
      LIMIT 1
    `) as HealthRecord[];

    return NextResponse.json({ data: rows[0] ?? null });
  } catch (err) {
    console.error("[GET /api/patient/ficha]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<HealthRecord> & {
      patient_email: string;
    };

    const {
      patient_email,
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

    if (!patient_email) {
      return NextResponse.json(
        { error: "patient_email is required" },
        { status: 400 }
      );
    }

    const sql = getDb();
    await ensureTable(sql);

    const allergiesJson = JSON.stringify(allergies);
    const conditionsJson = JSON.stringify(conditions);
    const vaccinationsJson = JSON.stringify(vaccinations);

    const [row] = (await sql`
      INSERT INTO patient_health_records (
        patient_email,
        blood_type,
        height_cm,
        weight_kg,
        bmi,
        allergies,
        conditions,
        vaccinations,
        primary_doctor,
        primary_doctor_specialty,
        notes,
        updated_at
      ) VALUES (
        ${patient_email},
        ${blood_type},
        ${height_cm},
        ${weight_kg},
        ${bmi},
        ${allergiesJson}::jsonb,
        ${conditionsJson}::jsonb,
        ${vaccinationsJson}::jsonb,
        ${primary_doctor},
        ${primary_doctor_specialty},
        ${notes},
        NOW()
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
      RETURNING *
    `) as Record<string, unknown>[];

    return NextResponse.json({ data: row });
  } catch (err) {
    console.error("[PATCH /api/patient/ficha]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
