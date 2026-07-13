"use client";
// Onboarding de Cuidadores — flujo guiado para configurar el perfil del dependiente
// 4 pasos: tipo de cuidado → datos del paciente → medicamentos → equipo

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type CareType =
  | "alzheimer"
  | "elderly"
  | "stroke"
  | "pediatric"
  | "palliative"
  | "disability"
  | "postsurgical"
  | "mental";

type Step = 1 | 2 | 3 | 4;

// ─── Care type config ─────────────────────────────────────────────────────────

const CARE_TYPES = [
  {
    key: "alzheimer" as CareType,
    icon: "🧠",
    title: "Alzheimer / Demencia",
    desc: "Pérdida de memoria, desorientación, cambios de conducta",
    available: true,
    color: "border-purple-700 bg-purple-900/20",
    activeColor: "border-purple-500 bg-purple-900/40 ring-2 ring-purple-500",
  },
  {
    key: "elderly" as CareType,
    icon: "🧓",
    title: "Adulto Mayor",
    desc: "Enfermedades crónicas, polifarmacia, prevención de caídas",
    available: true,
    color: "border-orange-800 bg-orange-900/10",
    activeColor: "border-orange-500 bg-orange-900/30 ring-2 ring-orange-500",
  },
  {
    key: "stroke" as CareType,
    icon: "🫀",
    title: "Post-ACV / Rehabilitación",
    desc: "Recuperación motora, habla, fisioterapia",
    available: true,
    color: "border-red-800 bg-red-900/10",
    activeColor: "border-red-500 bg-red-900/30 ring-2 ring-red-500",
  },
  {
    key: "pediatric" as CareType,
    icon: "👶",
    title: "Niño con condición crónica",
    desc: "Epilepsia, diabetes infantil, autismo, fibrosis quística",
    available: true,
    color: "border-yellow-800 bg-yellow-900/10",
    activeColor: "border-yellow-500 bg-yellow-900/30 ring-2 ring-yellow-500",
  },
  {
    key: "palliative" as CareType,
    icon: "🌿",
    title: "Cuidados Paliativos",
    desc: "Oncología, manejo del dolor, calidad de vida",
    available: true,
    color: "border-green-800 bg-green-900/10",
    activeColor: "border-green-500 bg-green-900/30 ring-2 ring-green-500",
  },
  {
    key: "disability" as CareType,
    icon: "♿",
    title: "Discapacidad Severa",
    desc: "ALS, lesión medular, dependencia total",
    available: true,
    color: "border-blue-800 bg-blue-900/10",
    activeColor: "border-blue-500 bg-blue-900/30 ring-2 ring-blue-500",
  },
  {
    key: "postsurgical" as CareType,
    icon: "🏥",
    title: "Post-Quirúrgico",
    desc: "Alta hospitalaria, recuperación, seguimiento de heridas",
    available: true,
    color: "border-cyan-800 bg-cyan-900/10",
    activeColor: "border-cyan-500 bg-cyan-900/30 ring-2 ring-cyan-500",
  },
  {
    key: "mental" as CareType,
    icon: "🧩",
    title: "Salud Mental",
    desc: "Depresión, bipolaridad, esquizofrenia",
    available: true,
    color: "border-pink-800 bg-pink-900/10",
    activeColor: "border-pink-500 bg-pink-900/30 ring-2 ring-pink-500",
  },
];

const RELATIONSHIPS = [
  "Hijo/a",
  "Cónyuge / Pareja",
  "Padre / Madre",
  "Hermano/a",
  "Nieto/a",
  "Cuidador/a profesional",
  "Otro familiar",
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "No sé"];

// ─── Step components ──────────────────────────────────────────────────────────

function StepIndicator({ step, current }: { step: Step; current: Step }) {
  const STEPS = ["Tipo", "Paciente", "Medicamentos", "Equipo"];
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3, 4] as Step[]).map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
            s < current ? "bg-[#10B981] text-white" :
            s === current ? "bg-purple-600 text-white" :
            "bg-[#1E293B] border border-[#334155] text-[#475569]"
          }`}>
            {s < current ? "✓" : s}
          </div>
          <span className={`text-xs hidden sm:block ${s === current ? "text-white font-medium" : "text-[#475569]"}`}>
            {STEPS[i]}
          </span>
          {s < 4 && <div className="w-6 h-px bg-[#334155] hidden sm:block" />}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CaregiverOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [careType, setCareType] = useState<CareType | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientRut, setPatientRut] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [relationship, setRelationship] = useState("");
  const [caregiverName, setCaregiverName] = useState("");
  const [caregiverPhone, setCaregiverPhone] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [med1, setMed1] = useState("");
  const [med2, setMed2] = useState("");
  const [med3, setMed3] = useState("");
  const [done, setDone] = useState(false);

  function handleFinish() {
    setDone(true);
    setTimeout(() => {
      router.push("/caregiver");
    }, 2500);
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-6xl">✅</div>
          <h2 className="text-white font-black text-2xl">¡Perfil creado!</h2>
          <p className="text-[#94A3B8] text-sm">
            El historial de {patientName || "tu familiar"} está configurado
            y anclado en Stellar blockchain.
          </p>
          <p className="text-[#64748B] text-xs">Redirigiendo al dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Minimal header */}
      <header className="border-b border-[#334155] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#10B981] flex items-center justify-center text-[#0F172A] font-bold text-xs">TL</div>
            <span className="text-white font-bold text-sm">Trust<span className="text-[#10B981]">Leaf</span></span>
          </Link>
          <StepIndicator step={step} current={step} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── STEP 1: Tipo de cuidado ─── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-white font-black text-2xl">¿Qué tipo de cuidado necesita tu familiar?</h1>
              <p className="text-[#64748B] text-sm mt-1">Configuraremos las herramientas más relevantes para su condición.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {CARE_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setCareType(t.key)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    careType === t.key ? t.activeColor : t.color
                  }`}
                >
                  <p className="text-2xl mb-2">{t.icon}</p>
                  <p className="text-white font-semibold text-sm leading-snug">{t.title}</p>
                  <p className="text-[#64748B] text-xs mt-1 leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!careType}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-colors ${
                careType
                  ? "bg-purple-600 hover:bg-purple-500 text-white"
                  : "bg-[#1E293B] text-[#475569] cursor-not-allowed"
              }`}
            >
              Continuar →
            </button>
          </div>
        )}

        {/* ─── STEP 2: Datos del paciente ─── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-white font-black text-2xl">Datos del paciente</h1>
              <p className="text-[#64748B] text-sm mt-1">
                Esta información aparecerá en el QR de emergencia y el historial compartido con médicos.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[#94A3B8] text-xs font-medium mb-1.5 block">Nombre completo *</label>
                <input
                  type="text"
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                  placeholder="Roberto Pérez Salas"
                  className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white text-sm placeholder-[#475569] focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#94A3B8] text-xs font-medium mb-1.5 block">Edad *</label>
                  <input
                    type="number"
                    value={patientAge}
                    onChange={e => setPatientAge(e.target.value)}
                    placeholder="78"
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white text-sm placeholder-[#475569] focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[#94A3B8] text-xs font-medium mb-1.5 block">RUT</label>
                  <input
                    type="text"
                    value={patientRut}
                    onChange={e => setPatientRut(e.target.value)}
                    placeholder="12.345.678-9"
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white text-sm placeholder-[#475569] focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[#94A3B8] text-xs font-medium mb-1.5 block">Grupo sanguíneo</label>
                <div className="flex flex-wrap gap-2">
                  {BLOOD_TYPES.map(bt => (
                    <button
                      key={bt}
                      onClick={() => setBloodType(bt)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                        bloodType === bt
                          ? "border-red-500 bg-red-900/40 text-red-300"
                          : "border-[#334155] text-[#64748B] hover:border-[#475569]"
                      }`}
                    >
                      {bt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[#94A3B8] text-xs font-medium mb-1.5 block">
                  Alergias conocidas <span className="text-red-400">(aparecen en amarillo en el QR de emergencia)</span>
                </label>
                <input
                  type="text"
                  value={allergies}
                  onChange={e => setAllergies(e.target.value)}
                  placeholder="Penicilina, Ibuprofeno..."
                  className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white text-sm placeholder-[#475569] focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[#94A3B8] text-xs font-medium mb-1.5 block">Tu relación con el paciente *</label>
                <select
                  value={relationship}
                  onChange={e => setRelationship(e.target.value)}
                  className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Selecciona...</option>
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 border border-[#334155] rounded-2xl text-[#64748B] text-sm hover:text-white transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!patientName || !relationship}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-colors ${
                  patientName && relationship
                    ? "bg-purple-600 hover:bg-purple-500 text-white"
                    : "bg-[#1E293B] text-[#475569] cursor-not-allowed"
                }`}
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Medicamentos ─── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-white font-black text-2xl">Medicamentos actuales</h1>
              <p className="text-[#64748B] text-sm mt-1">
                Agrega los medicamentos principales. Puedes agregar más desde el panel de medicamentos.
              </p>
            </div>

            <div className="space-y-3">
              {[[med1, setMed1], [med2, setMed2], [med3, setMed3]].map(([val, setter], i) => (
                <div key={i}>
                  <label className="text-[#94A3B8] text-xs font-medium mb-1.5 block">
                    Medicamento {i + 1} {i === 0 ? "*" : "(opcional)"}
                  </label>
                  <input
                    type="text"
                    value={val as string}
                    onChange={e => (setter as (v: string) => void)(e.target.value)}
                    placeholder={
                      i === 0 ? "Ej: Donepezilo 10mg — 08:00" :
                      i === 1 ? "Ej: Memantina 10mg — 08:00 y 20:00" :
                      "Ej: Losartán 50mg — 20:00"
                    }
                    className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-3 text-white text-sm placeholder-[#475569] focus:border-purple-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/5 p-4">
              <p className="text-[#10B981] text-xs font-semibold mb-1">🔐 Privacidad garantizada</p>
              <p className="text-[#64748B] text-xs leading-relaxed">
                Los medicamentos se guardan localmente y solo se comparten con quien tú autorices
                mediante QR. El nombre del paciente nunca aparece en la blockchain — solo un hash anónimo.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-3 border border-[#334155] rounded-2xl text-[#64748B] text-sm hover:text-white transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!med1}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-colors ${
                  med1
                    ? "bg-purple-600 hover:bg-purple-500 text-white"
                    : "bg-[#1E293B] text-[#475569] cursor-not-allowed"
                }`}
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: Equipo de cuidado ─── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-white font-black text-2xl">Equipo de cuidado</h1>
              <p className="text-[#64748B] text-sm mt-1">
                ¿Quién más cuida a {patientName || "tu familiar"}? El médico recibe acceso al historial.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-4">
                <p className="text-white font-semibold text-sm mb-3">Tus datos (cuidador principal)</p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={caregiverName}
                    onChange={e => setCaregiverName(e.target.value)}
                    placeholder="Tu nombre completo *"
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2.5 text-white text-sm placeholder-[#475569] focus:border-purple-500 focus:outline-none"
                  />
                  <input
                    type="tel"
                    value={caregiverPhone}
                    onChange={e => setCaregiverPhone(e.target.value)}
                    placeholder="Tu teléfono de contacto *"
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2.5 text-white text-sm placeholder-[#475569] focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-4">
                <p className="text-white font-semibold text-sm mb-3">Médico tratante (opcional)</p>
                <input
                  type="text"
                  value={doctorName}
                  onChange={e => setDoctorName(e.target.value)}
                  placeholder="Nombre del médico o especialista"
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-4 py-2.5 text-white text-sm placeholder-[#475569] focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Summary preview */}
            <div className="bg-purple-900/20 border border-purple-800 rounded-2xl p-4 space-y-2">
              <p className="text-purple-300 text-xs font-semibold mb-2">Resumen del perfil</p>
              <p className="text-white text-sm font-medium">{patientName || "—"}</p>
              <p className="text-[#64748B] text-xs">
                {patientAge ? `${patientAge} años` : "—"} ·{" "}
                {CARE_TYPES.find(t => t.key === careType)?.title ?? "—"} ·{" "}
                {bloodType || "Sangre: no especificado"}
              </p>
              {allergies && (
                <p className="text-orange-300 text-xs">⚠️ Alergias: {allergies}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="px-6 py-3 border border-[#334155] rounded-2xl text-[#64748B] text-sm hover:text-white transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={handleFinish}
                disabled={!caregiverName || !caregiverPhone}
                className={`flex-1 py-3.5 rounded-2xl font-bold text-sm transition-colors ${
                  caregiverName && caregiverPhone
                    ? "bg-[#10B981] hover:bg-[#059669] text-white"
                    : "bg-[#1E293B] text-[#475569] cursor-not-allowed"
                }`}
              >
                Crear perfil y comenzar ✓
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
