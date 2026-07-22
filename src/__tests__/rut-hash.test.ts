/**
 * Regression tests for the RUT identity key (src/lib/identity/rut.ts).
 * Lock in: deterministic + pepper-dependent hashing, normalization so formatted
 * and bare RUTs map to the SAME key, rejection of invalid RUTs, and fail-closed
 * behaviour when the pepper is missing.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hashRut, tryHashRut, RutError } from "@/lib/identity/rut";

// A valid Chilean RUT (módulo-11): 12.345.678-5.
const RUT_FORMATTED = "12.345.678-5";
const RUT_BARE = "123456785";
const RUT_INVALID = "12.345.678-0"; // wrong check digit

describe("hashRut", () => {
  const PEPPER = "test-pepper-0123456789abcdef";
  beforeEach(() => {
    process.env.TRUSTLEAF_RUT_PEPPER = PEPPER;
  });
  afterEach(() => {
    delete process.env.TRUSTLEAF_RUT_PEPPER;
  });

  it("is deterministic for the same RUT + pepper", () => {
    expect(hashRut(RUT_FORMATTED)).toBe(hashRut(RUT_FORMATTED));
  });

  it("maps formatted and bare forms of the same RUT to the same key", () => {
    expect(hashRut(RUT_FORMATTED)).toBe(hashRut(RUT_BARE));
  });

  it("returns a 64-char lowercase hex digest", () => {
    expect(hashRut(RUT_FORMATTED)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the pepper changes (keyed, not plain hash)", () => {
    const a = hashRut(RUT_BARE);
    process.env.TRUSTLEAF_RUT_PEPPER = "a-completely-different-pepper-value";
    expect(hashRut(RUT_BARE)).not.toBe(a);
  });

  it("rejects an invalid RUT (bad check digit)", () => {
    expect(() => hashRut(RUT_INVALID)).toThrow(RutError);
  });

  it("fails closed when the pepper is missing", () => {
    delete process.env.TRUSTLEAF_RUT_PEPPER;
    expect(() => hashRut(RUT_BARE)).toThrow(RutError);
  });

  it("fails closed when the pepper is too short", () => {
    process.env.TRUSTLEAF_RUT_PEPPER = "short";
    expect(() => hashRut(RUT_BARE)).toThrow(RutError);
  });
});

describe("tryHashRut", () => {
  beforeEach(() => {
    process.env.TRUSTLEAF_RUT_PEPPER = "test-pepper-0123456789abcdef";
  });
  afterEach(() => {
    delete process.env.TRUSTLEAF_RUT_PEPPER;
  });

  it("returns the hash for a valid RUT", () => {
    expect(tryHashRut(RUT_FORMATTED)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns null for an invalid RUT instead of throwing", () => {
    expect(tryHashRut(RUT_INVALID)).toBeNull();
  });

  it("still throws when the pepper is missing (config bug, not bad input)", () => {
    delete process.env.TRUSTLEAF_RUT_PEPPER;
    expect(() => tryHashRut(RUT_BARE)).toThrow(RutError);
  });
});
