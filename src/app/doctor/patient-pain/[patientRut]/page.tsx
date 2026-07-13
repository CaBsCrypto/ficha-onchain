"use client";
// Copyright © 2026 Browns Studio

import { use } from "react";
import Link from "next/link";
import PainHeatmap, { type DayRecord } from "../../../../components/pain/PainHeatmap";
import { ZONE_NAMES, type BodyZone } from "../../../../components/pain/BodyMap";

// Demo data — 30 days of simulated pain records
const DEMO_HISTORY: DayRecord[] = (() => {
  const zones: BodyZone[] = [
    "back_lower", "back_upper", "hip_l", "hip_r", "knee_l", "knee_r",
    "shoulder_l", "shoulder_r", "neck", "leg_l", "leg_r",
  ];
  const today = new Date();
  const records: DayRecord[] = [];
  for (let i = 0; i < 30; i++) {
    if (i % 3 === 0 && i > 0) continue; // skip some days for realism
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split("T")[0];
    const numZones = 2 + Math.floor(Math.random() * 4);
    const shuffled = [...zones].sort(() => Math.random() - 0.5).slice(0, numZones);
    const entries = shuffled.map((zone) => ({
      zone,
      level: 3 + Math.floor(Math.random() * 7),
      timestamp: d.toISOString(),
    }));
    records.push({ date, entries });
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
})();

function formatDateES(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getLevelColor(level: number): string {
  if (level <= 3) return "text-green-400";
  if (level <= 6) return "text-yellow-400";
  if (level <= 9) return "text-orange-400";
  return "text-red-400";
}

export default function PatientPainPage({
  params,
}: {
  params: Promise<{ patientRut: string }>;
}) {
  const { patientRut } = use(params);
  const recent = [...DEMO_HISTORY].reverse().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#0F172A] text-white pb-8">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-sm border-b border-[#334155] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link
            href="/doctor"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#334155] text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-white font-bold text-base">Historial de Dolor</h1>
            <p className="text-[#64748B] text-xs font-mono">Paciente · {patientRut}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* AI Summary card */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🧠</span>
            <h3 className="text-white font-semibold text-sm">Resumen clínico · IA</h3>
            <span className="ml-auto text-[10px] text-[#64748B] bg-[#0F172A] px-2 py-0.5 rounded-full">Demo</span>
          </div>
          <p className="text-[#CBD5E1] text-sm leading-relaxed mb-4">
            El paciente reportó dolor en <strong className="text-white">8 de los últimos 10 días</strong>.
            La zona lumbar baja es la más afectada con un promedio de <strong className="text-orange-400">7.2/10</strong>.
            Se observa un patrón de escalada los días miércoles y jueves — posiblemente relacionado con actividad laboral.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#0F172A] rounded-xl p-3 text-center">
              <p className="text-orange-400 font-bold text-lg">6.8</p>
              <p className="text-[#64748B] text-[11px] mt-0.5">Promedio 30d</p>
            </div>
            <div className="bg-[#0F172A] rounded-xl p-3 text-center">
              <p className="text-red-400 font-bold text-lg">9.1</p>
              <p className="text-[#64748B] text-[11px] mt-0.5">Pico máximo</p>
            </div>
            <div className="bg-[#0F172A] rounded-xl p-3 text-center">
              <p className="text-yellow-400 font-bold text-lg">↗ +0.4</p>
              <p className="text-[#64748B] text-[11px] mt-0.5">Tendencia</p>
            </div>
          </div>
          <p className="text-[#475569] text-[11px] mt-3">
            Sugerencia: evaluar ajuste de pauta analgésica. Próxima cita recomendada en 7 días.
          </p>
        </div>

        {/* Heatmap */}
        <PainHeatmap history={DEMO_HISTORY} />

        {/* Recent days table */}
        <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#334155]">
            <h3 className="text-white font-semibold">Registros recientes</h3>
          </div>
          <div className="divide-y divide-[#334155]">
            {recent.map(({ date, entries }) => {
              const avg = entries.length
                ? (entries.reduce((s, e) => s + e.level, 0) / entries.length)
                : 0;
              const mostIntense = entries.length
                ? entries.reduce((m, e) => (e.level > m.level ? e : m), entries[0])
                : null;

              return (
                <div key={date} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-24 shrink-0">
                    <p className="text-white text-xs font-medium">{formatDateES(date)}</p>
                  </div>
                  <div className="w-16 text-center">
                    <span className="text-[#94A3B8] text-xs">{entries.length} zonas</span>
                  </div>
                  <div className="w-16 text-center">
                    <span className={`text-xs font-bold ${getLevelColor(avg)}`}>
                      {avg.toFixed(1)}/10
                    </span>
                  </div>
                  <div className="flex-1 text-right">
                    {mostIntense && (
                      <span className="text-[#64748B] text-xs">
                        {ZONE_NAMES[mostIntense.zone as BodyZone]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Caregiver notes — visible only if patient has a caregiver registered */}
        <div className="bg-[#1E293B] border border-purple-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-purple-800/50">
            <span className="text-lg">🧠</span>
            <h3 className="text-white font-semibold text-sm">Notas del cuidador</h3>
            <span className="ml-auto text-[10px] text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded-full">Alzheimer</span>
          </div>
          <div className="divide-y divide-[#334155]">
            {[
              { date: "12 jul 09:30", icon: "🌀", type: "Confusión", sev: "Moderada", sevColor: "text-orange-400", note: "No reconoció a su hija por ~20 min. Se calmó con música familiar." },
              { date: "11 jul 22:00", icon: "🌙", type: "Sueño alterado", sev: "Severa", sevColor: "text-red-400", note: "Despertó 4 veces. Muy confundido al levantarse. Requirió Lorazepam 0.5mg a las 3:30am." },
              { date: "11 jul 14:00", icon: "⚡", type: "Agitación", sev: "Leve", sevColor: "text-yellow-400", note: "Inquieto post-almuerzo. Paseo corto en pasillo ayudó." },
              { date: "10 jul 11:00", icon: "⚠️", type: "Riesgo de caída", sev: "Leve", sevColor: "text-yellow-400", note: "Tropezó en umbral del baño. Sin caída. Pendiente instalar barras de apoyo." },
            ].map((ep, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs flex items-center gap-1.5">
                    <span>{ep.icon}</span>
                    <span className="text-white font-medium">{ep.type}</span>
                    <span className={`text-xs ${ep.sevColor}`}>· {ep.sev}</span>
                  </span>
                  <span className="text-[#475569] text-xs">{ep.date}</span>
                </div>
                <p className="text-[#94A3B8] text-xs leading-relaxed">{ep.note}</p>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-purple-900/10 border-t border-purple-800/30">
            <p className="text-purple-300 text-xs">
              Cuidador principal: Ana Pérez (hija) · +56 9 8765 4321 ·{" "}
              <span className="text-[#64748B]">Registrado en TrustLeaf</span>
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
