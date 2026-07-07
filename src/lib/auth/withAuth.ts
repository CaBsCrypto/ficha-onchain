/**
 * withAuth — session guard for App Router route handlers.
 * ---------------------------------------------------------------------------
 * Wrap a sensitive route handler so it only runs for a caller carrying a valid
 * TrustLeaf session (see `@/lib/auth/session`). The session travels as either
 * `Authorization: Bearer <jwt>` or the `trustleaf_session` cookie.
 *
 * ENFORCEMENT — TrustLeaf ships in demo mode by default (mock passkeys, no
 * infra) so the whole flow works out of the box. In that mode withAuth lets
 * requests through but tags them `demo: true`, so wrapping a route never breaks
 * the demo. Set `TRUSTLEAF_REQUIRE_AUTH=true` (or enable real passkeys via
 * `NEXT_PUBLIC_PASSKEY_ENABLED=true`) to fail closed — unauthenticated calls
 * then get 401, and a role mismatch gets 403.
 *
 * Usage:
 *   async function handler(request: Request, { auth }: AuthedContext) { … }
 *   export const POST = withAuth(handler, { role: "doctor" });
 */
import { NextResponse } from "next/server";
import type { Role } from "@/types";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "./session";

export interface AuthedContext {
  auth: SessionClaims & { demo: boolean };
}

/** True when auth must be strictly enforced (see file header). */
function authEnforced(): boolean {
  return (
    process.env.TRUSTLEAF_REQUIRE_AUTH === "true" ||
    process.env.NEXT_PUBLIC_PASSKEY_ENABLED === "true"
  );
}

/** Pull a session token from the Authorization header or session cookie. */
function extractToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7).trim() || null;
  }
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

type Handler<C> = (
  request: Request,
  ctx: C & AuthedContext,
) => Promise<Response> | Response;

export function withAuth<C = unknown>(
  handler: Handler<C>,
  opts: { role?: Role } = {},
): (request: Request, ctx?: C) => Promise<Response> {
  return async (request, ctx) => {
    const base = { ...(ctx as C) } as C;
    const token = extractToken(request);
    const result = token ? await verifySession(token) : null;

    if (result?.valid) {
      if (opts.role && result.claims.role !== opts.role) {
        return NextResponse.json(
          { error: "Forbidden — this resource requires a different role" },
          { status: 403 },
        );
      }
      return handler(request, {
        ...base,
        auth: { ...result.claims, demo: false },
      } as C & AuthedContext);
    }

    // No session, or an invalid/expired one.
    if (authEnforced()) {
      const expired = result && !result.valid && result.reason === "expired";
      return NextResponse.json(
        { error: expired ? "Session expired" : "Authentication required" },
        { status: 401 },
      );
    }

    // Demo mode: allow through, flagged so handlers can tell it apart.
    return handler(request, {
      ...base,
      auth: { address: "", role: opts.role ?? "doctor", demo: true },
    } as C & AuthedContext);
  };
}
