"use client";
/**
 * FichaChatWidget — Chat Conversacional sobre la Ficha del Paciente (Fase 5 IA RAG).
 * ---------------------------------------------------------------------------
 * Permite al paciente consultar en lenguaje natural sobre sus registros clínicos.
 * Las respuestas incluyen citas verificadas a documentos específicos y aviso médico.
 */
import { useState, useRef, useEffect } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";
import type { Citation } from "@/lib/ai/record-rag";

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: string;
}

interface Props {
  patientEmail: string;
}

export function FichaChatWidget({ patientEmail }: Props) {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "¡Hola! Soy tu Asistente de Ficha Médica. Puedes hacerme preguntas sobre tus exámenes, recetas, atenciones y diagnósticos registrados. Todas mis respuestas incluyen citas a tus documentos.",
      timestamp: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  async function sendMessage(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: MessageItem = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await authedFetch("/api/patient/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientEmail,
          message: text,
          history,
        }),
      });

      const json = (await res.json()) as {
        error?: string;
        answer?: string;
        citations?: Citation[];
        disclaimer?: string;
      };

      if (!res.ok || json.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: json.error || "No se pudo procesar tu consulta. Intenta de nuevo.",
            timestamp: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        return;
      }

      const botMsg: MessageItem = {
        id: `bot-${Date.now()}`,
        role: "assistant",
        content: json.answer || "No se obtuvo respuesta.",
        citations: json.citations || [],
        timestamp: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Error de conexión al consultar con el asistente.",
          timestamp: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const SUGGESTIONS = [
    { label: "💊 ¿Qué medicamentos tengo recetados?", query: "¿Cuáles medicamentos tengo recetados actualmente en mi ficha?" },
    { label: "🩸 ¿Cuándo fue mi último examen de creatinina?", query: "¿Cuándo fue mi último examen de creatinina o laboratorio y cuáles fueron los resultados?" },
    { label: "📋 ¿Cuáles son mis diagnósticos registrados?", query: "¿Qué diagnósticos o condiciones médicas figuran registradas en mi historial?" },
  ];

  return (
    <div className="flex h-[600px] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md">
      {/* Cabecera del chat */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-gradient-to-r from-slate-50 to-indigo-50/40">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white font-bold shadow-sm">
            🤖
          </div>
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              Chat con tu Ficha Médica
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                RAG Citable
              </span>
            </h3>
            <p className="text-xs text-muted">Respuestas basadas únicamente en tus documentos cargados</p>
          </div>
        </div>
      </div>

      {/* Sugerencias rápidas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-2.5 bg-slate-50/50">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sugerencias:</span>
        {SUGGESTIONS.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => void sendMessage(s.query)}
            disabled={loading}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-indigo-50 hover:text-indigo-700 transition-colors disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-3xl p-4 text-xs sm:text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-clinical text-white font-medium rounded-br-none shadow-xs"
                  : "bg-white text-ink border border-slate-200/80 rounded-bl-none shadow-xs space-y-2"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>

              {/* Citaciones en respuestas del asistente */}
              {m.citations && m.citations.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <p className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">
                    📄 Citas verificadas en tu Ficha:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.citations.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-800 ring-1 ring-inset ring-indigo-200/60"
                      >
                        📌 [{c.docId}] {c.title} ({c.date})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span className="mt-1 text-[10px] text-slate-400 px-1">{m.timestamp}</span>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white p-3.5 rounded-2xl border border-slate-200 w-fit">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"></div>
            Consultando tu ficha médica...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Formulario de envío */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="flex items-center gap-3 border-t border-slate-100 px-6 py-4 bg-white"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Haz una pregunta sobre tu ficha médica..."
          disabled={loading}
          className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-clinical focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-2xl bg-clinical px-5 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-50 hover:bg-clinical/90"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
