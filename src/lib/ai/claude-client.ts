/**
 * Cliente Anthropic compartido para los módulos de src/lib/ai.
 * ---------------------------------------------------------------------------
 * document-extractor, patient-explainer y record-rag repetían el mismo fetch a
 * la Messages API (headers, versión, chequeo de status y extracción del primer
 * bloque de texto). Este módulo es la única copia; cada motor conserva su
 * modelo, prompt y fallback heurístico propios.
 *
 * SERVER ONLY: usa la API key de proceso; nunca importar desde un componente
 * de cliente.
 */

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

export interface ClaudeCallOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  messages: ClaudeMessage[];
  system?: string;
}

/**
 * Llama a la Messages API y devuelve el texto del primer bloque de contenido
 * (trim aplicado). Lanza `Error` si la respuesta HTTP no es 2xx, incluyendo el
 * cuerpo del error cuando está disponible — los callers capturan y activan su
 * fallback heurístico.
 */
export async function callClaudeMessages(opts: ClaudeCallOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Claude API error ${response.status}${errorText ? `: ${errorText}` : ""}`,
    );
  }

  const json = (await response.json()) as { content?: Array<{ text?: string }> };
  return json.content?.[0]?.text?.trim() || "";
}

/**
 * Quita el fence markdown ```json ... ``` que el modelo a veces agrega pese a
 * las instrucciones, dejando el JSON crudo listo para `JSON.parse`.
 */
export function stripJsonFences(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}
