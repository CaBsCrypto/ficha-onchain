/**
 * GET /api/auth/google?wallet=G…
 * ---------------------------------------------------------------------------
 * Kicks off the Google OAuth 2.0 Authorization Code flow for a doctor.
 * Redirects the browser to Google's consent screen.
 *
 * After the doctor approves, Google redirects to
 * /api/auth/google/callback?code=…&state=… where the token exchange happens.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim();

  if (!wallet) {
    return NextResponse.json(
      { error: "wallet query parameter is required" },
      { status: 400 },
    );
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.",
      },
      { status: 503 },
    );
  }

  const authUrl = getAuthUrl(wallet);
  return NextResponse.redirect(authUrl);
}
