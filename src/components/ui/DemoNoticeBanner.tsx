"use client";
/**
 * DemoNoticeBanner — Banner de Transparencia para Superficies de Demostración.
 * ---------------------------------------------------------------------------
 * Aplica el principio de Honestidad Técnica de TrustLeaf:
 * Distingue explícitamente las superficies maquetadas/sandbox de los flujos
 * que operan 100% on-chain en Testnet (Recetas, Licencias, Ficha y Accesos).
 */
import Link from "next/link";

interface Props {
  title: string;
  subtitle?: string;
  realFeatureHint?: string;
}

export function DemoNoticeBanner({
  title,
  subtitle,
  realFeatureHint = "Las Recetas, Licencias, Ficha y Accesos operan con anclaje ⚡ On-Chain real.",
}: Props) {
  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-orange-50/40 to-yellow-50/60 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20">
            <span className="text-lg">📋</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wide ring-1 ring-inset ring-amber-500/30">
                Demostración UX
              </span>
              <h3 className="text-sm font-bold text-amber-950">{title}</h3>
            </div>
            <p className="mt-1 text-xs text-amber-900/90 leading-relaxed">
              {subtitle || "Esta vista corresponde a una maqueta interactiva de demostración (sandbox)."}
            </p>
            <p className="mt-1 text-[11px] text-amber-800/80 font-medium">
              💡 {realFeatureHint}
            </p>
          </div>
        </div>

        <Link
          href="/patient?tab=ficha"
          className="shrink-0 rounded-2xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition-colors text-center"
        >
          Ver Ficha On-Chain Real →
        </Link>
      </div>
    </div>
  );
}
