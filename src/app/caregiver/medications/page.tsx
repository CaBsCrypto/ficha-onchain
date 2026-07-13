"use client";
// Módulo de Medicamentos del Cuidador — historial, horarios, alertas de omisión
// Válido para todos los tipos de dependencia: Alzheimer, post-ACV, adulto mayor, discapacidad

import { useState } from "react";
import Link from "next/link";
import Navbar from "../../../components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Medication {
  id: number;
  name: string;
  dose: string;
  times: string[];
  taken: Record<string, boolean>;
  note: string;
  prescribedBy: string;
  since: string;
  controlled: boolean;
  purpose: string;
  color: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const TODAY = "2026-07-12";

const MEDICATIONS: Medication[] = [
  {
    id: 1,
    name: "Donepezilo",
    dose: "10 mg",
    times: ["08:00"],
    taken: { [`${TODAY}_08:00`]: true },
    note: "Con desayuno. No partir el comprimido.",
    prescribedBy: "Dra. González (Neurología)",
    since: "2025-03-01",
    controlled: false,
    purpose: "Inhibidor acetilcolinesterasa — mejora cognición en Alzheimer",
    color: "bg-blue-900/30 border-blue-700",
  },
  {
    id: 2,
    name: "Memantina",
    dose: "10 mg",
    times: ["08:00", "20:00"],
    taken: { [`${TODAY}_08:00`]: true, [`${TODAY}_20:00`]: false },
    note: "Con o sin comida. Dosis nocturna a las 20:00.",
    prescribedBy: "Dra. González (Neurología)",
    since: "2025-06-15",
    controlled: false,
    purpose: "Antagonista NMDA — protege neuronas, mejora función moderada/severa",
    color: "bg-purple-900/30 border-purple-700",
  },
  {
    id: 3,
    name: "Omeprazol",
    dose: "20 mg",
    times: ["08:00"],
    taken: { [`${TODAY}_08:00`]: false },
    note: "En ayunas, 30 min antes del desayuno. Protector gástrico.",
    prescribedBy: "Dr. Morales (Medicina Interna)",
    since: "2024-01-10",
    controlled: false,
    purpose: "Protector gástrico por uso crónico de AINEs",
    color: "bg-green-900/30 border-green-700",
  },
  {
    id: 4,
    name: "Losartán",
    dose: "50 mg",
    times: ["20:00"],
    taken: { [`${TODAY}_20:00`]: false },
    note: "Con cena. Monitorear presión arterial 1x/semana.",
    prescribedBy: "Dr. Morales (Medicina Interna)",
    since: "2023-09-20",
    controlled: false,
    purpose: "Antihipertensivo — presión arterial sistólica > 150 mmHg",
    color: "bg-orange-900/30 border-orange-700",
  },
  {
    id: 5,
    name: "Lorazepam",
    dose: "0.5 mg",
    times: ["22:00"],
    taken: { [`${TODAY}_22:00`]: false },
    note: "SOLO si hay agitación nocturna severa. No dar rutinariamente.",
    prescribedBy: "Dra. González (Neurología)",
    since: "2026-02-05",
    controlled: true,
    purpose: "Benzodiacepina — agitación nocturna / episodios de pánico",
    color: "bg-red-900/30 border-red-700",
  },
];

const SCHEDULE_HOURS = ["08:00", "13:00", "20:00", "22:00"];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CaregiverMedicationsPage() {
  const [meds, setMeds] = useState(MEDICATIONS);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [view, setView] = useState<"schedule" | "list">("schedule");

  function toggleTaken(medId: number, timeKey: string) {
    setMeds(prev =>
      prev.map(m =>
        m.id === medId
          ? { ...m, taken: { ...m.taken, [timeKey]: !m.taken[timeKey] } }
          : m
      )
    );
  }

  const totalDoses = meds.reduce((acc, m) => acc + m.times.length, 0);
  const takenDoses = meds.reduce(
    (acc, m) => acc + m.times.filter(t => m.taken[`${TODAY}_${t}`]).length,
    0
  );

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/caregiver" className="p-2 rounded-xl border border-[#334155] text-[#64748B] hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-white font-bold text-lg">Medicamentos</h1>
            <p className="text-[#64748B] text-xs">Roberto Pérez Salas · hoy {TODAY.slice(5)}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold text-sm">{takenDoses}/{totalDoses} dosis dadas hoy</p>
            <p className={`text-sm font-bold ${takenDoses === totalDoses ? "text-[#10B981]" : "text-yellow-400"}`}>
              {takenDoses === totalDoses ? "✓ Completo" : "En curso"}
            </p>
          </div>
          <div className="w-full bg-[#0F172A] rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${takenDoses === totalDoses ? "bg-[#10B981]" : "bg-yellow-500"}`}
              style={{ width: `${(takenDoses / totalDoses) * 100}%` }}
            />
          </div>
        </div>

        {/* View toggle */}
        <div className="flex bg-[#1E293B] border border-[#334155] rounded-2xl p-1 gap-1">
          {(["schedule", "list"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                view === v ? "bg-[#0F172A] text-white" : "text-[#64748B]"
              }`}
            >
              {v === "schedule" ? "⏰ Por horario" : "💊 Lista completa"}
            </button>
          ))}
        </div>

        {/* Schedule view */}
        {view === "schedule" && (
          <div className="space-y-4">
            {SCHEDULE_HOURS.map(hour => {
              const medsAtHour = meds.filter(m => m.times.includes(hour));
              if (medsAtHour.length === 0) return null;
              return (
                <div key={hour} className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#334155] bg-[#0F172A]/50">
                    <p className="text-white font-semibold text-sm">🕐 {hour}</p>
                  </div>
                  <div className="divide-y divide-[#334155]">
                    {medsAtHour.map(med => {
                      const key = `${TODAY}_${hour}`;
                      const taken = med.taken[key] ?? false;
                      return (
                        <div key={med.id} className="flex items-center gap-3 px-5 py-3">
                          <button
                            onClick={() => toggleTaken(med.id, key)}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              taken ? "bg-[#10B981] border-[#10B981]" : "border-[#475569] hover:border-[#10B981]"
                            }`}
                          >
                            {taken && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3.5 h-3.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-medium ${taken ? "line-through text-[#475569]" : "text-white"}`}>
                                {med.name} {med.dose}
                              </p>
                              {med.controlled && (
                                <span className="px-1.5 py-0.5 bg-red-900/40 border border-red-700 text-red-300 text-[10px] rounded font-bold">
                                  CTRL
                                </span>
                              )}
                            </div>
                            <p className="text-[#64748B] text-xs truncate">{med.note}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List view */}
        {view === "list" && (
          <div className="space-y-3">
            {meds.map(med => (
              <div key={med.id} className={`rounded-2xl border ${med.color} overflow-hidden`}>
                <button
                  className="w-full flex items-start justify-between px-5 py-4"
                  onClick={() => setExpanded(expanded === med.id ? null : med.id)}
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold text-sm">{med.name} {med.dose}</p>
                      {med.controlled && (
                        <span className="px-1.5 py-0.5 bg-red-900/40 border border-red-700 text-red-300 text-[10px] rounded font-bold">
                          CTRL
                        </span>
                      )}
                    </div>
                    <p className="text-[#64748B] text-xs mt-0.5">{med.times.join(" · ")} · desde {med.since.slice(0, 7)}</p>
                  </div>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className={`w-4 h-4 text-[#64748B] mt-0.5 transition-transform ${expanded === med.id ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {expanded === med.id && (
                  <div className="px-5 pb-4 space-y-2 border-t border-white/10">
                    <p className="text-[#94A3B8] text-xs leading-relaxed pt-3">{med.purpose}</p>
                    <p className="text-[#64748B] text-xs"><span className="text-[#475569]">Indicación: </span>{med.note}</p>
                    <p className="text-[#64748B] text-xs"><span className="text-[#475569]">Prescrito por: </span>{med.prescribedBy}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Controlled drug warning */}
        <div className="rounded-2xl border border-red-800 bg-red-900/20 p-4">
          <p className="text-red-400 font-semibold text-xs mb-1">⚠️ Medicamento controlado (Lorazepam)</p>
          <p className="text-[#94A3B8] text-xs leading-relaxed">
            Benzodiacepinas en adultos mayores con demencia aumentan riesgo de caídas y sedación excesiva.
            Administrar SOLO en agitación severa que no responde a medidas no farmacológicas.
            Reportar toda administración en el diario de episodios.
          </p>
        </div>

      </main>
    </div>
  );
}
