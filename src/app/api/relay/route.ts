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

// Simple origin guard: only allow requests originating from the same app.
// In production this should be backed by a proper API key or session check.
function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // Allow same-origin requests (no Origin header) and our own domain.
  if (!origin) return true;
  if (appUrl && origin === appUrl) return true;
  // Allow localhost in development
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      { error: "Relayer not configured" },
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
    console.error("[relay] error:", message);
    return NextResponse.json({ error: "Transaction relay failed" }, { status: 502 });
  }
}
