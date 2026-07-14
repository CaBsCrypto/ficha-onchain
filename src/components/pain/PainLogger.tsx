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
  if (level <= 3) return "bg-green-500 hover:bg-green-400";
  if (level <= 5) return "bg-yellow-400 hover:bg-yellow-300";
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

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

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
        className={`fixed inset-0 z-40 transition-all duration-300 ${
          isOpen
            ? "bg-black/50 backdrop-blur-sm pointer-events-auto"
            : "bg-transparent pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Bottom sheet / modal */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out
          sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:w-full sm:max-w-md
          ${isOpen
            ? "translate-y-0 sm:translate-y-[-50%]"
            : "translate-y-full sm:translate-y-[-40%] sm:opacity-0 pointer-events-none"
          }`}
      >
        <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-slate-200" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-slate-900 font-semibold text-base">
                {zone ? ZONE_NAMES[zone] : "Zona"}
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">Registrar nivel de dolor</p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-5 py-5 space-y-5">
            {/* Level selector */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-700 font-medium text-sm">Nivel de dolor</span>
                <span className="text-slate-900 font-bold text-lg">
                  {level}/10
                  <span className="text-xs font-normal text-slate-400 ml-1.5">{getLevelLabel(level)}</span>
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setLevel(n)}
                    className={`py-3 rounded-xl text-white font-bold text-sm transition-all ${getLevelColor(n)} ${
                      level === n
                        ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-white scale-105 shadow-md"
                        : "opacity-55 hover:opacity-90"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {/* Intensity bar */}
              <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
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
              <label className="text-slate-700 font-medium text-sm block mb-2">
                Describe el dolor
                <span className="text-slate-400 font-normal ml-1">(opcional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="Punzante, quemante, pulsátil..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 focus:border-sky-400 text-slate-900 text-sm rounded-xl px-4 py-3 outline-none placeholder-slate-300 transition-colors resize-none"
              />
              <p className="text-right text-xs text-slate-400 mt-1">{note.length}/200</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-7 pt-2 space-y-2.5">
            <button
              onClick={handleSave}
              className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-2xl transition-colors shadow-sm shadow-sky-500/30"
            >
              Guardar
            </button>
            {existingEntry && (
              <button
                onClick={handleRemove}
                className="w-full py-2.5 border border-red-200 text-red-500 hover:bg-red-50 font-semibold rounded-2xl transition-colors text-sm"
              >
                Quitar dolor de esta zona
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full py-2.5 text-slate-400 hover:text-slate-700 text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
