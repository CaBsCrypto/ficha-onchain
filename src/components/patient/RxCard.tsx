"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RxStatusBadge } from "@/components/prescriptions/RxStatusBadge";
import { formatLedgerDate } from "@/lib/stellar/status";
import { truncateHash } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import { PRESCRIPTION_TYPE_LABELS } from "@/lib/decreto41";
import type { OnChainPrescription, WithExpiry } from "@/lib/stellar";
import type { Consultation } from "@/lib/consultations/store";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClockIcon,
  CloseIcon,
  InfoIcon,
  LockIcon,
  PillIcon,
  QrIcon,
  ShareIcon,
  VideoIcon,
} from "@/components/icons/HealthIcons";
import { MOCK_RX, MOCK_RX_STATUS_CONFIG, type MockRx } from "@/types/health";

type PatientRx = WithExpiry<OnChainPrescription>;

// ---------------------------------------------------------------------------
// RxCard — real on-chain prescription card
// ---------------------------------------------------------------------------
export function RxCard({
  rx,
  onShowPharmacy,
  onShare,
}: {
  rx: PatientRx;
  onShowPharmacy: (rx: PatientRx) => void;
  onShare: (rx: OnChainPrescription) => void;
}) {
  const pct = rx.unitsTotal > 0 ? (rx.balance / rx.unitsTotal) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      {/* ── Status bar ── */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <RxStatusBadge status={rx.status} expired={rx.expired} />
        {rx.prescriptionType && (
          <Badge tone="clinical">
            {PRESCRIPTION_TYPE_LABELS[rx.prescriptionType]}
          </Badge>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted">
          #{rx.id}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* ── Medication ── */}
        <div>
          <h3 className="text-lg font-semibold leading-tight text-ink">
            {rx.medication}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{rx.dosage}</p>
          {rx.diagnosis && (
            <p className="mt-0.5 text-xs text-muted">
              {rx.diagnosis}
              {rx.cie10Code ? ` (${rx.cie10Code})` : ""}
            </p>
          )}
        </div>

        {/* ── Units progress bar ── */}
        {rx.unitsTotal > 0 && (
          <ProgressBar value={pct} current={rx.balance} total={rx.unitsTotal} />
        )}

        {/* ── Calendar dates ── */}
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              Emitida{" "}
              <span className="font-medium text-ink">
                {formatLedgerDate(rx.timestamp)}
              </span>
            </span>
          </div>
          {rx.expiresAt > 0 && (
            <div
              className={cn(
                "flex items-center gap-1.5",
                rx.expired
                  ? "font-medium text-rose-600"
                  : rx.expiringSoon
                    ? "font-medium text-amber-600"
                    : "",
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              <span>
                {rx.expired ? "Expiró" : "Vence"}{" "}
                <span className="font-medium">
                  {formatLedgerDate(rx.expiresAt)}
                </span>
                {rx.expiringSoon && !rx.expired && (
                  <span className="ml-1 text-amber-500">({rx.daysLeft}d)</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* ── Footer: hash + actions ── */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1.5">
            <LockIcon className="h-3.5 w-3.5 text-muted/60" />
            <span className="font-mono text-[10px] text-muted/70">
              {truncateHash(rx.doctorWallet, 4, 4)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onShare(rx)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50"
            >
              <ShareIcon /> Compartir
            </button>
            <button
              onClick={() => onShowPharmacy(rx)}
              disabled={rx.expired}
              className="flex items-center gap-1 rounded-lg bg-clinical/10 px-2.5 py-1.5 text-xs font-semibold text-clinical transition-colors hover:bg-clinical/20 disabled:pointer-events-none disabled:opacity-40"
            >
              <QrIcon /> Ver QR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockRxCard — demo mode prescription card
// ---------------------------------------------------------------------------
export function MockRxCard({ rx }: { rx: MockRx }) {
  const cfg =
    MOCK_RX_STATUS_CONFIG[rx.status] ?? MOCK_RX_STATUS_CONFIG.Registered;
  const pct = rx.units_total > 0 ? (rx.balance / rx.units_total) * 100 : 0;
  const shortHash = `${rx.rx_hash.slice(0, 8)}...${rx.rx_hash.slice(-4)}`;

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
          status={rx.status}
          configMap={MOCK_RX_STATUS_CONFIG}
          fallback="Registered"
        />
        <span className="ml-auto font-mono text-[10px] text-muted">
          #{rx.id}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* ── Medication ── */}
        <div>
          <h3 className="text-lg font-semibold leading-tight text-ink">
            {rx.medication}
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {rx.dosage} · {rx.form}
          </p>
          <p className="mt-0.5 text-xs text-muted">{rx.doctor}</p>
        </div>

        {/* ── Units progress bar ── */}
        {rx.units_total > 0 && (
          <ProgressBar
            value={pct}
            current={rx.balance}
            total={rx.units_total}
          />
        )}

        {/* ── Calendar dates ── */}
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              Emitida{" "}
              <span className="font-medium text-ink">{rx.issued}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              Vence{" "}
              <span className="font-medium text-ink">{rx.expires}</span>
            </span>
          </div>
        </div>

        {/* ── Footer: hash + QR button ── */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1.5">
            <LockIcon className="h-3.5 w-3.5 text-muted/60" />
            <span className="font-mono text-[10px] text-muted/70">
              {shortHash}
            </span>
          </div>
          {rx.status === "Active" && (
            <button className="flex items-center gap-1 rounded-lg bg-clinical/10 px-2.5 py-1.5 text-xs font-semibold text-clinical transition-colors hover:bg-clinical/20">
              <QrIcon /> Ver QR
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecetasTab
// ---------------------------------------------------------------------------
export function RecetasTab({
  items,
  error,
  consultations,
  onReload,
  onShare,
  onShowPharmacy,
  wallet: _wallet,
  mock,
}: {
  items: PatientRx[] | null;
  error: string | null;
  consultations: Consultation[];
  onReload: () => void;
  onShare: (rx: OnChainPrescription) => void;
  onShowPharmacy: (rx: PatientRx) => void;
  wallet: string;
  mock?: boolean;
}) {
  const showMock = mock && (items === null || items.length === 0);

  return (
    <div className="space-y-4">
      {consultations.length > 0 && <Teleconsultas items={consultations} />}

      {items === null ? (
        <LoadingList />
      ) : showMock ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-200/70">
            <InfoIcon className="h-3.5 w-3.5 shrink-0" />
            Datos de demostración · no conectado a la blockchain
          </div>
          {MOCK_RX.map((rx) => (
            <MockRxCard key={rx.id} rx={rx} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyRxState error={error} onRetry={onReload} />
      ) : (
        <div className="space-y-4">
          {error && <p className="text-xs text-amber-600">Aviso: {error}</p>}
          <ExpiryAlerts items={items} />
          {items.map((rx) => (
            <RxCard
              key={rx.id}
              rx={rx}
              onShowPharmacy={onShowPharmacy}
              onShare={onShare}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExpiryAlerts
// ---------------------------------------------------------------------------
export function ExpiryAlerts({ items }: { items: PatientRx[] }) {
  const expired = items.filter((rx) => rx.expired);
  const expiringSoon = items.filter((rx) => rx.expiringSoon);
  if (expired.length === 0 && expiringSoon.length === 0) return null;
  return (
    <div className="space-y-3">
      {expired.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <p className="font-semibold">
              {expired.length === 1
                ? "Tienes 1 receta expirada sin dispensar"
                : `Tienes ${expired.length} recetas expiradas sin dispensar`}
            </p>
            <p className="mt-0.5 text-rose-600/90">
              Solicita a tu médico una nueva prescripción antes de acudir a la
              farmacia.
            </p>
          </div>
        </div>
      )}
      {expiringSoon.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">
              {expiringSoon.length === 1
                ? "1 receta vence pronto"
                : `${expiringSoon.length} recetas vencen pronto`}
            </p>
            <p className="mt-0.5 text-amber-700/90">
              {expiringSoon.length === 1
                ? `Vence ${formatLedgerDate(expiringSoon[0].expiresAt)} (en ${Math.max(0, expiringSoon[0].daysLeft)} día${expiringSoon[0].daysLeft === 1 ? "" : "s"}).`
                : "Algunas de tus recetas vencen en los próximos días."}{" "}
              Dispénsalas a tiempo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teleconsultas
// ---------------------------------------------------------------------------
export function Teleconsultas({ items }: { items: Consultation[] }) {
  return (
    <section aria-label="Teleconsultas" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Tus teleconsultas
      </h2>
      {items.map((c) => {
        const when = c.scheduledAt
          ? new Date(c.scheduledAt).toLocaleString("es-CL", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "A convenir";
        return (
          <Card key={c.id} className="p-0">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#1a73e8]/10 text-[#1a73e8]">
                    <VideoIcon />
                  </div>
                  <h3 className="text-base font-semibold text-ink">
                    Consulta médica
                  </h3>
                  <Badge tone={c.status === "completed" ? "muted" : "clinical"}>
                    {c.status === "completed" ? "Completada" : "Programada"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium">Cuándo:</span> {when}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium uppercase tracking-wide">
                    Meet:
                  </span>
                  <a
                    href={c.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate font-mono text-[#1a73e8] hover:underline"
                  >
                    {c.meetLink}
                  </a>
                  <span className="shrink-0 rounded bg-[#1a73e8]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#1a73e8]">
                    {c.meetingCode}
                  </span>
                </div>
              </div>
              <a
                href={c.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1765cc]"
              >
                <VideoIcon /> Abrir Meet
              </a>
            </div>
          </Card>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// LoadingList
// ---------------------------------------------------------------------------
export function LoadingList() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-3xl border border-slate-200/70 bg-white"
        />
      ))}
      <p className="text-center text-xs text-muted">Cargando desde Soroban…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyRxState
// ---------------------------------------------------------------------------
export function EmptyRxState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Card className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
        <PillIcon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-ink">Aún no tienes recetas</h2>
      <p className="mt-2 text-sm text-muted">
        Cuando un médico emita una prescripción a tu wallet, aparecerá aquí,
        leída directamente desde Stellar Soroban.
      </p>
      {error && (
        <p className="mt-3 text-xs text-amber-600">Detalle: {error}</p>
      )}
      <Button variant="secondary" className="mt-5" onClick={onRetry}>
        Actualizar
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// QrCodeDisplay — deterministic visual QR (no external lib)
// ---------------------------------------------------------------------------
export function QrCodeDisplay({
  seed,
  size = 196,
}: {
  seed: string;
  size?: number;
}) {
  const modules = 25;
  const cells = useMemo(() => {
    const grid: boolean[][] = [];
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    for (let r = 0; r < modules; r++) {
      grid[r] = [];
      for (let c = 0; c < modules; c++) {
        h = (h * 1103515245 + 12345 + r * 97 + c * 131) >>> 0;
        grid[r][c] = ((h >> 8) & 1) === 1;
      }
    }
    return grid;
  }, [seed]);

  const unit = size / modules;
  const finders: [number, number][] = [
    [0, 0],
    [0, modules - 7],
    [modules - 7, 0],
  ];
  const inFinder = (r: number, c: number) =>
    finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Código QR de la receta"
      className="rounded-lg"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {cells.map((row, r) =>
        row.map((on, c) =>
          on && !inFinder(r, c) ? (
            <rect
              key={`${r}-${c}`}
              x={c * unit}
              y={r * unit}
              width={unit}
              height={unit}
              rx={unit * 0.25}
              fill="#0f172a"
            />
          ) : null,
        ),
      )}
      {finders.map(([fr, fc], i) => (
        <g key={i} transform={`translate(${fc * unit}, ${fr * unit})`}>
          <rect
            width={unit * 7}
            height={unit * 7}
            rx={unit * 1.4}
            fill="#0f172a"
          />
          <rect
            x={unit}
            y={unit}
            width={unit * 5}
            height={unit * 5}
            rx={unit}
            fill="#ffffff"
          />
          <rect
            x={unit * 2}
            y={unit * 2}
            width={unit * 3}
            height={unit * 3}
            rx={unit * 0.7}
            fill="#0ea5e9"
          />
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// RxPharmacyModal
// ---------------------------------------------------------------------------
export function RxPharmacyModal({
  rx,
  onClose,
}: {
  rx: PatientRx;
  onClose: () => void;
}) {
  const qrSeed = `${rx.id}:${rx.doctorWallet}:${rx.medication}`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Receta: ${rx.medication}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 hidden bg-ink/40 backdrop-blur-sm sm:block"
        onClick={onClose}
      />

      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-sm sm:rounded-3xl sm:shadow-2xl">
        {/* ── Pharmacy header band ── */}
        <div className="flex shrink-0 items-center justify-between bg-clinical px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/70">Vista farmacia</p>
            <h2 className="truncate text-base font-semibold leading-tight">
              {rx.medication}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-3 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* ── Status bar ── */}
        <div
          className={cn(
            "flex shrink-0 items-center justify-center gap-2 py-2.5 text-sm font-semibold",
            rx.expired
              ? "bg-rose-50 text-rose-600"
              : rx.status === "Quemada"
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-600",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              rx.expired
                ? "bg-rose-500"
                : rx.status === "Quemada"
                  ? "bg-amber-500"
                  : "bg-emerald-500",
            )}
          />
          {rx.expired
            ? "Receta vencida"
            : rx.status === "Quemada"
              ? "Ya dispensada"
              : "Receta activa ✓"}
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex justify-center bg-white px-6 py-6">
            <div className="overflow-hidden rounded-2xl border-4 border-slate-100 bg-white p-4 shadow-inner">
              <QrCodeDisplay seed={qrSeed} size={196} />
            </div>
          </div>

          <div className="space-y-4 px-5 pb-8">
            <div className="text-center">
              <h3 className="text-2xl font-bold leading-tight text-ink">
                {rx.medication}
              </h3>
              <p className="mt-1.5 text-base text-muted">{rx.dosage}</p>
            </div>

            <div className="h-px bg-slate-100" />

            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Receta N°
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-ink">
                  #{rx.id}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Emitida
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {formatLedgerDate(rx.timestamp)}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Médico
                </dt>
                <dd className="mt-0.5 font-mono text-xs font-semibold text-ink">
                  {truncateHash(rx.doctorWallet, 4, 4)}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Unidades
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {rx.balance}/{rx.unitsTotal}
                </dd>
              </div>
            </dl>

            {rx.expiresAt > 0 && (
              <div
                className={cn(
                  "rounded-xl px-4 py-3 text-sm",
                  rx.expired
                    ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                    : rx.expiringSoon
                      ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                      : "bg-slate-50 text-muted",
                )}
              >
                <span className="font-semibold">
                  {rx.expired ? "Expiró: " : "Vence: "}
                </span>
                {formatLedgerDate(rx.expiresAt)}
                {rx.expiringSoon && !rx.expired && (
                  <span className="ml-1 text-amber-600">
                    (en {rx.daysLeft} día{rx.daysLeft === 1 ? "" : "s"})
                  </span>
                )}
              </div>
            )}

            <p className="text-center text-xs text-muted">
              El farmacéutico escanea el QR para verificar on-chain
            </p>
          </div>
        </div>

        {/* ── Footer action ── */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-4 pb-safe">
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-ink transition-colors hover:bg-slate-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
