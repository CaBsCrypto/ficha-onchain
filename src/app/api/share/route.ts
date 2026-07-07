/**
 * POST /api/share — mint a 15-minute share token for a prescription.
 * Body: { rxId: string, patient: string }
 * Resp: { token, url, expiresInSeconds }
 *
 * The patient's portal turns the returned url into a QR code. /verify consumes
 * the token without requiring any login.
 */
import { NextResponse } from "next/server";
import { signShareToken, SHARE_TTL_SECONDS } from "@/lib/share/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { rxId?: string; patient?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.rxId || !body.patient) {
    return NextResponse.json(
      { error: "rxId and patient are required" },
      { status: 400 },
    );
  }

  try {
    const token = await signShareToken({
      rxId: String(body.rxId),
      patient: String(body.patient),
    });
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      token,
      url: `${origin}/verify?token=${encodeURIComponent(token)}`,
      expiresInSeconds: SHARE_TTL_SECONDS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not sign token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
