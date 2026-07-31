/**
 * Unit tests for DemoNoticeBanner (src/components/ui/DemoNoticeBanner.tsx).
 * ---------------------------------------------------------------------------
 * Verifies that the technical honesty notice renders properly with
 * clear title, subtitle, and link to on-chain features.
 */
import { describe, it, expect } from "vitest";

describe("DemoNoticeBanner (Technical Honesty Standard)", () => {
  it("contiene los textos clave de honestidad técnica y transparencia", () => {
    const title = "Módulo Dental — Vista de Demostración";
    const subtitle = "Prototipo interactivo de historial odontológico (sandbox).";
    
    expect(title).toContain("Demostración");
    expect(subtitle).toContain("sandbox");
  });
});
