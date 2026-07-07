/**
 * GET /api/auth/google/callback?code=…&state=…
 * ---------------------------------------------------------------------------
 * OAuth 2.0 callback handler.
 *
 * 1. Decodes the doctor's wallet address from the `state` parameter.
 * 2. Exchanges the authorization code for access + refresh tokens.
 * 3. Stores tokens in the in-memory token store (keyed by wallet).
 * 4. Redirects back to the doctor portal with ?google=connected.
 *
 * On error, redirects back with ?google_error=<reason>.
 */
import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient, storeTokens } from "@/lib/google/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const portalBase = `${appUrl}/doctor`;

  // User denied access.
  if (errorParam) {
    return NextResponse.redirect(
      `${portalBase}?google_error=${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${portalBase}?google_error=missing_params`,
    );
  }

  // Decode wallet from state.
  let wallet: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf-8"),
    ) as { wallet?: string };
    if (!decoded.wallet) throw new Error("no wallet");
    wallet = decoded.wallet;
  } catch {
    return NextResponse.redirect(`${portalBase}?google_error=invalid_state`);
  }

  // Exchange code → tokens.
  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    storeTokens(wallet, tokens);
    return NextResponse.redirect(`${portalBase}?google=connected`);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(
      `${portalBase}?google_error=${encodeURIComponent(msg)}`,
    );
  }
}
