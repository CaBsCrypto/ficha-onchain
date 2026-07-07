/**
 * POST /api/relay — Fee-bump relayer.
 * ---------------------------------------------------------------------------
 * The client submits an XDR of a transaction already signed by the user (via
 * their passkey wallet). We wrap it in a Fee Bump Transaction signed by the
 * TrustLeaf relayer so the user never spends XLM, submit it to Soroban Testnet,
 * and return the resulting hash.
 *
 * Body: { xdr: string }
 * Resp: { hash, status } | { error }
 */
import { NextResponse } from "next/server";
import { feeBumpAndSend } from "@/lib/stellar/server";
import { STELLAR_EXPERT_TX } from "@/lib/stellar/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { xdr?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.xdr || typeof body.xdr !== "string") {
    return NextResponse.json(
      { error: "Missing signed transaction XDR" },
      { status: 400 },
    );
  }

  if (!process.env.RELAYER_SECRET) {
    return NextResponse.json(
      { error: "Relayer not configured (RELAYER_SECRET missing)" },
      { status: 501 },
    );
  }

  try {
    const result = await feeBumpAndSend(body.xdr);
    return NextResponse.json({
      hash: result.hash,
      status: result.status,
      explorer: STELLAR_EXPERT_TX(result.hash),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Relay failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
