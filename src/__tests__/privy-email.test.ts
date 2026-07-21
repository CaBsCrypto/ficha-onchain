/**
 * Regression tests for privyEmail() — the resolver that broke the whole doctor
 * portal when a doctor signed in with Google (the code read user.email.address,
 * which is null for OAuth, so doctorEmail was empty and no data loaded).
 * These lock in that email-OTP, Google, LinkedIn and linkedAccounts all resolve.
 */
import { describe, it, expect } from "vitest";
import { privyEmail } from "@/lib/auth/privy-email";

// The real type is Privy's user; we only need the shape the resolver reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUser = (u: any) => u as Parameters<typeof privyEmail>[0];

describe("privyEmail", () => {
  it("resolves the email-OTP address", () => {
    expect(privyEmail(asUser({ email: { address: "otp@mail.cl" } }))).toBe("otp@mail.cl");
  });

  it("resolves a Google OAuth email when email.address is absent", () => {
    // This is the exact case that used to return null and break the doctor portal.
    expect(privyEmail(asUser({ google: { email: "doc@gmail.com" } }))).toBe("doc@gmail.com");
  });

  it("resolves a LinkedIn OAuth email", () => {
    expect(privyEmail(asUser({ linkedin: { email: "pro@linkedin.com" } }))).toBe("pro@linkedin.com");
  });

  it("scans linkedAccounts for an email field", () => {
    expect(privyEmail(asUser({ linkedAccounts: [{ type: "google_oauth", email: "linked@gmail.com" }] })))
      .toBe("linked@gmail.com");
  });

  it("prefers the direct email over an OAuth account", () => {
    expect(privyEmail(asUser({ email: { address: "primary@mail.cl" }, google: { email: "g@gmail.com" } })))
      .toBe("primary@mail.cl");
  });

  it("returns null for a null user", () => {
    expect(privyEmail(asUser(null))).toBeNull();
  });

  it("returns null when no email is present anywhere", () => {
    expect(privyEmail(asUser({ wallet: { address: "GABC" }, linkedAccounts: [] }))).toBeNull();
  });
});
