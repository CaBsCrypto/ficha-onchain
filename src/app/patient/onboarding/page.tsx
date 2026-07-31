"use client";
/**
 * /patient/onboarding — Wizard de Onboarding de Paciente.
 * ---------------------------------------------------------------------------
 * Guía al paciente nuevo en 3 pasos simples:
 * 1. Qué es la Ficha Portable (Anclaje Stellar, Cifrado AES-256-GCM).
 * 2. Privacidad y Control de Permisos (Ley 20.584 + Access-Log).
 * 3. Recuperación de Cuenta e Identidad (Privy Email / Passkeys).
 *
 * Mobile-first: Optimizado para viewports de 375px en adelante.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function PatientOnboardingPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const router = useRouter();

  const STEPS = [
    {
      num: 1,
      title: "Tu Ficha Clínica es TULYA",
      icon: "⚡",
      color: "bg-sky-500",
      description:
        "Tus diagnósticos, exámenes y recetas no quedan atrapados en una sola clínica. En TrustLeaf, la huella de tu ficha médica se ancla on-chain en la red Stellar y el contenido vive cifrado fuera de la cadena.",
      points: [
        "Huella criptográfica SHA-256 verificable públicamente",
        "Contenido cifrado AES-256-GCM a nivel bancario",
        "Derecho al olvido y cancelación (Ley 19.628)",
      ],
    },
    {
      num: 2,
      title: "Control de Permisos y Transparencia",
      icon: "🛡️",
      color: "bg-emerald-500",
      description:
        "Tú decides qué profesional médico puede consultar tu historia clínica. Bajo la Ley 20.584, cada lectura de un médico o centro externo queda auditada en tu Registro de Accesos.",
      points: [
        "Otorga y revoca permisos a médicos con un clic",
        "Notificaciones in-app cuando un profesional lee tu ficha",
        "Consentimiento granular registrado como transacción",
      ],
    },
    {
      num: 3,
      title: "Tu Identidad y Recuperación",
      icon: "🔑",
      color: "bg-indigo-500",
      description:
        "Ingresas con tu email o Google mediante Privy. Tu clave privada médica está resguardada sin necesidad de anotar frases semillas ni contraseñas complejas en papel.",
      points: [
        "Recuperación segura por correo electrónico",
        "Sin fricción: muestra tu QR en la farmacia o consulta",
        "La Inteligencia Artificial te explica tus exámenes en lenguaje simple",
      ],
    },
  ];

  const current = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col justify-between">
      <Navbar />

      <main className="max-w-md mx-auto px-4 py-8 flex-1 flex flex-col justify-center w-full space-y-6">
        {/* Progress Bar */}
        <div className="flex items-center justify-between gap-2">
          {STEPS.map((s) => (
            <div
              key={s.num}
              className={`h-2 flex-1 rounded-full transition-all ${
                s.num <= step ? "bg-[#0ea5e9]" : "bg-slate-800"
              }`}
            />
          ))}
        </div>

        {/* Step Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl space-y-5 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${current.color} text-white font-bold text-2xl shadow-md`}>
              {current.icon}
            </div>
            <div>
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                Paso {current.num} de 3
              </span>
              <h2 className="text-lg font-bold text-white leading-tight">{current.title}</h2>
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed font-medium">
            {current.description}
          </p>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            {current.points.map((p, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              className="rounded-2xl border border-slate-700 bg-slate-800/80 px-5 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
            >
              ← Anterior
            </button>
          ) : (
            <Link
              href="/patient"
              className="rounded-2xl border border-slate-800 px-4 py-3 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
            >
              Saltar
            </Link>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              className="flex-1 rounded-2xl bg-[#0ea5e9] px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-[#0284c7] transition-colors text-center"
            >
              Siguiente →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/patient?tab=inicio")}
              className="flex-1 rounded-2xl bg-emerald-500 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-600 transition-colors text-center"
            >
              Comenzar en mi Ficha →
            </button>
          )}
        </div>
      </main>

      <footer className="py-4 text-center text-[11px] text-slate-500">
        TrustLeaf On-Chain Health Records · Ley 20.584 & 19.628 Chile
      </footer>
    </div>
  );
}
