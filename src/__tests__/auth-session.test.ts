import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession } from "@/lib/auth/session";

// session.ts reads the secret lazily (per call), so setting it here is enough.
beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-please-ignore";
});

describe("session token", () => {
  it("round-trips a signed session back to its claims", async () => {
    const token = await signSession({ address: "GABC", role: "doctor" });
    const result = await verifySession(token);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims).toEqual({ address: "GABC", role: "doctor" });
    }
  });

  it("rejects a tampered token as invalid", async () => {
    const token = await signSession({ address: "GXYZ", role: "patient" });
    const result = await verifySession(`${token}tampered`);

    expect(result).toEqual({ valid: false, reason: "invalid" });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession({ address: "GXYZ", role: "patient" });
    process.env.AUTH_SECRET = "a-completely-different-secret";
    try {
      const result = await verifySession(token);
      expect(result).toEqual({ valid: false, reason: "invalid" });
    } finally {
      process.env.AUTH_SECRET = "test-secret-please-ignore";
    }
  });
});
