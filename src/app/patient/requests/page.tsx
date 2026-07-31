"use client";
// /patient/requests — Solicitud guiada de ficha clínica (Ley 20.584 art. 13)
// ---------------------------------------------------------------------------
// Wizard simple: nombre del prestador → previsualiza la carta formal →
// copiar / abrir correo → marcar como enviada. Abajo, la lista de solicitudes
// con el contador de días hábiles restantes del plazo legal y el aviso de
// escalamiento a la Superintendencia de Salud cuando venció.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePrivyEmail } from "@/hooks/usePrivyEmail";
// El endpoint resuelve la identidad del token Privy — toda llamada va autenticada.
import { authedFetch } from "@/lib/auth/authed-fetch";
import { businessDaysUntil, PLAZO_LEGAL_DIAS_HABILES } from "@/lib/dias-habiles";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface RecordRequest {
  id: number;
  provider_name: string;
  provider_email: string | null;
  request_text: string;
  status: "draft" | "sent" | "responded" | "closed";
  sent_at: string | null;
  due_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<RecordRequest["status"], string> = {
  draft: "Borrador",
  sent: "Enviada",
  responded: "Respondida",
  closed: "Cerrada",
};

const STATUS_BADGE: Record<RecordRequest["status"], string> = {
  draft: "bg-slate-100 text-slate-600 border border-slate-200",
  sent: "bg-sky-50 text-sky-700 border border-sky-200",
  responded: "bg-green-50 text-green-700 border border-green-200",
  closed: "bg-slate-100 text-slate-500 border border-slate-200",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

/** Contador del plazo: días hábiles restantes, o aviso de vencimiento. */
function Deadline({ req }: { req: RecordRequest }) {
  if (req.status !== "sent" || !req.due_at) return null;
  const remaining = businessDaysUntil(new Date(), new Date(req.due_at));
  if (remaining > 0) {
    return (
      <p className="text-xs text-slate-500">
        Plazo legal: quedan <span className="font-semibold text-slate-700">{remaining} día{remaining === 1 ? "" : "s"} hábil{remaining === 1 ? "" : "es"}</span> (vence el {formatDate(req.due_at)})
      </p>
    );
  }
  return (
    <p className="text-xs font-medium text-red-600">
      Plazo vencido — puedes reclamar en la{" "}
      <a
        href="https://www.superdesalud.gob.cl"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-red-700"
      >
        Superintendencia de Salud
      </a>
      .
    </p>
  );
}

type Step = "form" | "preview";

export default function RecordRequestsPage() {
  const privyEmail = usePrivyEmail();

  const [requests, setRequests] = useState<RecordRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard
  const [step, setStep] = useState<Step>("form");
  const [providerName, setProviderName] = useState("");
  const [providerEmail, setProviderEmail] = useState("");
  const [patientName, setPatientName] = useState("");
  const [draft, setDraft] = useState<RecordRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/patient/record-requests");
      if (!res.ok) return;
      const j = (await res.json()) as { requests?: RecordRequest[] };
      setRequests(j.requests ?? []);
    } catch { /* red caída — la lista queda como estaba */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createDraft() {
    if (!providerName.trim()) { toast.error("Ingresa el nombre del prestador"); return; }
    setBusy(true);
    try {
      const res = await authedFetch("/api/patient/record-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: providerName.trim(),
          providerEmail: providerEmail.trim() || undefined,
          patientName: patientName.trim() || undefined,
        }),
      });
      const j = (await res.json()) as { request?: RecordRequest; error?: string };
      if (!res.ok || !j.request) { toast.error(j.error ?? "No se pudo crear la solicitud"); return; }
      setDraft(j.request);
      setStep("preview");
      void load();
    } catch { toast.error("Error de red"); }
    finally { setBusy(false); }
  }

  async function markSent(id: number) {
    setBusy(true);
    try {
      const res = await authedFetch("/api/patient/record-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "sent" }),
      });
      const j = (await res.json()) as { request?: RecordRequest; error?: string };
      if (!res.ok || !j.request) { toast.error(j.error ?? "No se pudo actualizar"); return; }
      toast.success(`Solicitud marcada como enviada — el prestador tiene ${PLAZO_LEGAL_DIAS_HABILES} días hábiles`);
      setDraft(null);
      setStep("form");
      setProviderName("");
      setProviderEmail("");
      void load();
    } catch { toast.error("Error de red"); }
    finally { setBusy(false); }
  }

  async function updateStatus(id: number, status: "responded" | "closed") {
    try {
      const res = await authedFetch("/api/patient/record-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) { toast.error("No se pudo actualizar"); return; }
      toast.success(status === "responded" ? "Marcada como respondida" : "Solicitud cerrada");
      void load();
    } catch { toast.error("Error de red"); }
  }

  async function copyLetter(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Carta copiada al portapapeles");
    } catch { toast.error("No se pudo copiar"); }
  }

  function mailtoHref(req: RecordRequest): string {
    const subject = encodeURIComponent("Solicitud de copia de ficha clínica — Ley 20.584 art. 13");
    const body = encodeURIComponent(req.request_text);
    const to = req.provider_email ?? "";
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="space-y-6">
      {/* ── Encabezado ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Solicitar mi ficha clínica</h1>
        <p className="mt-1 text-sm text-slate-500">
          La Ley 20.584 (art. 13) te da derecho a pedir copia de tu ficha a cualquier prestador de
          salud, que debe entregarla en {PLAZO_LEGAL_DIAS_HABILES} días hábiles. Genera aquí la carta
          formal y haz seguimiento del plazo.
        </p>
      </div>

      {/* ── Wizard ── */}
      {step === "form" && (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900">1 · ¿A qué prestador se la pides?</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="rr-provider" className="mb-1 block text-xs font-medium text-slate-500">
                Nombre del prestador (clínica, hospital, consulta) *
              </label>
              <input
                id="rr-provider"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="Ej: Clínica Santa María"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div>
              <label htmlFor="rr-provider-email" className="mb-1 block text-xs font-medium text-slate-500">
                Correo del prestador (opcional — para el botón de enviar por correo)
              </label>
              <input
                id="rr-provider-email"
                type="email"
                value={providerEmail}
                onChange={(e) => setProviderEmail(e.target.value)}
                placeholder="oirs@clinica.cl"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div>
              <label htmlFor="rr-patient-name" className="mb-1 block text-xs font-medium text-slate-500">
                Tu nombre completo (aparece en la carta{privyEmail ? ` — si lo omites usamos ${privyEmail}` : ""})
              </label>
              <input
                id="rr-patient-name"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Ej: María Paz Torres Fuentes"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </div>
          <div className="mt-5">
            <Button onClick={() => void createDraft()} disabled={busy || !providerName.trim()}>
              {busy ? "Generando…" : "Generar carta"}
            </Button>
          </div>
        </Card>
      )}

      {step === "preview" && draft && (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900">2 · Revisa y envía tu carta</h2>
          <p className="mt-1 text-xs text-slate-500">
            Cópiala o ábrela en tu correo. Cuando la hayas enviado, márcala para iniciar el
            contador del plazo legal.
          </p>
          <pre className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-700">
            {draft.request_text}
          </pre>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void copyLetter(draft.request_text)}>
              Copiar carta
            </Button>
            <a
              href={mailtoHref(draft)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 text-sm font-medium text-slate-800 shadow-sm transition-all hover:border-sky-300 hover:text-sky-600"
            >
              Abrir en mi correo
            </a>
            <Button onClick={() => void markSent(draft.id)} disabled={busy}>
              {busy ? "Guardando…" : "Ya la envié"}
            </Button>
            <Button variant="ghost" onClick={() => { setDraft(null); setStep("form"); }}>
              Volver
            </Button>
          </div>
        </Card>
      )}

      {/* ── Lista de solicitudes ── */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Mis solicitudes</h2>
        {loading ? (
          <Card className="p-6 text-sm text-slate-400">Cargando…</Card>
        ) : requests.length === 0 ? (
          <Card className="p-6 text-sm text-slate-400">
            Aún no tienes solicitudes. Genera tu primera carta arriba.
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Card key={req.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{req.provider_name}</p>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[req.status]}`}>
                        {STATUS_LABEL[req.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Creada el {formatDate(req.created_at)}
                      {req.sent_at ? ` · enviada el ${formatDate(req.sent_at)}` : ""}
                    </p>
                    <div className="mt-1.5"><Deadline req={req} /></div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {req.status === "draft" && (
                      <Button size="sm" variant="secondary" onClick={() => { setDraft(req); setStep("preview"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                        Continuar
                      </Button>
                    )}
                    {req.status === "sent" && (
                      <Button size="sm" variant="secondary" onClick={() => void updateStatus(req.id, "responded")}>
                        Me respondieron
                      </Button>
                    )}
                    {(req.status === "sent" || req.status === "responded") && (
                      <Button size="sm" variant="ghost" onClick={() => void updateStatus(req.id, "closed")}>
                        Cerrar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
