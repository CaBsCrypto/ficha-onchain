/**
 * AI Record RAG Engine — Conversational Chat over Patient's Clinical Records.
 * ---------------------------------------------------------------------------
 * Phase 5 of "Mis datos: El paciente trae su ficha + IA".
 *
 * Answers patient queries in natural language using ONLY verified clinical
 * documents, entries, and prescriptions from their own record.
 *
 * Enforces:
 * 1. Mandatory inline document citations (e.g. [DOC-12: Examen de Sangre]).
 * 2. Explicit refusal to hallucinate if data is missing.
 * 3. Zero open-ended medical prescribing or independent diagnosis.
 * 4. Non-negotiable medical disclaimer.
 */
import { getDb } from "@/lib/db";
import { MANDATORY_MEDICAL_DISCLAIMER } from "@/lib/ai/patient-explainer";

export interface Citation {
  docId: string;
  title: string;
  date: string;
  type: "document" | "entry" | "prescription";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RagChatResponse {
  answer: string;
  citations: Citation[];
  disclaimer: string;
  engineUsed: "claude-rag" | "heuristic-rag";
}

interface RagInput {
  patientEmail: string;
  query: string;
  history?: ChatMessage[];
}

export async function answerPatientQueryWithRAG(
  input: RagInput
): Promise<RagChatResponse> {
  const sql = getDb();

  // Fetch patient records to assemble context
  const entries = await sql`
    SELECT id, kind, summary, detail, created_at
    FROM clinical_entries
    WHERE patient_email = ${input.patientEmail}
    ORDER BY created_at DESC LIMIT 30`;

  const docs = await sql`
    SELECT id, category, title, file_name, created_at
    FROM clinical_documents
    WHERE patient_email = ${input.patientEmail}
    ORDER BY created_at DESC LIMIT 30`;

  const rxs = await sql`
    SELECT id, rx_id, medication, dosage, quantity, prescription_type, created_at
    FROM prescriptions_log
    WHERE patient_email = ${input.patientEmail}
    ORDER BY created_at DESC LIMIT 30`;

  // Assemble context text and track available citations
  const citationsMap = new Map<string, Citation>();
  const contextBlocks: string[] = [];

  for (const doc of docs) {
    const key = `DOC-${doc.id}`;
    const dateStr = new Date(doc.created_at as string).toISOString().slice(0, 10);
    const title = String(doc.title);
    citationsMap.set(key, { docId: key, title, date: dateStr, type: "document" });
    contextBlocks.push(`[${key} | ${title} | Categoría: ${doc.category || "Examen"} | Fecha: ${dateStr}]`);
  }

  for (const entry of entries) {
    const key = `ENT-${entry.id}`;
    const dateStr = new Date(entry.created_at as string).toISOString().slice(0, 10);
    const title = String(entry.summary);
    citationsMap.set(key, { docId: key, title, date: dateStr, type: "entry" });
    contextBlocks.push(
      `[${key} | Tipo: ${entry.kind} | ${title} | Detalle: ${entry.detail || "N/A"} | Fecha: ${dateStr}]`
    );
  }

  for (const rx of rxs) {
    const key = `RX-${rx.id}`;
    const dateStr = new Date(rx.created_at as string).toISOString().slice(0, 10);
    const title = `Receta ${rx.medication} ${rx.dosage || ""}`.trim();
    citationsMap.set(key, { docId: key, title, date: dateStr, type: "prescription" });
    contextBlocks.push(
      `[${key} | Prescripción: ${rx.medication} ${rx.dosage || ""} | Cantidad: ${rx.quantity || 1} | Fecha: ${dateStr}]`
    );
  }

  const contextText =
    contextBlocks.length > 0
      ? contextBlocks.join("\n")
      : "No hay documentos ni registros ingresados aún en esta ficha.";

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      return await queryClaudeRAG(apiKey, input.query, contextText, citationsMap, input.history);
    } catch (err) {
      console.warn("[record-rag] error llamando a Claude API, activando fallback RAG:", err);
    }
  }

  return queryHeuristicRAG(input.query, contextBlocks, citationsMap);
}

async function queryClaudeRAG(
  apiKey: string,
  query: string,
  contextText: string,
  citationsMap: Map<string, Citation>,
  history?: ChatMessage[]
): Promise<RagChatResponse> {
  const systemPrompt = `Eres el Asistente de Salud TrustLeaf. Tu función es responder preguntas del paciente SOBRE SU PROPIA FICHA CLÍNICA utilizando ÚNICAMENTE el contexto de registros proporcionado a continuación.

CONTEXTO DE LA FICHA DEL PACIENTE:
${contextText}

REGLAS ESTRICTAS:
1. Responde en español claro, empático y profesional.
2. Cita SIEMPRE la fuente de cada dato usado mencionando el identificador del documento, por ejemplo: [DOC-12] o [ENT-3].
3. Si la pregunta del paciente NO puede responderse con la información presente en la ficha, di exactamente: "Esa información no figura registrada actualmente en los documentos de tu ficha clínica."
4. NUNCA inventes datos, nunca des diagnósticos independientes ni modifiques indicaciones médicas.
5. Mantén las respuestas concisas (máximo 2-3 párrafos).`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (history && history.length > 0) {
    for (const h of history.slice(-6)) {
      messages.push({ role: h.role, content: h.content });
    }
  }

  messages.push({ role: "user", content: query });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 800,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API HTTP error ${response.status}`);
  }

  const json = (await response.json()) as { content?: Array<{ text?: string }> };
  const rawAnswer = json.content?.[0]?.text?.trim() || "";

  // Extract citations used in answer
  const matchedCitations: Citation[] = [];
  for (const [key, cit] of citationsMap.entries()) {
    if (rawAnswer.includes(key)) {
      matchedCitations.push(cit);
    }
  }

  return {
    answer: rawAnswer,
    citations: matchedCitations,
    disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
    engineUsed: "claude-rag",
  };
}

export function queryHeuristicRAG(
  query: string,
  contextBlocks: string[],
  citationsMap: Map<string, Citation>
): RagChatResponse {
  const q = query.toLowerCase();
  const matchedBlocks: string[] = [];
  const matchedCitations: Citation[] = [];

  for (const block of contextBlocks) {
    const blockLower = block.toLowerCase();
    if (
      (q.includes("receta") && blockLower.includes("prescripción")) ||
      (q.includes("examen") && blockLower.includes("doc-")) ||
      (q.includes("creatinina") && blockLower.includes("creatinina")) ||
      (q.includes("glicemia") && blockLower.includes("glicemia")) ||
      (q.includes("losartán") && blockLower.includes("losartán")) ||
      (q.includes("presión") && blockLower.includes("presión")) ||
      q.split(" ").some((term) => term.length > 4 && blockLower.includes(term))
    ) {
      matchedBlocks.push(block);
      // Find matching key
      const keyMatch = block.match(/\[(DOC-\d+|ENT-\d+|RX-\d+)/);
      if (keyMatch && citationsMap.has(keyMatch[1])) {
        matchedCitations.push(citationsMap.get(keyMatch[1])!);
      }
    }
  }

  if (matchedBlocks.length === 0) {
    return {
      answer: `Esa información no figura registrada actualmente en los documentos cargados en tu ficha clínica. Si tienes un examen o receta en papel sobre "${query}", puedes subirlo en la sección "Agregar mis documentos".`,
      citations: [],
      disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
      engineUsed: "heuristic-rag",
    };
  }

  const firstCit = matchedCitations[0];
  const citText = firstCit ? ` (según tu documento [${firstCit.docId}: ${firstCit.title}])` : "";

  return {
    answer: `En tu ficha médica figura el siguiente registro relevante para "${query}"${citText}: ${matchedBlocks[0].replace(/\[.*?\]\s*/, "")}. Te recomendamos revisar el documento completo en tu línea de tiempo.`,
    citations: matchedCitations,
    disclaimer: MANDATORY_MEDICAL_DISCLAIMER,
    engineUsed: "heuristic-rag",
  };
}
