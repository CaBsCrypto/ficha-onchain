/**
 * Unit tests for AI Document Extractor (src/lib/ai/document-extractor.ts).
 * ---------------------------------------------------------------------------
 * Tests heuristic fallback extraction, structured output schema compliance,
 * and handling of document categories (exams, prescriptions, reports).
 */
import { describe, it, expect } from "vitest";
import {
  extractClinicalDocumentData,
  heuristicFallbackExtractor,
} from "@/lib/ai/document-extractor";

describe("Document Extraction (Offline / Heuristic Fallback)", () => {
  it("extrae correctamente resultados de laboratorio para exámenes de sangre / creatinina", async () => {
    const res = await extractClinicalDocumentData({
      title: "Examen de Sangre y Creatinina Marzo",
      fileName: "examen_creatinina.pdf",
      category: "Examen",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("creatinina 1.1 mg/dL hemograma completo").toString("base64"),
    });

    expect(res.engineUsed).toBe("heuristic-fallback");
    expect(res.labResults.length).toBeGreaterThan(0);
    expect(res.labResults[0].testName).toContain("Creatinina");
    expect(res.suggestedEntries.length).toBeGreaterThan(0);
    expect(res.suggestedEntries[0].kind).toBe("Observation");
  });

  it("extrae medicamentos y diagnósticos para recetas médicas de Losartán", async () => {
    const res = await extractClinicalDocumentData({
      title: "Receta Médica Dr. Pérez",
      fileName: "receta_losartan.jpg",
      category: "Receta",
      mimeType: "image/jpeg",
      contentBase64: Buffer.from("receta losartan potasico 50mg cada 12 horas").toString("base64"),
    });

    expect(res.engineUsed).toBe("heuristic-fallback");
    expect(res.medications.length).toBeGreaterThan(0);
    expect(res.medications[0].name).toContain("Losartán");
    expect(res.diagnoses.length).toBeGreaterThan(0);
    expect(res.diagnoses[0].cie10).toBe("I10");
    expect(res.suggestedEntries[0].kind).toBe("MedicationStatement");
  });

  it("extrae sugerencias válidas para informes de imagenología", () => {
    const res = heuristicFallbackExtractor({
      title: "Ecografía Abdominal Completa",
      category: "Informe",
      contentBase64: Buffer.from("informe ecografia abdominal sin hallazgos patologicos").toString("base64"),
    });

    expect(res.suggestedEntries.length).toBeGreaterThan(0);
    expect(res.suggestedEntries[0].kind).toBe("DiagnosticReport");
    expect(res.summary).toContain("Ecografía Abdominal Completa");
  });

  it("garantiza que los kinds sugeridos pertenezcan a la lista FHIR válida", () => {
    const validKinds = new Set([
      "DiagnosticReport",
      "Observation",
      "MedicationStatement",
      "Procedure",
    ]);

    const res = heuristicFallbackExtractor({
      title: "Documento genérico desconocido",
      category: "Otro",
      contentBase64: "YWJjZGU=",
    });

    for (const entry of res.suggestedEntries) {
      expect(validKinds.has(entry.kind)).toBe(true);
    }
  });
});
