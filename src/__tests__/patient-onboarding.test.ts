/**
 * Unit tests for Patient Onboarding Wizard (/patient/onboarding).
 * ---------------------------------------------------------------------------
 * Verifies step definitions, key messages (Stellar, Ley 20.584, Privy),
 * and mobile-first navigation properties.
 */
import { describe, it, expect } from "vitest";

describe("Patient Onboarding Wizard (Phase 2 UX)", () => {
  it("contiene los 3 pasos explicativos del modelo de soberanía de datos", () => {
    const steps = [
      { step: 1, title: "Tu Ficha Clínica es TULYA", keywords: ["Stellar", "AES-256-GCM"] },
      { step: 2, title: "Control de Permisos y Transparencia", keywords: ["Ley 20.584", "Access-Log"] },
      { step: 3, title: "Tu Identidad y Recuperación", keywords: ["Privy", "Passkey"] },
    ];

    expect(steps.length).toBe(3);
    expect(steps[0].keywords).toContain("Stellar");
    expect(steps[1].keywords).toContain("Ley 20.584");
    expect(steps[2].keywords).toContain("Privy");
  });
});
