"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import BodyMap, { type BodyZone, type PainEntry, ZONE_NAMES } from "@/components/pain/BodyMap";
import BodyMap3D from "@/components/pain/BodyMap3D";
import PainLogger from "@/components/pain/PainLogger";

const VIEW_PREF_KEY = "trustleaf_body_view";

function getTodayKey(): string {
  return `trustleaf_pain_${new Date().toISOString().split("T")[0]}`;
}

function getDateKey(date: Date): string {
  return `trustleaf_pain_${date.toISOString().split("T")[0]}`;
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

function getLevelBadgeClass(level: number): string {
  if (level <= 3) return "bg-green-100 text-green-700 border border-green-300";
  if (level <= 6) return "bg-yellow-100 text-yellow-700 border border-yellow-300";
  if (level <= 9) return "bg-orange-100 text-orange-700 border border-orange-300";
  return "bg-red-100 text-red-700 border border-red-300";
}

function getLevelColor(level: number): string {
  if (level <= 3) return "#22c55e";
  if (level <= 6) return "#eab308";
  if (level <= 9) return "#f97316";
  return "#ef4444";
}

interface HistoryDay {
  dateStr: string;   // "2026-07-12"
  entries: PainEntry[];
  avgLevel: number;
  maxLevel: number;
}

function loadHistory(days = 30): HistoryDay[] {
  const history: HistoryDay[] = [];
  const today = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = getDateKey(d);
    const dateStr = key.replace("trustleaf_pain_", "");
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const entries = JSON.parse(raw) as PainEntry[];
        if (entries.length > 0) {
          const avg = entries.reduce((s, e) => s + e.level, 0) / entries.length;
          const max = Math.max(...entries.map((e) => e.level));
          history.push({ dateStr, entries, avgLevel: avg, maxLevel: max });
        }
      }
    } catch { /* ignore */ }
  }
  return history;
}

type PageTab = "hoy" | "historial";

export default function PainDiaryPage() {
  const [entries, setEntries] = useState<PainEntry[]>([]);
  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [view3D, setView3D] = useState(false);
  const [fibromyalgiaMode, setFibromyalgiaMode] = useState(false);
  const [pageTab, setPageTab] = useState<PageTab>("hoy");
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getTodayKey());
      if (raw) setEntries(JSON.parse(raw) as PainEntry[]);
      const savedView = localStorage.getItem(VIEW_PREF_KEY);
      if (savedView === "3d") setView3D(true);
      setHistory(loadHistory(30));
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  function toggleView() {
    setView3D((prev) => {
      const next = !prev;
      try { localStorage.setItem(VIEW_PREF_KEY, next ? "3d" : "2d"); } catch { /* noop */ }
      return next;
    });
  }

  function handleZoneClick(zone: string) {
    setSelectedZone(zone as BodyZone);
  }

  function handleSave(entry: PainEntry) {
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.zone !== entry.zone);
      return [...filtered, entry];
    });
    setSelectedZone(null);
    toast.success(`Dolor en ${ZONE_NAMES[entry.zone]} registrado`);
  }

  function handleRemove(zone: BodyZone) {
    setEntries((prev) => prev.filter((e) => e.zone !== zone));
    setSelectedZone(null);
    toast.info(`Dolor en ${ZONE_NAMES[zone]} eliminado`);
  }

  function handleSaveToday() {
    try {
      localStorage.setItem(getTodayKey(), JSON.stringify(entries));
      toast.success("Registro del día guardado ✓");
    } catch {
      toast.error("No se pudo guardar el registro");
    }
  }

  const painData: Record<string, number> = {};
  for (const e of entries) {
    if (!painData[e.zone] || e.level > painData[e.zone]) {
      painData[e.zone] = e.level;
    }
  }

  const existingEntry = selectedZone
    ? entries.find((e) => e.zone === selectedZone)
    : undefined;

  const avgLevel = entries.length
    ? (entries.reduce((s, e) => s + e.level, 0) / entries.length).toFixed(1)
    : "—";

  const mostIntense = entries.length
    ? entries.reduce((max, e) => (e.level > max.level ? e : max), entries[0])
    : null;

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="text-gray-900 pb-8">
      {/* Page title */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">Diario de Dolor</h1>
          <p className="text-gray-500 text-sm capitalize">{formatTodayDate()}</p>
        </div>
        {history.length > 0 && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button
              onClick={() => setPageTab("hoy")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                pageTab === "hoy" ? "bg-sky-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setPageTab("historial")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                pageTab === "historial" ? "bg-sky-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Historial ({history.length})
            </button>
          </div>
        )}
      </div>

      {/* HISTORIAL VIEW */}
      {pageTab === "historial" && (
        <div className="max-w-lg mx-auto px-4 space-y-3">
          <p className="text-gray-400 text-xs">Últimos 30 días con registros guardados</p>
          {history.map((day) => (
            <div key={day.dateStr} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedDay(expandedDay === day.dateStr ? null : day.dateStr)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: getLevelColor(day.maxLevel) }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 capitalize">{formatShortDate(day.dateStr)}</p>
                    <p className="text-xs text-gray-400">{day.entries.length} zona{day.entries.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Promedio</p>
                    <p className="text-sm font-bold" style={{ color: getLevelColor(day.avgLevel) }}>
                      {day.avgLevel.toFixed(1)}/10
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={`w-4 h-4 text-gray-400 transition-transform ${expandedDay === day.dateStr ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </button>

              {expandedDay === day.dateStr && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-2">
                  {day.entries.sort((a, b) => b.level - a.level).map((entry) => (
                    <div key={entry.zone} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{ZONE_NAMES[entry.zone]}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getLevelBadgeClass(entry.level)}`}>
                        {entry.level}/10
                      </span>
                    </div>
                  ))}
                  {day.entries.some((e) => e.note) && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      {day.entries.filter((e) => e.note).map((e) => (
                        <p key={e.zone} className="text-xs text-gray-400 italic">
                          {ZONE_NAMES[e.zone]}: &quot;{e.note}&quot;
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TODAY VIEW */}
      {pageTab === "hoy" && (
      <main className="max-w-lg mx-auto px-4 pt-2 space-y-6">
        {/* Info banner */}
        <div className="flex items-center gap-3 p-3 bg-sky-50 border border-sky-200 rounded-xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" className="w-5 h-5 shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <p className="text-sky-700 text-xs">Tu médico puede ver este historial en TrustLeaf</p>
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => !view3D || toggleView()}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !view3D
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Vista 2D
            </button>
            <button
              onClick={() => view3D || toggleView()}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view3D
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Vista 3D
            </button>
          </div>

          {view3D && (
            <button
              onClick={() => setFibromyalgiaMode((p) => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                fibromyalgiaMode
                  ? "bg-violet-100 border-violet-300 text-violet-700"
                  : "border-gray-200 text-gray-500 hover:text-gray-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
              Puntos fibro
            </button>
          )}
        </div>

        {/* Body map */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          {view3D ? (
            <BodyMap3D
              painData={painData}
              fibromyalgiaMode={fibromyalgiaMode}
              readOnly={false}
              onZoneSelect={handleZoneClick}
            />
          ) : (
            <BodyMap
              entries={entries}
              onZoneClick={handleZoneClick}
            />
          )}
        </div>

        {/* Stats */}
        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm text-center">
              <p className="text-gray-500 text-xs mb-1">Zonas</p>
              <p className="text-gray-900 font-bold text-xl">{entries.length}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm text-center">
              <p className="text-gray-500 text-xs mb-1">Promedio</p>
              <p className="text-gray-900 font-bold text-xl">{avgLevel}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm text-center">
              <p className="text-gray-500 text-xs mb-1">Más intenso</p>
              <p className="text-gray-900 font-bold text-sm leading-tight">
                {mostIntense ? ZONE_NAMES[mostIntense.zone].split(" ")[0] : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Registered zones */}
        {entries.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
              Zonas registradas hoy
            </h2>
            {entries
              .slice()
              .sort((a, b) => b.level - a.level)
              .map((entry) => (
                <button
                  key={entry.zone}
                  onClick={() => setSelectedZone(entry.zone)}
                  className="w-full bg-white rounded-xl p-4 border border-gray-200 hover:border-sky-300 hover:shadow-sm transition-all text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-900 font-medium text-sm">{ZONE_NAMES[entry.zone]}</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getLevelBadgeClass(entry.level)}`}>
                      {entry.level}/10
                    </span>
                  </div>
                  {entry.note && (
                    <p className="text-gray-500 text-xs mt-1.5 truncate">{entry.note}</p>
                  )}
                </button>
              ))}
          </div>
        )}

        {entries.length === 0 && (
          <div className="bg-white/60 rounded-2xl p-8 border border-dashed border-gray-300 text-center">
            <p className="text-gray-500 text-sm">
              {view3D
                ? "Toca un punto del modelo 3D para registrar dolor"
                : "Toca una zona del mapa para registrar dolor"}
            </p>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSaveToday}
          disabled={entries.length === 0}
          className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-sm"
        >
          Guardar registro de hoy
        </button>
      </main>
      )}

      {/* Pain Logger panel */}
      <PainLogger
        zone={selectedZone}
        existingEntry={existingEntry}
        onSave={handleSave}
        onRemove={handleRemove}
        onClose={() => setSelectedZone(null)}
      />
    </div>
  );
}
