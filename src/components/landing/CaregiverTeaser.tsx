// Copyright © 2026 Browns Studio
// CaregiverTeaser — sección de landing que presenta el portal de cuidadores
// Muestra los 4 casos de uso principales y un CTA a /caregiver/types

import Link from "next/link";

const CARE_TYPES = [
  { icon: "🧠", label: "Alzheimer", sub: "Diario cognitivo + QR emergencia bilingüe", available: true },
  { icon: "🧓", label: "Adulto Mayor", sub: "Polifarmacia + signos vitales + citas", available: false },
  { icon: "🫀", label: "Post-ACV", sub: "Rehabilitación motora + escala de Rankin", available: false },
  { icon: "🌿", label: "Paliativos", sub: "Escala ESAS + directivas anticipadas", available: false },
  { icon: "👶", label: "Pediátrico", sub: "Crisis epilépticas + glucemia + vacunas", available: false },
  { icon: "♿", label: "Discapacidad", sub: "Rutina de cuidado + alimentación enteral", available: false },
  { icon: "🏥", label: "Post-quirúrgico", sub: "Alta hospitalaria + signos de alarma", available: false },
  { icon: "🧩", label: "Salud Mental", sub: "PHQ-9 + adherencia psiquiátrica", available: false },
];

export default function CaregiverTeaser() {
  return (
    <section className="py-20 bg-[#0F172A]" id="cuidadores">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-block px-3 py-1 bg-purple-900/30 border border-purple-700 rounded-full text-purple-300 text-xs font-medium mb-4">
            Nuevo — Portal de Cuidadores
          </div>
          <h2 className="text-white font-black text-3xl md:text-4xl mb-4">
            Para quienes cuidan a otros
          </h2>
          <p className="text-[#94A3B8] text-base md:text-lg max-w-2xl mx-auto">
            TrustLeaf no es solo para pacientes. Los cuidadores familiares son usuarios primarios:
            gestionan medicamentos, registran episodios y coordinan con el equipo médico.
            Todo desde el celular.
          </p>
        </div>

        {/* Care types grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {CARE_TYPES.map(t => (
            <div
              key={t.label}
              className={`relative rounded-2xl border p-4 text-center transition-all ${
                t.available
                  ? "border-purple-700 bg-purple-900/20 hover:bg-purple-900/30"
                  : "border-[#1E293B] bg-[#0F172A]"
              }`}
            >
              <p className="text-2xl mb-2">{t.icon}</p>
              <p className={`font-semibold text-sm ${t.available ? "text-white" : "text-[#64748B]"}`}>
                {t.label}
              </p>
              <p className={`text-[10px] mt-1 leading-snug ${t.available ? "text-purple-300" : "text-[#334155]"}`}>
                {t.sub}
              </p>
              {t.available && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-400" />
              )}
            </div>
          ))}
        </div>

        {/* Key features */}
        <div className="grid md:grid-cols-3 gap-4 mb-10">
          {[
            {
              icon: "📓",
              title: "Diario cognitivo",
              desc: "8 tipos de síntoma — confusión, agitación, alucinaciones, caídas. Con causa y qué ayudó a calmarlo.",
            },
            {
              icon: "🆘",
              title: "QR de emergencia bilingüe",
              desc: "Español + inglés. Sin login. Fondo rojo. Guías clínicas para el médico de urgencias.",
            },
            {
              icon: "💊",
              title: "Control de medicamentos",
              desc: "Vista por horario. Toggle dado/no dado. Alertas especiales para medicamentos controlados.",
            },
          ].map(f => (
            <div key={f.title} className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
              <p className="text-2xl mb-3">{f.icon}</p>
              <h3 className="text-white font-semibold text-sm mb-2">{f.title}</h3>
              <p className="text-[#64748B] text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { value: "53M", label: "Cuidadores familiares globales", sub: "de adultos con condiciones crónicas" },
            { value: "4.5M", label: "Cuidadores en LATAM", sub: "de adultos con demencia (ADI, 2023)" },
            { value: "60%", label: "Desarrollan burnout", sub: "en el primer año de cuidado" },
          ].map(s => (
            <div key={s.label} className="bg-[#1E293B] border border-[#334155] rounded-2xl p-4 text-center">
              <p className="text-purple-400 font-black text-2xl">{s.value}</p>
              <p className="text-white text-xs font-semibold mt-1">{s.label}</p>
              <p className="text-[#64748B] text-[10px] mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center space-y-3">
          <Link
            href="/caregiver"
            className="inline-block px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-base rounded-2xl transition-colors"
          >
            Ver demo de Cuidadores →
          </Link>
          <p className="text-[#475569] text-xs">
            Demo Alzheimer disponible · 7 tipos de cuidado más en desarrollo
          </p>
        </div>

      </div>
    </section>
  );
}
