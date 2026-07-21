/**
 * GET /api/doctor/prescriptions?doctorEmail=X
 * ---------------------------------------------------------------------------
 * A doctor's own issued prescriptions, read from the off-chain mirror
 * (`prescriptions_log`). The chain is the source of truth for a receta, but the
 * doctor portal needs a quick "what have I prescribed" list without scanning the
 * chain — so it reads the mirror written at mint time.
 *
 * Auth: a logged-in doctor may only see their own (resolveOwnerEmail); the param
 * is trusted only in demo mode.
 *
 * Response: { data: Prescription[] } shaped for the Recetas tab.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPO: Record<string, string> = { SIMPLE: "Simple", RETENIDA: "Retenida", MAGISTRAL: "Magistral" };

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const owner = await resolveOwnerEmail(request, searchParams.get("doctorEmail"));
  if ("error" in owner) return owner.error;
  const doctorEmail = owner.email;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, rx_id, tx_hash, mode, patient_name, patient_email,
             medication, dosage, quantity, prescription_type, created_at
      FROM prescriptions_log
      WHERE LOWER(doctor_email) = ${doctorEmail}
      ORDER BY created_at DESC
      LIMIT 200
    `.catch(() => []);

    const data = (rows as Array<Record<string, unknown>>).map((r) => {
      // dosage was stored as "concentración — posología" by the mint form.
      const dosage = String(r.dosage ?? "");
      const [concentracion, ...rest] = dosage.split(" — ");
      const posologia = rest.join(" — ") || (rest.length ? "" : dosage);
      return {
        id: `rx-${r.rx_id ?? r.id}`,
        patientName: (r.patient_name as string) || (r.patient_email as string) || "—",
        medication: (r.medication as string) ?? "",
        tipo: TIPO[String(r.prescription_type ?? "")] ?? "Simple",
        // Mirror doesn't track the dispense lifecycle; issued recetas show Activa.
        status: "Activa",
        concentracion: rest.length ? concentracion : "",
        posologia,
        mode: (r.mode as string) ?? "simulated",
        txHash: (r.tx_hash as string) ?? null,
        fecha: new Date(r.created_at as string).toISOString().slice(0, 10),
      };
    });

    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[GET /api/doctor/prescriptions]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
