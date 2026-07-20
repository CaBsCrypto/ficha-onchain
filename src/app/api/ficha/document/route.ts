/**
 * POST /api/ficha/document                    — attach an exam/lab/imaging file
 *                                                to a patient's ficha and anchor
 *                                                its SHA-256 on-chain.
 * GET  /api/ficha/document?patientEmail=X      — list a patient's documents
 *                                                (metadata only; no file bytes).
 * ---------------------------------------------------------------------------
 * The file bytes are stored (base64) in `clinical_documents`; only the 32-byte
 * SHA-256 anchor goes on-chain, as a DiagnosticReport entry on the patient's
 * ClinicalRecord (gasless — doctor signs, relayer fee-bumps). The chain proves
 * the file has not been altered; the file itself never touches the chain.
 *
 * Authorization is by treating relationship (or the patient themselves) — see
 * resolveOwnerOrTreating. A doctor can only attach to a patient who granted them
 * consent.
 *
 * Body (POST): { patientEmail, category?, title, fileName?, mimeType, base64,
 *                doctorEmail? }
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { CONTRACT_IDS, STELLAR_EXPERT_TX } from "@/lib/stellar/config";
import { appendClinicalEntry, getDemoDoctorSecret } from "@/lib/stellar/server";
import { resolveOwnerOrTreating } from "@/lib/auth/treating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ~5MB of base64 ≈ 3.7MB file. Exams (a PDF or a photo) fit comfortably; the cap
// keeps a huge upload from bloating the row and the request.
const MAX_BASE64 = 5_000_000;

interface DocBody {
  patientEmail?: string;
  category?: string;
  title?: string;
  fileName?: string;
  mimeType?: string;
  base64?: string;
  doctorEmail?: string;
}

export async function POST(request: Request) {
  let body: DocBody;
  try {
    body = (await request.json()) as DocBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const auth = await resolveOwnerOrTreating(request, body.patientEmail ?? null);
  if ("error" in auth) return auth.error;

  const title = (body.title ?? "").trim();
  const base64 = (body.base64 ?? "").trim();
  const category = (body.category ?? "Examen").trim() || "Examen";
  const fileName = body.fileName?.trim() || null;
  const mimeType = body.mimeType?.trim() || "application/octet-stream";
  const doctorEmail = (body.doctorEmail ?? auth.doctorEmail ?? "").trim().toLowerCase() || null;

  if (!title || !base64) {
    return NextResponse.json({ error: "title y base64 son obligatorios" }, { status: 400 });
  }
  if (base64.length > MAX_BASE64) {
    return NextResponse.json({ error: "archivo demasiado grande (máx ~3.7MB)" }, { status: 413 });
  }

  // SHA-256 of the actual file bytes — the anchor the chain verifies against.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "base64 inválido" }, { status: 400 });
  }
  const contentHash = createHash("sha256").update(bytes).digest(); // Buffer(32)

  // Anchor on-chain as a DiagnosticReport entry (same path as ficha/entry).
  const doctorSecret = getDemoDoctorSecret();
  let mode: "onchain" | "simulated" = "simulated";
  let txHash: string | null = null;
  let reason: string | undefined;

  if (doctorSecret) {
    try {
      const res = await appendClinicalEntry({
        doctorSecret,
        contractId: CONTRACT_IDS.clinicalRecordDemo,
        kind: "DiagnosticReport",
        contentHash,
      });
      if (res.status === "SUCCESS") { mode = "onchain"; txHash = res.hash; }
      else reason = `transacción ${res.status}`;
    } catch (err) {
      reason = err instanceof Error ? err.message : "fallo on-chain";
    }
  } else {
    reason = "sin firmante configurado (DEMO_DOCTOR_SECRET/RELAYER_SECRET)";
  }

  try {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO clinical_documents
        (patient_email, doctor_email, category, title, file_name, mime_type,
         content_base64, content_hash, tx_hash, mode)
      VALUES
        (${auth.patientEmail}, ${doctorEmail}, ${category}, ${title}, ${fileName}, ${mimeType},
         ${base64}, ${contentHash.toString("hex")}, ${txHash}, ${mode})
      RETURNING id, patient_email, doctor_email, category, title, file_name, mime_type,
                content_hash, tx_hash, mode, created_at`;
    return NextResponse.json({
      mode,
      reason,
      hash: txHash,
      contentHash: contentHash.toString("hex"),
      explorer: txHash ? STELLAR_EXPERT_TX(txHash) : null,
      document: row,
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[POST /api/ficha/document]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const patientEmail = new URL(request.url).searchParams.get("patientEmail");
  const auth = await resolveOwnerOrTreating(request, patientEmail);
  if ("error" in auth) return auth.error;

  try {
    const sql = getDb();
    // Deliberately NOT selecting content_base64 — the list is metadata; the file
    // is fetched one at a time from /api/ficha/document/[id].
    const rows = await sql`
      SELECT id, patient_email, doctor_email, category, title, file_name, mime_type,
             content_hash, tx_hash, mode, created_at
      FROM clinical_documents
      WHERE LOWER(patient_email) = ${auth.patientEmail}
      ORDER BY created_at DESC
      LIMIT 100`;
    return NextResponse.json({ documents: rows });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[GET /api/ficha/document]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
