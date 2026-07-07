"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  loginWithPasskey,
  passkeyEnabled,
  type PasskeySession,
} from "@/lib/passkey";
import type { Role } from "@/types";

const COPY: Record<Role, { title: string; blurb: string }> = {
  doctor: {
    title: "Portal del Médico",
    blurb:
      "Autentícate con tu passkey para verificar tu autorización y emitir prescripciones on-chain.",
  },
  patient: {
    title: "Portal del Paciente",
    blurb:
      "Autentícate con tu passkey para ver tus recetas verificadas y compartirlas de forma segura.",
  },
};

export function AccessScreen({
  role,
  onAuthenticated,
}: {
  role: Role;
  onAuthenticated: (session: PasskeySession) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[role];

  async function handleAuth(register: boolean) {
    setBusy(true);
    setError(null);
    try {
      const session = await loginWithPasskey(role, { register });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo autenticar");
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
            <FingerprintIcon
              className={cn(
                "h-9 w-9 text-clinical",
                busy && "animate-pulse",
              )}
            />
          </div>

          <h1 className="text-2xl font-semibold text-ink">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted">{copy.blurb}</p>

          <Button
            size="lg"
            className="mt-8 w-full"
            onClick={() => handleAuth(false)}
            disabled={busy}
          >
            {busy ? (
              <>
                <Spinner /> Verificando identidad…
              </>
            ) : (
              <>
                <FaceIdIcon className="h-5 w-5" /> Autenticar con Face ID / Touch ID
              </>
            )}
          </Button>

          {passkeyEnabled() && (
            <button
              type="button"
              onClick={() => handleAuth(true)}
              disabled={busy}
              className="mt-4 text-sm text-muted/70 underline underline-offset-4 transition-colors hover:text-clinical disabled:opacity-50"
            >
              Crear nueva passkey →
            </button>
          )}

          {error && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-inset ring-rose-500/20">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-center gap-2">
            <Badge tone="clinical">
              <ShieldIcon className="h-3.5 w-3.5" /> passkey-kit
            </Badge>
            <Badge tone="muted">Testnet</Badge>
            {!passkeyEnabled() && <Badge tone="muted">modo demo</Badge>}
          </div>

          <p className="mt-6 text-xs text-muted/80">
            {passkeyEnabled()
              ? "Tu clave privada nunca sale de tu dispositivo."
              : "Modo demo · login simulado con una wallet de testnet."}
          </p>
        </Card>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75" strokeLinecap="round" />
    </svg>
  );
}

function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 11a2 2 0 012 2v1a5 5 0 01-.4 2M7 11a5 5 0 018-4M5 15a9 9 0 01.3-6.5M9 20a7 7 0 01-1.5-3M12 13v2a9 9 0 001.5 5M16.5 18a12 12 0 00.5-4 5 5 0 00-9-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FaceIdIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 10v1M15 10v1M12 9v3l-1 1M9.5 15a3.5 3.5 0 005 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
