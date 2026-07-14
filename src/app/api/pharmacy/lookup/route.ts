/**
 * GET /api/pharmacy/lookup?rut=<RUT>
 * ---------------------------------------------------------------------------
 * Resolve a patient RUT to their on-chain prescriptions, for the /pharmacy
 * panel. Requires the `pharmacy_unlocked` cookie set by /api/pharmacy/verify-pin.
 *
 * WHY AN OFF-CHAIN INDEX: patient RUTs are PII and are DELIBERATELY never stored
 * on-chain (only the SHA-256 hash of the encrypted FHIR payload is anchored).
 * There is therefore no on-chain RUT→prescription mapping. Resolution goes
 * through an off-chain directory configured via PHARMACY_RUT_INDEX:
 *   PHARMACY_RUT_INDEX="12345678-9:GPATIENT1...,9876543-2:GPATIENT2..."
 * In production this is replaced by the clinical/off-chain FHIR index. When the
 * env var is unset the endpoint returns an empty result with an explanatory
 * note (RUT search unavailable) rather than failing — ID search still works.
 *
 * Responses:
 *   200 { data: PharmacyRx[], note?: string }
 *   400 { error }   — missing / malformed RUT
 *   401 { error }   — panel not unlocked
 *   404 { error }   — RUT not found in the directory
 *   500 { error }
 */
import { NextResponse } from "next/server";
import { listPrescriptions } from "@/lib/stellar/client";
import { computeExpiry } from "@/lib/stellar/expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Normalize a Chilean RUT: strip dots/spaces/dashes, upper-case the DV. */
function normalizeRut(raw: string): string {
  return raw.replace(/[.\s]/g, "").replace(/-/g, "").toUpperCase();
}

/** Parse PHARMACY_RUT_INDEX into a Map<normalizedRut, G-address>. */
function parseRutIndex(): Map<string, string> {
  const raw = process.env.PHARMACY_RUT_INDEX ?? "";
  const map = new Map<string, string>();
  if (!raw.trim()) return map;
  for (const entry of raw.split(",")) {
    const colon = entry.indexOf(":");
    if (colon < 1) continue;
    const rut = normalizeRut(entry.slice(0, colon));
    const wallet = entry.slice(colon + 1).trim();
    if (rut && wallet) map.set(rut, wallet);
  }
  return map;
}

/** True when the request carries the pharmacy_unlocked cookie. */
function isUnlocked(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  return /(?:^|;\s*)pharmacy_unlocked=1(?:;|$)/.test(cookie);
}

export async function GET(request: Request) {
  if (!isUnlocked(request)) {
    return NextResponse.json(
      { error: "Pharmacy panel locked — enter the PIN first" },
      { status: 401 },
    );
  }

  const rutRaw = (new URL(request.url).searchParams.get("rut") ?? "").trim();
  if (!rutRaw) {
    return NextResponse.json({ error: "rut is required" }, { status: 400 });
  }

  const index = parseRutIndex();
  if (index.size === 0) {
    return NextResponse.json({
      data: [],
      note: "Búsqueda por RUT no disponible: el índice clínico off-chain no está configurado. Usa el ID de la receta.",
    });
  }

  const wallet = index.get(normalizeRut(rutRaw));
  if (!wallet) {
    return NextResponse.json(
      { error: "No se encontró un paciente con ese RUT" },
      { status: 404 },
    );
  }

  try {
    const now = Date.now();
    const data = (await listPrescriptions(wallet, "patient")).map((rx) => {
      const expiry = computeExpiry(rx, now);
      // Minimal, PII-light projection — the pharmacist acts by prescription id.
      return {
        id: rx.id,
        status: rx.status,
        medication: rx.medication,
        dosage: rx.dosage,
        unitsTotal: rx.unitsTotal,
        balance: rx.balance,
        issuedAt: rx.timestamp,
        expiresAt: expiry.expiresAt,
        expired: expiry.expired,
        daysLeft: expiry.daysLeft,
        isActive:
          (rx.status === "Registrada" ||
            rx.status === "Activa" ||
            rx.status === "ConsumoParcial") &&
          !expiry.expired,
        rxHash: rx.rxHash,
      };
    });
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pharmacy/lookup] error:", message);
    return NextResponse.json(
      { error: "Lookup failed" },
      { status: 500 },
    );
  }
}
