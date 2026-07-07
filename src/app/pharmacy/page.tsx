"use client";

/**
 * Pharmacy panel (/pharmacy)
 * ---------------------------------------------------------------------------
 * PIN-gated dispensary console. Once unlocked (see /api/pharmacy/verify-pin) a
 * pharmacist can look up a prescription by its on-chain ID (QR / receta number)
 * or by patient RUT (resolved via the off-chain clinical index), inspect the
 * full record — status, blockchain anchor, remaining units — and register a
 * dispensation against the DispenseRecord contract (simulated in demo mode).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { RxStatusBadge } from "@/components/prescriptions/RxStatusBadge";
import { cn } from "@/lib/utils";
import {
  CONTRACT_IDS,
  STELLAR_EXPERT_CONTRACT,
  STELLAR_EXPERT_TX,
  formatLedgerDate,
  truncateHash,
  type RxStatus,
} from "@/lib/stellar";

const UNLOCK_KEY = "trustleaf.pharmacy.unlocked";

/** Sanitized prescription shape returned by the public/lookup endpoints. */
interface PharmacyRx {
  id: string;
  status: RxStatus;
  isActive: boolean;
  medication: string;
  dosage: string;
  unitsTotal: number;
  balance: number;
  issuedAt: number;
  expiresAt: number;
  expired: boolean;
  daysLeft: number;
  rxHash: string;
}

export default function PharmacyPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnlocked(sessionStorage.getItem(UNLOCK_KEY) === "1");
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!unlocked) {
    return (
      <PinGate
        onUnlock={(isDemo) => {
          sessionStorage.setItem(UNLOCK_KEY, "1");
          setDemo(isDemo);
          setUnlocked(true);
        }}
      />
    );
  }
  return (
    <PharmacyConsole
      demo={demo}
      onLock={() => {
        sessionStorage.removeItem(UNLOCK_KEY);
        setUnlocked(false);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// PIN gate
// ---------------------------------------------------------------------------

function PinGate({ onUnlock }: { onUnlock: (demo: boolean) => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!/^\d{6}$/.test(pin)) {
      setError("El PIN debe tener 6 dígitos");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pharmacy/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "PIN incorrecto");
      }
      onUnlock(Boolean(data.demo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo verificar");
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-canvas bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-spotlight" />
      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <Link
          href="/"
          className="mb-10 text-sm font-medium text-muted transition-colors hover:text-clinical"
        >
          ← Volver a TrustLeaf
        </Link>

        <Card className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-clinical-50 ring-1 ring-clinical/15">
            <LockIcon className="h-8 w-8 text-clinical" />
          </div>
          <h1 className="text-2xl font-semibold text-ink">Portal Farmacia</h1>
          <p className="mt-2 text-sm text-muted">
            Ingresa el PIN de acceso para verificar y dispensar recetas
            ancladas en Stellar.
          </p>

          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••••"
            aria-label="PIN de acceso"
            className="mt-8 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center font-mono text-3xl tracking-[0.5em] text-ink outline-none transition-colors focus:border-clinical focus:ring-2 focus:ring-clinical/30"
          />

          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={submit}
            disabled={busy || pin.length !== 6}
          >
            {busy ? "Verificando…" : "Ingresar"}
          </Button>

          {error && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-inset ring-rose-500/20">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-center gap-2">
            <Badge tone="clinical">Testnet</Badge>
            <Badge tone="muted">Acceso restringido</Badge>
          </div>
        </Card>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Console (search + results)
// ---------------------------------------------------------------------------

type Mode = "id" | "rut";

function PharmacyConsole({
  demo,
  onLock,
}: {
  demo: boolean;
  onLock: () => void;
}) {
  const [mode, setMode] = useState<Mode>("id");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [results, setResults] = useState<PharmacyRx[] | null>(null);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setResults(null);
    try {
      if (mode === "id") {
        if (!/^\d+$/.test(q)) {
          throw new Error("El ID de receta debe ser numérico");
        }
        const res = await fetch(
          `/api/public/prescription/${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No encontrada");
        setResults([data.data as PharmacyRx]);
      } else {
        const res = await fetch(
          `/api/pharmacy/lookup?rut=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No encontrada");
        setResults((data.data as PharmacyRx[]) ?? []);
        if (data.note) setNote(data.note);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la búsqueda");
      setResults([]);
    } finally {
      setBusy(false);
    }
  }, [mode, query]);

  return (
    <main className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <Link
              href="/"
              className="text-xs font-medium text-muted hover:text-clinical"
            >
              TrustLeaf
            </Link>
            <h1 className="truncate text-lg font-semibold text-ink">
              Portal Farmacia
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {demo && <Badge tone="muted">demo</Badge>}
            <button
              onClick={onLock}
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500"
            >
              Bloquear
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Search controls */}
        <Card className="p-5">
          <div className="mb-4 inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-sm font-medium">
            {(["id", "rut"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setQuery("");
                  setResults(null);
                  setError(null);
                  setNote(null);
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 transition-colors",
                  mode === m
                    ? "bg-white text-clinical shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {m === "id" ? "Por ID" : "Por RUT"}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={
                mode === "id"
                  ? "Número de receta, p. ej. 1024"
                  : "RUT del paciente, p. ej. 12.345.678-9"
              }
              aria-label={mode === "id" ? "ID de receta" : "RUT del paciente"}
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-clinical focus:ring-2 focus:ring-clinical/30"
            />
            <Button onClick={search} disabled={busy || !query.trim()}>
              {busy ? "Buscando…" : "Buscar"}
            </Button>
          </div>
        </Card>

        {/* Results */}
        <div className="mt-6 space-y-4">
          {note && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-500/20">
              {note}
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-inset ring-rose-500/20">
              {error}
            </p>
          )}
          {results?.length === 0 && !error && !note && (
            <Card className="py-10 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-muted">
                <SearchIcon />
              </div>
              <h3 className="text-base font-semibold text-ink">Sin resultados</h3>
              <p className="mt-2 text-sm text-muted">
                No encontramos recetas con esos datos. Verifica el número de
                receta o el RUT del paciente e inténtalo de nuevo.
              </p>
            </Card>
          )}
          {results?.map((rx) => (
            <RxDetailCard
              key={rx.id}
              rx={rx}
              onDispensed={(updated) =>
                setResults(
                  (prev) =>
                    prev?.map((r) => (r.id === updated.id ? updated : r)) ??
                    null,
                )
              }
            />
          ))}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Prescription detail + dispense
// ---------------------------------------------------------------------------

interface DispenseResult {
  mode: "onchain" | "simulated";
  recordId: string;
  txHash: string;
  amount: number;
  reason?: string;
}

function RxDetailCard({
  rx,
  onDispensed,
}: {
  rx: PharmacyRx;
  onDispensed: (rx: PharmacyRx) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DispenseResult | null>(null);

  const contractUrl = useMemo(
    () => STELLAR_EXPERT_CONTRACT(CONTRACT_IDS.prescriptionSoulbound),
    [],
  );

  const dispensable = rx.isActive && rx.balance > 0 && !result;

  async function dispense() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/prescription/${encodeURIComponent(rx.id)}/dispense`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: Math.max(1, rx.balance) }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo dispensar");
      setResult(data.data as DispenseResult);
      // Reflect the dispensation locally (balance drained → no longer active).
      onDispensed({ ...rx, balance: 0, isActive: false, status: "Quemada" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al dispensar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-0">
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">{rx.medication}</h3>
          <RxStatusBadge status={rx.status} expired={rx.expired} />
        </div>
        <p className="mt-1 text-sm text-muted">{rx.dosage}</p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Receta">#{rx.id}</Field>
          <Field label="Unidades">
            {rx.balance}/{rx.unitsTotal}
          </Field>
          <Field label="Emitida">{formatLedgerDate(rx.issuedAt)}</Field>
          {rx.expiresAt > 0 && (
            <Field label="Vence">
              <span
                className={cn(
                  rx.expired
                    ? "font-medium text-rose-600"
                    : rx.daysLeft <= 3
                      ? "font-medium text-amber-600"
                      : undefined,
                )}
              >
                {formatLedgerDate(rx.expiresAt)}
              </span>
            </Field>
          )}
          <Field label="Hash on-chain" className="col-span-2 sm:col-span-3">
            <a
              href={contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-clinical hover:underline"
            >
              {truncateHash(rx.rxHash, 10, 8)}
              <ExternalIcon className="h-3.5 w-3.5" />
            </a>
          </Field>
        </dl>
      </div>

      {/* Dispense action + result */}
      <div className="flex flex-col gap-3 border-t border-slate-200/70 bg-slate-50/50 p-5">
        {result ? (
          <div className="rounded-xl bg-mint-50 px-4 py-3 text-sm text-mint ring-1 ring-inset ring-mint/20">
            <p className="font-semibold">
              Dispensación registrada · {result.amount} unidad
              {result.amount === 1 ? "" : "es"}
            </p>
            <p className="mt-1 text-mint/90">
              Registro #{result.recordId}
              {result.mode === "onchain" ? (
                <>
                  {" · "}
                  <a
                    href={STELLAR_EXPERT_TX(result.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    Ver tx <ExternalIcon className="h-3.5 w-3.5" />
                  </a>
                </>
              ) : (
                " · modo simulado (contratos Fase 1 no desplegados)"
              )}
            </p>
          </div>
        ) : (
          <>
            {!rx.isActive && (
              <p className="text-sm text-muted">
                {rx.expired
                  ? "Esta receta está expirada y no puede dispensarse."
                  : "Esta receta no está en un estado dispensable."}
              </p>
            )}
            <Button onClick={dispense} disabled={!dispensable || busy}>
              {busy ? "Registrando…" : "Marcar Dispensada"}
            </Button>
            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-inset ring-rose-500/20">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect
        x="4"
        y="10"
        width="16"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m20 20-3.2-3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M14 5h5v5M19 5l-8 8M12 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
