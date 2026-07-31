"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { RxStatusBadge } from "@/components/prescriptions/RxStatusBadge";
import { formatLedgerDate } from "@/lib/stellar/status";
import { truncateHash } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import { PRESCRIPTION_TYPE_LABELS } from "@/lib/decreto41";
import type { OnChainPrescription } from "@/lib/stellar";
import type { Consultation } from "@/lib/consultations/store";
import { authedFetch } from "@/lib/auth/authed-fetch";
import {
  ShareIcon,
  LockIcon,
  LockOpenIcon,
  QrIcon,
  InfoIcon,
  CalendarIcon,
} from "@/components/icons/PatientIcons";
import type { PatientRx } from "@/components/patient/types";
import { ExpiryAlerts } from "@/components/patient/ExpiryAlerts";
import { Teleconsultas } from "@/components/patient/Teleconsultas";
import { LoadingList } from "@/components/patient/LoadingList";
import { EmptyRxState } from "@/components/patient/EmptyRxState";

// ---------------------------------------------------------------------------
// Mock Rx data (demo mode — no contract connected)
// ---------------------------------------------------------------------------
type MockRx = {
  id: number;
  medication: string;
  dosage: string;
  form: string;
  units_total: number;
  balance: number;
  status: string;
  issued: string;
  expires: string;
  rx_hash: string;
  doctor: string;
};

const MOCK_RX: MockRx[] = [
  { id: 1, medication: "Amoxicilina", dosage: "500mg", form: "Cápsulas", units_total: 30, balance: 18, status: "Active", issued: "2026-06-15", expires: "2026-07-15", rx_hash: "a3f8c2e1b9d4f7e2", doctor: "Dr. Ramírez" },
  { id: 2, medication: "Ibuprofeno", dosage: "400mg", form: "Comprimidos", units_total: 20, balance: 0, status: "Burned", issued: "2026-05-20", expires: "2026-06-20", rx_hash: "9c7b1d3e5f2a8b6c", doctor: "Dra. Chen" },
  { id: 3, medication: "Metformina", dosage: "850mg", form: "Comprimidos", units_total: 90, balance: 45, status: "PartiallyDispensed", issued: "2026-06-01", expires: "2026-09-01", rx_hash: "f1e4a8b3c2d7e9f0", doctor: "Dr. Ramírez" },
];

const MOCK_RX_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  Active: { label: "Activa", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  PartiallyDispensed: { label: "Parcialmente dispensada", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  Burned: { label: "Dispensada", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
  Revoked: { label: "Revocada", bg: "bg-red-50", text: "text-red-600", border: "border-red-200", dot: "bg-red-500" },
  Blocked: { label: "Bloqueada", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  Registered: { label: "Registrada", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
};

// ---------------------------------------------------------------------------
// Tab: Mis Recetas — redesigned with RxCard
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
              onReload={onReload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RxCard — real on-chain prescription card (redesigned)
// ---------------------------------------------------------------------------
function RxCard({
  rx,
  onShowPharmacy,
  onShare,
  onReload,
}: {
  rx: PatientRx;
  onShowPharmacy: (rx: PatientRx) => void;
  onShare: (rx: OnChainPrescription) => void;
  onReload: () => void;
}) {
  const pct = rx.unitsTotal > 0 ? (rx.balance / rx.unitsTotal) * 100 : 0;
  const barColor =
    pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-rose-500";

  // A prescription that is still "Registrada" (and not expired) can be
  // activated by the patient — this flips it to "Activa" on-chain.
  const canActivate = rx.status === "Registrada" && !rx.expired;
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  async function handleActivate() {
    setActivating(true);
    setActivateError(null);
    try {
      const res = await authedFetch("/api/prescriptions/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rxId: rx.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setActivateError(data.error ?? "No se pudo activar la receta");
        return;
      }
      onReload();
    } catch {
      setActivateError("No se pudo activar la receta");
    } finally {
      setActivating(false);
    }
  }

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
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted">
              <span>Unidades disponibles</span>
              <span className="font-semibold text-ink">
                {rx.balance}/{rx.unitsTotal}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  barColor,
                )}
                style={{
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                }}
              />
            </div>
          </div>
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
                  <span className="ml-1 text-amber-500">
                    ({rx.daysLeft}d)
                  </span>
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
            {canActivate ? (
              <button
                onClick={handleActivate}
                disabled={activating}
                className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:pointer-events-none disabled:opacity-50"
              >
                <LockOpenIcon className="h-3.5 w-3.5" />
                {activating ? "Activando…" : "Activar"}
              </button>
            ) : (
              <button
                onClick={() => onShowPharmacy(rx)}
                disabled={rx.expired}
                className="flex items-center gap-1 rounded-lg bg-clinical/10 px-2.5 py-1.5 text-xs font-semibold text-clinical transition-colors hover:bg-clinical/20 disabled:pointer-events-none disabled:opacity-40"
              >
                <QrIcon /> Ver QR
              </button>
            )}
          </div>
        </div>
        {activateError && (
          <p className="text-right text-[11px] text-rose-500">{activateError}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockRxCard — demo mode prescription card
// ---------------------------------------------------------------------------
function MockRxCard({ rx }: { rx: MockRx }) {
  const cfg =
    MOCK_RX_STATUS_CONFIG[rx.status] ?? MOCK_RX_STATUS_CONFIG.Registered;
  const pct =
    rx.units_total > 0 ? (rx.balance / rx.units_total) * 100 : 0;
  const barColor =
    pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-rose-500";
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
        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
        <span className={cn("text-xs font-semibold", cfg.text)}>
          {cfg.label}
        </span>
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
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted">
              <span>Unidades disponibles</span>
              <span className="font-semibold text-ink">
                {rx.balance}/{rx.units_total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", barColor)}
                style={{
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                }}
              />
            </div>
          </div>
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
