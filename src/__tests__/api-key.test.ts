/**
 * Regression tests for the pure helpers of the MCP API-key auth
 * (src/lib/auth/api-key.ts). authenticateApiKey() needs a DB and is exercised by
 * the end-to-end smoke tests; here we lock in the pure logic: key hashing,
 * env-from-prefix, header extraction and scope checks.
 */
import { describe, it, expect } from "vitest";
import {
  hashApiKey,
  envFromKey,
  extractApiKey,
  hasScope,
  type ApiContext,
} from "@/lib/auth/api-key";

describe("hashApiKey", () => {
  it("is deterministic and 64-char hex", () => {
    const a = hashApiKey("tl_sandbox_abc");
    expect(a).toBe(hashApiKey("tl_sandbox_abc"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("differs per key", () => {
    expect(hashApiKey("tl_sandbox_a")).not.toBe(hashApiKey("tl_sandbox_b"));
  });
});

describe("envFromKey", () => {
  it("maps the prefix to an env", () => {
    expect(envFromKey("tl_sandbox_xyz")).toBe("sandbox");
    expect(envFromKey("tl_live_xyz")).toBe("live");
  });
  it("returns null for a foreign key shape", () => {
    expect(envFromKey("sk_live_stripe")).toBeNull();
    expect(envFromKey("")).toBeNull();
  });
});

describe("extractApiKey", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://x/api/mcp", { method: "POST", headers });

  it("reads Authorization: Bearer", () => {
    expect(extractApiKey(req({ authorization: "Bearer tl_sandbox_1" }))).toBe("tl_sandbox_1");
  });
  it("is case-insensitive on the scheme", () => {
    expect(extractApiKey(req({ authorization: "bearer tl_sandbox_2" }))).toBe("tl_sandbox_2");
  });
  it("falls back to x-api-key", () => {
    expect(extractApiKey(req({ "x-api-key": "tl_sandbox_3" }))).toBe("tl_sandbox_3");
  });
  it("returns null when absent", () => {
    expect(extractApiKey(req({}))).toBeNull();
  });
});

describe("hasScope", () => {
  const ctx = (scopes: string[]): ApiContext => ({
    orgId: 1,
    orgName: "x",
    env: "sandbox",
    scopes,
    trustLevel: "org_vouched",
    signingWallet: null,
  });

  it("matches an exact scope", () => {
    expect(hasScope(ctx(["approval:create"]), "approval:create")).toBe(true);
  });
  it("does not match a scope it lacks", () => {
    expect(hasScope(ctx(["approval:create"]), "approval:read")).toBe(false);
  });
  it("honors the wildcard", () => {
    expect(hasScope(ctx(["*"]), "anything:goes")).toBe(true);
  });
  it("denies when scopes are empty", () => {
    expect(hasScope(ctx([]), "approval:create")).toBe(false);
  });
});
