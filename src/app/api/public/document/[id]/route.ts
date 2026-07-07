/**
 * GET /api/public/document/[id] — public document verification (no auth required).
 * ---------------------------------------------------------------------------
 * Used by QR scan verification pages. Returns sanitized document data —
 * wallet addresses are intentionally EXCLUDED from the public response.
 *
 * Response: { data: OnChainDocumentPublic }
 */
import { NextResponse } from "next/server";
import { getDocument } from "@/lib/stellar/documents";
import { DOC_LABEL, DOC_CATEGORY } from "@/lib/fhir/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const doc = await getDocument(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Sanitized public response: no wallet addresses exposed.
  return NextResponse.json({
    data: {
      id: doc.id,
      docType: doc.docType,
      docLabel: DOC_LABEL[doc.docType],
      category: DOC_CATEGORY[doc.docType],
      status: doc.status,
      isValid: doc.status === "active",
      contentHash: doc.contentHash,
      issuedAt: doc.issuedAt,
      expiresAt: doc.expiresAt,
    },
  });
}
