import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  ClockIcon,
  LockIcon,
} from "@/components/icons/PatientIcons";
import { addDaysPatient, fmtDatePatient } from "./dates";
import type { PatientDBLicense } from "./types";

export function PatientLicCard({ lic }: { lic: PatientDBLicense }) {
  const fechaFin   = addDaysPatient(lic.fecha_inicio, lic.dias);
  const isActive   = lic.status === 'signed' && new Date(fechaFin + 'T23:59:59') >= new Date();
  const isOnChain  = lic.mode === 'onchain';
  const displayHash = lic.tx_hash ?? lic.doc_hash;
  const shortHash  = displayHash ? `${displayHash.slice(0, 8)}...${displayHash.slice(-6)}` : null;

  const TIPO_DOT: Record<string, string> = {
    Enfermedad: 'bg-sky-400',
    Accidente:  'bg-orange-400',
    Maternidad: 'bg-pink-400',
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      {/* Status bar */}
      <div className={cn(
        "flex items-center gap-2 border-b px-4 py-2.5",
        isActive ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50",
      )}>
        <span className={cn("h-2 w-2 rounded-full", isActive ? "bg-emerald-500" : "bg-slate-400")} />
        <span className={cn("text-xs font-semibold", isActive ? "text-emerald-700" : "text-slate-500")}>
          {isActive ? "Vigente" : lic.status === 'draft' ? "Borrador" : "Vencida"}
        </span>
        {lic.status === 'signed' && (
          <span className={cn(
            "ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            isOnChain ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700",
          )}>
            {isOnChain ? "⚡ On-chain" : "📋 Demo"}
          </span>
        )}
        <span className="ml-auto text-[10px] font-medium text-muted">{lic.dias} días</span>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", TIPO_DOT[lic.tipo] ?? "bg-slate-400")} />
            <h3 className="text-base font-semibold text-ink">{lic.tipo}</h3>
          </div>
          <p className="mt-0.5 text-sm text-muted">{lic.doctor_email}</p>
          {lic.diagnostico && <p className="mt-0.5 text-xs text-slate-400">{lic.diagnostico} · CIE-10: {lic.cie10}</p>}
        </div>

        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
          <ClockIcon className="h-4 w-4 shrink-0 text-muted" />
          <p className="text-sm">
            <span className="font-semibold text-ink">{lic.dias} días</span>
            <span className="text-muted"> de reposo médico</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Inicio</p>
            <div className="mt-1 flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted" />
              <span className="text-sm font-semibold text-ink">{fmtDatePatient(lic.fecha_inicio)}</span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Fin</p>
            <div className="mt-1 flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted" />
              <span className="text-sm font-semibold text-ink">{fmtDatePatient(fechaFin)}</span>
            </div>
          </div>
        </div>

        {shortHash && (
          <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2">
            <LockIcon className="h-3.5 w-3.5 text-muted/60" />
            <span className="font-mono text-[10px] text-muted/70">{shortHash}</span>
            {isOnChain && lic.tx_hash && (
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${lic.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[10px] font-medium text-violet-600 hover:underline"
              >
                Ver →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
