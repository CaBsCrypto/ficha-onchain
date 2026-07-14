"use client";
// Copyright © 2026 Browns Studio

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import BodyMap, { type PainEntry, ZONE_NAMES, type BodyZone } from "../../../../components/pain/BodyMap";

function getPastDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  });
}

function formatDateES(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getLevelColor(level: number): string {
  if (level <= 3) return "text-green-400";
  if (level <= 6) return "text-yellow-400";
  if (level <= 9) return "text-orange-400";
  return "text-red-400";
}

interface DayData {
  date: string;
  entries: PainEntry[];
}

// ─── Demo fallback data (shown when no localStorage data exists) ─────────────
function generateDemoHistory(dates: string[]): DayData[] {
  const DEMO_LEVELS: Record<number, { zones: [string, number][] }> = {
    0: { zones: [["back_lower", 7], ["hip_l", 6]] },
    1: { zones: [["back_lower", 8], ["knee_l", 5], ["neck", 4]] },
    2: { zones: [["back_lower", 6]] },
    3: { zones: [["back_lower", 9], ["hip_l", 8], ["hip_r", 7], ["shoulder_l", 4]] },
    4: { zones: [["back_lower", 7], ["back_upper", 5]] },
    5: { zones: [["back_lower", 5], ["knee_l", 3]] },
    6: { zones: [["back_lower", 8], ["hip_l", 7], ["neck", 6]] },
  };
  return dates.map((date, i) => ({
    date,
    entries: (DEMO_LEVELS[i]?.zones ?? []).map(([zone, level]) => ({
      zone: zone as BodyZone,
      level,
      note: "",
      timestamp: `${date}T12:00:00`,
    })),
  }));
}

export default function PainHistoryPage() {
  const [history, setHistory] = useState<DayData[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);

  useEffect(() => {
    const dates = getPastDates(7);
    const loaded: DayData[] = dates.map((date) => {
      try {
        const raw = localStorage.getItem(`trustleaf_pain_${date}`);
        return { date, entries: raw ? (JSON.parse(raw) as PainEntry[]) : [] };
      } catch {
        return { date, entries: [] };
      }
    });
    // If no real data exists, use demo data so the page isn't empty
    const hasRealData = loaded.some((d) => d.entries.length > 0);
    if (!hasRealData) {
      setHistory(generateDemoHistory(dates));
      setUsingDemo(true);
    } else {
      setHistory(loaded);
    }
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-white pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-sm border-b border-[#334155] px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link
            href="/patient/pain-diary"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#334155] text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-white font-bold text-base">Historial de Dolor</h1>
            <p className="text-[#64748B] text-xs">
              Últimos 7 días
              {usingDemo && <span className="ml-2 text-[#10B981] font-medium">(datos demo)</span>}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 space-y-3">

        {/* ─── Trend Chart ─── */}
        {history.length > 0 && (() => {
          const chartData = [...history].reverse().map(({ date, entries }) => {
            const avg = entries.length
              ? Math.round((entries.reduce((s, e) => s + e.level, 0) / entries.length) * 10) / 10
              : 0;
            const label = new Date(date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric" });
            return { label, avg, count: entries.length };
          });
          const overallAvg = (chartData.reduce((s, d) => s + d.avg, 0) / chartData.filter(d => d.avg > 0).length || 0).toFixed(1);
          const trend = chartData[chartData.length - 1].avg - chartData[0].avg;
          return (
            <div className="bg-[#1E293B] rounded-2xl border border-[#334155] p-5 mb-2">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-white font-bold text-base">Tendencia — 7 días</p>
                  <p className="text-[#64748B] text-xs">Promedio de dolor por día</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-xl leading-none">{overallAvg}<span className="text-[#64748B] text-sm font-normal">/10</span></p>
                  <p className={`text-xs mt-0.5 ${trend < 0 ? "text-[#10B981]" : trend > 0 ? "text-red-400" : "text-[#64748B]"}`}>
                    {trend < 0 ? `↓ mejorando` : trend > 0 ? `↑ empeorando` : "→ estable"}
                  </p>
                </div>
              </div>
              <div style={{ height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="painGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} ticks={[0, 5, 10]} />
                    <Tooltip
                      contentStyle={{ background: "#0F172A", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#94A3B8" }}
                      itemStyle={{ color: "#10B981" }}
                      formatter={((v: number) => [`${v}/10`, "Dolor promedio"]) as never}
                    />
                    <Area type="monotone" dataKey="avg" stroke="#10B981" strokeWidth={2} fill="url(#painGrad)" dot={{ fill: "#10B981", r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

        {history.map(({ date, entries }) => {
          const isExpanded = expandedDate === date;
          const avg = entries.length
            ? (entries.reduce((s, e) => s + e.level, 0) / entries.length).toFixed(1)
            : null;
          const mostIntense = entries.length
            ? entries.reduce((m, e) => (e.level > m.level ? e : m), entries[0])
            : null;
          const isToday = date === new Date().toISOString().split("T")[0];

          return (
            <div
              key={date}
              className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden"
            >
              {/* Day row */}
              <button
                onClick={() => setExpandedDate(isExpanded ? null : date)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-[#253046]/50 transition-colors"
              >
                {/* Mini map preview */}
                <div className="w-12 h-20 shrink-0 pointer-events-none overflow-hidden relative">
                  {entries.length > 0 ? (
                    <div style={{ transform: "scale(0.22)", transformOrigin: "top left", position: "absolute", top: 0, left: 0, width: "200px" }}>
                      <BodyMap entries={entries} onZoneClick={() => {}} readOnly />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg viewBox="0 0 200 460" className="w-12 opacity-20">
                        <ellipse cx="100" cy="42" rx="28" ry="32" fill="#334155" />
                        <rect x="88" y="72" width="24" height="18" rx="6" fill="#334155" />
                        <rect x="70" y="88" width="60" height="100" rx="8" fill="#334155" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-semibold text-sm capitalize">
                      {formatDateES(date)}
                    </span>
                    {isToday && (
                      <span className="text-xs bg-green-900/50 text-green-400 border border-green-700 px-2 py-0.5 rounded-full">
                        Hoy
                      </span>
                    )}
                  </div>
                  {entries.length > 0 ? (
                    <p className="text-[#94A3B8] text-xs">
                      {entries.length} zona{entries.length !== 1 ? "s" : ""} · Promedio{" "}
                      <span className={getLevelColor(parseFloat(avg ?? "0"))}>{avg}/10</span>
                      {mostIntense && (
                        <> · Más intenso: {ZONE_NAMES[mostIntense.zone as BodyZone]}</>
                      )}
                    </p>
                  ) : (
                    <p className="text-[#64748B] text-xs">Sin registros</p>
                  )}
                </div>

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* Expanded detail */}
              {isExpanded && entries.length > 0 && (
                <div className="border-t border-[#334155] p-4">
                  <BodyMap entries={entries} onZoneClick={() => {}} readOnly />
                  <div className="mt-4 space-y-2">
                    {entries
                      .slice()
                      .sort((a, b) => b.level - a.level)
                      .map((entry) => (
                        <div
                          key={entry.zone}
                          className="flex items-center justify-between gap-3 py-2 border-b border-[#334155] last:border-0"
                        >
                          <span className="text-[#94A3B8] text-sm">{ZONE_NAMES[entry.zone as BodyZone]}</span>
                          <div className="flex items-center gap-2">
                            {entry.note && (
                              <span className="text-[#64748B] text-xs truncate max-w-[120px]">{entry.note}</span>
                            )}
                            <span className={`font-bold text-sm ${getLevelColor(entry.level)}`}>
                              {entry.level}/10
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {isExpanded && entries.length === 0 && (
                <div className="border-t border-[#334155] p-6 text-center text-[#64748B] text-sm">
                  No hubo registros este día
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
