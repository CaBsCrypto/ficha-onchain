"use client";

/**
 * ConsultationPanel
 * ---------------------------------------------------------------------------
 * Shown under the "Consultas" tab in the doctor portal.
 *
 * Flow:
 *   1. If Google not connected → "Conectar Google Meet" CTA.
 *   2. If connected → list of past consultations + "Nueva consulta" form.
 *   3. Creating a consultation calls POST /api/consultations → returns meetLink.
 *   4. "Emitir receta" on a card calls back to the parent so it can pre-fill
 *      the prescription form with the patient wallet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Consultation } from "@/lib/consultations/store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  doctorWallet: string;
  /** Called when doctor clicks "Emitir receta" on a consultation. */
  onIssueRx?: (patientWallet: string, consultationId: string) => void;
}

// ---------------------------------------------------------------------------
// Panel root
// ---------------------------------------------------------------------------

export function ConsultationPanel({ doctorWallet, onIssueRx }: Props) {
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [consultations, setConsultations] = useState<Consultation[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<Consultation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On mount: check for ?google=connected or ?google_error in the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("google");
    const err = params.get("google_error");

    if (ok === "connected") {
      setGoogleConnected(true);
      // Clean the URL so a page refresh doesn't re-trigger this.
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    } else if (err) {
      setGoogleConnected(false);
      setError(`Error al conectar Google: ${decodeURIComponent(err)}`);
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    } else {
      // We don't have server-side state — assume not connected until first
      // successful consultation creation or explicit connect.
      setGoogleConnected(false);
    }
  }, []);

  const loadConsultations = useCallback(async () => {
    try {
      // We don't have a list endpoint, so we ask the store via a small
      // client-side cache seeded by successful creates + a GET-all stub.
      // For v1 we use a best-effort load from sessionStorage.
      const raw = sessionStorage.getItem(`tl:consultations:${doctorWallet}`);
      if (raw) {
        setConsultations(JSON.parse(raw) as Consultation[]);
      } else {
        setConsultations([]);
      }
    } catch {
      setConsultations([]);
    }
  }, [doctorWallet]);

  useEffect(() => {
    void loadConsultations();
  }, [loadConsultations]);

  /** Persist consultation list in sessionStorage (client-side cache). */
  function persist(list: Consultation[]) {
    try {
      sessionStorage.setItem(
        `tl:consultations:${doctorWallet}`,
        JSON.stringify(list),
      );
    } catch {
      // storage quota — ignore
    }
  }

  async function createConsultation(form: ConsultationFormData) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorWallet,
          patientWallet: form.patientWallet || undefined,
          scheduledAt: form.scheduledAt
            ? new Date(form.scheduledAt).getTime()
            : undefined,
          notes: form.notes || undefined,
        }),
      });

      const data = (await res.json()) as
        | { data: Consultation }
        | { error: string; authUrl?: string };

      // Doctor needs to connect Google first.
      if (!res.ok && "error" in data && data.error === "google_not_authorized") {
        const authUrl = "authUrl" in data ? data.authUrl : undefined;
        if (authUrl) {
          window.location.href = authUrl;
        } else {
          setError(
            "Necesitas conectar tu cuenta de Google para crear la videollamada. Vuelve a intentarlo desde el banner de conexión.",
          );
        }
        return;
      }

      if (!res.ok || !("data" in data)) {
        throw new Error(
          "error" in data ? data.error : "Error al crear la consulta",
        );
      }

      const consultation = data.data;
      setJustCreated(consultation);
      setGoogleConnected(true);

      // Update local list.
      const prev = consultations ?? [];
      const next = [consultation, ...prev];
      setConsultations(next);
      persist(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCreating(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  if (googleConnected === null) {
    return (
      <div className="h-40 animate-pulse rounded-3xl border border-slate-200/70 bg-white" />
    );
  }

  // Just created success screen.
  if (justCreated) {
    return (
      <CreateSuccess
        consultation={justCreated}
        onNew={() => setJustCreated(null)}
        onIssueRx={
          onIssueRx
            ? () => {
                const pw = justCreated.patientWallet ?? "";
                onIssueRx(pw, justCreated.id);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 ring-1 ring-inset ring-rose-500/20">
          {error}
        </p>
      )}

      {/* Google connect banner */}
      {!googleConnected && (
        <GoogleConnectBanner doctorWallet={doctorWallet} />
      )}

      {/* New consultation form */}
      <Card className="p-0">
        <div className="border-b border-slate-200/70 px-6 py-5">
          <h2 className="text-lg font-semibold text-ink">
            Nueva consulta con Meet
          </h2>
          <p className="text-xs text-muted">
            Genera un link de Google Meet para la teleconsulta. Al terminar
            puedes emitir la receta on-chain desde esta misma vista.
          </p>
        </div>
        <ConsultationForm
          onSubmit={createConsultation}
          busy={creating}
          needsAuth={!googleConnected}
        />
      </Card>

      {/* Past consultations */}
      <ConsultationList
        items={consultations}
        onIssueRx={onIssueRx}
        onReload={loadConsultations}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// GoogleConnectBanner
// ---------------------------------------------------------------------------

function GoogleConnectBanner({ doctorWallet }: { doctorWallet: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-50/60 px-5 py-4 sm:flex-row sm:items-center">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600">
        <GoogleIcon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          Conecta tu cuenta Google para crear Meet
        </p>
        <p className="text-xs text-muted">
          TrustLeaf necesita acceso a Google Meet para generar links de
          teleconsulta. Solo se solicitan permisos para crear reuniones.
        </p>
      </div>
      <a
        href={`/api/auth/google?wallet=${encodeURIComponent(doctorWallet)}`}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        <GoogleIcon small />
        Conectar Google
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConsultationForm
// ---------------------------------------------------------------------------

interface ConsultationFormData {
  patientWallet: string;
  scheduledAt: string; // datetime-local value
  notes: string;
}

function ConsultationForm({
  onSubmit,
  busy,
  needsAuth,
}: {
  onSubmit: (data: ConsultationFormData) => void;
  busy: boolean;
  needsAuth: boolean;
}) {
  const [patientWallet, setPatientWallet] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ patientWallet, scheduledAt, notes });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
      <Field label="Wallet del paciente (G…) — opcional">
        <input
          value={patientWallet}
          onChange={(e) => setPatientWallet(e.target.value)}
          placeholder="GD7WGS7M…4ZFW (opcional)"
          className={inputClass}
          disabled={busy}
        />
      </Field>

      <Field label="Fecha y hora de la consulta — opcional">
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className={inputClass}
          disabled={busy}
        />
      </Field>

      <Field label="Notas internas — opcional">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Motivo de consulta, antecedentes relevantes…"
          rows={3}
          className={`${inputClass} resize-none`}
          disabled={busy}
        />
      </Field>

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {busy ? "Creando Meet…" : needsAuth ? "Crear Meet (conectar Google)" : "Crear consulta con Meet"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// CreateSuccess
// ---------------------------------------------------------------------------

function CreateSuccess({
  consultation,
  onNew,
  onIssueRx,
}: {
  consultation: Consultation;
  onNew: () => void;
  onIssueRx?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copyLink() {
    void navigator.clipboard.writeText(consultation.meetLink);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const scheduled = consultation.scheduledAt
    ? new Date(consultation.scheduledAt).toLocaleString("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "ASAP";

  return (
    <Card className="text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mint-50 ring-1 ring-mint/20">
        <VideoIcon />
      </div>
      <h3 className="text-lg font-semibold text-ink">
        Consulta creada ✓
      </h3>
      <p className="mt-1 text-sm text-muted">
        Link de Google Meet generado — compártelo con el paciente.
      </p>

      <div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4 text-left">
        <MeetLinkRow link={consultation.meetLink} code={consultation.meetingCode} />
        <div className="flex items-center gap-1 text-xs text-muted">
          <span className="font-medium uppercase tracking-wide">Hora:</span>
          <span>{scheduled}</span>
        </div>
        {consultation.patientWallet && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <span className="font-medium uppercase tracking-wide">Paciente:</span>
            <span className="font-mono">{consultation.patientWallet.slice(0, 8)}…{consultation.patientWallet.slice(-4)}</span>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={copyLink}
        >
          {copied ? "¡Copiado!" : "Copiar link"}
        </Button>
        <a
          href={consultation.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1765cc]"
        >
          <VideoIcon small />
          Abrir Meet
        </a>
        {onIssueRx && (
          <Button className="flex-1" onClick={onIssueRx}>
            Emitir receta
          </Button>
        )}
      </div>

      <button
        onClick={onNew}
        className="mt-4 text-xs text-muted hover:text-ink"
      >
        + Nueva consulta
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ConsultationList
// ---------------------------------------------------------------------------

function ConsultationList({
  items,
  onIssueRx,
  onReload,
}: {
  items: Consultation[] | null;
  onIssueRx?: (patientWallet: string, consultationId: string) => void;
  onReload: () => void;
}) {
  if (items === null) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-3xl border border-slate-200/70 bg-white"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="text-center py-10">
        <p className="text-sm text-muted">
          Aún no hay consultas creadas en esta sesión.
        </p>
        <p className="mt-1 text-xs text-muted/60">
          Las consultas se almacenan en memoria — se resetean al reiniciar el servidor.
        </p>
        <Button variant="secondary" className="mt-4" onClick={onReload}>
          Actualizar
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">
          Consultas recientes
        </h3>
        <button
          onClick={onReload}
          className="text-xs text-muted hover:text-ink"
        >
          Actualizar
        </button>
      </div>
      {items.map((c) => (
        <ConsultationCard
          key={c.id}
          consultation={c}
          onIssueRx={
            onIssueRx
              ? () => onIssueRx(c.patientWallet ?? "", c.id)
              : undefined
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConsultationCard
// ---------------------------------------------------------------------------

function ConsultationCard({
  consultation: c,
  onIssueRx,
}: {
  consultation: Consultation;
  onIssueRx?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copyLink() {
    void navigator.clipboard.writeText(c.meetLink);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const scheduled = c.scheduledAt
    ? new Date(c.scheduledAt).toLocaleString("es-MX", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "ASAP";

  const created = new Date(c.createdAt).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#1a73e8]/10 text-[#1a73e8]">
              <VideoIcon small />
            </div>
            <span className="text-sm font-semibold text-ink">
              Consulta · {scheduled}
            </span>
            <StatusBadge status={c.status} />
            {c.rxId && (
              <Badge tone="mint">Rx #{c.rxId}</Badge>
            )}
          </div>

          {/* Meet link */}
          <MeetLinkRow link={c.meetLink} code={c.meetingCode} />

          {/* Meta */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
            <span>Creada {created}</span>
            {c.patientWallet && (
              <span className="font-mono">
                {c.patientWallet.slice(0, 6)}…{c.patientWallet.slice(-4)}
              </span>
            )}
          </div>

          {c.notes && (
            <p className="text-xs text-muted italic">{c.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="rounded-xl px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-slate-200 transition hover:text-ink"
            >
              {copied ? "¡Copiado!" : "Copiar link"}
            </button>
            <a
              href={c.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-[#1a73e8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1765cc]"
            >
              <VideoIcon tiny />
              Abrir
            </a>
          </div>
          {onIssueRx && !c.rxId && (
            <Button
              variant="secondary"
              className="text-xs"
              onClick={onIssueRx}
            >
              Emitir receta
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// MeetLinkRow — reusable link display
// ---------------------------------------------------------------------------

function MeetLinkRow({ link, code }: { link: string; code: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[#1a73e8]/5 px-3 py-2">
      <VideoIcon small />
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 truncate font-mono text-xs font-medium text-[#1a73e8] hover:underline"
      >
        {link}
      </a>
      <span className="shrink-0 rounded bg-[#1a73e8]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#1a73e8]">
        {code}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Consultation["status"] }) {
  if (status === "completed") {
    return <Badge tone="muted">Completada</Badge>;
  }
  return <Badge tone="mint">Programada</Badge>;
}

// ---------------------------------------------------------------------------
// Small shared UI helpers
// ---------------------------------------------------------------------------

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink placeholder:text-muted/60 focus:border-clinical focus:outline-none focus:ring-2 focus:ring-clinical/20";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function VideoIcon({ small, tiny }: { small?: boolean; tiny?: boolean }) {
  const sz = tiny ? "h-3 w-3" : small ? "h-4 w-4" : "h-7 w-7 text-[#1a73e8]";
  return (
    <svg viewBox="0 0 24 24" fill="none" className={sz} aria-hidden>
      <rect x="2" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 10l5.5-3v10L15 14V10z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleIcon({ small }: { small?: boolean }) {
  const sz = small ? "h-4 w-4" : "h-5 w-5";
  // Simplified Google "G" icon
  return (
    <svg viewBox="0 0 24 24" className={sz} aria-hidden>
      <path
        d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 01-2 3.1v2.6h3.2c1.9-1.7 3-4.3 3-7.5z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 .9-3.5.9-2.7 0-4.9-1.8-5.7-4.2H3v2.6A10 10 0 0012 22z"
        fill="#34A853"
      />
      <path
        d="M6.3 13.8A6 6 0 016 12c0-.6.1-1.2.3-1.8V7.6H3A10 10 0 002 12c0 1.6.4 3.1 1 4.4l3.3-2.6z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.8c1.5 0 2.8.5 3.9 1.5l2.9-2.9A10 10 0 003 7.6L6.3 10c.8-2.4 3-4.2 5.7-4.2z"
        fill="#EA4335"
      />
    </svg>
  );
}
