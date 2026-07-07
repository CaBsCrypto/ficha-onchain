"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AccessScreen } from "@/components/portal/AccessScreen";
import { ShareModal } from "@/components/portal/ShareModal";
import { RxStatusBadge } from "@/components/prescriptions/RxStatusBadge";
import { formatLedgerDate } from "@/lib/stellar/status";
import { truncateHash } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import { PRESCRIPTION_TYPE_LABELS } from "@/lib/decreto41";
import type { OnChainPrescription, WithExpiry } from "@/lib/stellar";
import type { Consultation } from "@/lib/consultations/store";

type PatientRx = WithExpiry<OnChainPrescription>;
import {
  clearSession,
  loadSession,
  type PasskeySession,
} from "@/lib/passkey";

export default function PatientPortal() {
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession("patient"));
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!session) {
    return <AccessScreen role="patient" onAuthenticated={setSession} />;
  }
  return (
    <PatientDashboard
      session={session}
      onLogout={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

function PatientDashboard({
  session,
  onLogout,
}: {
  session: PasskeySession;
  onLogout: () => void;
}) {
  const [items, setItems] = useState<PatientRx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<OnChainPrescription | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/prescriptions?role=patient&wallet=${session.address}`,
      );
      const data = await res.json();
      setItems(data.prescriptions ?? []);
      if (data.error) setError(data.error);
    } catch {
      setError("No se pudieron cargar las recetas");
      setItems([]);
    }
  }, [session.address]);

  useEffect(() => {
    load();
  }, [load]);

  // Telemedicine consultations linked to this patient wallet (Meet links).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/consultations?patientWallet=${encodeURIComponent(session.address)}`,
        );
        const data = await res.json();
        if (!cancelled && Array.isArray(data.data)) {
          setConsultations(data.data as Consultation[]);
        }
      } catch {
        // Non-critical — the portal still works without the Meet panel.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.address]);

  return (
    <main className="min-h-screen bg-canvas">
      <PortalHeader
        title="Mis Recetas"
        subtitle="Prescripciones verificadas ancladas a tu wallet."
        wallet={session.address}
        mock={session.mock}
        onLogout={onLogout}
      />

      <div className="mx-auto max-w-3xl px-4 py-8">
        {consultations.length > 0 && (
          <div className="mb-6">
            <Teleconsultas items={consultations} />
          </div>
        )}
        {items === null ? (
          <LoadingList />
        ) : items.length === 0 ? (
          <EmptyState error={error} onRetry={load} />
        ) : (
          <div className="space-y-4">
            {error && (
              <p className="text-xs text-amber-600">
                Aviso: {error}
              </p>
            )}
            <ExpiryAlerts items={items} />
            {items.map((rx) => (
              <Card key={rx.id} className="p-0" interactive>
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-ink">
                        {rx.medication}
                      </h3>
                      <RxStatusBadge status={rx.status} expired={rx.expired} />
                      {rx.prescriptionType && (
                        <Badge tone="clinical">
                          {PRESCRIPTION_TYPE_LABELS[rx.prescriptionType]}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">{rx.dosage}</p>
                    {rx.diagnosis && (
                      <p className="mt-1 text-xs text-muted">
                        Diagnóstico: {rx.diagnosis}
                        {rx.cie10Code ? ` (CIE-10 ${rx.cie10Code})` : ""}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>Receta #{rx.id}</span>
                      <span>Emitida {formatLedgerDate(rx.timestamp)}</span>
                      {rx.expiresAt > 0 && (
                        <span
                          className={cn(
                            rx.expired
                              ? "font-medium text-rose-600"
                              : rx.expiringSoon
                                ? "font-medium text-amber-600"
                                : undefined,
                          )}
                        >
                          {rx.expired ? "Expiró" : "Vence"}{" "}
                          {formatLedgerDate(rx.expiresAt)}
                        </span>
                      )}
                      <span>
                        {rx.balance}/{rx.unitsTotal} unidades
                      </span>
                      <span className="font-mono">
                        Dr. {truncateHash(rx.doctorWallet, 4, 4)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShare(rx)}
                  >
                    <QrIcon /> Compartir
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {share && (
        <ShareModal
          rx={share}
          patientWallet={session.address}
          onClose={() => setShare(null)}
        />
      )}
    </main>
  );
}

function PortalHeader({
  title,
  subtitle,
  wallet,
  mock,
  onLogout,
}: {
  title: string;
  subtitle: string;
  wallet: string;
  mock: boolean;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <Link href="/" className="text-xs font-medium text-muted hover:text-clinical">
            TrustLeaf
          </Link>
          <h1 className="truncate text-lg font-semibold text-ink">{title}</h1>
          <p className="hidden truncate text-sm text-muted sm:block">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="font-mono text-xs text-muted">
              {truncateHash(wallet, 5, 4)}
            </p>
            {mock && <Badge tone="muted">demo</Badge>}
          </div>
          <button
            onClick={onLogout}
            className="rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Expiration alert banners for the patient's prescription list.
 *   • Red   — one or more prescriptions have lapsed while still un-dispensed.
 *   • Amber — one or more active prescriptions expire within EXPIRY_WARN_DAYS.
 * Both banners can show at once. Expiry is derived (see lib/stellar/expiry).
 */
function ExpiryAlerts({ items }: { items: PatientRx[] }) {
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
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <p className="font-semibold">
              {expired.length === 1
                ? "Tienes 1 receta expirada sin dispensar"
                : `Tienes ${expired.length} recetas expiradas sin dispensar`}
            </p>
            <p className="mt-0.5 text-rose-600/90">
              Su periodo de validez venció. Solicita a tu médico una nueva
              prescripción antes de acudir a la farmacia.
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

/**
 * Teleconsultas — the patient's Google Meet links for scheduled/recent
 * telemedicine sessions, fetched from /api/consultations. Sorted newest-first
 * by the API; we surface the join link + short meeting code so the patient can
 * enter the consultation from their portal.
 */
function Teleconsultas({ items }: { items: Consultation[] }) {
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
                <VideoIcon />
                Abrir Meet
              </a>
            </div>
          </Card>
        );
      })}
    </section>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <rect x="2" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 10l5.5-3v10L15 14V10z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingList() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-3xl border border-slate-200/70 bg-white"
        />
      ))}
    </div>
  );
}

function EmptyState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Card className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
        <QrIcon />
      </div>
      <h2 className="text-lg font-semibold text-ink">Aún no tienes recetas</h2>
      <p className="mt-2 text-sm text-muted">
        Cuando un médico emita una prescripción a tu wallet, aparecerá aquí,
        leída directamente desde Stellar Soroban.
      </p>
      {error && <p className="mt-3 text-xs text-amber-600">Detalle: {error}</p>}
      <Button variant="secondary" className="mt-5" onClick={onRetry}>
        Actualizar
      </Button>
    </Card>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h2v2h-2v-2zM18 14h2v2h-2v-2zM14 18h2v2h-2v-2zM18 18h2v2h-2v-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
