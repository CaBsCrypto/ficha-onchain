/**
 * At-rest encryption invariants. The interesting cases are the failure modes:
 * a tampered ciphertext must throw (GCM), an encrypted value without the key
 * must throw (unreadable data never masquerades as readable), and legacy
 * cleartext must pass through so reads keep working mid-rollout.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptAtRest, encryptAtRest, isEncrypted } from "@/lib/crypto/at-rest";

const KEY = "a".repeat(64); // deterministic test key, 32 bytes hex

describe("cifrado at-rest", () => {
  const original = process.env.TRUSTLEAF_DATA_KEY;
  beforeEach(() => { process.env.TRUSTLEAF_DATA_KEY = KEY; });
  afterEach(() => { process.env.TRUSTLEAF_DATA_KEY = original; });

  it("roundtrip: cifra y descifra texto clínico con tildes y saltos", () => {
    const plain = "Hipertensión arterial esencial (I10)\nPA 140/90 · Losartán 50mg";
    const stored = encryptAtRest(plain)!;
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("Hipertensión"); // el texto NO está en claro
    expect(decryptAtRest(stored)).toBe(plain);
  });

  it("es idempotente: cifrar lo ya cifrado no lo doble-cifra", () => {
    const once = encryptAtRest("dato")!;
    expect(encryptAtRest(once)).toBe(once);
  });

  it("legacy en claro pasa intacto en lectura (rollout incremental)", () => {
    expect(decryptAtRest("texto guardado antes del cifrado")).toBe(
      "texto guardado antes del cifrado",
    );
  });

  it("null y vacío pasan sin tocar", () => {
    expect(encryptAtRest(null)).toBeNull();
    expect(decryptAtRest(null)).toBeNull();
    expect(encryptAtRest("")).toBe("");
  });

  it("un byte alterado revienta, no devuelve basura creíble (GCM)", () => {
    const stored = encryptAtRest("dato sensible")!;
    const parts = stored.split(":");
    const ct = Buffer.from(parts[4], "base64");
    ct[0] ^= 0xff;
    parts[4] = ct.toString("base64");
    expect(() => decryptAtRest(parts.join(":"))).toThrow();
  });

  it("cifrado sin key configurada degrada a claro; descifrado sin key LANZA", () => {
    const stored = encryptAtRest("dato")!;
    delete process.env.TRUSTLEAF_DATA_KEY;
    // Escribir sin key: passthrough (los previews sin la env no caen).
    expect(encryptAtRest("nuevo")).toBe("nuevo");
    // Leer cifrado sin key: imposible por definición — jamás fingirlo.
    expect(() => decryptAtRest(stored)).toThrow(/TRUSTLEAF_DATA_KEY/);
  });

  it("una key de formato inválido lanza con instrucciones", () => {
    process.env.TRUSTLEAF_DATA_KEY = "no-es-hex";
    expect(() => encryptAtRest("x")).toThrow(/64 caracteres hex/);
  });
});
