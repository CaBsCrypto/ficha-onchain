/**
 * Google OAuth 2.0 helpers for TrustLeaf telemedicine.
 * Token store is in-memory (resets on server restart).
 * Production: replace with Vercel KV / Upstash Redis.
 */
import { google } from "googleapis";

// Derive types entirely from googleapis' own bundled google-auth-library.
// Importing from the top-level "google-auth-library" causes duplicate-package
// type conflicts because googleapis-common ships its own pinned copy.
type GoogleOAuth2 = InstanceType<typeof google.auth.OAuth2>;
type Credentials = Parameters<GoogleOAuth2["setCredentials"]>[0];

export type { GoogleOAuth2 };

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

export function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/auth/google/callback`;
}

const SCOPES = [
  "https://www.googleapis.com/auth/meetings.space.created",
  "openid",
  "email",
];

// In-memory token store keyed by doctor Stellar wallet (G...).
const tokenStore = new Map<string, Credentials>();

export function createOAuthClient(): GoogleOAuth2 {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, getRedirectUri());
}

export function getAuthUrl(doctorWallet: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: Buffer.from(JSON.stringify({ wallet: doctorWallet })).toString("base64url"),
  });
}

export function storeTokens(doctorWallet: string, tokens: Credentials): void {
  tokenStore.set(doctorWallet, tokens);
}

export function getTokens(doctorWallet: string): Credentials | undefined {
  return tokenStore.get(doctorWallet);
}

export function hasTokens(doctorWallet: string): boolean {
  return tokenStore.has(doctorWallet);
}

export function getAuthorizedClient(doctorWallet: string): GoogleOAuth2 {
  const tokens = getTokens(doctorWallet);
  if (!tokens) {
    throw new Error(
      `Doctor ${doctorWallet} has not authorized Google. Redirect to /api/auth/google?wallet=<wallet>`,
    );
  }
  const client = createOAuthClient();
  client.setCredentials(tokens);
  client.on("tokens", (refreshed) => {
    storeTokens(doctorWallet, { ...tokens, ...refreshed });
  });
  return client;
}
