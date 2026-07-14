/**
 * GET /api/public/prescription/[id]
 * ---------------------------------------------------------------------------
 * Public validation endpoint for pharmacies / dispensaries (QR scan flow).
 * No authentication required.
 *
 * Returns sanitized prescription data — NO patient or doctor wallet exposed.
 *
 * Possible responses:
 *   200 { data: PublicPrescription }
 *   400 { error: "Invalid prescription id" }
 *   404 { error: "Prescription not found" }
 *   500 { error: "..." }
 */
import { NextResponse } from "next/server";
import { getPrescription, type RxStatus } from "@/lib/stellar/client";
import { computeExpiry } from "@/lib/stellar/expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Statuses that a pharmacy should accept for dispensing. */
const DISPENSABLE: Set<RxStatus> = new Set([
  "Registrada",
  "Activa",
  "ConsumoParcial",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const rxId = Number(id);
  if (!Number.isInteger(rxId) || rxId <= 0) {
    return NextResponse.json({ error: "Invalid prescription id" }, { status: 400 });
  }

  try {
    const rx = await getPrescription(rxId);

    if (!rx) {
      return NextResponse.json(
        { error: "Prescription not found" },
        { status: 404 },
      );
    }

    const expiry = computeExpiry(rx);

    return NextResponse.json({
      data: {
        id: rx.id,
        status: rx.status,
        /**
         * Whether the pharmacy can accept and dispense this prescription.
         * A dispensable on-chain status that has passed its (derived) validity
         * window is treated as inactive so lapsed prescriptions are rejected.
         */
        isActive: DISPENSABLE.has(rx.status) && !expiry.expired,
        medication: rx.medication,
        dosage: rx.dosage,
        unitsTotal: rx.unitsTotal,
        /** Units remaining (balance). */
        balance: rx.balance,
        /** Ledger unix timestamp (seconds) when the prescription was issued. */
        issuedAt: rx.timestamp,
        /** Derived expiry (unix seconds); 0 when unknown. See lib/stellar/expiry. */
        expiresAt: expiry.expiresAt,
        /** Derived: dispensable status whose validity window has elapsed. */
        expired: expiry.expired,
        /** Whole days until expiry; negative once lapsed. */
        daysLeft: expiry.daysLeft,
        /** SHA-256 hash of the encrypted FHIR payload anchored on-chain. */
        rxHash: rx.rxHash,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[public/prescription] error:", message);
    return NextResponse.json(
      { error: "Failed to fetch prescription" },
      { status: 500 },
    );
  }
}
