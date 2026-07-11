"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { truncateHash } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  CheckIcon,
  HeartPulseIcon,
  InfoIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  SyringeIcon,
} from "@/components/icons/HealthIcons";
import { MOCK_FICHA } from "@/types/health";

// ---------------------------------------------------------------------------
// SectionHeader — shared card section title bar
// ---------------------------------------------------------------------------
export function SectionHeader({
  icon,
  title,
  bg,
}: {
  icon: React.ReactNode;
  title: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200/70 px-6 py-4">
      <div className={cn("grid h-9 w-9 place-items-center rounded-xl", bg)}>
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FichaTab
// ---------------------------------------------------------------------------
export function FichaTab({
  wallet,
  mock,
}: {
  wallet: string;
  mock: boolean;
}) {
  const ficha = MOCK_FICHA;

  return (
    <div className="space-y-5">
      {/* Demo notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs leading-relaxed text-amber-800">
          Tu ficha médica vive on-chain en Soroban — solo los médicos con acceso
          que tú autoricen pueden verla completa.{" "}
          {mock
            ? "Datos de ejemplo en modo demo."
            : "Los datos de resumen se leen desde tu wallet."}
        </p>
      </div>

      {/* ── Identity card ── */}
      <Card className="p-0">
        <div className="flex items-center gap-4 border-b border-slate-200/70 px-6 py-5">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-clinical/10 text-clinical">
            <span className="text-2xl font-bold leading-none">
              {mock ? "P" : "?"}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              {mock ? "Paciente Demo" : "Tu perfil"}
            </h2>
            <p className="font-mono text-xs text-muted">
              {truncateHash(wallet, 6, 6)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Badge tone="mint">
                <ShieldCheckIcon className="h-3 w-3" /> Verificada on-chain
              </Badge>
              <Badge tone="muted">Testnet</Badge>
            </div>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-px bg-slate-100/80 sm:grid-cols-4">
          <div className="bg-white px-5 py-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">
              Grupo sanguíneo
            </p>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 ring-1 ring-inset ring-rose-200">
              <span className="text-base font-bold text-rose-600">
                {ficha.bloodType}
              </span>
            </div>
          </div>
          {[
            { label: "Talla", value: ficha.height },
            { label: "Peso", value: ficha.weight },
            { label: "IMC", value: ficha.bmi },
          ].map((kv) => (
            <div key={kv.label} className="bg-white px-5 py-4">
              <p className="text-[10px] uppercase tracking-wide text-muted">
                {kv.label}
              </p>
              <p className="mt-0.5 text-lg font-semibold text-ink">
                {kv.value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Alergias ── */}
      <Card className="p-0">
        <SectionHeader
          icon={<AlertTriangleIcon className="h-5 w-5 text-rose-500" />}
          title="Alergias y contraindicaciones"
          bg="bg-rose-50"
        />
        <div className="px-6 py-4">
          {ficha.allergies.length === 0 ? (
            <p className="text-sm text-muted">Sin alergias registradas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ficha.allergies.map((a) => (
                <span
                  key={a}
                  className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200"
                >
                  <AlertTriangleIcon className="h-3.5 w-3.5 text-rose-400" />
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── Condiciones crónicas ── */}
      <Card className="p-0">
        <SectionHeader
          icon={<HeartPulseIcon className="h-5 w-5 text-orange-500" />}
          title="Condiciones crónicas"
          bg="bg-orange-50"
        />
        <div className="px-6 py-4">
          {ficha.conditions.length === 0 ? (
            <p className="text-sm text-muted">
              Sin condiciones crónicas registradas.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ficha.conditions.map((c) => (
                <span
                  key={c.label}
                  className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 ring-1 ring-inset ring-orange-200"
                >
                  {c.label}
                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">
                    {c.controlled ? "✓ controlada" : "seguimiento"}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── Vacunas — timeline vertical ── */}
      <Card className="p-0">
        <SectionHeader
          icon={<SyringeIcon className="h-5 w-5 text-clinical" />}
          title="Vacunación"
          bg="bg-clinical-50"
        />
        <div className="px-6 py-4">
          <div className="space-y-0">
            {ficha.vaccinations.map((v, i) => (
              <div key={v.name} className="relative flex gap-3 pb-4 last:pb-0">
                {i < ficha.vaccinations.length - 1 && (
                  <div className="absolute bottom-0 left-[11px] top-6 w-0.5 bg-slate-100" />
                )}
                <div className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-white">
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{v.name}</p>
                  <p className="text-xs text-muted">{v.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Médico tratante ── */}
      <Card className="p-0">
        <SectionHeader
          icon={<StethoscopeIcon className="h-5 w-5 text-clinical" />}
          title="Médico de cabecera"
          bg="bg-clinical-50"
        />
        <div className="px-6 py-4">
          <p className="text-sm font-semibold text-ink">
            {ficha.primaryDoctor}
          </p>
          <p className="text-xs text-muted">{ficha.primaryDoctorSpecialty}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">
                Última visita
              </p>
              <p className="mt-0.5 font-medium text-ink">{ficha.lastVisit}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">
                Próxima cita
              </p>
              <p className="mt-0.5 font-medium text-clinical">
                {ficha.nextAppointment}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Banner privacidad on-chain ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
        <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-clinical" />
        <div>
          <p className="text-sm font-semibold text-ink">Privacidad by design</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Tus datos personales no están en la blockchain. Solo tu wallet
            actúa como identificador — el resto vive cifrado, bajo tu control,
            y solo los médicos que tú autoricen pueden leerlo.
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-muted/70">
        © 2026 Browns Studio · TrustLeaf · Datos anclados en Stellar Testnet
      </p>
    </div>
  );
}
