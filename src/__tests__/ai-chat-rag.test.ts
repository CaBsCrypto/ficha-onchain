/**
 * Unit tests for Phase 5 IA — RAG Conversational Chat over Patient Records.
 * ---------------------------------------------------------------------------
 * Tests RAG context assembly, citation generation, fallback search, boundary
 * enforcement when data is missing, and mandatory medical disclaimers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const docs: Array<Record<string, unknown>> = [];
const entries: Array<Record<string, unknown>> = [];
const rxs: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db", () => ({
  getDb: () => {
    return async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("clinical_documents")) return docs;
      if (query.includes("clinical_entries")) return entries;
      if (query.includes("prescriptions_log")) return rxs;
      return [];
    };
  },
}));

import { answerPatientQueryWithRAG, queryHeuristicRAG } from "@/lib/ai/record-rag";
import { MANDATORY_MEDICAL_DISCLAIMER } from "@/lib/ai/patient-explainer";

beforeEach(() => {
  docs.length = 0;
  entries.length = 0;
  rxs.length = 0;
});

describe("AI Record RAG Chat (Phase 5)", () => {
  it("responde consulta sobre recetas incluyendo citaciones verificadas", async () => {
    rxs.push({
      id: 5,
      rx_id: "RX-101",
      medication: "Losartán Potásico",
      dosage: "50 mg",
      quantity: 1,
      created_at: new Date().toISOString(),
    });

    const res = await answerPatientQueryWithRAG({
      patientEmail: "paciente@example.com",
      query: "¿Qué medicamentos tengo recetados?",
    });

    expect(res.answer).toContain("Losartán");
    expect(res.citations.length).toBeGreaterThan(0);
    expect(res.citations[0].docId).toBe("RX-5");
    expect(res.disclaimer).toBe(MANDATORY_MEDICAL_DISCLAIMER);
  });

  it("declara explícitamente cuando la información consultada NO figura en la ficha", async () => {
    const res = await answerPatientQueryWithRAG({
      patientEmail: "paciente@example.com",
      query: "¿Cuándo fue mi examen de resonancia magnética cerebral?",
    });

    expect(res.answer).toContain("no figura registrada actualmente");
    expect(res.citations.length).toBe(0);
  });

  it("incluye citación directa en el resultado del fallback heurístico RAG", () => {
    const citationsMap = new Map();
    citationsMap.set("DOC-12", {
      docId: "DOC-12",
      title: "Examen de Sangre Marzo",
      date: "2026-07-28",
      type: "document",
    });

    const res = queryHeuristicRAG(
      "creatinina",
      ["[DOC-12 | Examen de Sangre | Creatinina 1.1 mg/dL | Fecha: 2026-07-28]"],
      citationsMap
    );

    expect(res.answer).toContain("DOC-12");
    expect(res.citations.length).toBe(1);
    expect(res.disclaimer).toBe(MANDATORY_MEDICAL_DISCLAIMER);
  });
});
