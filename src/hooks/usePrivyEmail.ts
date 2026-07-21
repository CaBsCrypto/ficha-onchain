import { usePrivy } from "@privy-io/react-auth";
import { privyEmail } from "@/lib/auth/privy-email";

/**
 * Returns the best available email for the authenticated Privy user, resolving
 * across every login method (email-OTP, Google, LinkedIn, linked accounts).
 * Thin hook wrapper over the shared {@link privyEmail} resolver. Returns null
 * if no email is available.
 */
export function usePrivyEmail(): string | null {
  const { user } = usePrivy();
  return privyEmail(user);
}
