/**
 * GET   /api/doctor/patient-record?patientEmail=X — read a patient's structured
 *                                                   antecedentes (vitals, allergies,
 *                                                   chronic conditions).
 * PATCH /api/doctor/patient-record                 — a treating doctor updates them.
 * ---------------------------------------------------------------------------
 * The patient's own /api/patient/ficha is deliberately self-only. This is the
 * doctor-side counterpart, gated by a TREATING RELATIONSHIP rather than a param:
 * the caller (a logged-in doctor) may only touch the record of a patient they
 * have an appointment with WHERE consent was granted (consent_mode set by
 * /api/ficha/grant). Without that consent row, the doctor gets 403 — the same
 * boundary the on-chain ficha append enforces.
 *
 * Only the clinical summary fields are writable here (blood_type, height_cm,
 * weight_kg, bmi, allergies, conditions). Identity fields (name, RUT, phone…)
 * remain the patient's to edit and are never clobbered by this route.
 *
 * In demo mode (no token, enforcement off) the treating check passes through so
 * the flow scripts keep working; with a token it is enforced.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { resolveOwnerOrTreating } from "@/lib/auth/treating";
import { CONTRACT_IDS, STELLAR_EXPERT_TX } from "@/lib/stellar/config";
import { appendClinicalEntry, getDemoDoctorSecret } from "@/lib/stellar/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve + authorise the treating relationship. This route is doctor-facing,
 * but resolveOwnerOrTreating also allows the patient themselves — harmless here,
 * since the patient editing their own record is exactly what /api/patient/ficha
 * already permits.
 */
async function gate(
  request: Request,
  patientEmailRaw: string | null,
): Promise<{ patientEmail: string; doctorEmail: string | null } | { error: NextResponse }> {
  const r = await resolveOwnerOrTreating(request, patientEmailRaw);
  if ("error" in r) return r;
  return { patientEmail: r.patientEmail, doctorEmail: r.doctorEmail };
}

export async function GET(request: Request): Promise<NextResponse> {
  const g = await gate(request, new URL(request.url).searchParams.get("patientEmail"));
  if ("error" in g) return g.error;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT patient_email, full_name, blood_type, height_cm, weight_kg, bmi,
             allergies, conditions, vaccinations, updated_at
      FROM patient_health_records
      WHERE LOWER(patient_email) = ${g.patientEmail}
      LIMIT 1`;
    return NextResponse.json({ data: rows[0] ?? null });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[GET /api/doctor/patient-record]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

interface PatchBody {
  patientEmail?: string;
  blood_type?: string | null;
  height_cm?: string | null;
  weight_kg?: string | null;
  allergies?: string[];
  conditions?: { label: string; controlled?: boolean }[];
}

/** BMI from height (cm) + weight (kg), rounded to one decimal, or null. */
function computeBmi(heightCm: string | null, weightKg: string | null): string | null {
  const h = parseFloat(String(heightCm ?? "")) / 100;
  const w = parseFloat(String(weightKg ?? ""));
  if (!(h > 0) || !(w > 0)) return null;
  return (w / (h * h)).toFixed(1);
}

export async function PATCH(request: Request): Promise<NextResponse> {
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const g = await gate(request, body.patientEmail ?? null);
  if ("error" in g) return g.error;

  const blood_type = body.blood_type?.trim() || null;
  const height_cm  = body.height_cm?.trim() || null;
  const weight_kg  = body.weight_kg?.trim() || null;
  const bmi        = computeBmi(height_cm, weight_kg);
  const allergies  = Array.isArray(body.allergies) ? body.allergies : [];
  const conditions = Array.isArray(body.conditions) ? body.conditions : [];

  try {
    const sql = getDb();
    // Vitals COALESCE so a partial update never nulls an existing value; the
    // list fields (allergies/conditions) replace, since the editor sends the
    // full intended list. Identity columns are untouched.
    const rows = await sql`
      INSERT INTO patient_health_records
        (patient_email, blood_type, height_cm, weight_kg, bmi, allergies, conditions, updated_at)
      VALUES (
        ${g.patientEmail}, ${blood_type}, ${height_cm}, ${weight_kg}, ${bmi},
        ${JSON.stringify(allergies)}::jsonb, ${JSON.stringify(conditions)}::jsonb, NOW()
      )
      ON CONFLICT (patient_email) DO UPDATE SET
        blood_type = COALESCE(EXCLUDED.blood_type, patient_health_records.blood_type),
        height_cm  = COALESCE(EXCLUDED.height_cm,  patient_health_records.height_cm),
        weight_kg  = COALESCE(EXCLUDED.weight_kg,  patient_health_records.weight_kg),
        bmi        = COALESCE(EXCLUDED.bmi,         patient_health_records.bmi),
        allergies  = EXCLUDED.allergies,
        conditions = EXCLUDED.conditions,
        updated_at = NOW()
      RETURNING patient_email, blood_type, height_cm, weight_kg, bmi, allergies, conditions, updated_at`;

    // Anchor the antecedentes on-chain — the hash of the just-saved structured
    // record is appended to the patient's ClinicalRecord (same contract, signer
    // and doctor write-grant as the ficha). Only the 32-byte hash touches the
    // chain; the record itself stays off-chain. Best-effort: a chain failure
    // degrades to mode:"simulated" and never fails the save.
    const saved = rows[0] as Record<string, unknown>;
    const canonical = JSON.stringify({
      kind: "Antecedentes",
      patientEmail: g.patientEmail,
      blood_type: saved.blood_type ?? null,
      height_cm: saved.height_cm ?? null,
      weight_kg: saved.weight_kg ?? null,
      bmi: saved.bmi ?? null,
      allergies: saved.allergies ?? [],
      conditions: saved.conditions ?? [],
    });
    const contentHash = createHash("sha256").update(canonical).digest();
    let mode: "onchain" | "simulated" = "simulated";
    let txHash: string | null = null;
    const doctorSecret = getDemoDoctorSecret();
    if (doctorSecret) {
      try {
        const res = await appendClinicalEntry({
          doctorSecret,
          contractId: CONTRACT_IDS.clinicalRecordDemo,
          kind: "Antecedentes",
          contentHash,
        });
        if (res.status === "SUCCESS") { mode = "onchain"; txHash = res.hash; }
      } catch (err) {
        console.error("[patient-record] anchor", err);
      }
    }
    await sql`
      UPDATE patient_health_records
      SET content_hash = ${contentHash.toString("hex")}, tx_hash = ${txHash}, mode = ${mode}
      WHERE patient_email = ${g.patientEmail}`;

    return NextResponse.json({
      data: saved,
      anchor: { mode, hash: txHash, contentHash: contentHash.toString("hex"),
                explorer: txHash ? STELLAR_EXPERT_TX(txHash) : null },
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[PATCH /api/doctor/patient-record]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
