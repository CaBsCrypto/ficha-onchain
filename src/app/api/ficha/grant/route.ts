/**
 * POST /api/ficha/grant — the patient authorizes their doctor to write their
 * on-chain ficha, tied to the "start consultation" event of a booking.
 * ---------------------------------------------------------------------------
 * One call from the "Iniciar consulta" button:
 *   1. Verifies the caller owns the appointment (patient of the row).
 *   2. Resolves the doctor's wallet (the grantee that will sign append_entry).
 *   3. If a signer is configured, performs a REAL, gasless grant_write_access on
 *      the patient's ClinicalRecord — signed by the OWNER (the patient), so the
 *      demo signs with DEMO_PATIENT_SECRET (the demo record's owner key), the
 *      relayer fee-bumps. Otherwise returns mode:"simulated" with the reason.
 *   4. Marks the appointment 'in_progress' and records the consent.
 *
 * Body: { appointmentId: number, patientEmail: string }
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { CONTRACT_IDS, STELLAR_EXPERT_TX, isStellarAddress } from "@/lib/stellar/config";
import { grantWriteAccess, getDemoPatientSecret } from "@/lib/stellar/server";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { appointmentId?: unknown; patientEmail?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const appointmentId = Number(body.appointmentId);
  if (!appointmentId) {
    return NextResponse.json({ error: "appointmentId required" }, { status: 400 });
  }

  // Identity: the patient acts on their own ficha. Closes the IDOR where anyone
  // could grant access on someone else's record by swapping patientEmail.
  const owner = await resolveOwnerEmail(request, String(body.patientEmail ?? ""));
  if ("error" in owner) return owner.error;

  try {
    const sql = getDb();

    // The appointment must exist and belong to the resolved patient.
    const [appt] = await sql`
      SELECT id, doctor_email, patient_email, status
      FROM appointments WHERE id = ${appointmentId}`;
    if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (String(appt.patient_email).toLowerCase() !== owner.email) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // Only a scheduled consultation can be started. Without this, a cancelled or
    // completed appointment could be resurrected to 'in_progress' and the doctor
    // re-authorized after the fact.
    if (appt.status !== "scheduled") {
      return NextResponse.json(
        { error: `la consulta no está agendada (estado: ${appt.status})` },
        { status: 409 },
      );
    }

    // Grantee = the wallet that later signs append_entry. On the demo ficha,
    // /api/ficha/entry always signs with DEMO_DOCTOR_SECRET, so the grant MUST go
    // to that exact wallet (NEXT_PUBLIC_DEMO_DOCTOR_WALLET) or the append reverts
    // Unauthorized. (In prod each patient has their own record and the doctor's
    // real passkey wallet signs — a different path, not this demo endpoint.)
    const grantee = process.env.NEXT_PUBLIC_DEMO_DOCTOR_WALLET ?? "";
    if (!isStellarAddress(grantee)) {
      return NextResponse.json({ error: "doctor_wallet_not_found" }, { status: 404 });
    }

    // Attempt a real on-chain grant, signed by the record owner (the patient).
    const ownerSecret = getDemoPatientSecret();

    let mode: "onchain" | "simulated" = "simulated";
    let txHash: string | null = null;
    let reason: string | undefined;

    if (ownerSecret) {
      try {
        const res = await grantWriteAccess({
          ownerSecret,
          contractId: CONTRACT_IDS.clinicalRecordDemo,
          grantee,
        });
        if (res.status === "SUCCESS") {
          mode = "onchain";
          txHash = res.hash;
        } else {
          reason = `transacción ${res.status}`;
        }
      } catch (err) {
        reason = err instanceof Error ? err.message : "fallo on-chain";
      }
    } else {
      reason = "sin firmante del paciente (DEMO_PATIENT_SECRET/RELAYER_SECRET)";
    }

    // Persist the consent + start the consultation, even when simulated, so the
    // demo flow (and both portals' "acceso otorgado") stay consistent.
    const [updated] = await sql`
      UPDATE appointments SET
        status         = 'in_progress',
        started_at     = NOW(),
        consent_tx     = ${txHash},
        consent_mode   = ${mode},
        consent_wallet = ${grantee}
      WHERE id = ${appointmentId}
      RETURNING *`;

    return NextResponse.json({
      mode,
      reason,
      hash: txHash,
      explorer: txHash ? STELLAR_EXPERT_TX(txHash) : null,
      appointment: updated,
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[ficha/grant]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
