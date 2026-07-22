/**
 * Regression tests for assertDbSafe() — the fail-closed guard that stops a
 * Vercel PREVIEW deployment from ever writing to the production database
 * (previews share prod's DATABASE_URL; see AGENTS.md). Locks in: no-op unless
 * fully configured, and a hard throw on the exact hazard.
 */
import { describe, it, expect, afterEach } from "vitest";
import { assertDbSafe, PreviewProdDbError } from "@/lib/db";

const PROD = "postgresql://u:p@ep-rapid-shadow-ahq94785-pooler.neon.tech/db";
const DEV = "postgresql://u:p@ep-lingering-water-ahzh89z5-pooler.neon.tech/db";

describe("assertDbSafe", () => {
  afterEach(() => {
    delete process.env.PROD_DB_HOST_GUARD;
    delete process.env.VERCEL_ENV;
  });

  it("no-op when the guard is not configured", () => {
    process.env.VERCEL_ENV = "preview";
    expect(() => assertDbSafe(PROD)).not.toThrow();
  });

  it("no-op in production even pointing at the prod host", () => {
    process.env.PROD_DB_HOST_GUARD = "ep-rapid-shadow";
    process.env.VERCEL_ENV = "production";
    expect(() => assertDbSafe(PROD)).not.toThrow();
  });

  it("no-op locally (VERCEL_ENV unset)", () => {
    process.env.PROD_DB_HOST_GUARD = "ep-rapid-shadow";
    expect(() => assertDbSafe(PROD)).not.toThrow();
  });

  it("THROWS on a preview pointing at the guarded prod host", () => {
    process.env.PROD_DB_HOST_GUARD = "ep-rapid-shadow";
    process.env.VERCEL_ENV = "preview";
    expect(() => assertDbSafe(PROD)).toThrow(PreviewProdDbError);
  });

  it("allows a preview pointing at a non-prod host", () => {
    process.env.PROD_DB_HOST_GUARD = "ep-rapid-shadow";
    process.env.VERCEL_ENV = "preview";
    expect(() => assertDbSafe(DEV)).not.toThrow();
  });

  it("error message names the host but not the credentials", () => {
    process.env.PROD_DB_HOST_GUARD = "ep-rapid-shadow";
    process.env.VERCEL_ENV = "preview";
    try {
      assertDbSafe(PROD);
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("ep-rapid-shadow");
      expect(msg).not.toContain("u:p"); // no credentials leaked
    }
  });
});
