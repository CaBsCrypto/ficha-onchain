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
import { requireAuthOrDemo } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Meet link + clinical notes — same gate as the list endpoint.
  const gate = await requireAuthOrDemo(request);
  if (gate) return gate.error;

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
