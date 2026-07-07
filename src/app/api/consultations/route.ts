/**
 * POST /api/consultations
 * ---------------------------------------------------------------------------
 * Creates a new telemedicine consultation:
 *   1. Verifies the doctor has authorized Google (tokens in store).
 *   2. Creates a Google Meet space on their behalf.
 *   3. Persists the consultation record (in-memory store).
 *
 * Body: {
 *   doctorWallet: string;       // G… Stellar wallet (required)
 *   patientWallet?: string;     // G… Stellar wallet (optional for v1)
 *   scheduledAt?: number;       // Unix timestamp ms (optional, ASAP if omitted)
 *   notes?: string;             // Internal clinical notes (optional)
 * }
 *
 * 200 → { data: Consultation }
 * 400 → { error: "…" }
 * 401 → { error: "google_not_authorized", authUrl: "/api/auth/google?wallet=…" }
 * 500 → { error: "…" }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient, hasTokens } from "@/lib/google/auth";
import { createMeetSpace } from "@/lib/google/meet";
import { createConsultation } from "@/lib/consultations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConsultationBody {
  doctorWallet?: string;
  patientWallet?: string;
  scheduledAt?: number;
  notes?: string;
}

export async function POST(request: NextRequest) {
  let body: ConsultationBody;
  try {
    body = (await request.json()) as ConsultationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const doctorWallet = (body.doctorWallet ?? "").trim();
  if (!doctorWallet) {
    return NextResponse.json(
      { error: "doctorWallet is required" },
      { status: 400 },
    );
  }

  // If the doctor hasn't connected Google, tell the client to start the flow.
  if (!hasTokens(doctorWallet)) {
    return NextResponse.json(
      {
        error: "google_not_authorized",
        authUrl: `/api/auth/google?wallet=${encodeURIComponent(doctorWallet)}`,
      },
      { status: 401 },
    );
  }

  try {
    const auth = getAuthorizedClient(doctorWallet);
    const space = await createMeetSpace(auth);

    const consultation = createConsultation({
      doctorWallet,
      patientWallet: body.patientWallet?.trim() || undefined,
      meetLink: space.meetingUri,
      meetingCode: space.meetingCode,
      spaceName: space.name,
      scheduledAt: body.scheduledAt,
      notes: body.notes?.trim() || undefined,
    });

    return NextResponse.json({ data: consultation }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create consultation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
