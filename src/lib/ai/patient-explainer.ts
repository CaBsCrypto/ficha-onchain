/**
 * AI Patient Explainer — Plain language medical explanations.
 * ---------------------------------------------------------------------------
 * Phase 3 of "Mis datos: El paciente trae su ficha + IA".
 *
 * Translates complex medical terms, lab results (e.g. "Creatinina 1.4 mg/dL"),
 * and diagnoses into clear, patient-friendly Spanish explanations with practical
 * context and non-negotiable medical disclaimers.
 *
 * Uses Claude via the Anthropic API when ANTHROPIC_API_KEY is present;
 * otherwise uses an intelligent offline patient-friendly explanation dictionary.
 */
import { callClaudeMessages, stripJsonFences } from "@/lib/ai/claude-client";

export interface PlainLanguageExplanation {
  termOrResult: string;
  plainTextExplanation: string;
  keyTakeaway: string;
  suggestedQuestionForDoctor: string;
  disclaimer: string;
  engineUsed: "claude-ai" | "heuristic-fallback";
}

export const MANDATORY_MEDICAL_DISCLAIMER =
  "Esta explicación es estrictamente informativa y educacional, generada mediante Inteligencia Artificial, y no constituye un diagnóstico ni reemplaza la evaluación o indicación de tu médico tratante.";

interface ExplainInput {
  termOrResult: string;
  context?: string | null;
}

export async function explainMedicalTermInPlainLanguage(
  input: ExplainInput
): Promise<PlainLanguageExplanation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      return await explainWithClaude(apiKey, input);
    } catch (err) {
      console.warn("[patient-explainer] fallo llamada a Claude API, activando fallback:", err);
    }
  }

  return heuristicExplainer(input);
}

async function explainWithClaude(
  apiKey: string,
  input: ExplainInput
): Promise<PlainLanguageExplanation> {
  const prompt = `Un paciente consulta por este término o resultado médico: "${input.termOrResult}"${
    input.context ? ` (Contexto: ${input.context})` : ""
  }.

Explica qué significa esto en palabras simples para una persona sin conocimientos de medicina.
Responde ÚNICAMENTE con un JSON válido (sin markdown ni \`\`\`json) con esta estructura exacta:
{
  "plainTextExplanation": "Explicación clara y empática en 2-3 oraciones breves en español neutro/chileno.",
  "keyTakeaway": "Resumen en una frase del aspecto principal a comprender.",
  "suggestedQuestionForDoctor": "Una pregunta relevante que el paciente puede hacer a su médico en el próximo control."
}`;

  const rawText = await callClaudeMessages({
    apiKey,
    model: "claude-3-5-haiku-20241022",
    maxTokens: 600,
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = JSON.parse(stripJsonFences(rawText)) as Partial<PlainLanguageExplanation>;

  return {
    termOrResult: input.termOrResult,
    plainTextExplanation:
      parsed.plainTextExplanation ||
      `Explicación de "${input.termOrResult}": este examen permite a tu médico evaluar tu estado general de salud.`,
    keyTakeaway: parsed.keyTakeaway || "Mantén tus controles médicos al día.",
    suggestedQuestionForDoctor:
      parsed.suggestedQuestionForDoctor ||
      "¿Qué significan estos resultados para mi tratamiento actual?",
    disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
    engineUsed: "claude-ai",
  };
}

export function heuristicExplainer(input: ExplainInput): PlainLanguageExplanation {
  const query = `${input.termOrResult} ${input.context || ""}`.toLowerCase();

  if (query.includes("creatinina")) {
    return {
      termOrResult: input.termOrResult,
      plainTextExplanation:
        "La creatinina es un producto de desecho que tus músculos producen y tus riñones se encargan de filtrar y eliminar por la orina. Medirla en sangre sirve como un indicador de qué tan bien están funcionando tus riñones.",
      keyTakeaway: "Es la prueba principal para revisar la función de los riñones.",
      suggestedQuestionForDoctor: "¿Mis niveles de creatinina muestran que mis riñones están filtrando bien?",
      disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
      engineUsed: "heuristic-fallback",
    };
  }

  if (query.includes("glicemia") || query.includes("glucosa") || query.includes("hemoglobina glicosilada") || query.includes("hba1c")) {
    return {
      termOrResult: input.termOrResult,
      plainTextExplanation:
        "La glicemia mide la cantidad de azúcar (glucosa) presente en tu sangre en el momento del examen. La glucosa es la principal fuente de energía de tu cuerpo, y mantenerla en niveles estables es clave para prevenir o controlar la diabetes.",
      keyTakeaway: "Un nivel adecuado de glicemia indica que tu cuerpo procesa bien el azúcar.",
      suggestedQuestionForDoctor: "¿Requiere este nivel de azúcar algún ajuste en mi alimentación o medicación?",
      disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
      engineUsed: "heuristic-fallback",
    };
  }

  if (query.includes("losartán") || query.includes("losartan") || query.includes("hipertensión") || query.includes("presión")) {
    return {
      termOrResult: input.termOrResult,
      plainTextExplanation:
        "El Losartán ayuda a relajar los vasos sanguíneos para que la sangre fluya con menor esfuerzo, lo que reduce la presión arterial y protege tu corazón y riñones a largo plazo.",
      keyTakeaway: "Controlar la presión arterial previene accidentes cerebrovasculares y problemas cardíacos.",
      suggestedQuestionForDoctor: "¿Mi presión arterial objetivo está bien controlada con esta dosis?",
      disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
      engineUsed: "heuristic-fallback",
    };
  }

  if (query.includes("metformina") || query.includes("diabetes")) {
    return {
      termOrResult: input.termOrResult,
      plainTextExplanation:
        "La Metformina ayuda a tu cuerpo a aprovechar mejor la insulina natural que produce y reduce la cantidad de azúcar que el hígado libera a la sangre.",
      keyTakeaway: "Es un medicamento fundamental para el control del azúcar en personas con resistencia a la insulina o diabetes.",
      suggestedQuestionForDoctor: "¿A qué hora me conviene tomarla para minimizar molestias digestivas?",
      disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
      engineUsed: "heuristic-fallback",
    };
  }

  if (query.includes("hemograma") || query.includes("hemoglobina") || query.includes("anemia")) {
    return {
      termOrResult: input.termOrResult,
      plainTextExplanation:
        "El hemograma hace un recuento completo de las células de tu sangre: glóbulos rojos (que llevan oxígeno), glóbulos blancos (que defienden de infecciones) y plaquetas (que ayudan a la coagulación).",
      keyTakeaway: "Evalúa si hay signos de anemia, defensas bajas o infecciones.",
      suggestedQuestionForDoctor: "¿Mis niveles de glóbulos rojos y hierro están en el rango óptimo?",
      disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
      engineUsed: "heuristic-fallback",
    };
  }

  // General default fallback for any other term
  return {
    termOrResult: input.termOrResult,
    plainTextExplanation: `El término "${input.termOrResult}" corresponde a un registro clínico en tu ficha. Los exámenes e indicaciones médicas ayudan a tu equipo de salud a realizar un seguimiento preventivo y personalizado.`,
    keyTakeaway: "Mantener una copia de tus registros te permite estar informado sobre tu salud.",
    suggestedQuestionForDoctor: `¿Qué significa "${input.termOrResult}" para mi plan de cuidado actual?`,
    disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
    engineUsed: "heuristic-fallback",
  };
}
