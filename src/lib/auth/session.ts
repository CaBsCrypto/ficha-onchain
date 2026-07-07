/**
 * Server-verifiable session tokens for the doctor/patient portals.
 * ---------------------------------------------------------------------------
 * The portals authenticate with a device passkey client-side (see
 * `@/lib/passkey`), but a WebAuthn passkey can't produce a token an API route
 * can cheaply verify on every request. So — mirroring the share-token model in
 * `@/lib/share/token` — the server issues a short-lived signed JWT (HS256) that
 * binds the authenticated wallet + role. Route handlers verify it via
 * `withAuth`; a production upgrade would swap HS256 for an app Ed25519 keypair
 * or a passkey-assertion challenge.
 *
 * Secret: AUTH_SECRET (falls back to the existing JWT_SECRET).
 */
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import type { Role } from "@/types";

const ISSUER = "trustleaf";
const AUDIENCE = "trustleaf-session";
/** Cookie/token lifetime for an authenticated portal session. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h
export const SESSION_COOKIE = "trustleaf_session";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("AUTH_SECRET (or JWT_SECRET) is not configured");
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  /** Authenticated wallet address (G… or smart-wallet contract id). */
  address: string;
  role: Role;
}

export async function signSession(
  claims: SessionClaims,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ address: claims.address, role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export type SessionResult =
  | { valid: true; claims: SessionClaims }
  | { valid: false; reason: "expired" | "invalid" };

export async function verifySession(token: string): Promise<SessionResult> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload.address !== "string" ||
      (payload.role !== "doctor" && payload.role !== "patient")
    ) {
      return { valid: false, reason: "invalid" };
    }
    return {
      valid: true,
      claims: { address: payload.address, role: payload.role },
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { valid: false, reason: "expired" };
    }
    return { valid: false, reason: "invalid" };
  }
}
