"use client";
<<<<<<< HEAD
=======
// Copyright © 2026 Browns Studio
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
<<<<<<< HEAD
import BodyMap, { type BodyZone, type PainEntry, ZONE_NAMES } from "@/components/pain/BodyMap";
import BodyMap3D from "@/components/pain/BodyMap3D";
import PainLogger from "@/components/pain/PainLogger";
=======
import BodyMap, { type BodyZone, type PainEntry, ZONE_NAMES } from "../../../components/pain/BodyMap";
import BodyMap3D from "../../../components/pain/BodyMap3D";
import PainLogger from "../../../components/pain/PainLogger";
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)

const VIEW_PREF_KEY = "trustleaf_body_view";

function getTodayKey(): string {
  return `trustleaf_pain_${new Date().toISOString().split("T")[0]}`;
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getLevelBadgeClass(level: number): string {
<<<<<<< HEAD
  if (level <= 3) return "bg-green-100 text-green-700 border border-green-300";
  if (level <= 6) return "bg-yellow-100 text-yellow-700 border border-yellow-300";
  if (level <= 9) return "bg-orange-100 text-orange-700 border border-orange-300";
  return "bg-red-100 text-red-700 border border-red-300";
=======
  if (level <= 3) return "bg-green-900/50 text-green-400 border border-green-700";
  if (level <= 6) return "bg-yellow-900/50 text-yellow-400 border border-yellow-700";
  if (level <= 9) return "bg-orange-900/50 text-orange-400 border border-orange-700";
  return "bg-red-900/50 text-red-400 border border-red-700";
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
}

export default function PainDiaryPage() {
  const [entries, setEntries] = useState<PainEntry[]>([]);
  const [selectedZone, setSelectedZone] = useState<BodyZone | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [view3D, setView3D] = useState(false);
  const [fibromyalgiaMode, setFibromyalgiaMode] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getTodayKey());
      if (raw) setEntries(JSON.parse(raw) as PainEntry[]);
      const savedView = localStorage.getItem(VIEW_PREF_KEY);
      if (savedView === "3d") setView3D(true);
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
<<<<<<< HEAD
=======
    // Works for both BodyZone strings and 3D hotspot ids that match BodyZone
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
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

<<<<<<< HEAD
=======
  // Build painData map for BodyMap3D (zoneId → intensity)
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
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
<<<<<<< HEAD
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
=======
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
      </div>
    );
  }

  return (
<<<<<<< HEAD
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors"
=======
    <div className="min-h-screen bg-[#0F172A] text-white pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-sm border-b border-[#334155] px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/patient"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#334155] text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <div>
<<<<<<< HEAD
              <h1 className="text-gray-900 font-bold text-base leading-tight">Diario de Dolor</h1>
              <p className="text-gray-500 text-xs capitalize">{formatTodayDate()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-sky-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              <span className="hidden sm:inline">Registro diario</span>
            </span>
=======
              <h1 className="text-white font-bold text-base leading-tight">Diario de Dolor</h1>
              <p className="text-[#64748B] text-xs capitalize">{formatTodayDate()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/patient/settings"
              className="flex items-center gap-1 text-xs text-[#10B981] hover:text-green-300 transition-colors"
              title="Configurar recordatorio"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              <span className="hidden sm:inline">Configurar recordatorio →</span>
              <span className="sm:hidden">Recordatorio →</span>
            </Link>
            <Link
              href="/patient/pain-diary/history"
              className="px-3 py-1.5 border border-[#334155] text-[#94A3B8] hover:text-white hover:border-gray-500 text-xs font-medium rounded-lg transition-colors"
            >
              Ver historial
            </Link>
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* Info banner */}
<<<<<<< HEAD
        <div className="flex items-center gap-3 p-3 bg-sky-50 border border-sky-200 rounded-xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" className="w-5 h-5 shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <p className="text-sky-700 text-xs">Tu médico puede ver este historial en TrustLeaf</p>
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-xl p-1">
=======
        <div className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-800 rounded-xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5" className="w-5 h-5 shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <p className="text-blue-300 text-xs">Tu médico puede ver este historial en TrustLeaf</p>
        </div>

        {/* View toggle row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-[#1E293B] border border-[#334155] rounded-xl p-1">
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
            <button
              onClick={() => !view3D || toggleView()}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !view3D
<<<<<<< HEAD
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
=======
                  ? "bg-[#10B981] text-[#0F172A]"
                  : "text-[#94A3B8] hover:text-white"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
              }`}
            >
              Vista 2D
            </button>
            <button
              onClick={() => view3D || toggleView()}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view3D
<<<<<<< HEAD
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
=======
                  ? "bg-[#10B981] text-[#0F172A]"
                  : "text-[#94A3B8] hover:text-white"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
              }`}
            >
              Vista 3D
            </button>
          </div>

<<<<<<< HEAD
=======
          {/* Fibro toggle — only when 3D */}
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
          {view3D && (
            <button
              onClick={() => setFibromyalgiaMode((p) => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                fibromyalgiaMode
<<<<<<< HEAD
                  ? "bg-violet-100 border-violet-300 text-violet-700"
                  : "border-gray-200 text-gray-500 hover:text-gray-900"
=======
                  ? "bg-violet-900/40 border-violet-600 text-violet-300"
                  : "border-[#334155] text-[#94A3B8] hover:text-white"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
              Puntos fibro
            </button>
          )}
        </div>

        {/* Body map */}
<<<<<<< HEAD
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
=======
        <div className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
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
<<<<<<< HEAD
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
=======
            <div className="bg-[#1E293B] rounded-xl p-3 border border-[#334155] text-center">
              <p className="text-[#64748B] text-xs mb-1">Zonas</p>
              <p className="text-white font-bold text-xl">{entries.length}</p>
            </div>
            <div className="bg-[#1E293B] rounded-xl p-3 border border-[#334155] text-center">
              <p className="text-[#64748B] text-xs mb-1">Promedio</p>
              <p className="text-white font-bold text-xl">{avgLevel}</p>
            </div>
            <div className="bg-[#1E293B] rounded-xl p-3 border border-[#334155] text-center">
              <p className="text-[#64748B] text-xs mb-1">Más intenso</p>
              <p className="text-white font-bold text-sm leading-tight">
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
                {mostIntense ? ZONE_NAMES[mostIntense.zone].split(" ")[0] : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Registered zones */}
        {entries.length > 0 && (
          <div className="space-y-2">
<<<<<<< HEAD
            <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
=======
            <h2 className="text-[#94A3B8] text-xs font-semibold uppercase tracking-wider">
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
              Zonas registradas hoy
            </h2>
            {entries
              .slice()
              .sort((a, b) => b.level - a.level)
              .map((entry) => (
                <button
                  key={entry.zone}
                  onClick={() => setSelectedZone(entry.zone)}
<<<<<<< HEAD
                  className="w-full bg-white rounded-xl p-4 border border-gray-200 hover:border-sky-300 hover:shadow-sm transition-all text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-900 font-medium text-sm">{ZONE_NAMES[entry.zone]}</span>
=======
                  className="w-full bg-[#1E293B] rounded-xl p-4 border border-[#334155] hover:border-gray-500 transition-colors text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white font-medium text-sm">{ZONE_NAMES[entry.zone]}</span>
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getLevelBadgeClass(entry.level)}`}>
                      {entry.level}/10
                    </span>
                  </div>
                  {entry.note && (
<<<<<<< HEAD
                    <p className="text-gray-500 text-xs mt-1.5 truncate">{entry.note}</p>
=======
                    <p className="text-[#64748B] text-xs mt-1.5 truncate">{entry.note}</p>
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
                  )}
                </button>
              ))}
          </div>
        )}

        {entries.length === 0 && (
<<<<<<< HEAD
          <div className="bg-white/60 rounded-2xl p-8 border border-dashed border-gray-300 text-center">
            <p className="text-gray-500 text-sm">
=======
          <div className="bg-[#1E293B]/50 rounded-2xl p-8 border border-dashed border-[#334155] text-center">
            <p className="text-[#64748B] text-sm">
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
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
<<<<<<< HEAD
          className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-sm"
=======
          className="w-full py-3.5 bg-[#10B981] hover:bg-green-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-[#0F172A] font-bold rounded-xl transition-colors"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
        >
          Guardar registro de hoy
        </button>
      </main>

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
