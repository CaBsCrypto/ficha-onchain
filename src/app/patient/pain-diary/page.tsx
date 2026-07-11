"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import BodyMap, { type BodyZone, type PainEntry, ZONE_NAMES } from "@/components/pain/BodyMap";
import BodyMap3D from "@/components/pain/BodyMap3D";
import PainLogger from "@/components/pain/PainLogger";

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
  if (level <= 3) return "bg-green-100 text-green-700 border border-green-300";
  if (level <= 6) return "bg-yellow-100 text-yellow-700 border border-yellow-300";
  if (level <= 9) return "bg-orange-100 text-orange-700 border border-orange-300";
  return "bg-red-100 text-red-700 border border-red-300";
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
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <div>
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
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-6 space-y-6">
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
