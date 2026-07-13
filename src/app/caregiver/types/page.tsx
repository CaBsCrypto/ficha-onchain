"use client";
// Hub de Tipos de Cuidado — página informativa que muestra todos los perfiles
// que TrustLeaf puede apoyar para cuidadores y dependientes

import Link from "next/link";
import Navbar from "../../../components/Navbar";

// ─── Care profiles ────────────────────────────────────────────────────────────

const CARE_PROFILES = [
  {
    key: "alzheimer",
    icon: "🧠",
    title: "Alzheimer y Demencias",
    subtitle: "Pérdida de memoria · Desorientación · Cambios conductuales",
    description:
      "Seguimiento de episodios cognitivos y conductuales, control de medicamentos específicos, QR de emergencia bilingüe con guías para urgencias.",
    features: [
      "Diario de episodios: confusión, agitación, alucinaciones",
      "QR de emergencia con instrucciones para médicos",
      "Horario de medicamentos con alerta de dosis omitidas",
      "Historial compartido con neurólogo tratante",
    ],
    color: "border-purple-700 bg-purple-900/20",
    iconBg: "bg-purple-900/40",
    textColor: "text-purple-300",
    btnColor: "bg-purple-600 hover:bg-purple-500",
    href: "/caregiver",
    available: true,
  },
  {
    key: "elderly",
    icon: "🧓",
    title: "Adulto Mayor",
    subtitle: "Cuidado general · Enfermedades crónicas · Prevención de caídas",
    description:
      "Monitoreo de condiciones crónicas, seguimiento de citas médicas, control de polifarmacia (múltiples medicamentos), y detección temprana de deterioro funcional.",
    features: [
      "Control de polifarmacia — alertas de interacciones",
      "Registro de signos vitales: presión, glucosa, peso",
      "Calendario de citas y controles médicos",
      "Evaluación de riesgo de caídas",
    ],
    color: "border-orange-700 bg-orange-900/20",
    iconBg: "bg-orange-900/40",
    textColor: "text-orange-300",
    btnColor: "bg-orange-600 hover:bg-orange-500",
    href: "#",
    available: false,
    tag: "Próximamente",
  },
  {
    key: "stroke",
    icon: "🫀",
    title: "Post-ACV / Rehabilitación",
    subtitle: "Recuperación neurológica · Fisioterapia · Habla y lenguaje",
    description:
      "Seguimiento de progreso en rehabilitación motora y del lenguaje, registro de sesiones de fisioterapia, y métricas de recuperación funcional para el equipo médico.",
    features: [
      "Progreso en rehabilitación motora por zona corporal",
      "Registro de sesiones de fonoaudiología",
      "Escala de Rankin modificada — seguimiento mensual",
      "Alertas de regresión funcional",
    ],
    color: "border-red-700 bg-red-900/20",
    iconBg: "bg-red-900/40",
    textColor: "text-red-300",
    btnColor: "bg-red-600 hover:bg-red-500",
    href: "#",
    available: false,
    tag: "Próximamente",
  },
  {
    key: "pediatric",
    icon: "👶",
    title: "Niños con Condición Crónica",
    subtitle: "Epilepsia · Diabetes infantil · Fibrosis quística · Autismo",
    description:
      "Registro de crisis, control de glucemia, historial de vacunas y controles pediátricos. QR de emergencia adaptado para niños con instrucciones específicas para cada condición.",
    features: [
      "Registro de crisis (epilepsia) con cronómetro integrado",
      "Curva de crecimiento y desarrollo",
      "Control de glucemia con gráficos de tendencia",
      "QR pediátrico de emergencia con foto reciente",
    ],
    color: "border-yellow-700 bg-yellow-900/20",
    iconBg: "bg-yellow-900/40",
    textColor: "text-yellow-300",
    btnColor: "bg-yellow-600 hover:bg-yellow-500",
    href: "#",
    available: false,
    tag: "Próximamente",
  },
  {
    key: "palliative",
    icon: "🌿",
    title: "Cuidados Paliativos / Oncología",
    subtitle: "Manejo del dolor · Síntomas · Calidad de vida",
    description:
      "Versión especializada del Diario de Dolor para pacientes oncológicos, registro de síntomas de quimioterapia, coordinación con equipo paliativo y planificación anticipada.",
    features: [
      "Escala de dolor ESAS (Edmonton Symptom Assessment)",
      "Registro de síntomas de quimioterapia / radioterapia",
      "Directivas anticipadas — documento seguro en blockchain",
      "Coordinación entre equipo paliativo y familia",
    ],
    color: "border-green-700 bg-green-900/20",
    iconBg: "bg-green-900/40",
    textColor: "text-green-300",
    btnColor: "bg-green-600 hover:bg-green-500",
    href: "#",
    available: false,
    tag: "Próximamente",
  },
  {
    key: "disability",
    icon: "♿",
    title: "Discapacidad Severa / Dependencia Total",
    subtitle: "ALS · Lesión medular · Parálisis cerebral · Dependencia total",
    description:
      "Gestión completa del cuidado para personas con dependencia total: cambios de posición, alimentación enteral, rutinas de cuidado, y comunicación con el equipo de enfermería.",
    features: [
      "Registro de cambios de posición (prevención úlceras)",
      "Control de alimentación enteral / PEG",
      "Rutina diaria de cuidado con validación horaria",
      "Comunicación aumentativa — tablero de símbolos",
    ],
    color: "border-blue-700 bg-blue-900/20",
    iconBg: "bg-blue-900/40",
    textColor: "text-blue-300",
    btnColor: "bg-blue-600 hover:bg-blue-500",
    href: "#",
    available: false,
    tag: "En diseño",
  },
  {
    key: "postsurgical",
    icon: "🏥",
    title: "Post-Quirúrgico y Recuperación",
    subtitle: "Alta hospitalaria · Heridas · Medicamentos transitorios",
    description:
      "Seguimiento estructurado para las primeras semanas tras el alta hospitalaria: registro de signos de alarma, control de heridas, medicamentos transitorios y citas de control.",
    features: [
      "Checklist de signos de alarma post-cirugía",
      "Seguimiento de herida quirúrgica (fotos con timestamp)",
      "Medicamentos temporales con fechas de fin",
      "Recordatorio de citas de control",
    ],
    color: "border-cyan-700 bg-cyan-900/20",
    iconBg: "bg-cyan-900/40",
    textColor: "text-cyan-300",
    btnColor: "bg-cyan-600 hover:bg-cyan-500",
    href: "#",
    available: false,
    tag: "En diseño",
  },
  {
    key: "dental",
    icon: "🦷",
    title: "Salud Dental",
    subtitle: "Procedimientos · Radiografías · Ortodoncia · Cambio de dentista",
    description:
      "Tu historial dental completo en un QR. Procedimientos, radiografías y ortodoncia guardados en blockchain. Cuando cambias de dentista, él lo ve todo sin que repitas nada.",
    features: [
      "Historial de procedimientos con dentista y fecha",
      "Radiografías guardadas — no las repites al cambiar de dentista",
      "Seguimiento de ortodoncia con progreso mensual",
      "QR para nuevo dentista — sin llenar formularios de cero",
    ],
    color: "border-teal-700 bg-teal-900/20",
    iconBg: "bg-teal-900/40",
    textColor: "text-teal-300",
    btnColor: "bg-teal-600 hover:bg-teal-500",
    href: "/patient/dental",
    available: true,
  },
  {
    key: "optical",
    icon: "👓",
    title: "Oftalmología / Salud Visual",
    subtitle: "Recetas ópticas · Lentes · Control de graduación",
    description:
      "Tu receta óptica siempre disponible en el celular. El oftalmólogo la firma digitalmente y queda en blockchain — la muestras en cualquier óptica con un QR, sin papel ni foto borrosa.",
    features: [
      "Receta óptica digital: esfera, cilindro, eje, adición, DP",
      "QR para mostrar en cualquier óptica de Chile",
      "Alerta cuando tu receta está por vencer",
      "Historial de graduaciones anteriores",
    ],
    color: "border-sky-700 bg-sky-900/20",
    iconBg: "bg-sky-900/40",
    textColor: "text-sky-300",
    btnColor: "bg-sky-600 hover:bg-sky-500",
    href: "/patient/optical",
    available: true,
  },
  {
    key: "mental",
    icon: "🧩",
    title: "Salud Mental / Trastornos del Ánimo",
    subtitle: "Depresión · Bipolaridad · Esquizofrenia · Trastornos de conducta",
    description:
      "Seguimiento de estado anímico, adherencia a medicamentos psiquiátricos, registro de episodios y comunicación con psiquiatra tratante.",
    features: [
      "Escala PHQ-9 / GAD-7 semanal",
      "Registro de episodios: maníacos, depresivos, psicóticos",
      "Adherencia a medicamentos psiquiátricos",
      "Alertas de riesgo para el equipo tratante",
    ],
    color: "border-pink-700 bg-pink-900/20",
    iconBg: "bg-pink-900/40",
    textColor: "text-pink-300",
    btnColor: "bg-pink-600 hover:bg-pink-500",
    href: "#",
    available: false,
    tag: "En diseño",
  },
];

// ─── Feature comparison ───────────────────────────────────────────────────────

const SHARED_FEATURES = [
  { icon: "🔐", label: "Historial verificado en blockchain", desc: "Cada registro tiene timestamp inmutable" },
  { icon: "🆘", label: "QR de emergencia personalizado", desc: "Sin login, sin app — funciona en urgencias" },
  { icon: "💊", label: "Control de medicamentos", desc: "Horarios, alertas de omisión, interacciones" },
  { icon: "👥", label: "Equipo de cuidado compartido", desc: "Familia, médicos y cuidadores en un mismo sistema" },
  { icon: "📊", label: "Reportes para el médico", desc: "PDF exportable con historial completo" },
  { icon: "📱", label: "100% mobile-first", desc: "Diseñado para usar desde el celular en cualquier momento" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CaregiverTypesPage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-16">

        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="inline-block px-4 py-1.5 bg-purple-900/30 border border-purple-700 rounded-full text-purple-300 text-xs font-medium mb-2">
            Portal de Cuidadores — TrustLeaf
          </div>
          <h1 className="text-white font-black text-3xl md:text-4xl leading-tight">
            Cuidar es un acto de amor.
            <br />
            <span className="text-purple-400">TrustLeaf lo hace más llevadero.</span>
          </h1>
          <p className="text-[#94A3B8] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Un sistema diseñado para cuidadores de personas dependientes — ya sea tu padre con Alzheimer,
            tu hijo con epilepsia, o tu pareja en recuperación post-ACV. Cada tipo de cuidado tiene
            sus propias herramientas.
          </p>
        </div>

        {/* Shared features */}
        <div>
          <h2 className="text-white font-bold text-xl text-center mb-8">
            Lo que tienen en común todos los perfiles
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {SHARED_FEATURES.map(f => (
              <div key={f.label} className="bg-[#1E293B] border border-[#334155] rounded-2xl p-4">
                <p className="text-2xl mb-2">{f.icon}</p>
                <p className="text-white font-semibold text-sm">{f.label}</p>
                <p className="text-[#64748B] text-xs mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Care profiles — available now */}
        <div>
          <h2 className="text-white font-bold text-xl text-center mb-2">
            Disponibles ahora
          </h2>
          <p className="text-[#64748B] text-sm text-center mb-8">Accede al demo completo de cada uno</p>
          <div className="grid md:grid-cols-3 gap-5">
            {CARE_PROFILES.filter(p => p.available).map(profile => (
              <div
                key={profile.key}
                className={`relative rounded-2xl border p-6 space-y-4 ${profile.color}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl ${profile.iconBg} flex items-center justify-center text-2xl shrink-0`}>
                    {profile.icon}
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base">{profile.title}</h3>
                    <p className={`text-xs ${profile.textColor}`}>{profile.subtitle}</p>
                  </div>
                </div>

                <p className="text-[#94A3B8] text-sm leading-relaxed">{profile.description}</p>

                <ul className="space-y-1.5">
                  {profile.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[#CBD5E1]">
                      <span className={`${profile.textColor} mt-0.5`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={profile.href}
                  className={`inline-block w-full text-center py-2.5 text-sm font-semibold text-white rounded-xl transition-colors ${profile.btnColor}`}
                >
                  Ver demo →
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Coming soon — compact grid */}
        <div>
          <h2 className="text-white font-bold text-xl text-center mb-2">En desarrollo</h2>
          <p className="text-[#64748B] text-sm text-center mb-6">Próximas especialidades</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CARE_PROFILES.filter(p => !p.available).map(profile => (
              <div
                key={profile.key}
                className="bg-[#1E293B] border border-[#334155] rounded-2xl p-4 opacity-70"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{profile.icon}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 bg-white/10 text-white/50 rounded-full`}>
                    {profile.tag ?? "Próximamente"}
                  </span>
                </div>
                <p className="text-white font-semibold text-sm leading-tight">{profile.title}</p>
                <p className="text-[#64748B] text-xs mt-1 leading-tight">{profile.subtitle}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Caregiver burnout note */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-3xl p-8 text-center">
          <p className="text-4xl mb-4">💚</p>
          <h3 className="text-white font-bold text-xl mb-3">
            También pensamos en el cuidador
          </h3>
          <p className="text-[#94A3B8] text-sm md:text-base leading-relaxed max-w-xl mx-auto mb-6">
            El agotamiento del cuidador es real. TrustLeaf no solo organiza la información del paciente —
            también da al cuidador la tranquilidad de saber que hay un registro confiable, que el médico
            tiene acceso a la información real, y que en una emergencia, el QR habla por él.
          </p>
          <p className="text-[#64748B] text-xs">
            El 60% de los cuidadores familiares desarrolla síntomas de burnout en el primer año.
            <br />
            Un sistema organizado reduce el tiempo de gestión hasta un 40%.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4">
          <Link
            href="/caregiver/onboarding"
            className="inline-block px-8 py-4 bg-[#10B981] hover:bg-[#059669] text-white font-bold text-base rounded-2xl transition-colors"
          >
            Configurar mi perfil de cuidador →
          </Link>
          <Link
            href="/caregiver"
            className="inline-block px-6 py-3 border border-purple-700 text-purple-300 hover:text-white text-sm font-medium rounded-2xl transition-colors"
          >
            Ver demo de Alzheimer →
          </Link>
          <p className="text-[#64748B] text-xs">
            Onboarding disponible · Demo Alzheimer completa · Resto en desarrollo
          </p>
        </div>

      </main>
    </div>
  );
}
