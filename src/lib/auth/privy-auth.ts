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
import { AccessServiceError } from '@/lib/auth/access-error';

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
      throw new AccessServiceError('auth_configuration_missing', 'configuration');
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
const INVALID_TOKEN_CODES = new Set([
  'ERR_JWT_EXPIRED', 'ERR_JWT_CLAIM_VALIDATION_FAILED', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWS_INVALID', 'ERR_JWT_INVALID', 'ERR_JOSE_ALG_NOT_ALLOWED',
]);
function providerUnavailable(error: unknown): AccessServiceError {
  if (error instanceof AccessServiceError) return error;
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  return status === 401 || status === 403
    ? new AccessServiceError('auth_configuration_invalid', 'configuration')
    : new AccessServiceError('auth_service_unavailable', 'auth_provider');
}

/** Verify the session without conflating a provider/configuration outage with an invalid JWT. */
export async function requirePrivySession(request: Request): Promise<{ userId: string } | null> {
  const token = extractToken(request);
  if (!token) return null;
  try {
    const claims = await getPrivy().verifyAuthToken(token);
    return { userId: claims.userId };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (typeof code === 'string' && INVALID_TOKEN_CODES.has(code)) return null;
    throw providerUnavailable(error);
  }
}

export async function requireUser(request: Request, options: { strict?: boolean } = {}): Promise<AuthedUser | null> {
  try {
    const claims = await requirePrivySession(request);
    if (!claims) return null;
    const privy = getPrivy();
    let user;
    try { user = await privy.getUser(claims.userId); }
    catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) return null;
      throw providerUnavailable(error);
    }

    // Resolve the user's email across login methods. Email-OTP accounts store it
    // under `.address`; OAuth accounts (Google, etc.) under `.email`. Looking
    // only at type==="email" rejected every Google-only user once enforcement
    // was on, because their linkedAccounts hold a `google_oauth` account instead.
    const accounts = (user.linkedAccounts ?? []) as Array<{
      type?: string; address?: string; email?: string;
    }>;
    const emailAccount = accounts.find((a) => a.type === "email" && a.address);
    const oauthEmail = accounts.find((a) => a.email)?.email;
    const email = (emailAccount?.address ?? oauthEmail ?? null)?.trim().toLowerCase() ?? null;

    return { userId: claims.userId, email };
  } catch (err) {
    const failure = providerUnavailable(err);
    if (options.strict) throw failure;
    // Keep the historical nullable contract, without logging credentials or provider payloads.
    console.warn('[auth]', { category: failure.category, code: failure.code });
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

/**
 * Guard for a resource shared by more than one actor (an appointment belongs to
 * BOTH a doctor and a patient; either may act on it). The caller is allowed when
 * their token email matches ANY of `candidateEmails`.
 *
 *   - token matching one candidate  → { email } (the caller's own)
 *   - token matching none           → { error: 403 }
 *   - no token + enforced           → { error: 401 }
 *   - no token + demo               → { email: first candidate }  (param trusted)
 */
export async function requireActor(
  request: Request,
  candidateEmails: (string | null | undefined)[],
): Promise<{ email: string } | { error: NextResponse }> {
  const cands = candidateEmails
    .map((e) => e?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e));
  const user = await requireUser(request);

  if (user?.email) {
    if (cands.length && !cands.includes(user.email)) return { error: forbidden() };
    return { email: user.email };
  }
  if (authEnforced()) return { error: unauthorized() };
  return { email: cands[0] ?? "" };
}

/**
 * Minimal guard for routes that only need "a logged-in user" (no ownership),
 * e.g. resolving another user's public wallet from the doctor portal. Requires a
 * valid token when enforcement is on; passes through in demo mode.
 */
export async function requireAuthOrDemo(
  request: Request,
): Promise<{ error: NextResponse } | null> {
  const user = await requireUser(request);
  if (user) return null;
  if (authEnforced()) return { error: unauthorized() };
  return null;
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
