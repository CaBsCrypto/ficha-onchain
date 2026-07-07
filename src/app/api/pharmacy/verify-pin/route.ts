/**
 * POST /api/pharmacy/verify-pin
 * ---------------------------------------------------------------------------
 * Light access gate for the /pharmacy panel. Verifies a 6-digit PIN against the
 * server-only PHARMACY_PIN env var and, on success, sets a short-lived httpOnly
 * cookie (`pharmacy_unlocked`) used to gate the RUT lookup endpoint.
 *
 * This is a convenience gate for the dispensary UI — NOT patient-data
 * authorization. Per-prescription dispensing is still authorized independently
 * (Bearer pharmacy API key / on-chain DispensaryRegistry). Public per-id lookup
 * (QR flow) remains open by design.
 *
 * Demo mode: when PHARMACY_PIN is unset, any well-formed 6-digit PIN unlocks the
 * panel and the response is flagged `demo: true`.
 *
 * Body (JSON): { pin: string }
 * Responses:
 *   200 { ok: true, demo: boolean }
 *   400 { ok: false, error }   — malformed PIN
 *   401 { ok: false, error }   — wrong PIN
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIN_RE = /^\d{6}$/;
/** Cookie lifetime for an unlocked pharmacy session (seconds). */
const UNLOCK_TTL = 60 * 60 * 8; // 8h shift

/** Constant-time string compare that never short-circuits on length. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  let pin: string;
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = String(body.pin ?? "").trim();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!PIN_RE.test(pin)) {
    return NextResponse.json(
      { ok: false, error: "PIN must be 6 digits" },
      { status: 400 },
    );
  }

  const expected = process.env.PHARMACY_PIN?.trim();
  const demo = !expected;

  if (!demo && !safeEqual(pin, expected!)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect PIN" },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true, demo });
  res.cookies.set("pharmacy_unlocked", "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_TTL,
  });
  return res;
}
