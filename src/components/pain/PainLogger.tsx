"use client";
// Copyright © 2026 Browns Studio

import { useState, useEffect } from "react";
import type { BodyZone, PainEntry } from "./BodyMap";
import { ZONE_NAMES } from "./BodyMap";

interface PainLoggerProps {
  zone: BodyZone | null;
  existingEntry?: PainEntry;
  onSave: (entry: PainEntry) => void;
  onRemove: (zone: BodyZone) => void;
  onClose: () => void;
}

function getLevelColor(level: number): string {
<<<<<<< HEAD
  if (level <= 3) return "bg-green-500 hover:bg-green-400";
  if (level <= 5) return "bg-yellow-400 hover:bg-yellow-300";
=======
  if (level <= 3) return "bg-green-600 hover:bg-green-500";
  if (level <= 5) return "bg-yellow-500 hover:bg-yellow-400";
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
  if (level <= 7) return "bg-orange-500 hover:bg-orange-400";
  return "bg-red-500 hover:bg-red-400";
}

function getLevelLabel(level: number): string {
  if (level <= 2) return "Mínimo";
  if (level <= 4) return "Leve";
  if (level <= 6) return "Moderado";
  if (level <= 8) return "Intenso";
  return "Severo";
}

export default function PainLogger({ zone, existingEntry, onSave, onRemove, onClose }: PainLoggerProps) {
  const [level, setLevel] = useState<number>(existingEntry?.level ?? 5);
  const [note, setNote] = useState<string>(existingEntry?.note ?? "");
  const isOpen = zone !== null;

  useEffect(() => {
    if (zone) {
      setLevel(existingEntry?.level ?? 5);
      setNote(existingEntry?.note ?? "");
    }
  }, [zone, existingEntry]);

  function handleSave() {
    if (!zone) return;
    onSave({ zone, level, note: note.trim() || undefined, timestamp: new Date().toISOString() });
  }

  function handleRemove() {
    if (!zone) return;
    onRemove(zone);
  }

  return (
    <>
      {/* Backdrop */}
      <div
<<<<<<< HEAD
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
=======
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
<<<<<<< HEAD
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-white border-l border-gray-200 z-50 flex flex-col shadow-2xl transition-transform duration-300 ${
=======
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-[#1E293B] border-l border-[#334155] z-50 flex flex-col shadow-2xl transition-transform duration-300 ${
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
<<<<<<< HEAD
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-gray-900 font-semibold text-base">
              {zone ? ZONE_NAMES[zone] : "Zona"}
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">Registrar nivel de dolor</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
=======
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#334155]">
          <div>
            <h2 className="text-white font-semibold text-base">
              {zone ? ZONE_NAMES[zone] : "Zona"}
            </h2>
            <p className="text-[#94A3B8] text-xs mt-0.5">Registrar nivel de dolor</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          {/* Level selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
<<<<<<< HEAD
              <span className="text-gray-900 font-medium text-sm">Nivel de dolor</span>
              <span className="text-gray-900 font-bold text-lg">
                {level}/10
                <span className="text-xs font-normal text-gray-500 ml-2">{getLevelLabel(level)}</span>
=======
              <span className="text-white font-medium text-sm">Nivel de dolor</span>
              <span className="text-white font-bold text-lg">
                {level}/10
                <span className="text-xs font-normal text-[#94A3B8] ml-2">{getLevelLabel(level)}</span>
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setLevel(n)}
                  className={`py-3 rounded-xl text-white font-bold text-sm transition-all ${getLevelColor(n)} ${
                    level === n
<<<<<<< HEAD
                      ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-white scale-105"
=======
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#1E293B] scale-105"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Visual intensity bar */}
<<<<<<< HEAD
            <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
=======
            <div className="mt-3 h-2 rounded-full bg-gray-700 overflow-hidden">
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${level * 10}%`,
                  background: `linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)`,
                }}
              />
            </div>
          </div>

          {/* Note */}
          <div>
<<<<<<< HEAD
            <label className="text-gray-900 font-medium text-sm block mb-2">
              Describe el dolor
              <span className="text-gray-400 font-normal ml-1">(opcional)</span>
=======
            <label className="text-white font-medium text-sm block mb-2">
              Describe el dolor
              <span className="text-[#64748B] font-normal ml-1">(opcional)</span>
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Punzante, quemante, pulsátil..."
              rows={3}
<<<<<<< HEAD
              className="w-full bg-gray-50 border border-gray-200 focus:border-sky-400 text-gray-900 text-sm rounded-xl px-4 py-3 outline-none placeholder-gray-400 transition-colors resize-none"
            />
            <p className="text-right text-xs text-gray-400 mt-1">{note.length}/200</p>
=======
              className="w-full bg-gray-900 border border-[#334155] focus:border-[#10B981] text-white text-sm rounded-xl px-4 py-3 outline-none placeholder-gray-600 transition-colors resize-none"
            />
            <p className="text-right text-xs text-[#64748B] mt-1">{note.length}/200</p>
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
          </div>
        </div>

        {/* Footer actions */}
<<<<<<< HEAD
        <div className="px-5 pb-6 pt-4 border-t border-gray-200 space-y-3">
          <button
            onClick={handleSave}
            className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-colors"
=======
        <div className="px-5 pb-6 pt-4 border-t border-[#334155] space-y-3">
          <button
            onClick={handleSave}
            className="w-full py-3 bg-[#10B981] hover:bg-green-400 text-[#0F172A] font-bold rounded-xl transition-colors"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
          >
            Guardar
          </button>
          {existingEntry && (
            <button
              onClick={handleRemove}
<<<<<<< HEAD
              className="w-full py-2.5 border border-red-300 text-red-500 hover:bg-red-50 font-semibold rounded-xl transition-colors text-sm"
=======
              className="w-full py-2.5 border border-red-700 text-red-400 hover:bg-red-900/30 font-semibold rounded-xl transition-colors text-sm"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
            >
              Quitar dolor de esta zona
            </button>
          )}
          <button
            onClick={onClose}
<<<<<<< HEAD
            className="w-full py-2.5 text-gray-500 hover:text-gray-900 text-sm transition-colors"
=======
            className="w-full py-2.5 text-[#94A3B8] hover:text-white text-sm transition-colors"
>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
