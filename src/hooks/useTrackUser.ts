"use client";
/**
 * Tracks authenticated Privy users to our Neon `registered_users` table.
 * Call once in a top-level client component after authentication.
 */
import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

export function useTrackUser() {
  const { user, authenticated } = usePrivy();
  const tracked = useRef(false);

  useEffect(() => {
    if (!authenticated || !user || tracked.current) return;
    tracked.current = true;

    const email  = user.email?.address ?? null;
    const wallet = user.wallet?.address ?? null;

    fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privyId: user.id, email, wallet }),
    }).catch(() => {/* silent */});
  }, [authenticated, user]);
}
