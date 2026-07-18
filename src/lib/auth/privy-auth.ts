/**
 * Server-side identity, derived from the caller's Privy access token.
 *
 * This is the only trustworthy answer to "who is asking?". Routes used to take
 * `?email=` or `?doctorEmail=` from the query string and trust it, which meant
 * anyone could read or overwrite any patient's record by guessing an address —
 * emails are not secrets, they appear in every appointment row.
 *
 * `src/lib/auth/withAuth.ts` looks like it solves this and does not: it verifies
 * a TrustLeaf-issued session token that nothing in the app ever issues
 * (`signSession` has no callers outside its tests), and it falls through to a
 * synthesised demo session unless TRUSTLEAF_REQUIRE_AUTH is set — a variable
 * that appears in no env file. Privy is the app's real login, so identity comes
 * from Privy.
 *
 * Usage:
 *
 *   const user = await requireUser(request);
 *   if (!user) return unauthorized();
 *   // user.email is verified — compare it against the record being touched
 */
import { PrivyClient } from "@privy-io/server-auth";
import { NextResponse } from "next/server";

export interface AuthedUser {
  /** Privy DID, e.g. "did:privy:cmrixg4c702vy0cjmt0jsyt8s" */
  userId: string;
  /** Verified email, lowercased. Null when the account has no email linked. */
  email: string | null;
}

let client: PrivyClient | null = null;

function getPrivy(): PrivyClient {
  if (!client) {
    const appId = process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const secret = process.env.PRIVY_APP_SECRET;
    if (!appId || !secret) {
      throw new Error("PRIVY_APP_ID / PRIVY_APP_SECRET are not set");
    }
    client = new PrivyClient(appId, secret);
  }
  return client;
}

/** Pulls the bearer token out of the Authorization header. */
function extractToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

/**
 * Verifies the caller's Privy token and resolves their identity.
 *
 * Returns null on any failure — missing token, invalid signature, expired,
 * Privy unreachable. Callers must treat null as "denied", never as "allow".
 */
export async function requireUser(request: Request): Promise<AuthedUser | null> {
  const token = extractToken(request);
  if (!token) return null;

  try {
    const privy = getPrivy();
    const claims = await privy.verifyAuthToken(token);
    const user = await privy.getUser(claims.userId);

    const emailAccount = (user.linkedAccounts ?? []).find((a) => a.type === "email") as
      | { address?: string }
      | undefined;

    return {
      userId: claims.userId,
      email: emailAccount?.address?.trim().toLowerCase() ?? null,
    };
  } catch (err) {
    // Includes an unreachable Privy. Failing closed is deliberate: a network
    // problem must not read as "this request is fine".
    console.error("[auth] token verification failed:", err);
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * True when authentication must be strictly enforced. Off by default so the
 * demo (and the HTTP flow tests) work token-less; flip TRUSTLEAF_REQUIRE_AUTH
 * (or enable passkeys) in production to lock every guarded route down.
 */
export function authEnforced(): boolean {
  return (
    process.env.TRUSTLEAF_REQUIRE_AUTH === "true" ||
    process.env.NEXT_PUBLIC_PASSKEY_ENABLED === "true"
  );
}

/**
 * Ownership guard for routes that act on a single actor's own data
 * (a doctor's availability, their patient roster, …).
 *
 * Resolves the email the request is allowed to act as:
 *   - a valid token whose email matches `claimedEmail`  → { email } (own email)
 *   - a valid token whose email does NOT match          → { error: 403 }
 *   - no/invalid token AND auth is enforced             → { error: 401 }
 *   - no/invalid token AND not enforced (demo)          → { email: claimedEmail }
 *
 * This closes the IDOR where a logged-in user reads/writes someone else's data
 * by swapping the `?email=` param, while keeping the token-less demo working.
 * Turn on enforcement in prod to reject anonymous callers outright.
 */
export async function resolveOwnerEmail(
  request: Request,
  claimedEmail: string | null | undefined,
): Promise<{ email: string } | { error: NextResponse }> {
  const wanted = claimedEmail?.trim().toLowerCase() || "";
  const user = await requireUser(request);

  if (user?.email) {
    if (wanted && !ownsEmail(user, wanted)) return { error: forbidden() };
    return { email: user.email };
  }

  if (authEnforced()) return { error: unauthorized() };
  if (!wanted) return { error: unauthorized() };
  return { email: wanted };
}

export function forbidden() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

/**
 * True when `email` belongs to the caller.
 *
 * Case-insensitive because emails arrive in whatever case the user typed, while
 * the database stores them lowercased.
 */
export function ownsEmail(user: AuthedUser, email: string | null | undefined): boolean {
  if (!user.email || !email) return false;
  return user.email === email.trim().toLowerCase();
}

/**
 * Resolves the caller's role from the `doctors` table.
 *
 * A doctor is someone with an active row there — the same table the admin CRUD
 * writes. Kept separate from `requireUser` so routes that only need identity do
 * not pay for a database round-trip.
 */
export async function isDoctor(
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>,
  user: AuthedUser,
): Promise<boolean> {
  if (!user.email) return false;
  const rows = await sql`
    SELECT 1 FROM doctors
    WHERE LOWER(email) = ${user.email} AND status = 'active'
    LIMIT 1`;
  return rows.length > 0;
}
