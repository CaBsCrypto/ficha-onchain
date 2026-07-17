/**
 * fetch() that proves who is calling.
 *
 * Attaches the caller's Privy access token, which the server verifies with
 * `requireUser()` in `src/lib/auth/privy-auth.ts`. Any route that reads or
 * writes someone's data should be called through this rather than plain
 * fetch(), because the alternative — passing `?email=` and having the server
 * trust it — is what let anyone read any patient's record.
 *
 * `getAccessToken` is Privy's standalone export, so this works outside React
 * and does not need `usePrivy()` threaded down through the component tree.
 *
 * Usage is identical to fetch():
 *
 *   const res = await authedFetch("/api/patient/ficha");
 */
import { getAccessToken } from "@privy-io/react-auth";

export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // No token means the session expired or was never established. The request
  // still goes out so the server answers 401 — one place decides access, and
  // it is the server.
  return fetch(input, { ...init, headers });
}
