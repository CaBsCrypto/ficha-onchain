"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AccessScreen } from "@/components/portal/AccessScreen";
import { LicenseCard } from "@/components/portal/LicenseCard";
import type { LicenseDoc } from "@/components/portal/LicenseCard";
import { truncateHash } from "@/lib/stellar/config";
import { clearSession, loadSession, type PasskeySession } from "@/lib/passkey";

// ---------------------------------------------------------------------------
// Entry point — session gate
// ---------------------------------------------------------------------------

export default function LicensesPortal() {
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession("doctor"));
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!session) return <AccessScreen role="doctor" onAuthenticated={setSession} />;

  return (
    <LicensesDashboard
      session={session}
      onLogout={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function LicensesDashboard({
  session,
  onLogout,
}: {
  session: PasskeySession;
  onLogout: () => void;
}) {
  const [docs, setDocs] = useState<LicenseDoc[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setDocs(null);
    setReason(null);
    try {
      const res = await fetch(
        `/api/documents?wallet=${session.address}&role=issuer`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      setDocs(json.data.documents ?? []);
      if (json.data.reason) setReason(json.data.reason);
    } catch (err) {
      setDocs([]);
      setReason(err instanceof Error ? err.message : "No se pudo cargar");
    }
  }, [session.address]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  return (
    <main className="min-h-screen bg-canvas">
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <Link
              href="/doctor"
              className="text-xs font-medium text-muted hover:text-clinical"
            >
              ← Portal del Médico
            </Link>
            <h1 className="truncate text-lg font-semibold text-ink">
              Licencias y Certificados
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <p className="hidden font-mono text-xs text-muted sm:block">
              {truncateHash(session.address, 5, 4)}
            </p>
            {session.mock && <Badge tone="muted">demo</Badge>}
            <button
              onClick={onLogout}
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Module description banner */}
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-clinical/20 bg-clinical-50/60 px-5 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-clinical/15 text-clinical">
            <DocumentIcon />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              Documentos médicos on-chain
            </p>
            <p className="text-xs text-muted">
              Certifica licencias médicas, aptitud laboral, reposo y más como
              tokens soulbound verificables con QR.
            </p>
          </div>
        </div>

        {/* Actions bar */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            Documentos emitidos
          </h2>
          <Link href="/licenses/new">
            <Button>
              <PlusIcon />
              Emitir nuevo
            </Button>
          </Link>
        </div>

        {/* Debug reason (only in demo mode) */}
        {reason && session.mock && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-500/20">
            Nota: {reason}
          </p>
        )}

        {/* Document list */}
        <DocList docs={docs} walletDisplay={truncateHash(session.address, 4, 4)} onReload={loadDocs} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Document list
// ---------------------------------------------------------------------------

function DocList({
  docs,
  walletDisplay,
  onReload,
}: {
  docs: LicenseDoc[] | null;
  walletDisplay: string;
  onReload: () => void;
}) {
  if (docs === null) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-3xl border border-slate-200/70 bg-white"
          />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <Card className="py-10 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-muted">
          <DocumentIcon />
        </div>
        <h3 className="text-base font-semibold text-ink">
          Sin documentos emitidos
        </h3>
        <p className="mt-2 text-sm text-muted">
          Los certificados y licencias que emitas como{" "}
          <span className="font-mono">{walletDisplay}</span> aparecerán aquí,
          leídos desde los eventos{" "}
          <code className="text-clinical">doc_mint</code> de la red.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="secondary" onClick={onReload}>
            Actualizar
          </Button>
          <Link href="/licenses/new">
            <Button>Emitir primer documento</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {docs.map((doc) => (
        <LicenseCard key={doc.id} doc={doc} />
      ))}
      <div className="pt-2 text-center">
        <button
          onClick={onReload}
          className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Actualizar lista
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function DocumentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-1.5"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
