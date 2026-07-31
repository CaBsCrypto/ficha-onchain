/**
 * Unit tests for Phase 3 IA — Patient Explainer & Health Timeline.
 * ---------------------------------------------------------------------------
 * Tests plain language medical explanations, fallback heuristics,
 * mandatory medical disclaimers, and health timeline data structure.
 */
import { describe, it, expect } from "vitest";
import {
  explainMedicalTermInPlainLanguage,
  heuristicExplainer,
  MANDATORY_MEDICAL_DISCLAIMER,
} from "@/lib/ai/patient-explainer";

describe("Patient Explainer (Phase 3 IA)", () => {
  it("genera explicación en lenguaje sencillo para Creatinina", async () => {
    const res = await explainMedicalTermInPlainLanguage({
      termOrResult: "Creatinina 1.4 mg/dL",
    });

    expect(res.plainTextExplanation).toContain("riñones");
    expect(res.keyTakeaway).toBeDefined();
    expect(res.suggestedQuestionForDoctor).toBeDefined();
    expect(res.disclaimer).toBe(MANDATORY_MEDICAL_DISCLAIMER);
  });

  it("genera explicación en lenguaje sencillo para Glicemia", () => {
    const res = heuristicExplainer({
      termOrResult: "Glicemia en ayunas 105 mg/dL",
    });

    expect(res.plainTextExplanation.toLowerCase()).toContain("azúcar");
    expect(res.disclaimer).toBe(MANDATORY_MEDICAL_DISCLAIMER);
  });

  it("genera explicación en lenguaje sencillo para Losartán", () => {
    const res = heuristicExplainer({
      termOrResult: "Losartán Potásico 50mg",
    });

    expect(res.plainTextExplanation.toLowerCase()).toContain("presión");
    expect(res.disclaimer).toBe(MANDATORY_MEDICAL_DISCLAIMER);
  });

  it("incluye SIEMPRE el aviso médico obligatorio no negociable", () => {
    const res = heuristicExplainer({
      termOrResult: "Examen de Orina Completo",
    });

    expect(res.disclaimer).toContain("no constituye un diagnóstico ni reemplaza la evaluación");
  });
});
