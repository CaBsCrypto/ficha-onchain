"use client";
/**
 * Resolve the best email from a Privy user object, regardless of login method.
 *
 * `user.email.address` is only populated for the email-OTP flow. A user who
 * signed in with Google (or LinkedIn) has NO `user.email.address` — their email
 * lives under `user.google.email` / `user.linkedin.email`, or inside a
 * `linkedAccounts` entry. Client code that read `user?.email?.address` directly
 * therefore got `undefined` for every OAuth user, silently breaking any flow
 * keyed on the doctor's / patient's email (patient roster, prescriptions, etc.).
 *
 * This is the client twin of the server-side resolution in
 * `privy-auth.ts#requireUser`. Use it everywhere the UI needs the logged-in
 * user's email.
 */
import type { usePrivy } from "@privy-io/react-auth";

type PrivyUser = ReturnType<typeof usePrivy>["user"];

export function privyEmail(user: PrivyUser): string | null {
  if (!user) return null;
  if (user.email?.address) return user.email.address;      // email-OTP login
  if (user.google?.email) return user.google.email;        // Google OAuth
  if (user.linkedin?.email) return user.linkedin.email;    // LinkedIn OAuth
  // Fallback: scan every linked account for an email-ish field.
  for (const acct of user.linkedAccounts ?? []) {
    if ("email" in acct && typeof acct.email === "string" && acct.email) return acct.email;
    if ("emailAddress" in acct && typeof acct.emailAddress === "string" && acct.emailAddress) {
      return acct.emailAddress;
    }
  }
  return null;
}
