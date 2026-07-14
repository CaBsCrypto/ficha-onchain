"use client";
/**
 * Tracks authenticated Privy users to our Neon `registered_users` table.
 * - Wallet: Stellar G… address fetched from /api/privy/stellar-wallet (server-side Privy API)
 * - Email:  checks email, google, twitter, and linkedAccounts fallback
 *
 * NOTE: We do NOT use useSolanaWallets() because the embedded wallets are Stellar-type,
 * not Solana-type. The server API correctly creates/retrieves them via privy.walletApi.
 */
import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

/** Extract the best email from the Privy user object regardless of login method. */
function extractEmail(user: ReturnType<typeof usePrivy>["user"]): string | null {
  if (!user) return null;
  // Direct email login
  if (user.email?.address) return user.email.address;
  // Google OAuth
  if (user.google?.email) return user.google.email;
  // LinkedIn
  if (user.linkedin?.email) return user.linkedin.email;
  // Scan linkedAccounts for any email
  if (user.linkedAccounts) {
    for (const acct of user.linkedAccounts) {
      if ("email" in acct && typeof acct.email === "string" && acct.email) {
        return acct.email;
      }
      if ("emailAddress" in acct && typeof acct.emailAddress === "string" && acct.emailAddress) {
        return acct.emailAddress;
      }
    }
  }
  return null;
}

export function useTrackUser() {
  const { user, authenticated, getAccessToken } = usePrivy();
  const tracked = useRef<string | null>(null);

  useEffect(() => {
    if (!authenticated || !user) return;
    // Only run once per user session (user.id is stable)
    if (tracked.current === user.id) return;
    tracked.current = user.id;

    const email = extractEmail(user);

    // Fetch the real Stellar G… address from the server API (same as patient portal does)
    void (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/privy/stellar-wallet", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { address?: string; error?: string };
        const wallet = data.address ?? null;

        await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ privyId: user.id, email, wallet }),
        });
      } catch {
        // silent — non-critical tracking
      }
    })();
  }, [authenticated, user, getAccessToken]);
}
