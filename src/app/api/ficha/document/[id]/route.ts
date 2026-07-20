/**
 * GET /api/ficha/document/[id] — serve one exam file's bytes.
 * ---------------------------------------------------------------------------
 * Streams the stored file back with its real content-type so the browser can
 * render a PDF/image inline. Authorization is resolved from the document's OWN
 * patient (not a query param): the caller must be that patient or a treating
 * doctor, exactly like the list endpoint.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { resolveOwnerOrTreating } from "@/lib/auth/treating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const docId = Number(id);
  if (!docId) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    const sql = getDb();
    const rows = await sql<{
      patient_email: string; mime_type: string | null;
      file_name: string | null; content_base64: string;
    }>`
      SELECT patient_email, mime_type, file_name, content_base64
      FROM clinical_documents WHERE id = ${docId} LIMIT 1`;
    const doc = rows[0];
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Authorize against the document's own patient.
    const auth = await resolveOwnerOrTreating(request, doc.patient_email);
    if ("error" in auth) return auth.error;

    const bytes = Buffer.from(doc.content_base64, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": doc.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${doc.file_name ?? `examen-${docId}`}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[GET /api/ficha/document/[id]]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
