import { describe, it, expect } from "vitest";
import { buildVerifyUrl, parseVerifyToken } from "@/lib/share/url";

describe("buildVerifyUrl", () => {
  it("builds a /verify URL with the token query-encoded", () => {
    expect(buildVerifyUrl("https://trustleaf.cl", "abc.def")).toBe(
      "https://trustleaf.cl/verify?token=abc.def",
    );
  });

  it("does not double up slashes when origin has a trailing slash", () => {
    expect(buildVerifyUrl("https://trustleaf.cl/", "tok")).toBe(
      "https://trustleaf.cl/verify?token=tok",
    );
  });

  it("percent-encodes tokens containing URL-reserved characters", () => {
    const url = buildVerifyUrl("https://x.io", "a+b/c=d");
    expect(url).toContain("token=a%2Bb%2Fc%3Dd");
  });
});

describe("parseVerifyToken", () => {
  it("extracts the token from an absolute verifier URL", () => {
    expect(
      parseVerifyToken("https://trustleaf.cl/verify?token=abc.def"),
    ).toBe("abc.def");
  });

  it("round-trips with buildVerifyUrl (decodes encoded tokens)", () => {
    const token = "a+b/c=d";
    expect(parseVerifyToken(buildVerifyUrl("https://x.io", token))).toBe(token);
  });

  it("extracts the token from a relative path + query", () => {
    expect(parseVerifyToken("/verify?token=xyz")).toBe("xyz");
  });

  it("accepts a bare query string", () => {
    expect(parseVerifyToken("token=xyz")).toBe("xyz");
  });

  it("accepts a bare token pasted by hand", () => {
    expect(parseVerifyToken("justatoken")).toBe("justatoken");
  });

  it("ignores unrelated query params", () => {
    expect(
      parseVerifyToken("https://trustleaf.cl/verify?foo=1&token=t2&bar=2"),
    ).toBe("t2");
  });

  it("returns null for a URL with no token", () => {
    expect(parseVerifyToken("https://trustleaf.cl/verify")).toBeNull();
    expect(parseVerifyToken("/verify?foo=bar")).toBeNull();
  });

  it("returns null for empty / whitespace input", () => {
    expect(parseVerifyToken("")).toBeNull();
    expect(parseVerifyToken("   ")).toBeNull();
  });
});
