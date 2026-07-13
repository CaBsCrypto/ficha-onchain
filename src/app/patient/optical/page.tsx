"use client";
// /patient/optical — Recetas ópticas verificadas en blockchain
// El paciente muestra el QR en cualquier óptica. Sin papel, sin foto borrosa.
// Datos: esfera, cilindro, eje, adición, distancia pupilar — firmados por el oftalmólogo.

import { useState } from "react";
import Link from "next/link";
import Navbar from "../../../components/Navbar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EyeValues {
  esfera: string;
  cilindro: string;
  eje: string;
  add?: string;
}

interface OpticalPrescription {
  id: string;
  date: string;
  expiresAt: string;
  daysLeft: number;
  type: "monofocal" | "progresivo" | "bifocal" | "contacto";
  doctor: string;
  doctorSpecialty: string;
  clinic: string;
  od: EyeValues; // Ojo derecho / Right eye
  os: EyeValues; // Ojo izquierdo / Left eye
  dp: string;    // Distancia pupilar
  notes: string;
  blockchainHash: string;
  status: "active" | "expiring" | "expired";
}

// ─── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_PRESCRIPTIONS: OpticalPrescription[] = [
  {
    id: "OPT-2026-001",
    date: "2026-03-15",
    expiresAt: "2027-03-15",
    daysLeft: 246,
    type: "progresivo",
    doctor: "Dra. Carmen Valdivia",
    doctorSpecialty: "Oftalmóloga · Cirugía refractiva",
    clinic: "Clínica Bupa Santiago",
    od: { esfera: "-2.50", cilindro: "-0.75", eje: "95°", add: "+1.75" },
    os: { esfera: "-2.25", cilindro: "-0.50", eje: "85°", add: "+1.75" },
    dp: "63 mm (OD 31.5 / OS 31.5)",
    notes: "Lente progresivo recomendado. Control en 12 meses o antes si hay cambios visuales.",
    blockchainHash: "a3f8c2...91e4",
    status: "active",
  },
  {
    id: "OPT-2024-003",
    date: "2024-02-10",
    expiresAt: "2026-02-10",
    daysLeft: -152,
    type: "monofocal",
    doctor: "Dr. Rodrigo Fuentealba",
    doctorSpecialty: "Oftalmólogo",
    clinic: "Centro Médico Providencia",
    od: { esfera: "-2.25", cilindro: "-0.50", eje: "90°" },
    os: { esfera: "-2.00", cilindro: "-0.25", eje: "80°" },
    dp: "62 mm",
    notes: "Uso permanente recomendado.",
    blockchainHash: "7b2d1f...44ac",
    status: "expired",
  },
];

const TYPE_LABELS: Record<OpticalPrescription["type"], string> = {
  monofocal: "Monofocal",
  progresivo: "Progresivo",
  bifocal: "Bifocal",
  contacto: "Lente de contacto",
};

const TYPE_ICONS: Record<OpticalPrescription["type"], string> = {
  monofocal: "👓",
  progresivo: "🔭",
  bifocal: "🕶️",
  contacto: "👁️",
};

// ─── QR placeholder ────────────────────────────────────────────────────────────

function QRCode({ id }: { id: string }) {
  const pattern = [
    [1,1,1,0,1,0,1,1,1],
    [1,0,1,0,0,1,1,0,1],
    [1,1,1,1,0,0,1,1,1],
    [0,0,0,1,1,0,0,1,0],
    [1,0,1,0,1,1,0,0,1],
    [0,1,0,1,0,0,1,0,1],
    [1,1,1,1,1,0,1,1,1],
    [1,0,0,0,1,0,0,0,1],
    [1,1,1,0,1,0,1,1,1],
  ];
  return (
    <div className="p-2 bg-white rounded-xl inline-block">
      <div style={{ display: "grid", gridTemplateColumns: `repeat(9, 6px)`, gap: 1 }}>
        {pattern.flat().map((cell, i) => (
          <div key={i} style={{ width: 6, height: 6, background: cell ? "#0F172A" : "white" }} />
        ))}
      </div>
      <p className="text-[#0F172A] text-[9px] text-center mt-1 font-mono">{id}</p>
    </div>
  );
}

// ─── Eye values table ──────────────────────────────────────────────────────────

function EyeTable({ od, os, add, dp }: { od: EyeValues; os: EyeValues; add?: string; dp: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#334155]">
            <th className="text-left py-2 px-3 text-[#64748B] font-medium text-xs w-24">Ojo</th>
            <th className="text-center py-2 px-2 text-[#64748B] font-medium text-xs">Esfera</th>
            <th className="text-center py-2 px-2 text-[#64748B] font-medium text-xs">Cilindro</th>
            <th className="text-center py-2 px-2 text-[#64748B] font-medium text-xs">Eje</th>
            {(od.add || os.add) && <th className="text-center py-2 px-2 text-[#64748B] font-medium text-xs">Adición</th>}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#1E293B]">
            <td className="py-2.5 px-3">
              <span className="text-[#10B981] font-bold text-xs">OD</span>
              <span className="text-[#64748B] text-xs ml-1">derecho</span>
            </td>
            <td className="text-center py-2.5 px-2 text-white font-mono text-sm font-semibold">{od.esfera}</td>
            <td className="text-center py-2.5 px-2 text-white font-mono text-sm font-semibold">{od.cilindro}</td>
            <td className="text-center py-2.5 px-2 text-white font-mono text-sm font-semibold">{od.eje}</td>
            {(od.add || os.add) && <td className="text-center py-2.5 px-2 text-blue-300 font-mono text-sm font-semibold">{od.add ?? "—"}</td>}
          </tr>
          <tr>
            <td className="py-2.5 px-3">
              <span className="text-purple-400 font-bold text-xs">OS</span>
              <span className="text-[#64748B] text-xs ml-1">izquierdo</span>
            </td>
            <td className="text-center py-2.5 px-2 text-white font-mono text-sm font-semibold">{os.esfera}</td>
            <td className="text-center py-2.5 px-2 text-white font-mono text-sm font-semibold">{os.cilindro}</td>
            <td className="text-center py-2.5 px-2 text-white font-mono text-sm font-semibold">{os.eje}</td>
            {(od.add || os.add) && <td className="text-center py-2.5 px-2 text-blue-300 font-mono text-sm font-semibold">{os.add ?? "—"}</td>}
          </tr>
        </tbody>
      </table>
      <div className="px-3 py-2.5 border-t border-[#1E293B] flex items-center gap-2">
        <span className="text-[#64748B] text-xs">Distancia pupilar (DP):</span>
        <span className="text-white font-mono text-sm font-semibold">{dp}</span>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OpticalPage() {
  const [selectedId, setSelectedId] = useState<string>(DEMO_PRESCRIPTIONS[0].id);
  const [showQR, setShowQR] = useState(false);

  const active = DEMO_PRESCRIPTIONS.find(p => p.id === selectedId)!;
  const hasActive = DEMO_PRESCRIPTIONS.some(p => p.status === "active");

  function shareWithOptician() {
    const text =
      `*Receta óptica verificada · TrustLeaf*\n` +
      `Paciente: [Tu nombre]\n` +
      `Tipo: ${TYPE_LABELS[active.type]}\n` +
      `OD: ${active.od.esfera} / ${active.od.cilindro} / ${active.od.eje}\n` +
      `OS: ${active.os.esfera} / ${active.os.cilindro} / ${active.os.eje}\n` +
      (active.od.add ? `Adición: ${active.od.add}\n` : "") +
      `DP: ${active.dp}\n` +
      `Emitida por: ${active.doctor}\n` +
      `Válida hasta: ${active.expiresAt}\n` +
      `_Verificado en Stellar Blockchain · ${active.blockchainHash}_`;
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
            <h1 className="text-white font-bold text-xl">Mis recetas ópticas</h1>
            <p className="text-[#64748B] text-xs">Verificadas en blockchain · Muestra el QR en tu óptica</p>
          </div>
        </div>

        {/* Status banner */}
        {hasActive && (
          <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <span className="text-2xl">👓</span>
            <div>
              <p className="text-[#10B981] font-semibold text-sm">Tienes una receta óptica vigente</p>
              <p className="text-[#10B981]/70 text-xs">Válida hasta {DEMO_PRESCRIPTIONS[0].expiresAt} · {DEMO_PRESCRIPTIONS[0].daysLeft} días restantes</p>
            </div>
            <button
              onClick={() => setShowQR(true)}
              className="ml-auto bg-[#10B981] text-[#0F172A] font-bold text-xs px-4 py-2 rounded-xl hover:bg-[#34D399] transition-colors"
            >
              Ver QR
            </button>
          </div>
        )}

        {/* QR Modal */}
        {showQR && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4" onClick={() => setShowQR(false)}>
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-8 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
              <p className="text-white font-bold text-base mb-1">QR para tu óptica</p>
              <p className="text-[#64748B] text-xs mb-6">Muestra esta pantalla — sin app, sin login</p>
              <div className="flex justify-center mb-4">
                <QRCode id={active.id} />
              </div>
              <p className="text-[#10B981] text-xs font-mono mb-1">{active.blockchainHash}</p>
              <p className="text-[#475569] text-xs mb-6">Verificado en Stellar Blockchain</p>
              <div className="space-y-2">
                <button
                  onClick={shareWithOptician}
                  className="w-full py-3 bg-[#25D366] text-white font-bold text-sm rounded-xl hover:bg-[#20BF5A] transition-colors"
                >
                  Enviar por WhatsApp
                </button>
                <button
                  onClick={() => setShowQR(false)}
                  className="w-full py-2 text-[#64748B] text-sm hover:text-white transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Prescriptions list */}
        <div className="space-y-4">
          {DEMO_PRESCRIPTIONS.map(rx => {
            const isSelected = rx.id === selectedId;
            const statusColor = rx.status === "active" ? "border-[#10B981]/40" : rx.status === "expiring" ? "border-yellow-500/40" : "border-[#334155]";
            return (
              <div
                key={rx.id}
                className={`bg-[#1E293B] border rounded-2xl overflow-hidden transition-all cursor-pointer ${isSelected ? statusColor : "border-[#334155] opacity-70"}`}
                onClick={() => setSelectedId(rx.id)}
              >
                {/* Card header */}
                <div className="flex items-center gap-3 px-5 py-4">
                  <span className="text-2xl">{TYPE_ICONS[rx.type]}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold text-sm">{TYPE_LABELS[rx.type]}</p>
                      {rx.status === "active" && (
                        <span className="text-[10px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 px-2 py-0.5 rounded-full font-semibold">Vigente</span>
                      )}
                      {rx.status === "expiring" && (
                        <span className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-semibold">Por vencer</span>
                      )}
                      {rx.status === "expired" && (
                        <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-semibold">Vencida</span>
                      )}
                    </div>
                    <p className="text-[#64748B] text-xs">{rx.doctor} · {rx.date}</p>
                  </div>
                  <span className="text-[#64748B] text-sm">{isSelected ? "▲" : "▼"}</span>
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <>
                    {/* Eye table */}
                    <div className="border-t border-[#334155]/60">
                      <EyeTable od={rx.od} os={rx.os} dp={rx.dp} />
                    </div>

                    {/* Doctor info */}
                    <div className="border-t border-[#334155]/60 px-5 py-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[#64748B] text-[10px] uppercase tracking-wide mb-1">Médico</p>
                        <p className="text-white text-sm font-medium">{rx.doctor}</p>
                        <p className="text-[#64748B] text-xs">{rx.doctorSpecialty}</p>
                      </div>
                      <div>
                        <p className="text-[#64748B] text-[10px] uppercase tracking-wide mb-1">Clínica</p>
                        <p className="text-white text-sm font-medium">{rx.clinic}</p>
                        <p className="text-[#64748B] text-xs">Válida hasta: {rx.expiresAt}</p>
                      </div>
                    </div>

                    {/* Notes */}
                    {rx.notes && (
                      <div className="border-t border-[#334155]/60 px-5 py-3">
                        <p className="text-[#64748B] text-[10px] uppercase tracking-wide mb-1">Indicaciones</p>
                        <p className="text-[#94A3B8] text-xs leading-relaxed">{rx.notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    {rx.status !== "expired" && (
                      <div className="border-t border-[#334155]/60 px-5 py-4 flex gap-3">
                        <button
                          onClick={() => setShowQR(true)}
                          className="flex-1 py-3 bg-[#10B981] hover:bg-[#34D399] text-[#0F172A] font-bold text-sm rounded-xl transition-colors"
                        >
                          Mostrar QR en óptica
                        </button>
                        <button
                          onClick={shareWithOptician}
                          className="px-4 py-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] font-bold text-sm rounded-xl transition-colors"
                        >
                          WhatsApp
                        </button>
                      </div>
                    )}

                    {/* Blockchain badge */}
                    <div className="border-t border-[#334155]/60 px-5 py-3 flex items-center gap-2">
                      <span className="text-xs">⛓️</span>
                      <p className="text-[#475569] text-xs font-mono">{rx.blockchainHash} · Stellar Network</p>
                      <span className="ml-auto text-[10px] text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full">Verificado</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty state / future prescription */}
        <div className="mt-6 bg-[#1E293B]/50 border border-dashed border-[#334155] rounded-2xl p-6 text-center">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-white font-semibold text-sm mb-1">¿Tu oftalmólogo usa TrustLeaf?</p>
          <p className="text-[#64748B] text-xs leading-relaxed mb-4">
            Pídele que emita tu próxima receta óptica digital. Quedará guardada aquí automáticamente — sin papel, sin perderla.
          </p>
          <Link
            href="/for-doctors"
            className="inline-block text-xs text-[#10B981] hover:underline"
          >
            Comparte TrustLeaf con tu oftalmólogo →
          </Link>
        </div>

        {/* How it works mini */}
        <div className="mt-6 grid grid-cols-3 gap-2 md:gap-3">
          {[
            { icon: "🩺", title: "Oftalmólogo firma", desc: "Con Face ID · en segundos" },
            { icon: "⛓️", title: "Queda en blockchain", desc: "Inmutable · con fecha y doctor" },
            { icon: "👓", title: "Tú muestras el QR", desc: "En cualquier óptica · sin papel" },
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
