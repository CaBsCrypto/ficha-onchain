/**
 * GET /api/doctor-status?wallet=G... — is this wallet allowed to prescribe?
 * Resp: { authorized, source, doctor|null }
 *
 * `source: "chain"`       when DoctorRegistry.is_authorized returned true.
 * `source: "demo"`        when the chain says no but we grant a demo pass to any
 *                         valid G-address so the visual flow works without an
 *                         admin authorizing wallets.
 * `source: "unreachable"` when the chain could not be asked at all. Same demo
 *                         pass, but the caller can tell a real "no" apart from
 *                         a broken connection — these looked identical while
 *                         isDoctorAuthorized swallowed its errors.
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

  let onChain = false;
  let reachable = true;
  let doctor = null;

  try {
    [onChain, doctor] = await Promise.all([
      isDoctorAuthorized(wallet),
      getDoctor(wallet),
    ]);
  } catch (err) {
    // The registry is the source of truth; if it cannot be reached we say so
    // instead of reporting an authoritative "not authorized".
    reachable = false;
    console.error("[doctor-status] registry unreachable:", err);
  }

  // Demo fallback: any valid G-wallet may prescribe (no admin to authorize us).
  return NextResponse.json({
    authorized: true,
    source: onChain ? "chain" : reachable ? "demo" : "unreachable",
    doctor,
  });
}
