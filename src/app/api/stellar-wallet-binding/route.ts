import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/auth/privy-auth";
import { getDb } from "@/lib/db";
import { BookingPreparationError } from "@/lib/prescription-booking";
import { createWalletChallenge, completeWalletChallenge } from "@/lib/stellar-wallet-binding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, complete: boolean) {
  const actor = await requireUser(request);
  if (!actor) return unauthorized();
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const keys = complete ? ["challengeId", "signature"] : ["wallet", "role"];
    if (Object.keys(body).some((key) => !keys.includes(key)) ||
        keys.some((key) => typeof body[key] !== "string" || body[key].length > 300)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const result = complete
      ? await completeWalletChallenge(getDb(), actor, body.challengeId, body.signature)
      : await createWalletChallenge(getDb(), actor, body.wallet, body.role);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    if (error instanceof BookingPreparationError) return NextResponse.json({ error: error.code }, { status: error.status });
    return NextResponse.json({ error: "wallet_binding_unavailable" }, { status: 503 });
  }
}
export const POST = (request: Request) => handle(request, false);
export const PUT = (request: Request) => handle(request, true);
