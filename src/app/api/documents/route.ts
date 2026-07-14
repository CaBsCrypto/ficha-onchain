/**
 * GET /api/documents — list documents for a wallet.
 * ---------------------------------------------------------------------------
 * Query params:
 *   wallet  — Stellar G-address
 *   role    — "issuer" (doctor/institution view) | "recipient" (patient view)
 *   type?   — optional filter by DocumentType
 *
 * Response: { data: { documents: OnChainDocument[] } }
 */
import { NextResponse } from "next/server";
import { listDocuments } from "@/lib/stellar/documents";
import type { DocumentType } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = (searchParams.get("wallet") ?? "").trim();
  const roleParam = searchParams.get("role") ?? "recipient";
  const typeFilter = searchParams.get("type") as DocumentType | null;

  if (!wallet || !/^G[A-Z2-7]{55}$/.test(wallet)) {
    return NextResponse.json(
      { error: "wallet must be a valid Stellar G-address" },
      { status: 400 },
    );
  }

  const role = roleParam === "issuer" ? "issuer" : "recipient";

  try {
    let documents = await listDocuments(wallet, role);
    if (typeFilter) {
      documents = documents.filter((d) => d.docType === typeFilter);
    }
    return NextResponse.json({ data: { documents } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[documents] error:", message);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 },
    );
  }
}
