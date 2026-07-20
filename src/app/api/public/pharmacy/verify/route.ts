/**
 * GET /api/public/pharmacy/verify
 * ---------------------------------------------------------------------------
 * Verify whether a pharmacy / dispensary wallet is authorized to dispense.
 *
 * Query params:
 *   wallet — Stellar G-address of the pharmacy
 *
 * Authorization check order:
 *   1. On-chain DispensaryRegistry (when DISPENSARY_REGISTRY_ID is set)
 *   2. PHARMACY_API_KEYS env var (API key config)
 *   3. Demo mode (always authorized, source "demo")
 *
 * Possible responses:
 *   200 { data: { wallet, authorized, source, checkedAt } }
 *   400 { error: "..." }   — missing or malformed wallet
 *   500 { error: "..." }
 */
import { NextResponse } from "next/server";
import { isPharmacyAuthorized } from "@/lib/stellar/pharmacy";
import { isStellarAddress } from "@/lib/stellar/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = (searchParams.get("wallet") ?? "").trim();

  if (!wallet) {
    return NextResponse.json(
      { error: "wallet query parameter is required" },
      { status: 400 },
    );
  }

  if (!isStellarAddress(wallet)) {
    return NextResponse.json(
      { error: "Invalid wallet address (expected a Stellar G-address)" },
      { status: 400 },
    );
  }

  try {
    const result = await isPharmacyAuthorized(wallet);
    return NextResponse.json({
      data: {
        wallet,
        authorized: result.authorized,
        /** Origin of the authorization decision. */
        source: result.source,
        /** Unix timestamp (seconds) when the check was performed. */
        checkedAt: Math.floor(Date.now() / 1000),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Verification failed: ${message}` },
      { status: 500 },
    );
  }
}
