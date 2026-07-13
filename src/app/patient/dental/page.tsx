"use client";
// /patient/dental — Historial dental verificado en blockchain
// Pain point clave: cambias de dentista → tienes que repetir radiografías y explicar todo.
// TrustLeaf: un QR y el nuevo dentista tiene tu historial completo — procedimientos, Rx, alergias.

import { useState } from "react";
import Link from "next/link";
import Navbar from "../../../components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProcedureType =
  | "extraccion" | "endodoncia" | "implante" | "ortodoncia"
  | "corona" | "blanqueamiento" | "obturacion" | "periodoncia" | "consulta";

interface DentalProcedure {
  id: string;
  date: string;
  type: ProcedureType;
  tooth?: string; // e.g. "pieza 36", "cuadrante superior"
  description: string;
  dentist: string;
  clinic: string;
  status: "completed" | "in_progress" | "planned";
  notes?: string;
  hasXray: boolean;
  blockchainHash: string;
}

interface DentalRx {
  date: string;
  type: "panoramica" | "periapical" | "bite_wing" | "tac";
  description: string;
  dentist: string;
  hash: string;
}

interface OrthoPlan {
  startDate: string;
  estimatedEnd: string;
  type: string;
  monthsIn: number;
  totalMonths: number;
  lastVisit: string;
  nextVisit: string;
  phase: string;
  note: string;
}

// ─── Demo data ─────────────────────────────────────────────────────────────────

const PROCEDURE_META: Record<ProcedureType, { label: string; icon: string; color: string }> = {
  extraccion:     { label: "Extracción", icon: "🦷", color: "text-red-400" },
  endodoncia:     { label: "Endodoncia", icon: "🔬", color: "text-orange-400" },
  implante:       { label: "Implante", icon: "⚙️", color: "text-blue-400" },
  ortodoncia:     { label: "Ortodoncia", icon: "🔧", color: "text-purple-400" },
  corona:         { label: "Corona / Prótesis", icon: "👑", color: "text-yellow-400" },
  blanqueamiento: { label: "Blanqueamiento", icon: "✨", color: "text-cyan-400" },
  obturacion:     { label: "Obturación / Empaste", icon: "🛡️", color: "text-green-400" },
  periodoncia:    { label: "Periodoncia", icon: "🌿", color: "text-teal-400" },
  consulta:       { label: "Consulta / Control", icon: "📋", color: "text-gray-400" },
};

const DEMO_PROCEDURES: DentalProcedure[] = [
  {
    id: "D-2026-001",
    date: "2026-05-20",
    type: "ortodoncia",
    tooth: "Tratamiento completo",
    description: "Ajuste mensual — fase 3 de 4. Arco superior 0.019×0.025 NiTi. Inferior 0.018 NiTi.",
    dentist: "Dr. Sebastián Morales",
    clinic: "Ortodoncia Morales · Las Condes",
    status: "in_progress",
    notes: "Próxima cita: julio 2026. Usar elásticos clase II 12h/día.",
    hasXray: false,
    blockchainHash: "c7e3a1...82f0",
  },
  {
    id: "D-2025-008",
    date: "2025-11-03",
    type: "obturacion",
    tooth: "Pieza 26",
    description: "Obturación compuesta con resina directa. Caries clase II interproximal.",
    dentist: "Dra. Valentina Ruiz",
    clinic: "Clínica Dental Providencia",
    status: "completed",
    hasXray: true,
    blockchainHash: "4d8b2c...15ae",
  },
  {
    id: "D-2025-003",
    date: "2025-03-15",
    type: "periodoncia",
    tooth: "Cuadrante inferior",
    description: "Destartraje y pulido radicular. Gingivitis generalizada leve. Control en 6 meses.",
    dentist: "Dra. Valentina Ruiz",
    clinic: "Clínica Dental Providencia",
    status: "completed",
    hasXray: false,
    blockchainHash: "9f1d4e...33bc",
  },
  {
    id: "D-2024-011",
    date: "2024-08-22",
    type: "endodoncia",
    tooth: "Pieza 46",
    description: "Tratamiento de conductos en 2 sesiones. Pulpitis irreversible. Sellado con MTA.",
    dentist: "Dr. Alejandro Pinto",
    clinic: "Endodoncia Especializada Santiago",
    status: "completed",
    notes: "Requiere corona protésica — pendiente.",
    hasXray: true,
    blockchainHash: "2a6f9d...77e1",
  },
];

const DEMO_RX: DentalRx[] = [
  {
    date: "2025-11-03",
    type: "periapical",
    description: "Rx periapical pieza 26 — diagnóstico de caries interproximal confirmada",
    dentist: "Dra. Valentina Ruiz",
    hash: "rx_4d8b...c09a",
  },
  {
    date: "2024-08-20",
    type: "periapical",
    description: "Rx periapical pieza 46 — necrosis pulpar con lesión periapical incipiente",
    dentist: "Dr. Alejandro Pinto",
    hash: "rx_2a6f...e84f",
  },
  {
    date: "2024-03-10",
    type: "panoramica",
    description: "Radiografía panorámica — evaluación orthodóntica inicial completa",
    dentist: "Dr. Sebastián Morales",
    hash: "rx_b3c1...120d",
  },
];

const ORTHO_PLAN: OrthoPlan = {
  startDate: "2024-03-15",
  estimatedEnd: "2026-12-15",
  type: "Brackets metálicos fijos — arco recto MBT 0.022",
  monthsIn: 28,
  totalMonths: 33,
  lastVisit: "2026-05-20",
  nextVisit: "2026-07-22",
  phase: "Fase 3 — Finalización y detallado",
  note: "Retención: retenedor fijo inferior + placa removible superior tras el retiro.",
};

const RX_LABELS = {
  panoramica:  "Panorámica",
  periapical:  "Periapical",
  bite_wing:   "Bite Wing",
  tac:         "TAC 3D",
};

// ─── Components ────────────────────────────────────────────────────────────────

function QRMini({ id }: { id: string }) {
  const cells = Array.from({ length: 49 }, (_, i) => [
    [1,1,1,0,1,0,1],[1,0,1,0,0,1,1],[1,1,1,1,0,0,1],[0,0,0,1,1,0,0],[1,0,1,0,1,1,0],[0,1,0,1,0,0,1],[1,1,1,1,1,0,1]
  ].flat()[i]);
  return (
    <div className="p-2 bg-white rounded-lg inline-block">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 5px)", gap: 1 }}>
        {cells.map((c, i) => <div key={i} style={{ width: 5, height: 5, background: c ? "#0F172A" : "white" }} />)}
      </div>
      <p className="text-[#0F172A] text-[8px] text-center mt-0.5 font-mono">{id.slice(0, 8)}</p>
    </div>
  );
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const pct = Math.round((value / total) * 100);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#334155" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="#10B981" strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute text-center">
        <p className="text-white font-bold text-sm leading-none">{pct}%</p>
        <p className="text-[#64748B] text-[9px] leading-none mt-0.5">listo</p>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function DentalPage() {
  const [activeTab, setActiveTab] = useState<"historial" | "radiografias" | "ortodoncia">("historial");
  const [expandedId, setExpandedId] = useState<string | null>(DEMO_PROCEDURES[0].id);
  const [showQR, setShowQR] = useState(false);

  function shareWithDentist() {
    const text =
      `*Historial dental verificado · TrustLeaf*\n` +
      `Procedimientos: ${DEMO_PROCEDURES.length}\n` +
      `Radiografías: ${DEMO_RX.length} (almacenadas en blockchain)\n` +
      `Ortodoncia: en progreso — ${ORTHO_PLAN.monthsIn}/${ORTHO_PLAN.totalMonths} meses\n` +
      `Último tratamiento: ${DEMO_PROCEDURES[0].description} (${DEMO_PROCEDURES[0].date})\n\n` +
      `_Historial completo verificado en Stellar Blockchain · TrustLeaf_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 pt-8 pb-20">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/patient" className="p-2 rounded-xl border border-[#334155] text-[#64748B] hover:text-white transition-colors">
            ←
          </Link>
          <div>
            <h1 className="text-white font-bold text-xl">Mi historial dental</h1>
            <p className="text-[#64748B] text-xs">Procedimientos, radiografías y ortodoncia · Verificados en blockchain</p>
          </div>
          <button
            onClick={() => setShowQR(true)}
            className="ml-auto bg-[#10B981] text-[#0F172A] font-bold text-xs px-3 py-2 rounded-xl hover:bg-[#34D399] transition-colors"
          >
            QR dentista
          </button>
        </div>

        {/* QR Modal — para compartir con nuevo dentista */}
        {showQR && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4" onClick={() => setShowQR(false)}>
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-8 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
              <p className="text-white font-bold text-base mb-1">QR para tu dentista</p>
              <p className="text-[#64748B] text-xs mb-4">El nuevo dentista escanea y ve tu historial completo — procedimientos, Rx y alergias</p>
              <div className="flex justify-center mb-4">
                <QRMini id="dental-hist-2026" />
              </div>
              <p className="text-[#10B981] text-xs font-mono mb-1">dental.tl/c7e3a1...82f0</p>
              <p className="text-[#475569] text-xs mb-5">Stellar Blockchain · Sin login requerido</p>
              <div className="space-y-2">
                <button onClick={shareWithDentist} className="w-full py-3 bg-[#25D366] text-white font-bold text-sm rounded-xl hover:bg-[#20BF5A] transition-colors">
                  Enviar por WhatsApp
                </button>
                <button onClick={() => setShowQR(false)} className="w-full py-2 text-[#64748B] text-sm hover:text-white transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Procedimientos", value: DEMO_PROCEDURES.length, icon: "🦷" },
            { label: "Radiografías", value: DEMO_RX.length, icon: "🔬" },
            { label: "Ortodoncia", value: `${ORTHO_PLAN.monthsIn}m`, icon: "🔧" },
          ].map(s => (
            <div key={s.label} className="bg-[#1E293B] border border-[#334155] rounded-xl p-3 text-center">
              <p className="text-lg mb-0.5">{s.icon}</p>
              <p className="text-white font-bold text-lg leading-none">{s.value}</p>
              <p className="text-[#64748B] text-[10px] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Orthodontic alert if in progress */}
        <div className="bg-purple-900/20 border border-purple-700/40 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">🔧</span>
          <div className="flex-1">
            <p className="text-purple-300 font-semibold text-sm">Ortodoncia en progreso</p>
            <p className="text-purple-400/70 text-xs">Próxima cita: {ORTHO_PLAN.nextVisit} · {ORTHO_PLAN.phase}</p>
          </div>
          <button onClick={() => setActiveTab("ortodoncia")} className="text-xs text-purple-300 border border-purple-700/50 rounded-lg px-3 py-1.5 hover:bg-purple-900/30 transition-colors">
            Ver →
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#1E293B] p-1 rounded-xl mb-6">
          {(["historial", "radiografias", "ortodoncia"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${
                activeTab === tab ? "bg-[#0F172A] text-white" : "text-[#64748B] hover:text-white"
              }`}
            >
              {tab === "historial" ? "Historial" : tab === "radiografias" ? "Radiografías" : "Ortodoncia"}
            </button>
          ))}
        </div>

        {/* Tab: Historial */}
        {activeTab === "historial" && (
          <div className="space-y-3">
            {DEMO_PROCEDURES.map(proc => {
              const meta = PROCEDURE_META[proc.type];
              const isExpanded = expandedId === proc.id;
              return (
                <div
                  key={proc.id}
                  className={`bg-[#1E293B] border rounded-2xl overflow-hidden transition-all cursor-pointer ${
                    proc.status === "in_progress" ? "border-purple-700/50" : "border-[#334155]"
                  }`}
                  onClick={() => setExpandedId(isExpanded ? null : proc.id)}
                >
                  <div className="flex items-center gap-3 px-5 py-4">
                    <span className="text-2xl">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold text-sm">{meta.label}</p>
                        {proc.tooth && <span className="text-[10px] text-[#64748B] bg-[#0F172A] px-2 py-0.5 rounded-full">{proc.tooth}</span>}
                        {proc.status === "in_progress" && (
                          <span className="text-[10px] bg-purple-900/40 text-purple-300 border border-purple-700/40 px-2 py-0.5 rounded-full font-semibold">En progreso</span>
                        )}
                        {proc.hasXray && <span className="text-[10px] text-blue-400">📷 Rx</span>}
                      </div>
                      <p className="text-[#64748B] text-xs mt-0.5">{proc.dentist} · {proc.date}</p>
                    </div>
                    <span className="text-[#64748B] text-sm shrink-0">{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {isExpanded && (
                    <>
                      <div className="border-t border-[#334155]/60 px-5 py-4">
                        <p className="text-[#94A3B8] text-sm leading-relaxed mb-3">{proc.description}</p>
                        {proc.notes && (
                          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-3">
                            <p className="text-yellow-300 text-xs leading-relaxed">{proc.notes}</p>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-[#334155]/60 px-5 py-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-[#64748B] text-[10px] uppercase tracking-wide mb-1">Dentista</p>
                          <p className="text-white font-medium">{proc.dentist}</p>
                          <p className="text-[#64748B]">{proc.clinic}</p>
                        </div>
                        <div>
                          <p className="text-[#64748B] text-[10px] uppercase tracking-wide mb-1">Verificación</p>
                          <p className="text-[#10B981] font-mono text-[10px]">{proc.blockchainHash}</p>
                          <p className="text-[#475569] text-[10px]">Stellar Network</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab: Radiografías */}
        {activeTab === "radiografias" && (
          <div className="space-y-3">
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-2xl p-4 mb-2">
              <p className="text-blue-300 font-semibold text-sm mb-1">Tus radiografías guardadas en blockchain</p>
              <p className="text-blue-400/70 text-xs leading-relaxed">
                Cuando cambias de dentista, muestra el QR — el nuevo dentista accede a todas tus Rx sin que tengas que repetir los exámenes.
              </p>
            </div>
            {DEMO_RX.map((rx, i) => (
              <div key={i} className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-900/40 border border-blue-700/30 flex items-center justify-center text-lg shrink-0">
                    🔬
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-semibold text-sm">{RX_LABELS[rx.type]}</p>
                      <span className="text-[10px] bg-[#0F172A] text-[#64748B] px-2 py-0.5 rounded-full">{rx.date}</span>
                    </div>
                    <p className="text-[#94A3B8] text-xs leading-relaxed mb-2">{rx.description}</p>
                    <p className="text-[#64748B] text-xs">{rx.dentist}</p>
                    <p className="text-[#10B981] font-mono text-[10px] mt-1">{rx.hash} · Stellar</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-[#1E293B]/50 border border-dashed border-[#334155] rounded-2xl p-5 text-center">
              <p className="text-[#64748B] text-xs">Las radiografías nuevas se agregan automáticamente cuando tu dentista usa TrustLeaf</p>
            </div>
          </div>
        )}

        {/* Tab: Ortodoncia */}
        {activeTab === "ortodoncia" && (
          <div className="space-y-4">
            {/* Progress card */}
            <div className="bg-[#1E293B] border border-purple-700/40 rounded-2xl p-5">
              <div className="flex items-center gap-4 mb-5">
                <ProgressRing value={ORTHO_PLAN.monthsIn} total={ORTHO_PLAN.totalMonths} />
                <div>
                  <p className="text-white font-bold text-base">{ORTHO_PLAN.phase}</p>
                  <p className="text-[#64748B] text-xs mt-0.5">{ORTHO_PLAN.monthsIn} de {ORTHO_PLAN.totalMonths} meses</p>
                  <p className="text-purple-300 text-xs mt-1">{ORTHO_PLAN.type}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { label: "Inicio", value: ORTHO_PLAN.startDate },
                  { label: "Estimado término", value: ORTHO_PLAN.estimatedEnd },
                  { label: "Última cita", value: ORTHO_PLAN.lastVisit },
                  { label: "Próxima cita", value: ORTHO_PLAN.nextVisit },
                ].map(d => (
                  <div key={d.label} className="bg-[#0F172A] rounded-xl p-3">
                    <p className="text-[#64748B] text-[10px] uppercase tracking-wide mb-0.5">{d.label}</p>
                    <p className="text-white font-semibold">{d.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Orthodontist info */}
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
              <p className="text-[#64748B] text-xs uppercase tracking-wide mb-3">Ortodoncista</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-900/40 border border-purple-700/40 flex items-center justify-center text-sm font-bold text-purple-300">
                  SM
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Dr. Sebastián Morales</p>
                  <p className="text-[#64748B] text-xs">Ortodoncia Morales · Las Condes</p>
                </div>
                <a href="tel:+56223456789" className="ml-auto bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981] text-xs rounded-lg px-3 py-2 hover:bg-[#10B981]/25 transition-colors">
                  Llamar
                </a>
              </div>
            </div>

            {/* Retention note */}
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5">
              <p className="text-[#64748B] text-xs uppercase tracking-wide mb-2">Plan de retención post-tratamiento</p>
              <p className="text-[#94A3B8] text-sm leading-relaxed">{ORTHO_PLAN.note}</p>
            </div>
          </div>
        )}

        {/* Footer — change dentist pitch */}
        <div className="mt-8 bg-[#1E293B]/50 border border-dashed border-[#334155] rounded-2xl p-6 text-center">
          <p className="text-3xl mb-3">🔄</p>
          <p className="text-white font-semibold text-sm mb-1">¿Cambiaste de dentista?</p>
          <p className="text-[#64748B] text-xs leading-relaxed mb-4">
            Muéstrale el QR de arriba. Ve tu historial completo — procedimientos, radiografías, alergias — sin repetir nada.
          </p>
          <button onClick={() => setShowQR(true)} className="inline-block text-sm font-bold text-[#10B981] hover:underline">
            Ver QR para nuevo dentista →
          </button>
        </div>

        {/* How it works */}
        <div className="mt-5 grid grid-cols-3 gap-2 md:gap-3">
          {[
            { icon: "🩺", title: "Dentista registra", desc: "Cada procedimiento firmado con Face ID" },
            { icon: "⛓️", title: "Queda en blockchain", desc: "Con fecha, pieza dental y Rx" },
            { icon: "🦷", title: "Tú controlas", desc: "QR para cualquier dentista nuevo" },
          ].map(s => (
            <div key={s.title} className="bg-[#1E293B] border border-[#334155] rounded-xl p-2 md:p-3 text-center">
              <p className="text-xl mb-1">{s.icon}</p>
              <p className="text-white text-[11px] font-semibold leading-tight mb-0.5">{s.title}</p>
              <p className="text-[#64748B] text-[9px] md:text-[10px]">{s.desc}</p>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
