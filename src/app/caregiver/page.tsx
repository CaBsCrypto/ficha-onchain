"use client";
// Copyright © 2026 Browns Studio
// Portal de Cuidadores — para familiares y cuidadores de adultos dependientes
// Casos: Alzheimer, demencia, ACV, adulto mayor, discapacidad severa

import { useState } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";

// ─── Mock patient data ────────────────────────────────────────────────────────

const PATIENT = {
  name: "Roberto Pérez Salas",
  age: 78,
  condition: "Alzheimer · Etapa moderada",
  bloodType: "A+",
  photo: null, // null = iniciales
  rut: "5.432.198-7",
  lastUpdate: "2026-07-12",
  allergies: ["Penicilina", "Ibuprofeno"],
  emergencyQrUrl: "/caregiver/emergency/5432198-7",
};

const TODAY_MEDS = [
  { id: 1, name: "Donepezilo 10mg", time: "08:00", taken: true, note: "Con desayuno" },
  { id: 2, name: "Memantina 10mg", time: "08:00", taken: true, note: "Con desayuno" },
  { id: 3, name: "Omeprazol 20mg", time: "08:00", taken: false, note: "En ayunas — dar antes del desayuno" },
  { id: 4, name: "Losartán 50mg", time: "20:00", taken: false, note: "Con cena" },
  { id: 5, name: "Lorazepam 0.5mg", time: "22:00", taken: false, note: "Solo si hay agitación nocturna" },
];

const RECENT_SYMPTOMS = [
  { date: "Hoy 09:30", type: "confusion", severity: "moderate", note: "No reconoció a su hija por ~20 min. Se calmó con música." },
  { date: "Ayer 14:00", type: "agitation", severity: "mild", note: "Inquieto después del almuerzo. Paseo corto ayudó." },
  { date: "Ayer 22:00", type: "sleep", severity: "severe", note: "Despertó 4 veces. Muy confundido al levantarse." },
  { date: "10 jul", type: "fall_risk", severity: "mild", note: "Tropezó en el baño. Sin caída. Instalar barras de apoyo." },
];

const CAREGIVERS = [
  { name: "Ana Pérez", relation: "Hija", phone: "+56 9 8765 4321", isPrimary: true },
  { name: "Carlos Pérez", relation: "Hijo", phone: "+56 9 1234 5678", isPrimary: false },
  { name: "Dra. María González", relation: "Neuróloga tratante", phone: "+56 2 2345 6789", isPrimary: false },
];

// ─── Symptom config ───────────────────────────────────────────────────────────

const SYMPTOM_CONFIG = {
  confusion: { label: "Confusión / Desorientación", color: "text-orange-400", bg: "bg-orange-900/20 border-orange-700", icon: "🌀" },
  agitation: { label: "Agitación / Conducta", color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-700", icon: "⚡" },
  sleep: { label: "Sueño alterado", color: "text-blue-400", bg: "bg-blue-900/20 border-blue-700", icon: "🌙" },
  fall_risk: { label: "Riesgo de caída", color: "text-red-400", bg: "bg-red-900/20 border-red-700", icon: "⚠️" },
  memory: { label: "Pérdida de memoria", color: "text-purple-400", bg: "bg-purple-900/20 border-purple-700", icon: "🧩" },
  appetite: { label: "Alimentación", color: "text-green-400", bg: "bg-green-900/20 border-green-700", icon: "🍽️" },
};

const SEVERITY_LABEL: Record<string, string> = {
  mild: "Leve",
  moderate: "Moderada",
  severe: "Severa",
};

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-white text-xs font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[#64748B] text-[11px] mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CaregiverPage() {
  const [medTaken, setMedTaken] = useState<Record<number, boolean>>(
    Object.fromEntries(TODAY_MEDS.map((m) => [m.id, m.taken]))
  );

  const takenCount = Object.values(medTaken).filter(Boolean).length;
  const totalMeds = TODAY_MEDS.length;

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Demo badge */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-purple-900/20 border border-purple-800 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-purple-400 text-xs">🧩</span>
            <p className="text-purple-300 text-xs font-medium">Alzheimer · Vista demo</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/caregiver/onboarding" className="text-[#10B981] hover:text-[#34D399] text-xs font-semibold whitespace-nowrap">
              + Nuevo perfil
            </Link>
            <Link href="/caregiver/types" className="text-purple-400 hover:text-purple-300 text-xs underline whitespace-nowrap">
              Tipos →
            </Link>
          </div>
        </div>

        {/* Patient card */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {PATIENT.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-base truncate">{PATIENT.name}</h2>
              <p className="text-[#64748B] text-sm">{PATIENT.age} años · {PATIENT.condition}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 bg-red-900/40 border border-red-700 text-red-300 text-xs rounded-full font-bold">
                  {PATIENT.bloodType}
                </span>
                {PATIENT.allergies.map(a => (
                  <span key={a} className="px-2 py-0.5 bg-orange-900/30 border border-orange-700 text-orange-300 text-xs rounded-full">
                    ⚠️ {a}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Link
              href="/caregiver/emergency/5432198-7"
              className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-800 rounded-xl hover:bg-red-900/30 transition-colors"
            >
              <span className="text-xl">🆘</span>
              <div>
                <p className="text-red-400 font-semibold text-xs">QR Emergencia</p>
                <p className="text-[#64748B] text-[11px]">Mostrar en urgencias</p>
              </div>
            </Link>
            <Link
              href="/caregiver/diary"
              className="flex items-center gap-2 p-3 bg-purple-900/20 border border-purple-800 rounded-xl hover:bg-purple-900/30 transition-colors"
            >
              <span className="text-xl">📓</span>
              <div>
                <p className="text-purple-400 font-semibold text-xs">Diario de Síntomas</p>
                <p className="text-[#64748B] text-[11px]">Registrar episodio</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Meds hoy" value={`${takenCount}/${totalMeds}`} sub="dados" color={takenCount === totalMeds ? "text-[#10B981]" : "text-yellow-400"} />
          <StatCard label="Episodios" value={3} sub="esta semana" color="text-orange-400" />
          <StatCard label="Próx. cita" value="21 jul" sub="Dra. González" color="text-[#3B82F6]" />
        </div>

        {/* Medication schedule */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#334155]">
            <div className="flex items-center gap-2">
              <span className="text-lg">💊</span>
              <h3 className="text-white font-semibold text-sm">Medicamentos de hoy</h3>
            </div>
            <Link href="/caregiver/medications" className="text-[#10B981] text-xs hover:underline">
              Ver todo →
            </Link>
          </div>
          <div className="divide-y divide-[#334155]">
            {TODAY_MEDS.map((med) => (
              <div key={med.id} className="flex items-center gap-3 px-5 py-3">
                <button
                  onClick={() => setMedTaken(p => ({ ...p, [med.id]: !p[med.id] }))}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    medTaken[med.id]
                      ? "bg-[#10B981] border-[#10B981]"
                      : "border-[#475569] hover:border-[#10B981]"
                  }`}
                >
                  {medTaken[med.id] && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3 h-3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${medTaken[med.id] ? "line-through text-[#475569]" : "text-white"}`}>
                    {med.name}
                  </p>
                  <p className="text-[#64748B] text-xs">{med.time} · {med.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent symptoms */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#334155]">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <h3 className="text-white font-semibold text-sm">Episodios recientes</h3>
            </div>
            <Link href="/caregiver/diary" className="text-[#10B981] text-xs hover:underline">
              + Registrar →
            </Link>
          </div>
          <div className="divide-y divide-[#334155]">
            {RECENT_SYMPTOMS.map((s, i) => {
              const cfg = SYMPTOM_CONFIG[s.type as keyof typeof SYMPTOM_CONFIG];
              return (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{}}>
                      <span>{cfg.icon}</span>
                      <span className={cfg.color}>{cfg.label}</span>
                    </span>
                    <span className="text-[#475569] text-xs">{s.date} · {SEVERITY_LABEL[s.severity]}</span>
                  </div>
                  <p className="text-[#94A3B8] text-xs leading-relaxed">{s.note}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Care team */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#334155]">
            <div className="flex items-center gap-2">
              <span className="text-lg">👥</span>
              <h3 className="text-white font-semibold text-sm">Equipo de cuidado</h3>
            </div>
          </div>
          <div className="divide-y divide-[#334155]">
            {CAREGIVERS.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-white text-sm font-medium">{c.name}</p>
                  <p className="text-[#64748B] text-xs">{c.relation}{c.isPrimary ? " · Cuidador principal" : ""}</p>
                </div>
                <a
                  href={`tel:${c.phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] border border-[#334155] rounded-xl text-[#94A3B8] hover:text-white text-xs transition-colors"
                >
                  📞 Llamar
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Blockchain verification */}
        <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/5 p-4 flex items-start gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={2} className="w-4 h-4 shrink-0 mt-0.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <div>
            <p className="text-[#10B981] font-semibold text-xs">Historial anclado en Stellar Blockchain</p>
            <p className="text-[#64748B] text-xs mt-0.5">
              Cada registro de síntomas y medicamento queda verificado con timestamp inmutable.
              El neurólogo ve los datos exactamente como fueron registrados.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
