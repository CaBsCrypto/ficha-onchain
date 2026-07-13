"use client";
// Diario de Síntomas Cognitivos — para cuidadores de pacientes con Alzheimer / demencia
// Registra episodios conductuales, cognitivos y funcionales (NO dolor — eso es el diario del paciente)

import { useState } from "react";
import Link from "next/link";
import Navbar from "../../../components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

type SymptomType =
  | "confusion"
  | "agitation"
  | "sleep"
  | "fall_risk"
  | "memory"
  | "appetite"
  | "hallucination"
  | "wandering";

type SeverityLevel = "mild" | "moderate" | "severe";

interface Episode {
  id: string;
  date: string;
  time: string;
  type: SymptomType;
  severity: SeverityLevel;
  duration: string;
  note: string;
  trigger?: string;
  resolution?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SYMPTOM_TYPES: { key: SymptomType; label: string; icon: string; description: string }[] = [
  { key: "confusion", label: "Confusión / Desorientación", icon: "🌀", description: "No sabe dónde está, qué día es, o quiénes son las personas" },
  { key: "agitation", label: "Agitación / Conducta", icon: "⚡", description: "Inquietud, enojo, llanto, resistencia a cuidados" },
  { key: "sleep", label: "Sueño alterado", icon: "🌙", description: "Despertares, inversión día/noche, sueño excesivo" },
  { key: "fall_risk", label: "Caída / Riesgo de caída", icon: "⚠️", description: "Tropiezos, mareos, pérdida de equilibrio" },
  { key: "memory", label: "Pérdida de memoria", icon: "🧩", description: "No recuerda personas, eventos recientes, cómo usar objetos" },
  { key: "appetite", label: "Alimentación", icon: "🍽️", description: "Rechaza comida, olvida que comió, dificultad para deglutir" },
  { key: "hallucination", label: "Alucinación / Ilusión", icon: "👁️", description: "Ve o escucha cosas que no existen, desconfianza extrema" },
  { key: "wandering", label: "Deambulación / Fuga", icon: "🚶", description: "Sale solo, intenta irse, no encuentra el baño" },
];

const SEVERITY_OPTIONS: { value: SeverityLevel; label: string; color: string }[] = [
  { value: "mild", label: "Leve", color: "text-yellow-400" },
  { value: "moderate", label: "Moderada", color: "text-orange-400" },
  { value: "severe", label: "Severa", color: "text-red-400" },
];

const DURATION_OPTIONS = [
  "< 5 minutos",
  "5–15 minutos",
  "15–30 minutos",
  "30–60 minutos",
  "Más de 1 hora",
  "Duró todo el día",
];

// ─── Demo history ─────────────────────────────────────────────────────────────

const DEMO_EPISODES: Episode[] = [
  {
    id: "1",
    date: "2026-07-12",
    time: "09:30",
    type: "confusion",
    severity: "moderate",
    duration: "5–15 minutos",
    note: "No reconoció a su hija Ana por aproximadamente 20 minutos. Al poner música que él conoce se calmó.",
    trigger: "Despertó desorientado de la siesta",
    resolution: "Música familiar + contacto físico suave",
  },
  {
    id: "2",
    date: "2026-07-11",
    time: "14:00",
    type: "agitation",
    severity: "mild",
    duration: "15–30 minutos",
    note: "Inquieto después del almuerzo, quería salir a caminar pero estaba lloviendo. Se calmó con un paseo corto en el pasillo.",
    trigger: "Encerrado en casa por lluvia",
    resolution: "Paseo corto en pasillo",
  },
  {
    id: "3",
    date: "2026-07-11",
    time: "22:00",
    type: "sleep",
    severity: "severe",
    duration: "Duró todo el día",
    note: "Despertó 4 veces en la noche. Cada vez muy confundido, creyendo que era de día. A las 3am insistía en desayunar.",
    trigger: "Sin causa clara",
    resolution: "Lorazepam 0.5mg a las 3:30am según pauta",
  },
  {
    id: "4",
    date: "2026-07-10",
    time: "11:00",
    type: "fall_risk",
    severity: "mild",
    duration: "< 5 minutos",
    note: "Tropezó con el umbral del baño. Sin caída. Se apoyó en la muralla. Pendiente instalar barras de apoyo.",
    trigger: "Piso húmedo + umbral alto",
    resolution: "Sin consecuencias. Reportar al médico.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CaregiverDiaryPage() {
  const [episodes] = useState<Episode[]>(DEMO_EPISODES);
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState<SymptomType | null>(null);
  const [severity, setSeverity] = useState<SeverityLevel>("moderate");
  const [duration, setDuration] = useState(DURATION_OPTIONS[1]);
  const [note, setNote] = useState("");
  const [trigger, setTrigger] = useState("");
  const [resolution, setResolution] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [currentTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType) return;
    setSubmitted(true);
    setTimeout(() => {
      setShowForm(false);
      setSubmitted(false);
      setSelectedType(null);
      setNote("");
      setTrigger("");
      setResolution("");
    }, 2000);
  }

  const getTypeConfig = (key: SymptomType) =>
    SYMPTOM_TYPES.find(t => t.key === key)!;

  const getSeverityColor = (s: SeverityLevel) =>
    SEVERITY_OPTIONS.find(o => o.value === s)?.color ?? "text-white";

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
            <h1 className="text-white font-bold text-lg">Diario de Episodios</h1>
            <p className="text-[#64748B] text-xs">Roberto Pérez Salas · Alzheimer etapa moderada</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            + Registrar
          </button>
        </div>

        {/* Register form */}
        {showForm && (
          <div className="bg-[#1E293B] border border-purple-700 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Registrar episodio — {currentTime}</h3>

            {submitted ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-[#10B981] font-semibold text-sm">Episodio registrado y anclado en blockchain</p>
                <p className="text-[#64748B] text-xs mt-1">Tu neuróloga verá este registro en la próxima consulta</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Type selector */}
                <div>
                  <label className="text-[#94A3B8] text-xs font-medium mb-2 block">¿Qué tipo de episodio?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SYMPTOM_TYPES.map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setSelectedType(t.key)}
                        className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-colors ${
                          selectedType === t.key
                            ? "border-purple-500 bg-purple-900/30"
                            : "border-[#334155] hover:border-[#475569]"
                        }`}
                      >
                        <span className="text-lg shrink-0">{t.icon}</span>
                        <span className="text-xs text-white font-medium leading-snug">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedType && (
                  <>
                    {/* Severity */}
                    <div>
                      <label className="text-[#94A3B8] text-xs font-medium mb-2 block">Intensidad del episodio</label>
                      <div className="flex gap-2">
                        {SEVERITY_OPTIONS.map(s => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => setSeverity(s.value)}
                            className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                              severity === s.value
                                ? `border-current bg-current/10 ${s.color}`
                                : "border-[#334155] text-[#64748B] hover:border-[#475569]"
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration */}
                    <div>
                      <label className="text-[#94A3B8] text-xs font-medium mb-2 block">¿Cuánto duró?</label>
                      <select
                        value={duration}
                        onChange={e => setDuration(e.target.value)}
                        className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2.5 text-white text-sm"
                      >
                        {DURATION_OPTIONS.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    {/* Note */}
                    <div>
                      <label className="text-[#94A3B8] text-xs font-medium mb-2 block">¿Qué pasó? (descripción libre)</label>
                      <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Describe lo que observaste..."
                        rows={3}
                        className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2.5 text-white text-sm placeholder-[#475569] resize-none"
                      />
                    </div>

                    {/* Trigger */}
                    <div>
                      <label className="text-[#94A3B8] text-xs font-medium mb-2 block">Posible causa o desencadenante (opcional)</label>
                      <input
                        type="text"
                        value={trigger}
                        onChange={e => setTrigger(e.target.value)}
                        placeholder="Ej: ruido fuerte, visita de alguien nuevo, cambio de rutina..."
                        className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2.5 text-white text-sm placeholder-[#475569]"
                      />
                    </div>

                    {/* Resolution */}
                    <div>
                      <label className="text-[#94A3B8] text-xs font-medium mb-2 block">¿Qué ayudó a calmarlo? (opcional)</label>
                      <input
                        type="text"
                        value={resolution}
                        onChange={e => setResolution(e.target.value)}
                        placeholder="Ej: música, contacto físico, medicamento..."
                        className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2.5 text-white text-sm placeholder-[#475569]"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="flex-1 py-2.5 border border-[#334155] rounded-xl text-[#64748B] text-sm hover:text-white transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        Registrar episodio
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        )}

        {/* Stats this week */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: "🌀", count: 2, label: "Confusión" },
            { icon: "⚡", count: 1, label: "Agitación" },
            { icon: "🌙", count: 1, label: "Sueño" },
            { icon: "⚠️", count: 1, label: "Caídas" },
          ].map(s => (
            <div key={s.label} className="bg-[#1E293B] border border-[#334155] rounded-2xl p-3 text-center">
              <p className="text-lg">{s.icon}</p>
              <p className="text-white font-bold text-base">{s.count}</p>
              <p className="text-[#64748B] text-[10px]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Episodes list */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#334155]">
            <h3 className="text-white font-semibold text-sm">Últimos episodios registrados</h3>
          </div>
          <div className="divide-y divide-[#334155]">
            {episodes.map(ep => {
              const cfg = getTypeConfig(ep.type);
              return (
                <div key={ep.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{cfg.icon}</span>
                      <span className="text-white text-sm font-medium">{cfg.label}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[#64748B] text-xs">{ep.date.slice(5)} · {ep.time}</p>
                      <p className={`text-xs font-semibold ${getSeverityColor(ep.severity)}`}>
                        {SEVERITY_OPTIONS.find(s => s.value === ep.severity)?.label}
                      </p>
                    </div>
                  </div>
                  <p className="text-[#94A3B8] text-xs leading-relaxed mb-2">{ep.note}</p>
                  <div className="flex flex-wrap gap-3">
                    {ep.trigger && (
                      <span className="text-[11px] text-[#64748B]">
                        <span className="text-[#475569]">Causa: </span>{ep.trigger}
                      </span>
                    )}
                    {ep.resolution && (
                      <span className="text-[11px] text-[#10B981]">
                        <span className="text-[#475569]">Ayudó: </span>{ep.resolution}
                      </span>
                    )}
                  </div>
                  <p className="text-[#334155] text-[10px] mt-2">{ep.duration}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Share with doctor */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
          <h3 className="text-white font-semibold text-sm mb-1">Enviar resumen a la neuróloga</h3>
          <p className="text-[#64748B] text-xs mb-4 leading-relaxed">
            Genera un resumen de los últimos 7 días con todos los episodios registrados.
            Tu médica ve exactamente lo que tú observaste — no lo que el paciente recuerda.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const summary =
                  `*Diario de episodios — Roberto Pérez Salas* 🧠\n` +
                  `*Semana: 6–12 julio 2026*\n\n` +
                  `🌀 Confusión: 2 episodios (mod + leve)\n` +
                  `⚡ Agitación: 1 episodio (leve)\n` +
                  `🌙 Sueño alterado: 1 episodio severo (4 despertares)\n` +
                  `⚠️ Riesgo de caída: 1 (tropiezo baño, sin caída)\n\n` +
                  `_Pauta actual: Donepezilo 10mg + Memantina 10mg_\n` +
                  `_Verificado en Stellar blockchain · TrustLeaf_`;
                const url = `https://wa.me/?text=${encodeURIComponent(summary)}`;
                window.open(url, "_blank");
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.122 1.533 5.856L0 24l6.335-1.652A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.821 9.821 0 01-5.007-1.37l-.36-.214-3.732.979.995-3.638-.235-.373A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/>
              </svg>
              WhatsApp
            </button>
            <button
              onClick={() => {
                const report =
                  `*Reporte semanal — Roberto Pérez Salas* 🧠\n` +
                  `*Para: Dra. María González (Neuróloga)*\n` +
                  `*Semana: 6–12 julio 2026*\n\n` +
                  `📊 *Resumen de episodios:*\n` +
                  `• Confusión: 2 ep. (mod 45min + leve 20min)\n` +
                  `• Agitación: 1 ep. leve (música → calmó)\n` +
                  `• Sueño: 1 noche severa (4 despertares)\n` +
                  `• Riesgo caída: 1 tropiezo baño (sin daño)\n\n` +
                  `💊 *Medicamentos esta semana:*\n` +
                  `• Donepezilo 10mg: 7/7 dosis dadas ✅\n` +
                  `• Memantina 10mg: 7/7 ✅\n` +
                  `• Lorazepam: 0 usos esta semana\n\n` +
                  `⚠️ *Nota del cuidador:* Los episodios de confusión ocurren mayoritariamente entre 21–23h. ¿Conviene revisar Memantina nocturna?\n\n` +
                  `_Generado automáticamente · Verificado en Stellar Blockchain · TrustLeaf_`;
                window.open(`https://wa.me/?text=${encodeURIComponent(report)}`, "_blank");
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-[#334155] text-[#94A3B8] hover:text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Reporte para médico
            </button>
          </div>
        </div>

        {/* Tip for caregiver */}
        <div className="rounded-2xl border border-blue-800 bg-blue-900/20 p-4">
          <p className="text-blue-300 font-semibold text-xs mb-1">💡 Consejo para tu próxima consulta</p>
          <p className="text-[#94A3B8] text-xs leading-relaxed">
            Muéstrale este diario a la Dra. González. Los episodios de confusión nocturna
            repetidos podrían indicar que conviene revisar la dosis de Memantina o agregar
            melatonina de liberación prolongada.
          </p>
        </div>

      </main>
    </div>
  );
}
