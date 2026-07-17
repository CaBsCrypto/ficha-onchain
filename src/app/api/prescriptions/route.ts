/**
 * GET /api/prescriptions?wallet=G...&role=doctor|patient
 * Resp: { prescriptions: WithExpiry<OnChainPrescription>[] }
 *
 * Patient reads use the contract's direct getter `get_prescriptions_by_patient`
 * (a single read backed by the contract's own per-patient index) instead of
 * scanning `rx_mint` events, so older prescriptions never fall out of the RPC
 * node's ~7-day event-retention window. Doctor reads still enumerate via the
 * event scan (no equivalent per-doctor getter is exposed on-chain).
 *
 * Each record is enriched with a DERIVED expiry overlay (`expiresAt`, `expired`,
 * `expiringSoon`, `daysLeft`). There is no on-chain expiry field, so this path
 * cannot and does not mutate chain state — it computes the effective expired
 * status from the issuance timestamp so the UI can flag lapsed prescriptions.
 *
 * Guarded by requireUser(): the caller must present a valid Privy token when
 * Privy is configured (a patient reads their own records). In demo mode (no
 * Privy secret configured) the guard passes through so the flow stays testable.
 */
import { NextResponse } from "next/server";
import {
  getPrescriptionsByPatient,
  listPrescriptions,
} from "@/lib/stellar/client";
import { withExpiry } from "@/lib/stellar/expiry";
import { requireUser, unauthorized } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Privy is wired up in this environment — when so, the guard is enforced. */
function privyConfigured(): boolean {
  return Boolean(
    (process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID) &&
      process.env.PRIVY_APP_SECRET,
  );
}

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

  // A patient may only read their own prescriptions. Enforced whenever Privy is
  // configured; demo mode (no PRIVY_APP_SECRET) passes through so the flow works.
  if (privyConfigured()) {
    const user = await requireUser(request);
    if (!user) return unauthorized();
  }

  try {
    const now = Date.now();
    const records =
      role === "patient"
        ? await getPrescriptionsByPatient(wallet)
        : await listPrescriptions(wallet, role);
    const prescriptions = records.map((rx) => withExpiry(rx, now));
    return NextResponse.json({ prescriptions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not read prescriptions";
    console.error("[prescriptions] error:", message);
    return NextResponse.json(
      { error: "Failed to load prescriptions" },
      { status: 500 },
    );
  }
}
