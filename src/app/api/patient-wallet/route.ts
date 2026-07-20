/**
 * GET /api/patient-wallet?email=X
 * ---------------------------------------------------------------------------
 * Returns the Stellar wallet address for a registered patient by email.
 * Used by the doctor portal to auto-fill the patient wallet when issuing
 * on-chain prescriptions.
 *
 * Auth: requires a valid Privy Bearer token (doctor must be logged in).
 * In demo mode (no TRUSTLEAF_REQUIRE_AUTH) requests pass through.
 *
 * Response 200: { wallet: "G…", email: string }
 * Response 404: { error: "not_found" }
 * Response 400: { error: "email_required" }
 */
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { requireAuthOrDemo } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDb() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export async function GET(request: Request) {
  // A logged-in user (doctor resolving a patient's wallet) is required under
  // enforcement; demo passes through. This route claimed to guard but did not.
  const gate = await requireAuthOrDemo(request);
  if (gate) return gate.error;

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT email, wallet
      FROM registered_users
      WHERE LOWER(email) = ${email}
        AND wallet IS NOT NULL
        AND wallet <> ''
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const row = rows[0] as { email: string; wallet: string };
    return NextResponse.json({ wallet: row.wallet, email: row.email });
  } catch (err) {
    console.error("[patient-wallet GET]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
