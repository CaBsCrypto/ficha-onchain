"use client";
/**
 * HealthTimelineView — Línea de Tiempo Narrativa de Salud (Fase 3 IA).
 * ---------------------------------------------------------------------------
 * Integra atenciones médicas, exámenes, recetas y solicitudes en un flujo
 * cronológico unificado con filtros por origen (Médico, Paciente, IA) y botón
 * directo de explicación en palabras simples.
 */
import { useState, useEffect } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";
import { PlainLanguageModal } from "@/components/patient/PlainLanguageModal";
import type { HealthTimelineEvent } from "@/app/api/patient/health-timeline/route";

interface Props {
  patientEmail: string;
}

export function HealthTimelineView({ patientEmail }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<HealthTimelineEvent[]>([]);
  const [narrativeSummary, setNarrativeSummary] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "doctor" | "patient" | "ai">("all");
  const [explainTarget, setExplainTarget] = useState<{ title: string; context?: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTimeline() {
      setLoading(true);
      setError(null);
      try {
        const res = await authedFetch(
          `/api/patient/health-timeline?patientEmail=${encodeURIComponent(patientEmail)}`
        );
        const json = (await res.json()) as {
          error?: string;
          events?: HealthTimelineEvent[];
          narrativeSummary?: string;
        };

        if (!active) return;
        if (!res.ok || json.error) {
          setError(json.error || "No se pudo cargar la línea de tiempo de salud.");
          setLoading(false);
          return;
        }

        setEvents(json.events ?? []);
        setNarrativeSummary(json.narrativeSummary ?? "");
      } catch {
        if (active) setError("Error de red al cargar la línea de tiempo.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadTimeline();
    return () => {
      active = false;
    };
  }, [patientEmail]);

  const filteredEvents = events.filter((e) => {
    if (filter === "all") return true;
    if (filter === "doctor") return e.provenance === "doctor";
    if (filter === "patient") return e.provenance === "patient";
    if (filter === "ai") return e.provenance === "ai";
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Resumen de narrativa de salud */}
      <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-indigo-600 text-white font-bold shadow-sm">
            ⌛
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Línea de Tiempo Narrativa de Salud</h3>
            <p className="text-xs text-muted">Historial médico unificado ordenado cronológicamente</p>
          </div>
        </div>
        {narrativeSummary && (
          <p className="mt-3 text-xs text-slate-700 leading-relaxed font-medium bg-white/80 p-3.5 rounded-2xl border border-slate-200/60">
            {narrativeSummary}
          </p>
        )}

        {/* Filtros por origen */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: "all", label: "Todos los registros", count: events.length },
            { id: "doctor", label: "🩺 Emitidos por Médico", count: events.filter((e) => e.provenance === "doctor").length },
            { id: "patient", label: "👤 Aportados por ti", count: events.filter((e) => e.provenance === "patient").length },
            { id: "ai", label: "🧠 IA Extraídos", count: events.filter((e) => e.provenance === "ai").length },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id as typeof filter)}
              className={
                filter === f.id
                  ? "rounded-full bg-clinical/10 px-3.5 py-1.5 text-xs font-bold text-clinical ring-1 ring-inset ring-clinical/40 shadow-xs"
                  : "rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-ink"
              }
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center space-y-3 bg-white rounded-3xl border border-slate-200/70 p-6">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-clinical/30 border-t-clinical"></div>
          <p className="text-xs font-semibold text-slate-600">Cargando eventos de tu historial...</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 text-xs text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {!loading && filteredEvents.length === 0 && (
        <div className="rounded-3xl border border-slate-200/70 bg-white p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-ink">No hay eventos en este filtro</p>
          <p className="text-xs text-muted">Prueba cambiando el filtro o agrega un nuevo documento a tu ficha.</p>
        </div>
      )}

      {/* Flujo vertical de la línea de tiempo */}
      {!loading && filteredEvents.length > 0 && (
        <div className="relative pl-6 sm:pl-8 space-y-4 before:absolute before:left-3.5 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {filteredEvents.map((e) => {
            const dateFormatted = new Date(e.date).toLocaleDateString("es-CL", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });

            const iconMap = {
              entry: "📋",
              document: "📄",
              prescription: "💊",
              request: "📬",
            };

            const provBadgeMap = {
              doctor: { text: "🩺 Médico", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
              patient: { text: "👤 Aportado por ti", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
              ai: { text: "🧠 IA Extraído", cls: "bg-indigo-50 text-indigo-800 ring-indigo-200" },
              system: { text: "⚙️ Sistema", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
            };

            const provInfo = provBadgeMap[e.provenance] || provBadgeMap.system;

            return (
              <div key={e.id} className="relative group">
                {/* Nodo de la línea de tiempo */}
                <div className="absolute -left-6 sm:-left-8 top-4 grid h-7 w-7 place-items-center rounded-full bg-white ring-2 ring-slate-300 group-hover:ring-clinical transition-colors text-xs shadow-xs">
                  {iconMap[e.type] || "🔹"}
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-xs hover:border-slate-300 transition-colors space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">{dateFormatted}</span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${provInfo.cls}`}>
                        {provInfo.text}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {e.category}
                      </span>
                    </div>

                    {e.mode && (
                      <span className="text-[10px] font-bold text-slate-500">
                        {e.mode === "onchain" ? "⚡ On-chain" : "📋 Demo"}
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-ink">{e.title}</h4>
                    {e.subtitle && <p className="text-xs text-muted mt-0.5">{e.subtitle}</p>}
                    {e.detail && <p className="text-xs text-slate-600 mt-1 leading-relaxed">{e.detail}</p>}
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setExplainTarget({ title: e.title, context: e.detail || e.subtitle })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors ring-1 ring-inset ring-teal-200/70"
                    >
                      <span>💬</span> Explicar en palabras simples
                    </button>

                    {e.txHash && (
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${e.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] text-clinical hover:underline"
                      >
                        Stellar tx ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de explicación sencilla */}
      {explainTarget && (
        <PlainLanguageModal
          patientEmail={patientEmail}
          termOrResult={explainTarget.title}
          context={explainTarget.context}
          onClose={() => setExplainTarget(null)}
        />
      )}
    </div>
  );
}
