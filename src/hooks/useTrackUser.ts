"use client";
/**
 * Tracks authenticated Privy users to our Neon `registered_users` table.
 * - Wallet: Stellar G… address from the embedded Solana/Ed25519 wallet
 * - Email:  checks email, google, twitter, and linkedAccounts fallback
 */
import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyWallet } from "@/lib/privy";

/** Extract the best email from the Privy user object regardless of login method. */
function extractEmail(user: ReturnType<typeof usePrivy>["user"]): string | null {
  if (!user) return null;
  // Direct email login
  if (user.email?.address) return user.email.address;
  // Google OAuth
  if (user.google?.email) return user.google.email;
  // Twitter / X (no email usually, skip)
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
  const { user, authenticated } = usePrivy();
  const { stellarAddress } = usePrivyWallet();
  const tracked = useRef<string | null>(null);

  useEffect(() => {
    // Re-track if stellar address changes (wallet just got created)
    const key = `${user?.id}:${stellarAddress}`;
    if (!authenticated || !user || tracked.current === key) return;
    tracked.current = key;

    const email  = extractEmail(user);
    const wallet = stellarAddress; // G... Stellar address

    fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privyId: user.id, email, wallet }),
    }).catch(() => {/* silent */});
  }, [authenticated, user, stellarAddress]);
}
