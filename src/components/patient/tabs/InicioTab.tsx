"use client";

import { truncateHash } from "@/lib/stellar/config";
import type { PasskeySession } from "@/lib/passkey";
import { usePrivyEmail } from "@/hooks/usePrivyEmail";
import {
  ChevronRightIcon,
  PillIcon,
  FichaIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  CalendarIcon,
} from "@/components/icons/PatientIcons";
import type { AuthorizedDoctor } from "@/components/patient/types";

// ---------------------------------------------------------------------------
// NEW: Inicio Tab — home screen for the patient
// ---------------------------------------------------------------------------
export function InicioTab({
  session,
  activeRxCount,
  authorizedDoctors,
  onGoToRecetas,
  onGoToFicha,
  onGoToConsultas,
}: {
  session: PasskeySession;
  activeRxCount: number;
  authorizedDoctors: AuthorizedDoctor[];
  onGoToRecetas: () => void;
  onGoToFicha: () => void;
  onGoToConsultas: () => void;
}) {
  const privyEmail = usePrivyEmail();
  const displayName = privyEmail ?? "Mi portal";
  const avatarLetter = privyEmail ? privyEmail[0].toUpperCase() : "P";

  return (
    <div className="space-y-5">
      {/* ── Patient hero card ── */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-clinical to-clinical/80 p-6 text-white shadow-lg shadow-clinical/20">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30 text-2xl font-bold">
            {avatarLetter}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/70">Portal del paciente</p>
            <h2 className="text-xl font-semibold truncate">
              {displayName}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-white/60">
              {truncateHash(session.address, 6, 4)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Recetas activas
          </p>
          <p className="mt-1 text-3xl font-bold text-ink">{activeRxCount}</p>
          <p className="mt-0.5 text-xs text-muted">on-chain</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Médicos con acceso
          </p>
          <p className="mt-1 text-3xl font-bold text-ink">
            {authorizedDoctors.length}
          </p>
          <p className="mt-0.5 text-xs text-muted">autorizados</p>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Acceso rápido
        </h2>

        {/* Primary CTA — Ver recetas */}
        <button
          onClick={onGoToRecetas}
          className="flex w-full items-center gap-4 rounded-2xl border border-clinical/20 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.98] hover:border-clinical/40 hover:shadow-md"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
            <PillIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Ver mis recetas</p>
            <p className="text-sm text-muted">
              {activeRxCount > 0
                ? `${activeRxCount} receta${activeRxCount !== 1 ? "s" : ""} activa${activeRxCount !== 1 ? "s" : ""}`
                : "Sin recetas activas"}
            </p>
          </div>
          {activeRxCount > 0 && (
            <span className="shrink-0 rounded-full bg-clinical px-2.5 py-1 text-xs font-bold text-white">
              {activeRxCount}
            </span>
          )}
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>

        {/* Secondary CTA — Mi ficha */}
        <button
          onClick={onGoToFicha}
          className="flex w-full items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.98] hover:border-slate-300 hover:shadow-md"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-ink">
            <FichaIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Mi ficha médica</p>
            <p className="text-sm text-muted">Historial, alergias, condiciones</p>
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>

        {/* Consultas CTA */}
        <button
          onClick={onGoToConsultas}
          className="flex w-full items-center gap-4 rounded-2xl border border-emerald-100 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.98] hover:border-emerald-200 hover:shadow-md"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <CalendarIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Mis consultas</p>
            <p className="text-sm text-muted">Citas agendadas y próximas visitas</p>
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>
      </div>

      {/* ── Active doctors ── */}
      {authorizedDoctors.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Médicos con acceso activo
          </h2>
          <div className="space-y-2">
            {authorizedDoctors.map((doc) => (
              <div
                key={doc.wallet}
                className="flex items-center gap-3 rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/70"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
                  <StethoscopeIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{doc.name}</p>
                  <p className="text-xs text-muted">{doc.specialty}</p>
                </div>
                {doc.verified && (
                  <ShieldCheckIcon className="h-4 w-4 shrink-0 text-mint" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted/70">
        © 2026 Browns Studio · TrustLeaf · Stellar Testnet
      </p>
    </div>
  );
}
