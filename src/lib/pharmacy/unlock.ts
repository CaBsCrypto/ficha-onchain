/**
 * Pharmacy panel unlock token — the value inside the `pharmacy_unlocked` cookie.
 * ---------------------------------------------------------------------------
 * The cookie used to hold the literal "1", which meant `Cookie: pharmacy_unlocked=1`
 * hand-written into a curl skipped the PIN entirely (httpOnly protects browser JS,
 * not an attacker forging their own request). The value is now an HMAC derived
 * from the server-only PHARMACY_PIN, so only a server that verified the PIN can
 * mint it.
 *
 * Demo mode (PHARMACY_PIN unset) keeps the legacy "1": there is no secret to
 * protect and the panel is explicitly running unlocked-for-anyone.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const DEMO_TOKEN = "1";

function expectedToken(): string {
  const pin = process.env.PHARMACY_PIN?.trim();
  if (!pin) return DEMO_TOKEN;
  return createHmac("sha256", pin).update("pharmacy_unlocked:v1").digest("hex");
}

/** Value to set in the cookie after a successful PIN check. */
export function mintUnlockToken(): string {
  return expectedToken();
}

/** True when the request's `pharmacy_unlocked` cookie holds a valid token. */
export function isUnlocked(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)pharmacy_unlocked=([^;]+)/.exec(cookie);
  if (!match) return false;
  const got = Buffer.from(decodeURIComponent(match[1]));
  const want = Buffer.from(expectedToken());
  return got.length === want.length && timingSafeEqual(got, want);
}
