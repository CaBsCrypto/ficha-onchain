/**
 * POST /api/ficha/entry — a doctor appends a clinical entry to a patient's ficha.
 * ---------------------------------------------------------------------------
 * 1. Builds a canonical JSON of the entry and derives
 *    content_hash = SHA-256(payload) — the 32-byte anchor stored on-chain. The
 *    plaintext (summary/detail) never touches the chain; only its hash does.
 * 2. If a doctor signer + relayer are configured, performs a REAL, gasless
 *    append to the patient's ClinicalRecord contract (the doctor keypair signs,
 *    the relayer fee-bumps). Requires the doctor to hold write access, granted
 *    on-chain by the patient. Returns mode:"onchain" + tx hash.
 * 3. Otherwise (or if the chain rejects it) returns mode:"simulated" with the
 *    reason — the entry is still mirrored off-chain so the UI flow completes.
 *
 * In every case the entry is mirrored into `clinical_entries` so the patient's
 * ficha renders the history without decrypting anything.
 *
 * Body: { patientEmail, patientWallet?, kind, summary, detail?, doctorEmail? }
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { CONTRACT_IDS, STELLAR_EXPERT_TX } from "@/lib/stellar/config";
import { appendClinicalEntry, getDemoDoctorSecret } from "@/lib/stellar/server";
import { withAuth } from "@/lib/auth/withAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EntryBody {
  patientEmail?: string;
  patientWallet?: string;
  kind?: string;
  summary?: string;
  detail?: string;
  doctorEmail?: string;
}

async function handleAppend(request: Request) {
  let body: EntryBody;
  try {
    body = (await request.json()) as EntryBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patientEmail = (body.patientEmail ?? "").trim().toLowerCase();
  const patientWallet = (body.patientWallet ?? "").trim() || null;
  const kind = (body.kind ?? "").trim();
  const summary = (body.summary ?? "").trim();
  const detail = body.detail?.trim() || null;
  const doctorEmail = (body.doctorEmail ?? "").trim().toLowerCase() || null;

  if (!patientEmail || !kind || !summary) {
    return NextResponse.json(
      { error: "patientEmail, kind y summary son obligatorios" },
      { status: 400 },
    );
  }

  // Canonical payload → 32-byte anchor. Stable key order so the hash is
  // reproducible from the same clinical content.
  const payload = JSON.stringify({ patientEmail, kind, summary, detail });
  const contentHash = createHash("sha256").update(payload).digest(); // Buffer(32)

  // Attempt a real on-chain append when we have a signer.
  const doctorSecret = getDemoDoctorSecret();

  let mode: "onchain" | "simulated" = "simulated";
  let txHash: string | null = null;
  let authorWallet: string | null = process.env.NEXT_PUBLIC_DEMO_DOCTOR_WALLET ?? null;
  let reason: string | undefined;

  if (doctorSecret) {
    try {
      const res = await appendClinicalEntry({
        doctorSecret,
        contractId: CONTRACT_IDS.clinicalRecordDemo,
        kind,
        contentHash,
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
    reason = "sin firmante configurado (DEMO_DOCTOR_SECRET/RELAYER_SECRET)";
  }

  try {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO clinical_entries
        (patient_email, patient_wallet, kind, summary, detail,
         content_hash, tx_hash, mode, author_wallet, doctor_email)
      VALUES
        (${patientEmail}, ${patientWallet}, ${kind}, ${summary}, ${detail},
         ${contentHash.toString("hex")}, ${txHash}, ${mode}, ${authorWallet}, ${doctorEmail})
      RETURNING *`;
    return NextResponse.json({
      mode,
      reason,
      hash: txHash,
      contentHash: contentHash.toString("hex"),
      explorer: txHash ? STELLAR_EXPERT_TX(txHash) : null,
      entry: row,
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[ficha/entry]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

// Appending to a ficha is a doctor action — guard it (demo mode passes through).
export const POST = withAuth(handleAppend, { role: "doctor" });
