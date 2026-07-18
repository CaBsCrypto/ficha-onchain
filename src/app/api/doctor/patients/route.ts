/**
 * GET /api/doctor/patients?doctorEmail=X
 * ---------------------------------------------------------------------------
 * Returns a deduplicated list of patients who have interacted with this doctor,
 * aggregated from three tables:
 *   - appointments      (doctor_email, patient_email, patient_name)
 *   - medical_licenses  (doctor_email, patient_email, patient_name)
 *   - (future: prescriptions table once it exists)
 *
 * Response: { data: PatientSummary[] }
 *
 * PatientSummary: {
 *   patient_email: string | null
 *   patient_name:  string
 *   last_seen:     string   — ISO timestamp of most recent interaction
 *   appt_count:    number
 *   rx_count:      number   — prescriptions (licencias médicas)
 *   lic_count:     number   — licencias médicas
 * }
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sql = NeonQueryFunction<any, any>;

function getDb(): Sql {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // A doctor's patient roster is PII; a logged-in doctor may only see their own.
  // The param is trusted only in demo mode (no token, enforcement off).
  const owner = await resolveOwnerEmail(request, searchParams.get("doctorEmail"));
  if ("error" in owner) return owner.error;
  const doctorEmail = owner.email;

  try {
    const sql = getDb();

    // Aggregate from appointments
    const apptRows = (await sql`
      SELECT
        LOWER(patient_email) AS patient_email,
        patient_name,
        COUNT(*)::int         AS appt_count,
        MAX(created_at)       AS last_seen
      FROM appointments
      WHERE LOWER(doctor_email) = ${doctorEmail}
        AND patient_name IS NOT NULL
      GROUP BY LOWER(patient_email), patient_name
    `) as Array<{
      patient_email: string | null;
      patient_name: string;
      appt_count: number;
      last_seen: string;
    }>;

    // Aggregate from medical_licenses
    const licRows = (await sql`
      SELECT
        LOWER(patient_email) AS patient_email,
        patient_name,
        COUNT(*)::int         AS lic_count,
        MAX(created_at)       AS last_seen
      FROM medical_licenses
      WHERE LOWER(doctor_email) = ${doctorEmail}
        AND patient_name IS NOT NULL
      GROUP BY LOWER(patient_email), patient_name
    `.catch(() => [])) as Array<{
      patient_email: string | null;
      patient_name: string;
      lic_count: number;
      last_seen: string;
    }>;

    // Merge: key = lower(patient_email) ?? patient_name
    const map = new Map<string, {
      patient_email: string | null;
      patient_name: string;
      last_seen: string;
      appt_count: number;
      lic_count: number;
    }>();

    for (const r of apptRows) {
      const key = r.patient_email ?? r.patient_name.toLowerCase();
      map.set(key, {
        patient_email: r.patient_email,
        patient_name: r.patient_name,
        last_seen: r.last_seen,
        appt_count: r.appt_count,
        lic_count: 0,
      });
    }

    for (const r of licRows) {
      const key = r.patient_email ?? r.patient_name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.lic_count = r.lic_count;
        if (r.last_seen > existing.last_seen) existing.last_seen = r.last_seen;
      } else {
        map.set(key, {
          patient_email: r.patient_email,
          patient_name: r.patient_name,
          last_seen: r.last_seen,
          appt_count: 0,
          lic_count: r.lic_count,
        });
      }
    }

    // Sort by last_seen desc
    const patients = [...map.values()].sort(
      (a, b) => b.last_seen.localeCompare(a.last_seen),
    );

    return NextResponse.json({ data: patients });
  } catch (err) {
    console.error("[doctor/patients GET]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
