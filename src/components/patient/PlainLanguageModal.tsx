"use client";
/**
 * PlainLanguageModal — Explicaciones médicas en palabras simples (Fase 3 IA).
 * ---------------------------------------------------------------------------
 * Traduce términos y exámenes médicos complejos a lenguaje sencillo para el paciente.
 * Incluye takeaway clave, pregunta sugerida para el médico y el aviso médico obligatorio.
 */
import { useState, useEffect } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";
import type { PlainLanguageExplanation } from "@/lib/ai/patient-explainer";

interface Props {
  patientEmail: string;
  termOrResult: string;
  context?: string;
  onClose: () => void;
}

export function PlainLanguageModal({
  patientEmail,
  termOrResult,
  context,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlainLanguageExplanation | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchExplanation() {
      setLoading(true);
      setError(null);
      try {
        const res = await authedFetch("/api/patient/ai-explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientEmail, termOrResult, context }),
        });
        const json = (await res.json()) as {
          error?: string;
          explanation?: PlainLanguageExplanation;
        };

        if (!active) return;
        if (!res.ok || json.error) {
          setError(json.error || "No se pudo generar la explicación.");
          setLoading(false);
          return;
        }

        if (json.explanation) {
          setData(json.explanation);
        }
      } catch {
        if (active) setError("Error de red al solicitar la explicación.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchExplanation();
    return () => {
      active = false;
    };
  }, [patientEmail, termOrResult, context]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
              <span className="text-base">💬</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink truncate max-w-xs">
                En palabras simples
              </h3>
              <p className="text-[11px] text-muted truncate">{termOrResult}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="py-8 text-center space-y-3">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600"></div>
              <p className="text-xs font-semibold text-slate-600">
                Generando explicación sencilla para tu examen...
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-50 p-4 text-xs text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          {!loading && data && (
            <>
              {/* Explicación principal */}
              <div className="rounded-2xl bg-teal-50/50 p-4 ring-1 ring-teal-100 space-y-1.5">
                <p className="text-xs font-bold text-teal-900">¿Qué significa?</p>
                <p className="text-sm text-teal-950 font-medium leading-relaxed">
                  {data.plainTextExplanation}
                </p>
              </div>

              {/* Takeaway principal */}
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/80 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Aspecto clave a recordar
                </p>
                <p className="text-xs font-semibold text-ink leading-relaxed">
                  💡 {data.keyTakeaway}
                </p>
              </div>

              {/* Pregunta sugerida para el médico */}
              <div className="rounded-2xl bg-indigo-50/50 p-4 ring-1 ring-indigo-100 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                  Sugerencia para tu próxima consulta
                </p>
                <p className="text-xs font-medium text-indigo-950">
                  🗣️ Puedes preguntarle a tu médico: <span className="italic">"{data.suggestedQuestionForDoctor}"</span>
                </p>
              </div>

              {/* Disclaimer médico obligatorio */}
              <div className="rounded-2xl bg-amber-50/70 p-3.5 ring-1 ring-amber-200/70 text-[11px] text-amber-900 leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <span>⚠️</span> Aviso importante
                </p>
                <p>{data.disclaimer}</p>
              </div>
            </>
          )}
        </div>

        {/* Pie */}
        <div className="flex items-center justify-end border-t border-slate-100 px-6 py-3.5 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
