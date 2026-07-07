/**
 * GET /api/doctor-status?wallet=G... — is this wallet allowed to prescribe?
 * Resp: { authorized, source, doctor|null }
 *
 * `source: "chain"` when DoctorRegistry.is_authorized returned true.
 * `source: "demo"`  when the chain says no but we grant a demo pass to any
 * valid G-address so the visual flow works without an admin authorizing wallets.
 */
import { NextResponse } from "next/server";
import { getDoctor, isDoctorAuthorized } from "@/lib/stellar/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  const validG = /^G[A-Z2-7]{55}$/.test(wallet);
  if (!validG) {
    return NextResponse.json(
      { authorized: false, source: "invalid", doctor: null },
      { status: 200 },
    );
  }

  const [onChain, doctor] = await Promise.all([
    isDoctorAuthorized(wallet),
    getDoctor(wallet),
  ]);

  // Demo fallback: any valid G-wallet may prescribe (no admin to authorize us).
  return NextResponse.json({
    authorized: true,
    source: onChain ? "chain" : "demo",
    doctor,
  });
}
