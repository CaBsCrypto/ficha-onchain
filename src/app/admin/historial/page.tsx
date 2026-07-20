"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ActivityEvent {
  ts: string;
  kind: string;
  title: string;
  detail?: string;
  actor?: string;
  tx_hash?: string;
  mode?: string;
  table: string;
}

// ── Event styling by kind ───────────────────────────────────────────────────
const KIND_META: Record<string, { label: string; dot: string; ring: string }> = {
  "doctor.registered":   { label: "Médico",        dot: "bg-emerald-500", ring: "bg-emerald-50 text-emerald-700" },
  "user.registered":     { label: "Usuario",       dot: "bg-violet-500",  ring: "bg-violet-50 text-violet-700" },
  "waitlist.joined":     { label: "Waitlist",      dot: "bg-sky-400",     ring: "bg-sky-50 text-sky-700" },
  "appointment.created": { label: "Reserva",       dot: "bg-indigo-500",  ring: "bg-indigo-50 text-indigo-700" },
  "consent.granted":     { label: "Consentimiento",dot: "bg-amber-500",   ring: "bg-amber-50 text-amber-700" },
  "ficha.appended":      { label: "Ficha",         dot: "bg-teal-500",    ring: "bg-teal-50 text-teal-700" },
  "document.uploaded":   { label: "Examen",        dot: "bg-cyan-500",    ring: "bg-cyan-50 text-cyan-700" },
  "antecedentes.updated":{ label: "Antecedentes",  dot: "bg-lime-500",    ring: "bg-lime-50 text-lime-700" },
  "license.issued":      { label: "Licencia",      dot: "bg-rose-500",    ring: "bg-rose-50 text-rose-700" },
  "pain.logged":         { label: "Dolor",         dot: "bg-orange-400",  ring: "bg-orange-50 text-orange-700" },
};
const metaFor = (k: string) => KIND_META[k] ?? { label: k, dot: "bg-slate-400", ring: "bg-slate-100 text-slate-600" };

function fmt(ts: string) {
  return new Date(ts).toLocaleString("es-CL", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function trunc(s?: string) {
  if (!s) return "";
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

export default function AdminHistorialPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/admin/activity`);
      const data = (await res.json()) as { events?: ActivityEvent[]; generatedAt?: string };
      setEvents(data.events ?? []);
      setGeneratedAt(data.generatedAt ?? "");
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Distinct kinds present, for the filter pills.
  const kinds = useMemo(() => {
    const set = new Set(events.map((e) => e.kind));
    return [...set];
  }, [events]);

  const shown = filter === "all" ? events : events.filter((e) => e.kind === filter);

  return (
    <div className="px-8 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Historial global</h1>
          <p className="mt-1 text-sm text-slate-400">
            {generatedAt ? `Generado ${fmt(generatedAt)}` : "Cargando…"} · {events.length} movimientos
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-600"
        >
          Actualizar
        </button>
      </div>

      {/* Filter pills */}
      {!loading && events.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todo ({events.length})
          </button>
          {kinds.map((k) => {
            const m = metaFor(k);
            const n = events.filter((e) => e.kind === k).length;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filter === k ? "bg-slate-800 text-white" : `${m.ring} hover:opacity-80`
                }`}
              >
                {m.label} ({n})
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          Cargando historial…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
          {events.length === 0
            ? "✅ Sin movimientos registrados — la app está limpia."
            : "Sin movimientos para este filtro."}
        </div>
      ) : (
        <ol className="relative border-l border-slate-200 pl-6">
          {shown.map((e, i) => {
            const m = metaFor(e.kind);
            return (
              <li key={`${e.table}-${e.ts}-${i}`} className="mb-5 last:mb-0">
                {/* Dot */}
                <span className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-slate-50 ${m.dot}`} />
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.ring}`}>{m.label}</span>
                      <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-400">{fmt(e.ts)}</time>
                  </div>
                  {(e.detail || e.actor) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {e.detail}
                      {e.detail && e.actor ? " · " : ""}
                      {e.actor && <span className="text-slate-400">{e.actor}</span>}
                    </p>
                  )}
                  {e.tx_hash && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        e.mode === "onchain" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {e.mode === "onchain" ? "on-chain" : "simulado"}
                      </span>
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${e.tx_hash}`}
                        target="_blank" rel="noreferrer"
                        className="font-mono text-[11px] text-sky-600 hover:underline"
                      >
                        {trunc(e.tx_hash)}
                      </a>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
