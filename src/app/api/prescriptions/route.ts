/**
 * GET /api/prescriptions?wallet=G...&role=doctor|patient
 * Resp: { prescriptions: WithExpiry<OnChainPrescription>[] }
 *
 * Enumerates on-chain prescriptions for the wallet by scanning `rx_mint` events
 * (see listPrescriptions for why). Returns [] when none are found or the event
 * window has rolled over — the UI renders an empty state in that case.
 *
 * Each record is enriched with a DERIVED expiry overlay (`expiresAt`, `expired`,
 * `expiringSoon`, `daysLeft`). There is no on-chain expiry field, so this path
 * cannot and does not mutate chain state — it computes the effective expired
 * status from the issuance timestamp so the UI can flag lapsed prescriptions.
 */
import { NextResponse } from "next/server";
import { listPrescriptions } from "@/lib/stellar/client";
import { withExpiry } from "@/lib/stellar/expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const wallet = params.get("wallet");
  const role = params.get("role");

  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }
  if (role !== "doctor" && role !== "patient") {
    return NextResponse.json(
      { error: "role must be 'doctor' or 'patient'" },
      { status: 400 },
    );
  }

  try {
    const now = Date.now();
    const prescriptions = (await listPrescriptions(wallet, role)).map((rx) =>
      withExpiry(rx, now),
    );
    return NextResponse.json({ prescriptions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not read prescriptions";
    console.error("[prescriptions] error:", message);
    return NextResponse.json({ error: "Failed to load prescriptions" }, { status: 500 });
  }
}
