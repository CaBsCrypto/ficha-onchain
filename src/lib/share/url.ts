/**
 * Share / verifier URL helpers.
 * ---------------------------------------------------------------------------
 * A patient's "Compartir receta" QR encodes a public verifier URL of the form
 * `<origin>/verify?token=<jwt>`. These two pure helpers are the single source
 * of truth for that shape:
 *
 *   • buildVerifyUrl  — used by POST /api/share to mint the QR target.
 *   • parseVerifyToken — used by the pharmacy/QR-scan entry point to pull the
 *     share token back out of a scanned string (which may be a full URL, a
 *     relative path + query, or a bare token pasted by hand).
 *
 * Kept node-free so both server routes and client scanners can import them.
 */

/** Build the public verifier URL a patient QR points at. */
export function buildVerifyUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/verify?token=${encodeURIComponent(token)}`;
}

/**
 * Extract the share token from a scanned/pasted value.
 *
 * Accepts:
 *   • an absolute URL   → "https://host/verify?token=abc"  → "abc"
 *   • a relative path    → "/verify?token=abc"              → "abc"
 *   • a bare query       → "token=abc"                      → "abc"
 *   • a bare token       → "abc"                            → "abc"
 *
 * Returns null when the input looks like a URL/query but carries no token.
 */
export function parseVerifyToken(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Absolute URL.
  try {
    const token = new URL(raw).searchParams.get("token");
    return token && token.length > 0 ? token : null;
  } catch {
    // Not an absolute URL — fall through.
  }

  // Relative path with an explicit query, e.g. "/verify?token=abc".
  const q = raw.indexOf("?");
  if (q >= 0) {
    const token = new URLSearchParams(raw.slice(q + 1)).get("token");
    return token && token.length > 0 ? token : null;
  }

  // Bare query string with no leading "?", e.g. "token=abc&foo=1".
  if (raw.includes("=") || raw.includes("&")) {
    const token = new URLSearchParams(raw).get("token");
    return token && token.length > 0 ? token : null;
  }

  // Looks path-ish but has no token param → invalid.
  if (raw.includes("/")) {
    return null;
  }

  // Bare token pasted directly.
  return raw;
}
