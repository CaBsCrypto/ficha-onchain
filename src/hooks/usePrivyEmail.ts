import { usePrivy } from "@privy-io/react-auth";

/**
 * Returns the best available email for the authenticated Privy user.
 * Checks the primary email field first, then falls back to any linked Google OAuth account.
 * Returns null if no email is available.
 */
export function usePrivyEmail(): string | null {
  const { user } = usePrivy();
  if (!user) return null;
  return (
    user.email?.address ??
    (user.linkedAccounts?.find((a) => a.type === "google_oauth") as { email?: string } | undefined)?.email ??
    null
  );
}
