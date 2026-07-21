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
import { privyEmail as extractEmail } from "@/lib/auth/privy-email";

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
