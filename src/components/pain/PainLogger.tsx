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
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-white border-l border-gray-200 z-50 flex flex-col shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
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
              <span className="text-gray-900 font-medium text-sm">Nivel de dolor</span>
              <span className="text-gray-900 font-bold text-lg">
                {level}/10
                <span className="text-xs font-normal text-gray-500 ml-2">{getLevelLabel(level)}</span>
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setLevel(n)}
                  className={`py-3 rounded-xl text-white font-bold text-sm transition-all ${getLevelColor(n)} ${
                    level === n
                      ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-white scale-105"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Visual intensity bar */}
            <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
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
            <label className="text-gray-900 font-medium text-sm block mb-2">
              Describe el dolor
              <span className="text-gray-400 font-normal ml-1">(opcional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Punzante, quemante, pulsátil..."
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 focus:border-sky-400 text-gray-900 text-sm rounded-xl px-4 py-3 outline-none placeholder-gray-400 transition-colors resize-none"
            />
            <p className="text-right text-xs text-gray-400 mt-1">{note.length}/200</p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-6 pt-4 border-t border-gray-200 space-y-3">
          <button
            onClick={handleSave}
            className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-colors"
          >
            Guardar
          </button>
          {existingEntry && (
            <button
              onClick={handleRemove}
              className="w-full py-2.5 border border-red-300 text-red-500 hover:bg-red-50 font-semibold rounded-xl transition-colors text-sm"
            >
              Quitar dolor de esta zona
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-2.5 text-gray-500 hover:text-gray-900 text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
