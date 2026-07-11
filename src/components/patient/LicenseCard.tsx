"use client";

import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import {
  CalendarIcon,
  ClipboardCheckIcon,
  ClockIcon,
  InfoIcon,
  LockIcon,
} from "@/components/icons/HealthIcons";
import {
  LICENSE_STATUS_CONFIG,
  MOCK_LICENSES,
  type MockLicense,
} from "@/types/health";

// ---------------------------------------------------------------------------
// LicenseCard
// ---------------------------------------------------------------------------
export function LicenseCard({ license }: { license: MockLicense }) {
  const cfg =
    LICENSE_STATUS_CONFIG[license.status] ??
    LICENSE_STATUS_CONFIG["Vencida"];
  const shortHash = `${license.hash.slice(0, 8)}...${license.hash.slice(-4)}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      {/* ── Status bar ── */}
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-2.5",
          cfg.bg,
          cfg.border,
        )}
      >
        <StatusBadge
          status={license.status}
          configMap={LICENSE_STATUS_CONFIG}
          fallback="Vencida"
        />
        <span className="ml-auto text-[10px] font-medium text-muted">
          {license.days} días
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* ── Type + doctor ── */}
        <div>
          <h3 className="text-base font-semibold text-ink">{license.type}</h3>
          <p className="mt-0.5 text-sm text-muted">{license.doctor}</p>
        </div>

        {/* ── Duration pill ── */}
        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
          <ClockIcon className="h-4 w-4 shrink-0 text-muted" />
          <p className="text-sm">
            <span className="font-semibold text-ink">{license.days} días</span>
            <span className="text-muted"> de reposo médico</span>
          </p>
        </div>

        {/* ── Date range ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Inicio
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted" />
              <span className="text-sm font-semibold text-ink">
                {license.start}
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Fin
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted" />
              <span className="text-sm font-semibold text-ink">
                {license.end}
              </span>
            </div>
          </div>
        </div>

        {/* ── On-chain hash ── */}
        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2">
          <LockIcon className="h-3.5 w-3.5 text-muted/60" />
          <span className="font-mono text-[10px] text-muted/70">
            {shortHash}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LicenciasTab
// ---------------------------------------------------------------------------
export function LicenciasTab() {
  const licenses = MOCK_LICENSES;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200/60 bg-violet-50/40 px-4 py-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
        <p className="text-xs leading-relaxed text-violet-800">
          <span className="font-semibold">Licencias médicas on-chain.</span>{" "}
          Cada licencia emitida por tu médico queda registrada en Stellar
          Soroban — verificable por empleadores e instituciones de salud.
          Datos de demostración.
        </p>
      </div>

      {licenses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
            <ClipboardCheckIcon className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium text-ink">
            Sin licencias registradas
          </p>
          <p className="mt-1 text-xs text-muted">
            Tus licencias médicas aparecerán aquí cuando un médico las emita
            on-chain.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {licenses.map((lic) => (
            <LicenseCard key={lic.id} license={lic} />
          ))}
        </div>
      )}
    </div>
  );
}
