/**
 * Treating-relationship authorization — the boundary that lets a doctor act on a
 * patient's record (structured antecedentes, exam documents) without a `?email=`
 * free-for-all. A doctor is "treating" a patient when they share an appointment
 * on which consent was granted (consent_mode set by /api/ficha/grant).
 *
 * Kept in one place so /api/doctor/patient-record and /api/ficha/document apply
 * the exact same rule instead of drifting their own copies.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser, authEnforced, unauthorized, forbidden } from "@/lib/auth/privy-auth";

/** True when `doctorEmail` has a consented appointment with `patientEmail`. */
export async function hasTreatingRelationship(
  doctorEmail: string,
  patientEmail: string,
): Promise<boolean> {
  const sql = getDb();
  const rows = await sql<{ n: number }>`
    SELECT COUNT(*)::int AS n
    FROM appointments
    WHERE LOWER(doctor_email)  = ${doctorEmail.toLowerCase()}
      AND LOWER(patient_email) = ${patientEmail.toLowerCase()}
      AND consent_mode IS NOT NULL`;
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Authorize a request to read/write `patientEmail`'s record. Allows the patient
 * themselves (token email matches) OR a treating doctor. In demo mode (no token,
 * enforcement off) it passes through so the flow scripts keep working.
 *
 *   - token == patient            → { patientEmail, actor: 'patient' }
 *   - treating doctor             → { patientEmail, actor: 'doctor', doctorEmail }
 *   - no token + enforced         → { error: 401 }
 *   - no token + demo             → { patientEmail, actor: 'demo' }
 *   - token, neither owner nor treating → { error: 403 }
 */
export async function resolveOwnerOrTreating(
  request: Request,
  patientEmailRaw: string | null | undefined,
): Promise<
  | { patientEmail: string; actor: "patient" | "doctor" | "demo"; doctorEmail: string | null }
  | { error: NextResponse }
> {
  const patientEmail = patientEmailRaw?.trim().toLowerCase() || "";
  if (!patientEmail) {
    return { error: NextResponse.json({ error: "patientEmail required" }, { status: 400 }) };
  }

  const user = await requireUser(request);

  if (!user?.email) {
    if (authEnforced()) return { error: unauthorized() };
    return { patientEmail, actor: "demo", doctorEmail: null };
  }

  if (user.email === patientEmail) {
    return { patientEmail, actor: "patient", doctorEmail: null };
  }

  if (await hasTreatingRelationship(user.email, patientEmail)) {
    return { patientEmail, actor: "doctor", doctorEmail: user.email };
  }

  return { error: forbidden() };
}
