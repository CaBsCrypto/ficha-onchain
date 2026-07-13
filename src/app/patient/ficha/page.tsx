"use client";
// /patient/ficha — Ficha Clínica On-Chain
// La vista central que une todos los módulos de TrustLeaf.
// Cada sección tiene su hash Stellar y fue firmada digitalmente por un profesional.

import { useState } from "react";
import Link from "next/link";
import Navbar from "../../../components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccessEntry {
  name: string;
  role: string;
  specialty: string;
  since: string;
  scope: string[];
  active: boolean;
}

interface DiagnosisEntry {
  code: string; // ICD-10
  name: string;
  date: string;
  doctor: string;
  status: "activo" | "resuelto" | "crónico";
  hash: string;
}

interface MedEntry {
  name: string;
  dose: string;
  frequency: string;
  prescriber: string;
  since: string;
  hash: string;
}

interface VaccineEntry {
  name: string;
  date: string;
  dose: string;
  hash: string;
}

// ─── Demo data ─────────────────────────────────────────────────────────────────

const PATIENT = {
  name: "María Paz Torres Fuentes",
  rut: "12.345.678-9",
  dob: "1987-04-12",
  age: 39,
  blood: "A+",
  nationality: "Chilena",
  emergencyContact: "Roberto Torres · +56 9 8765 4321",
  allergies: ["Penicilina", "AINEs (urticaria)"],
  fichaHash: "0x7a3f...c921",
  lastUpdated: "2026-07-10",
  stellarTx: "4f2c8e...a019",
  delegatedAccess: "Cuidador: Sofía Torres (hija)",
};

const DIAGNOSES: DiagnosisEntry[] = [
  {
    code: "M54.5",
    name: "Lumbago crónico",
    date: "2022-03-15",
    doctor: "Dr. Andrés Villanueva · Traumatólogo",
    status: "crónico",
    hash: "e3a1...7f02",
  },
  {
    code: "H52.1",
    name: "Miopía bilateral",
    date: "2019-08-22",
    doctor: "Dra. Carmen Valdivia · Oftalmóloga",
    status: "crónico",
    hash: "b7c4...1d38",
  },
  {
    code: "J45.20",
    name: "Asma leve intermitente",
    date: "2015-11-05",
    doctor: "Dr. Luis Espinoza · Broncopulmonar",
    status: "activo",
    hash: "9f1e...4a67",
  },
  {
    code: "K21.0",
    name: "Reflujo gastroesofágico",
    date: "2024-01-18",
    doctor: "Dra. Paula Ramírez · Gastroenteróloga",
    status: "resuelto",
    hash: "2c8d...b543",
  },
];

const MEDICATIONS: MedEntry[] = [
  {
    name: "Salbutamol 100mcg (inhalador)",
    dose: "2 puff",
    frequency: "SOS",
    prescriber: "Dr. Luis Espinoza",
    since: "2015-11-05",
    hash: "a4f2...c819",
  },
  {
    name: "Omeprazol 20mg",
    dose: "1 cápsula",
    frequency: "Cada mañana",
    prescriber: "Dra. Paula Ramírez",
    since: "2024-01-18",
    hash: "d9e3...7b21",
  },
];

const VACCINES: VaccineEntry[] = [
  { name: "COVID-19 bivalente", date: "2024-04-10", dose: "Refuerzo", hash: "f1a2...3c04" },
  { name: "Influenza", date: "2026-04-08", dose: "Anual", hash: "8b7c...e219" },
  { name: "Hepatitis B", date: "2010-06-15", dose: "Serie completa", hash: "3d4e...a781" },
  { name: "Tétanos-Difteria", date: "2018-09-20", dose: "Refuerzo", hash: "c5f6...2b93" },
];

const ACCESSES: AccessEntry[] = [
  {
    name: "Dra. Carmen Valdivia",
    role: "Médico tratante",
    specialty: "Oftalmología",
    since: "2019-08-22",
    scope: ["Recetas ópticas", "Historial visual"],
    active: true,
  },
  {
    name: "Dr. Sebastián Morales",
    role: "Médico tratante",
    specialty: "Odontología / Ortodoncia",
    since: "2024-03-01",
    scope: ["Historial dental", "Radiografías", "Ortodoncia"],
    active: true,
  },
  {
    name: "Dr. Andrés Villanueva",
    role: "Especialista",
    specialty: "Traumatología",
    since: "2022-03-15",
    scope: ["Diagnósticos", "Diario de dolor", "Imágenes"],
    active: true,
  },
  {
    name: "Sofía Torres",
    role: "Cuidador autorizado",
    specialty: "Familiar (hija)",
    since: "2026-01-15",
    scope: ["Medicamentos", "Episodios", "QR emergencia"],
    active: true,
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, hash }: { icon: string; title: string; hash?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="text-white font-bold text-sm">{title}</h2>
      </div>
      {hash && (
        <span className="text-[#10B981] text-[10px] font-mono bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 rounded-full">
          ⛓ {hash}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "activo" | "resuelto" | "crónico" }) {
  const map = {
    activo:   { label: "Activo",   cls: "bg-amber-900/40 text-amber-400 border-amber-700" },
    resuelto: { label: "Resuelto", cls: "bg-green-900/40 text-green-400 border-green-700" },
    crónico:  { label: "Crónico",  cls: "bg-blue-900/40 text-blue-400 border-blue-700" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QRModal({ onClose }: { onClose: () => void }) {
  const shareText =
    `🏥 *Ficha Clínica — María Paz Torres F.*\n` +
    `🩸 Sangre: A+ · RUT: 12.345.678-9\n` +
    `⚠️ Alergias: Penicilina, AINEs\n\n` +
    `📋 Diagnósticos activos:\n` +
    `• Lumbago crónico (M54.5)\n` +
    `• Miopía bilateral (H52.1)\n` +
    `• Asma leve (J45.20)\n\n` +
    `💊 Medicamentos:\n` +
    `• Salbutamol 100mcg (inhalador SOS)\n` +
    `• Omeprazol 20mg (mañanas)\n\n` +
    `📞 Contacto emergencia: Roberto Torres +56 9 8765 4321\n\n` +
    `⛓ Verificado en Stellar Blockchain · TrustLeaf\n` +
    `Hash: 0x7a3f...c921`;

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 max-w-xs w-full text-center"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-white font-bold text-sm mb-1">QR Emergencia</p>
        <p className="text-[#64748B] text-xs mb-4">Escanear para ver ficha completa</p>

        {/* QR placeholder */}
        <div className="w-44 h-44 mx-auto bg-white rounded-xl mb-4 flex items-center justify-center">
          <div className="grid grid-cols-5 gap-0.5 p-2">
            {Array.from({ length: 25 }).map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded-sm ${
                  [0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24,7,12,17,6,8,11,13,16,18][i] % 3 === 0
                    ? "bg-[#0F172A]"
                    : "bg-white"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="bg-[#0F172A] rounded-xl p-3 mb-4 text-left">
          <p className="text-[#10B981] text-[10px] font-mono">⛓ Hash: 0x7a3f...c921</p>
          <p className="text-[#64748B] text-[10px] mt-0.5">Stellar · Soroban · Verificado</p>
        </div>

        <button
          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank")}
          className="w-full py-2.5 bg-[#25D366] text-white font-bold text-sm rounded-xl hover:bg-[#20BF5A] transition-colors mb-2"
        >
          📤 Compartir por WhatsApp
        </button>
        <button
          onClick={onClose}
          className="w-full py-2 text-[#64748B] text-sm hover:text-white transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FichaOnChainPage() {
  const [showQR, setShowQR] = useState(false);
  const [showAccess, setShowAccess] = useState(false);

  const activeAccesses = ACCESSES.filter(a => a.active);

  return (
    <div className="min-h-screen bg-[#0F172A] text-white pb-24">
      <Navbar />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-sm border-b border-[#334155] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/patient"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#334155] text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <div>
              <h1 className="text-white font-bold text-base leading-none">Ficha Clínica On-Chain</h1>
              <p className="text-[#10B981] text-xs mt-0.5">⛓ Verificada · Stellar Soroban</p>
            </div>
          </div>
          <button
            onClick={() => setShowQR(true)}
            className="bg-[#10B981] text-[#0F172A] font-bold text-xs px-4 py-2 rounded-xl hover:bg-[#34D399] transition-colors"
          >
            QR Emergencia
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-5">

        {/* Identity card */}
        <div className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] border border-[#334155] rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#10B981]/20 border border-[#10B981]/30 flex items-center justify-center text-2xl shrink-0">
              🧬
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base leading-tight">{PATIENT.name}</p>
              <p className="text-[#64748B] text-xs mt-0.5">RUT {PATIENT.rut} · {PATIENT.age} años · {PATIENT.nationality}</p>
              <p className="text-[#64748B] text-xs">Nacimiento: {PATIENT.dob}</p>
            </div>
          </div>

          {/* Key vitals row */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-[#0F172A] rounded-xl p-3 text-center">
              <p className="text-red-400 font-bold text-lg leading-none">{PATIENT.blood}</p>
              <p className="text-[#64748B] text-[10px] mt-0.5">Tipo de sangre</p>
            </div>
            <div className="bg-[#0F172A] rounded-xl p-3 text-center">
              <p className="text-amber-400 font-bold text-sm leading-none mt-0.5">⚠️ {PATIENT.allergies.length}</p>
              <p className="text-[#64748B] text-[10px] mt-0.5">Alergias</p>
            </div>
            <div className="bg-[#0F172A] rounded-xl p-3 text-center">
              <p className="text-[#10B981] font-bold text-sm leading-none mt-0.5">✓ {activeAccesses.length}</p>
              <p className="text-[#64748B] text-[10px] mt-0.5">Accesos activos</p>
            </div>
          </div>

          {/* Allergies */}
          <div className="mt-3 flex flex-wrap gap-2">
            {PATIENT.allergies.map(a => (
              <span key={a} className="text-xs bg-red-900/30 text-red-400 border border-red-700/50 rounded-full px-3 py-1">
                ⚠️ {a}
              </span>
            ))}
          </div>

          {/* Blockchain seal */}
          <div className="mt-4 bg-[#0F172A] rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[#10B981] text-xs font-semibold">Ficha verificada en blockchain</p>
              <p className="text-[#64748B] text-[10px] font-mono mt-0.5">Hash: {PATIENT.fichaHash} · Tx: {PATIENT.stellarTx}</p>
            </div>
            <span className="text-lg">⛓️</span>
          </div>
        </div>

        {/* Caregiver delegated access banner */}
        <div className="bg-purple-900/20 border border-purple-700/40 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl shrink-0">🧠</span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">Cuidado activo · Alzheimer</p>
            <p className="text-purple-300 text-xs">Sofía Torres (hija) tiene acceso delegado on-chain a esta ficha</p>
          </div>
          <a href="/caregiver" className="text-xs text-purple-300 border border-purple-700/50 rounded-lg px-3 py-1.5 hover:bg-purple-900/30 transition-colors shrink-0">
            Ver →
          </a>
        </div>

        {/* Emergency contact */}
        <div className="bg-[#1E293B] border border-amber-700/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">📞</span>
          <div>
            <p className="text-white text-sm font-semibold">Contacto de emergencia</p>
            <p className="text-[#94A3B8] text-xs">{PATIENT.emergencyContact}</p>
          </div>
        </div>

        {/* Diagnoses */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <SectionHeader icon="🩺" title="Diagnósticos" hash="e3a1...9f02" />
          <div className="space-y-3">
            {DIAGNOSES.map(d => (
              <div key={d.code} className="bg-[#0F172A] rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[#64748B] text-[10px] font-mono bg-[#1E293B] px-1.5 py-0.5 rounded">
                        {d.code}
                      </span>
                      <StatusBadge status={d.status} />
                    </div>
                    <p className="text-white text-sm font-semibold mt-1">{d.name}</p>
                    <p className="text-[#64748B] text-xs">{d.doctor}</p>
                    <p className="text-[#64748B] text-[10px] mt-0.5">{d.date}</p>
                  </div>
                </div>
                <p className="text-[#10B981] text-[10px] font-mono mt-1">⛓ {d.hash}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Medications */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <SectionHeader icon="💊" title="Medicamentos activos" hash="a4f2...d921" />
          <div className="space-y-3">
            {MEDICATIONS.map(m => (
              <div key={m.name} className="bg-[#0F172A] rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold">{m.name}</p>
                    <p className="text-[#94A3B8] text-xs">{m.dose} · {m.frequency}</p>
                    <p className="text-[#64748B] text-xs">Recetado por: {m.prescriber}</p>
                    <p className="text-[#64748B] text-[10px] mt-0.5">Desde: {m.since}</p>
                  </div>
                  <span className="text-2xl shrink-0">💊</span>
                </div>
                <p className="text-[#10B981] text-[10px] font-mono mt-2">⛓ {m.hash}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Vaccines */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <SectionHeader icon="💉" title="Vacunas" hash="f1a2...8c14" />
          <div className="space-y-2">
            {VACCINES.map(v => (
              <div key={v.name} className="flex items-center justify-between gap-3 py-2.5 border-b border-[#334155] last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-semibold">{v.name}</p>
                  <p className="text-[#64748B] text-[10px]">{v.dose} · {v.date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#10B981] text-[10px] font-mono bg-[#10B981]/10 border border-[#10B981]/20 px-1.5 py-0.5 rounded">
                    ✓ on-chain
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Specialty modules */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <SectionHeader icon="📂" title="Módulos especializados" />
          <div className="space-y-2">
            {[
              { icon: "🗓️", label: "Diario de Dolor", sub: "7 días registrados · Lumbago crónico", href: "/patient/pain-diary", color: "text-green-400" },
              { icon: "👓", label: "Receta Óptica", sub: "Progresivo · válida hasta 2027-03-15", href: "/patient/optical", color: "text-sky-400" },
              { icon: "🦷", label: "Historial Dental", sub: "Ortodoncia en progreso · próxima cita 22 jul", href: "/patient/dental", color: "text-teal-400" },
              { icon: "🧠", label: "Diario Cognitivo (Alzheimer)", sub: "Episodios · medicamentos · adherencia semanal", href: "/caregiver/diary", color: "text-purple-400" },
              { icon: "🆘", label: "QR Emergencia Bilingüe", sub: "ES/EN · datos críticos siempre accesibles", href: "/caregiver/emergency/12345678-9", color: "text-red-400" },
              { icon: "👴", label: "Portal Cuidadores", sub: "Dashboard Alzheimer · acceso delegado activo", href: "/caregiver", color: "text-indigo-400" },
            ].map(m => (
              <a
                key={m.label}
                href={m.href}
                className="flex items-center gap-3 bg-[#0F172A] rounded-xl p-3.5 hover:bg-[#253046]/50 transition-colors"
              >
                <span className="text-2xl shrink-0">{m.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold">{m.label}</p>
                  <p className={`text-xs ${m.color}`}>{m.sub}</p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[#64748B] shrink-0">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </a>
            ))}
          </div>
        </div>

        {/* Access control */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔐</span>
              <h2 className="text-white font-bold text-sm">Control de acceso</h2>
            </div>
            <button
              onClick={() => setShowAccess(!showAccess)}
              className="text-xs text-[#10B981] hover:underline"
            >
              {showAccess ? "Ocultar" : "Ver todos"}
            </button>
          </div>

          {/* Summary */}
          <div className="bg-[#0F172A] rounded-xl p-3 mb-3">
            <p className="text-[#94A3B8] text-xs">
              <span className="text-white font-semibold">{activeAccesses.length} profesionales</span> tienen acceso activo a tu ficha.
              Tú puedes revocar cualquier acceso en cualquier momento.
            </p>
          </div>

          {showAccess && (
            <div className="space-y-2 mt-3">
              {ACCESSES.map(a => (
                <div key={a.name} className="bg-[#0F172A] rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-semibold">{a.name}</p>
                      <p className="text-[#64748B] text-[10px]">{a.specialty} · desde {a.since}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {a.scope.map(s => (
                          <span key={s} className="text-[9px] bg-[#1E293B] text-[#94A3B8] border border-[#334155] rounded-full px-2 py-0.5">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${
                        a.active
                          ? "bg-green-900/40 text-green-400 border-green-700"
                          : "bg-gray-900/40 text-gray-400 border-gray-700"
                      }`}>
                        {a.active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <button className="w-full mt-2 py-2.5 border border-dashed border-[#334155] rounded-xl text-[#64748B] text-xs hover:border-[#10B981] hover:text-[#10B981] transition-colors">
                + Autorizar nuevo profesional
              </button>
            </div>
          )}
        </div>

        {/* Blockchain audit trail */}
        <div className="bg-[#1E293B] border border-[#10B981]/20 rounded-2xl p-5">
          <SectionHeader icon="⛓️" title="Registro blockchain" />
          <div className="space-y-2">
            {[
              { action: "Vacuna Influenza registrada", date: "2026-04-08", hash: "8b7c...e219", actor: "Centro Médico UC" },
              { action: "Receta óptica firmada", date: "2026-03-15", hash: "f4d1...2a08", actor: "Dra. Carmen Valdivia" },
              { action: "Ajuste ortodoncia registrado", date: "2026-05-20", hash: "c7e3...82f0", actor: "Dr. Sebastián Morales" },
              { action: "Acceso delegado a Sofía Torres", date: "2026-01-15", hash: "7a1b...c340", actor: "Sistema · autorizado por paciente" },
              { action: "Diagnóstico lumbago crónico", date: "2022-03-15", hash: "e3a1...7f02", actor: "Dr. Andrés Villanueva" },
            ].map((entry, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-semibold">{entry.action}</p>
                  <p className="text-[#64748B] text-[10px]">{entry.actor} · {entry.date}</p>
                  <p className="text-[#10B981] text-[10px] font-mono">⛓ {entry.hash}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[#334155] text-center">
            <p className="text-[#64748B] text-[10px]">
              Todos los eventos son inmutables · Stellar Soroban · Testnet
            </p>
          </div>
        </div>

        {/* Last updated */}
        <div className="text-center pb-4">
          <p className="text-[#64748B] text-xs">
            Última actualización: {PATIENT.lastUpdated} · TrustLeaf v0.9
          </p>
        </div>

      </main>

      {showQR && <QRModal onClose={() => setShowQR(false)} />}
    </div>
  );
}
