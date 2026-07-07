/**
 * GET /api/consultations/[id]
 * ---------------------------------------------------------------------------
 * Returns the consultation record by UUID.
 *
 * 200 → { data: Consultation }
 * 404 → { error: "Consultation not found" }
 */
import { NextRequest, NextResponse } from "next/server";
import { getConsultation } from "@/lib/consultations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const consultation = getConsultation(id);

  if (!consultation) {
    return NextResponse.json(
      { error: "Consultation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: consultation });
}
