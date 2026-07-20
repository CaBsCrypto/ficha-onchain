/**
 * Admin authorization.
 *
 * The admin is a real Privy-authenticated user whose email is on an allowlist
 * (`ADMIN_EMAILS`, comma-separated) — the same identity model as doctors and
 * patients, so admin actions are accountable (we know *which* admin acted) and
 * revocable (drop the email from the list) with no shared static secret.
 *
 * A legacy static token (`WAITLIST_ADMIN_TOKEN`) is still accepted as a
 * FALLBACK for automation (scripts, CI) that can't perform a Privy login. It is
 * read from the `x-admin-token` header or a `?token=` query param — never the
 * request body — so POST routes can still read their own body, and it is kept
 * out of logs by preferring the header. Prefer the Privy path for humans.
 */
import { NextResponse } from "next/server";
import { requireUser, unauthorized, forbidden } from "@/lib/auth/privy-auth";

/** Lowercased admin allowlist from ADMIN_EMAILS (comma-separated). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase();
  return Boolean(e) && adminEmails().includes(e!);
}

/** Legacy token from the header or query string — NEVER the body. */
function legacyToken(request: Request): string | null {
  const header = request.headers.get("x-admin-token");
  if (header) return header.trim();
  const q = new URL(request.url).searchParams.get("token");
  return q ? q.trim() : null;
}

/**
 * Authorize an admin request.
 *   - Privy user whose email ∈ ADMIN_EMAILS        → { email }
 *   - valid legacy WAITLIST_ADMIN_TOKEN (fallback)  → { email: "token-admin" }
 *   - a logged-in non-admin                         → { error: 403 }
 *   - nobody                                        → { error: 401 }
 */
export async function requireAdmin(
  request: Request,
): Promise<{ email: string } | { error: NextResponse }> {
  const user = await requireUser(request);
  if (isAdminEmail(user?.email)) return { email: user!.email! };

  const token = legacyToken(request);
  const configured = process.env.WAITLIST_ADMIN_TOKEN;
  if (configured && token && token === configured) return { email: "token-admin" };

  return { error: user ? forbidden() : unauthorized() };
}
