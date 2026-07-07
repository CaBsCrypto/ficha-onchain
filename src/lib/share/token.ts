/**
 * Temporary share tokens for the public prescription verifier.
 * ---------------------------------------------------------------------------
 * A patient taps "Compartir receta" → the server mints a short-lived (15 min)
 * signed token embedding the prescription id + patient wallet. The token is
 * rendered as a QR pointing at /verify?token=..., a public page that validates
 * the signature + expiry and reads the record from chain — no login required.
 *
 * SIGNING MODEL: the SOW describes signing "with the patient's key". A WebAuthn
 * passkey can't produce a verifiable detached JWT for an arbitrary verifier, so
 * we sign server-side with a symmetric app secret (HS256) and bind the patient
 * wallet into the claims. This keeps the flow fully functional and testable; a
 * production upgrade would swap HS256 for an app Ed25519 keypair (EdDSA) whose
 * public key the verifier pins, or a passkey-assertion challenge.
 */
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

const ISSUER = "trustleaf";
const AUDIENCE = "trustleaf-verify";
export const SHARE_TTL_SECONDS = 15 * 60; // 15 minutes

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export interface ShareClaims {
  rxId: string;
  patient: string;
}

export async function signShareToken(claims: ShareClaims): Promise<string> {
  return new SignJWT({ rxId: claims.rxId, patient: claims.patient })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SHARE_TTL_SECONDS}s`)
    .sign(secretKey());
}

export type VerifyResult =
  | { valid: true; claims: ShareClaims; expiresAt: number }
  | { valid: false; reason: "expired" | "invalid" };

export async function verifyShareToken(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.rxId !== "string" || typeof payload.patient !== "string") {
      return { valid: false, reason: "invalid" };
    }
    return {
      valid: true,
      claims: { rxId: payload.rxId, patient: payload.patient },
      expiresAt: (payload.exp ?? 0) * 1000,
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { valid: false, reason: "expired" };
    }
    return { valid: false, reason: "invalid" };
  }
}
