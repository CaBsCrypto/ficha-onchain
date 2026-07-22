"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import BodyMap, { type BodyZone, type PainEntry, ZONE_NAMES } from "@/components/pain/BodyMap";
import BodyMap3D from "@/components/pain/BodyMap3D";
import PainLogger from "@/components/pain/PainLogger";
import RegionDetail3D from "@/components/pain/RegionDetail3D";

const VIEW_PREF_KEY = "trustleaf_body_view";

// Resolve a display name for any zone key, including the compound detail
// sub-zones RegionDetail3D produces (e.g. "hand_r.index.dist") — ZONE_NAMES only
// knows the coarse body zones, so unknown keys fall back to a readable label
// instead of rendering "undefined" (and crashing on .split()).
function zoneLabel(zone: string): string {
  const known = (ZONE_NAMES as Record<string, string>)[zone];
  if (known) return known;
  const [parent, ...rest] = zone.split(".");
  const base = (ZONE_NAMES as Record<string, string>)[parent] ?? parent;
  return rest.length ? `${base} · ${rest.join(" ")}` : base;
}

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

function loadHistoryFromLocal(days = 30): HistoryDay[] {
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

function buildHistoryDay(dateStr: string, entries: PainEntry[]): HistoryDay {
  const avg = entries.reduce((s, e) => s + e.level, 0) / entries.length;
  const max = Math.max(...entries.map((e) => e.level));
  return { dateStr, entries, avgLevel: avg, maxLevel: max };
}

type PageTab = "hoy" | "historial";

export default function PainDiaryPage() {
  const { user } = usePrivy();
  const privyId = user?.id ?? null;

  const [entries, setEntries] = useState<PainEntry[]>([]);
  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // 3D is the primary map — default to it. 2D stays available behind the toggle.
  const [view3D, setView3D] = useState(true);
  const [fibromyalgiaMode, setFibromyalgiaMode] = useState(false);
  const [pageTab, setPageTab] = useState<PageTab>("hoy");
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Fine-grained sub-zones from the RegionDetail3D pop-ups, keyed by compound id
  // (e.g. "hand_r.index.dist"). Kept separate from `entries`; the parent zone
  // gets an aggregate entry so the body map / summary still reflect it.
  const [detail, setDetail] = useState<Record<string, number>>({});
  const [detailRegion, setDetailRegion] = useState<{ prefix: string; title: string } | null>(null);

  // Load today's entries (localStorage first, then DB)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getTodayKey());
      if (raw) setEntries(JSON.parse(raw) as PainEntry[]);
      const rawDetail = localStorage.getItem(getTodayKey() + "_detail");
      if (rawDetail) setDetail(JSON.parse(rawDetail) as Record<string, number>);
      // Honour a saved preference in either direction; default (no pref) is 3D.
      const savedView = localStorage.getItem(VIEW_PREF_KEY);
      if (savedView === "2d") setView3D(false);
      else if (savedView === "3d") setView3D(true);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Load history from DB (falls back to localStorage)
  useEffect(() => {
    if (!privyId) {
      setHistory(loadHistoryFromLocal(30));
      return;
    }
    setHistoryLoading(true);
    fetch(`/api/pain-diary?privyId=${encodeURIComponent(privyId)}&days=90`)
      .then((r) => r.json())
      .then((data: { days?: Array<{ date: string; entries: PainEntry[] }> }) => {
        if (data.days && data.days.length > 0) {
          const h: HistoryDay[] = data.days
            .filter((d) => d.entries.length > 0)
            .map((d) => buildHistoryDay(d.date, d.entries));
          setHistory(h);
        } else {
          // fallback to localStorage
          setHistory(loadHistoryFromLocal(30));
        }
        setHistoryLoading(false);
      })
      .catch(() => {
        setHistory(loadHistoryFromLocal(30));
        setHistoryLoading(false);
      });
  }, [privyId]);

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

  // Save the fine-grained sub-zones from a RegionDetail3D pop-up. `levels` keys
  // are already compound-prefixed (e.g. "hand_r.index.dist"). We replace the
  // prior sub-zones for this region, and upsert an aggregate entry on the parent
  // zone (max sub-level) so the body map / summary / DB still reflect it.
  function handleDetailSave(levels: Record<string, number>) {
    if (!detailRegion) return;
    const prefix = detailRegion.prefix;
    setDetail((prev) => {
      const kept = Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(prefix + ".")));
      const merged = { ...kept, ...levels };
      try { localStorage.setItem(getTodayKey() + "_detail", JSON.stringify(merged)); } catch { /* ignore */ }
      const sub = Object.entries(merged).filter(([k]) => k.startsWith(prefix + "."));
      const maxLvl = sub.reduce((m, [, v]) => Math.max(m, v), 0);
      setEntries((prevE) => {
        const filtered = prevE.filter((e) => e.zone !== prefix);
        if (maxLvl <= 0) return filtered;
        return [...filtered, {
          zone: prefix as BodyZone,
          level: maxLvl,
          note: `${sub.length} zona${sub.length === 1 ? "" : "s"} en detalle`,
          timestamp: new Date().toISOString(),
        }];
      });
      return merged;
    });
    setDetailRegion(null);
    toast.success("Detalle guardado");
  }

  function handleRemove(zone: BodyZone) {
    setEntries((prev) => prev.filter((e) => e.zone !== zone));
    setSelectedZone(null);
    toast.info(`Dolor en ${ZONE_NAMES[zone]} eliminado`);
  }

  async function handleSaveToday() {
    const today = new Date().toISOString().split("T")[0];
    // Always save to localStorage as cache
    try { localStorage.setItem(getTodayKey(), JSON.stringify(entries)); } catch { /* ignore */ }

    if (!privyId) {
      toast.success("Registro guardado localmente ✓");
      return;
    }

    try {
      const res = await fetch("/api/pain-diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privyId, date: today, entries }),
      });
      if (res.ok) {
        toast.success("Registro guardado en tu historial ✓");
        // Refresh history
        const r = await fetch(`/api/pain-diary?privyId=${encodeURIComponent(privyId)}&days=90`);
        const data = (await r.json()) as { days?: Array<{ date: string; entries: PainEntry[] }> };
        if (data.days) {
          setHistory(data.days.filter((d) => d.entries.length > 0).map((d) => buildHistoryDay(d.date, d.entries)));
        }
      } else {
        toast.error("No se pudo guardar en la base de datos");
      }
    } catch {
      toast.error("Error de conexión al guardar");
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
            Historial{history.length > 0 ? ` (${history.length})` : ""}
          </button>
        </div>
      </div>

      {/* HISTORIAL VIEW */}
      {pageTab === "historial" && (
        <div className="max-w-lg mx-auto px-4 space-y-3">
          {historyLoading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-slate-400 text-sm">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              Cargando historial…
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500 text-sm font-medium">Sin registros anteriores</p>
              <p className="text-gray-400 text-xs mt-1">
                Guarda el registro de hoy y aquí aparecerá tu historial
              </p>
            </div>
          ) : (
          <>
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
                      <span className="text-sm text-gray-700">{zoneLabel(entry.zone)}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getLevelBadgeClass(entry.level)}`}>
                        {entry.level}/10
                      </span>
                    </div>
                  ))}
                  {day.entries.some((e) => e.note) && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      {day.entries.filter((e) => e.note).map((e) => (
                        <p key={e.zone} className="text-xs text-gray-400 italic">
                          {zoneLabel(e.zone)}: &quot;{e.note}&quot;
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          </>
          )}
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
              onClick={() => view3D || toggleView()}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view3D
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Vista 3D
            </button>
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

        {/* Detail drill-downs — open a dedicated 3D sub-model for finer marking.
            Pilot: right arm/hand. More regions (foot, head/dental…) to follow. */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDetailRegion({ prefix: "hand_r", title: "Brazo y mano derecha" })}
            className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors"
          >
            <span aria-hidden>🖐️</span>
            Detalle brazo/mano der.
            {(() => {
              const n = Object.keys(detail).filter((k) => k.startsWith("hand_r.")).length;
              return n > 0 ? <span className="rounded-full bg-sky-500 text-white px-1.5 py-0.5 text-[10px]">{n}</span> : null;
            })()}
          </button>
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
                {mostIntense ? zoneLabel(mostIntense.zone).split(" ")[0] : "—"}
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
                    <span className="text-gray-900 font-medium text-sm">{zoneLabel(entry.zone)}</span>
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

      {/* Region drill-down pop-up (dedicated 3D sub-model) */}
      {detailRegion && (
        <RegionDetail3D
          title={detailRegion.title}
          keyPrefix={detailRegion.prefix}
          initial={Object.fromEntries(
            Object.entries(detail)
              .filter(([k]) => k.startsWith(detailRegion.prefix + "."))
              .map(([k, v]) => [k.slice(detailRegion.prefix.length + 1), v]),
          )}
          onClose={() => setDetailRegion(null)}
          onSave={handleDetailSave}
        />
      )}
    </div>
  );
}
