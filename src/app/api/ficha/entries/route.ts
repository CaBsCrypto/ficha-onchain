/**
 * GET /api/ficha/entries?patientEmail=X — a patient's clinical history.
 * ---------------------------------------------------------------------------
 * Returns the off-chain mirror of the on-chain ClinicalRecord entries (kind,
 * summary, detail) alongside each entry's on-chain anchor (content_hash, tx_hash,
 * mode). Newest first.
 *
 * → { entries: ClinicalEntryRow[] }
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const patientEmail = new URL(request.url).searchParams
    .get("patientEmail")
    ?.trim()
    .toLowerCase();
  if (!patientEmail) {
    return NextResponse.json({ error: "patientEmail required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, patient_email, kind, summary, detail,
             content_hash, tx_hash, mode, author_wallet, doctor_email, created_at
      FROM clinical_entries
      WHERE LOWER(patient_email) = ${patientEmail}
      ORDER BY created_at DESC`;
    return NextResponse.json({ entries: rows });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[ficha/entries]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
