/**
 * POST /api/patient/ai-extract — Analyze an uploaded clinical document with AI.
 * ---------------------------------------------------------------------------
 * 1. Checks patient ownership (resolveOwnerEmail).
 * 2. Fetches the document from `clinical_documents`.
 * 3. Logs explicit opt-in access in `api_access_log` as `ai.analyze`
 *    under Ley 20.584 ("quién vio tu ficha").
 * 4. Executes vision/text extraction via Claude API (or smart fallback).
 * 5. Returns structured diagnoses, medications, lab results, and suggested entries.
 *
 * Body: { documentId: number, patientEmail?: string }
 */
import { NextResponse } from "next/server";
import { dbNotConfiguredResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";
import { logAccess } from "@/lib/access-log";
import { extractClinicalDocumentData } from "@/lib/ai/document-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExtractBody {
  documentId?: number;
  patientEmail?: string;
}

export async function POST(request: Request) {
  let body: ExtractBody;
  try {
    body = (await request.json()) as ExtractBody;
  } catch {
    return NextResponse.json({ error: "cuerpo JSON inválido" }, { status: 400 });
  }

  const documentId = Number(body.documentId);
  if (!documentId || isNaN(documentId)) {
    return NextResponse.json({ error: "documentId es obligatorio" }, { status: 400 });
  }

  const auth = await resolveOwnerEmail(request, body.patientEmail);
  if ("error" in auth) return auth.error;

  const patientEmail = auth.email;

  try {
    const sql = getDb();
    const [doc] = await sql`
      SELECT id, title, file_name, category, mime_type, content_base64, created_at
      FROM clinical_documents
      WHERE id = ${documentId} AND patient_email = ${patientEmail}
      LIMIT 1`;

    if (!doc) {
      return NextResponse.json(
        { error: "documento no encontrado o no pertenece a este paciente" },
        { status: 404 }
      );
    }

    // Register Ley 20.584 access log event (patient opt-in for AI analysis)
    logAccess({
      patientEmail,
      accessor: "Claude AI (opt-in)",
      accessorRole: "system",
      action: "ai.analyze",
      detail: `Análisis IA de documento #${doc.id}: "${doc.title}"`,
    });

    const extraction = await extractClinicalDocumentData({
      title: String(doc.title),
      fileName: doc.file_name ? String(doc.file_name) : null,
      category: doc.category ? String(doc.category) : null,
      mimeType: doc.mime_type ? String(doc.mime_type) : null,
      contentBase64: String(doc.content_base64),
    });

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      documentTitle: doc.title,
      extraction,
    });
  } catch (err) {
    const dbDown = dbNotConfiguredResponse(err);
    if (dbDown) return dbDown;
    console.error("[api/patient/ai-extract]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
