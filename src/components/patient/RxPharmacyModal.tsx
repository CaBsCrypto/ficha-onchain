"use client";

import { formatLedgerDate } from "@/lib/stellar/status";
import { truncateHash } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import { CloseIcon } from "@/components/icons/PatientIcons";
import { QrCodeDisplay } from "./QrCodeDisplay";
import type { PatientRx } from "./types";

// ---------------------------------------------------------------------------
// Rx Pharmacy Modal — full-screen on mobile, modal on desktop
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
      {/* Backdrop — only visible on sm+ */}
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
          {/* QR — big and centered for easy scanning */}
          <div className="flex justify-center bg-white px-6 py-6">
            <div className="overflow-hidden rounded-2xl border-4 border-slate-100 bg-white p-4 shadow-inner">
              <QrCodeDisplay seed={qrSeed} size={196} />
            </div>
          </div>

          <div className="space-y-4 px-5 pb-8">
            {/* Medication — large text */}
            <div className="text-center">
              <h3 className="text-2xl font-bold leading-tight text-ink">
                {rx.medication}
              </h3>
              <p className="mt-1.5 text-base text-muted">{rx.dosage}</p>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Key details grid */}
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

            {/* Expiry notice */}
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
