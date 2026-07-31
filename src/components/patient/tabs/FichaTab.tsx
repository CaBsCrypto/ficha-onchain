"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { truncateHash } from "@/lib/stellar/config";
import { usePrivyEmail } from "@/hooks/usePrivyEmail";
import { authedFetch } from "@/lib/auth/authed-fetch";
import {
  UserIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  InfoIcon,
  HeartPulseIcon,
  SyringeIcon,
  StethoscopeIcon,
  CheckIcon,
  ClipboardCheckIcon,
} from "@/components/icons/PatientIcons";
import {
  type HealthRecord,
  type ClinicalEntry,
  EMPTY_RECORD,
} from "@/components/patient/types";
import { SectionHeader } from "@/components/patient/SectionHeader";
import { EditFichaModal } from "@/components/patient/EditFichaModal";
import { SelfUploadCard } from "@/components/patient/SelfUploadCard";
import { AiExtractionModal } from "@/components/patient/AiExtractionModal";

// ---------------------------------------------------------------------------
// Tab: Mi Ficha Médica (mejorada)
// ---------------------------------------------------------------------------
interface ClinicalDoc {
  id: number;
  doctor_email: string | null;
  category: string;
  title: string;
  file_name: string | null;
  mime_type: string | null;
  content_hash: string;
  tx_hash: string | null;
  mode: string;
  created_at: string;
}

export function FichaTab({ wallet, mock }: { wallet: string; mock: boolean }) {
  const privyEmail   = usePrivyEmail();
  const displayName  = privyEmail ?? (mock ? "Mi Cuenta" : "Tu perfil");
  const avatarLetter = privyEmail ? privyEmail[0].toUpperCase() : "P";

  const [record,    setRecord]    = useState<HealthRecord | null>(null);
  const [entries,   setEntries]   = useState<ClinicalEntry[]>([]);
  const [docs,      setDocs]      = useState<ClinicalDoc[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showEdit,  setShowEdit]  = useState(false);
  const [aiDocTarget, setAiDocTarget] = useState<{ id: number; title: string } | null>(null);

  // Recargable: la subida de un autoaporte (SelfUploadCard) o confirmación de IA
  // vuelve a pedir la lista sin recargar la página.
  function loadDocs(email: string) {
    authedFetch(`/api/ficha/document?patientEmail=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then((j: { documents?: ClinicalDoc[] }) => setDocs(j.documents ?? []))
      .catch(() => setDocs([]));
  }

  function refreshEntries(email: string) {
    authedFetch(`/api/ficha/entries?patientEmail=${encodeURIComponent(email)}`)
      .then(r => r.json() as Promise<{ entries?: ClinicalEntry[] }>)
      .then(j => setEntries(j.entries ?? []))
      .catch(() => setEntries([]));
  }

  async function viewDoc(id: number) {
    const res = await authedFetch(`/api/ficha/document/${id}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  useEffect(() => {
    if (!privyEmail) { setLoading(false); return; }
    // No email param — the server returns whatever record the token owns.
    authedFetch('/api/patient/ficha')
      .then(r => r.json() as Promise<{ data: HealthRecord | null }>)
      .then(j => setRecord(j.data))
      .catch(err => console.error('[FichaTab]', err))
      .finally(() => setLoading(false));
    // On-chain clinical history (anchored by the patient's doctors).
    authedFetch(`/api/ficha/entries?patientEmail=${encodeURIComponent(privyEmail)}`)
      .then(r => r.json() as Promise<{ entries?: ClinicalEntry[] }>)
      .then(j => setEntries(j.entries ?? []))
      .catch(() => setEntries([]));
    // Exam / lab documents (attached by doctors or by the patient).
    loadDocs(privyEmail);
  }, [privyEmail]);

  // Fallback to an empty record when there's no real data yet.
  const ficha = record ?? {
    ...EMPTY_RECORD,
    patient_email: privyEmail ?? '',
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="space-y-5">
      {/* Demo notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs leading-relaxed text-amber-800">
          {/* Cada afirmación de este aviso debe ser verificable: las anclas de tu
              historial viven on-chain; el contenido y el resumen viven fuera de
              la cadena. Decir "se leen desde tu wallet" era falso. */}
          Las anclas de tu ficha viven on-chain en Soroban — solo los médicos
          que tú autorices pueden escribir en ella.{" "}
          {mock
            ? "Datos de ejemplo · tu historial real estará aquí cuando conectes tu wallet."
            : "El contenido vive fuera de la cadena, bajo tu control."}
        </p>
      </div>

      {/* ── Identity card ── */}
      <Card className="relative p-0">
        <div className="flex items-center gap-4 border-b border-slate-200/70 px-6 py-5">
          {/* Self-report: allergies, base conditions and identity are the
              patient's to declare — no doctor is going to type them in. What
              the patient writes stays clearly separate from the doctor-anchored
              history below: this edits antecedentes only, never the on-chain
              entries. The modal existed for months with nothing opening it. */}
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="absolute right-4 top-4 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-600"
          >
            Editar mis datos
          </button>
          {/* Avatar con inicial */}
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-clinical/10 text-clinical">
            <span className="text-2xl font-bold leading-none">
              {avatarLetter}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              {ficha.full_name || displayName}
            </h2>
            {ficha.rut && (
              <p className="text-xs text-muted">RUT {ficha.rut}</p>
            )}
            <p className="font-mono text-xs text-muted">
              {truncateHash(wallet, 6, 6)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {mock ? (
                <Badge tone="muted">Demo · datos de ejemplo</Badge>
              ) : (
                <Badge tone="mint">
                  <ShieldCheckIcon className="h-3 w-3" /> Wallet verificada
                </Badge>
              )}
              <Badge tone="muted">Testnet</Badge>
            </div>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-px bg-slate-100/80 sm:grid-cols-4">
          {/* Grupo sanguíneo — badge rojo especial */}
          <div className="bg-white px-5 py-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">
              Grupo sanguíneo
            </p>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 ring-1 ring-inset ring-rose-200">
              <span className="text-base font-bold text-rose-600">
                {ficha.blood_type ?? "—"}
              </span>
            </div>
          </div>
          {[
            { label: "Talla", value: ficha.height_cm ?? "—" },
            { label: "Peso", value: ficha.weight_kg ?? "—" },
            { label: "IMC", value: ficha.bmi ?? "—" },
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

      {/* ── Historial clínico on-chain ── */}
      {entries.length > 0 && (
        <Card className="p-0">
          <SectionHeader
            icon={<ShieldCheckIcon className="h-5 w-5 text-clinical" />}
            title="Historial clínico on-chain"
            bg="bg-clinical-50"
          />
          <div className="divide-y divide-slate-100">
            {entries.map((en) => (
              <div key={en.id} className="px-6 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{en.summary}</p>
                  <Badge tone={en.mode === 'onchain' ? 'clinical' : 'muted'}>
                    {en.mode === 'onchain' ? '⚡ On-chain' : '📋 Demo'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {en.kind}{en.detail ? ` · ${en.detail}` : ''}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] text-muted/70" title={en.content_hash}>
                  hash: {en.content_hash}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Subida de documentos propios (foto o PDF desde el teléfono) ── */}
      {privyEmail && (
        <SelfUploadCard
          patientEmail={privyEmail}
          onUploaded={() => loadDocs(privyEmail)}
        />
      )}

      {/* ── Exámenes y laboratorios ── */}
      {docs.length > 0 && (
        <Card className="p-0">
          <SectionHeader
            icon={<ClipboardCheckIcon className="h-5 w-5 text-clinical" />}
            title="Exámenes y laboratorios"
            bg="bg-clinical-50"
          />
          <div className="divide-y divide-slate-100">
            {docs.map((doc) => (
              <div key={doc.id} className="px-6 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                        {doc.category === 'self' ? 'Personal' : doc.category}
                      </span>
                      {/* doctor_email NULL = documento aportado por el propio paciente */}
                      {!doc.doctor_email && (
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                          Aportado por ti
                        </span>
                      )}
                      <p className="text-sm font-semibold text-ink">{doc.title}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-muted">
                        {new Date(doc.created_at).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      <Badge tone={doc.mode === 'onchain' ? 'clinical' : 'muted'}>
                        {doc.mode === 'onchain' ? '⚡ On-chain' : '📋 Demo'}
                      </Badge>
                      {doc.tx_hash && (
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${doc.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-clinical hover:underline"
                        >
                          tx {truncateHash(doc.tx_hash, 4, 4)}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setAiDocTarget({ id: doc.id, title: doc.title })}
                      className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 ring-1 ring-inset ring-indigo-200/60"
                      title="Analizar con IA (Opt-in registrado bajo Ley 20.584)"
                    >
                      <span>🧠</span> Analizar con IA
                    </button>
                    <button
                      onClick={() => void viewDoc(doc.id)}
                      className="rounded-lg bg-clinical/10 px-3 py-1.5 text-xs font-semibold text-clinical transition-colors hover:bg-clinical/20"
                    >
                      Ver
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal de extracción e inteligencia con IA (Opt-in Ley 20.584) */}
      {aiDocTarget && privyEmail && (
        <AiExtractionModal
          patientEmail={privyEmail}
          documentId={aiDocTarget.id}
          documentTitle={aiDocTarget.title}
          onClose={() => setAiDocTarget(null)}
          onEntriesAdded={() => {
            refreshEntries(privyEmail);
            loadDocs(privyEmail);
          }}
        />
      )}

      {/* ── Datos personales ── */}
      {(ficha.birthdate || ficha.phone || ficha.address || ficha.prevision || ficha.emergency_contact) && (
        <Card className="p-0">
          <SectionHeader
            icon={<UserIcon className="h-5 w-5 text-clinical" />}
            title="Datos personales"
            bg="bg-clinical-50"
          />
          <dl className="grid grid-cols-2 gap-px bg-slate-100/80 sm:grid-cols-3">
            {[
              { label: "Fecha de nacimiento", value: ficha.birthdate?.slice(0, 10) },
              { label: "Previsión", value: ficha.prevision },
              { label: "Teléfono", value: ficha.phone },
              { label: "Dirección", value: ficha.address },
              { label: "Contacto de emergencia", value: ficha.emergency_contact },
            ]
              .filter((kv) => kv.value)
              .map((kv) => (
                <div key={kv.label} className="bg-white px-5 py-4">
                  <dt className="text-[10px] uppercase tracking-wide text-muted">{kv.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">{kv.value}</dd>
                </div>
              ))}
          </dl>
        </Card>
      )}

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
                {/* Timeline connector line */}
                {i < ficha.vaccinations.length - 1 && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-100" />
                )}
                {/* Check circle */}
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
            {ficha.primary_doctor ?? "—"}
          </p>
          <p className="text-xs text-muted">{ficha.primary_doctor_specialty ?? ""}</p>
        </div>
      </Card>

      {/* ── Banner privacidad on-chain ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
        <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-clinical" />
        <div>
          <p className="text-sm font-semibold text-ink">
            Privacidad by design
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {/* "cifrado" volvió el día que se volvió verdad: AES-256-GCM
                at-rest sobre el contenido clínico (#75). El comentario que
                estuvo aquí prohibía escribirlo antes de eso. */}
            Tus datos personales no están en la blockchain: allí solo viaja su
            huella digital. El contenido vive cifrado fuera de la cadena, bajo
            tu control, y solo los médicos que tú autorices pueden leerlo.
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-muted/70">
        © 2026 Browns Studio · TrustLeaf · Datos anclados en Stellar Testnet
      </p>

      {showEdit && (
        <EditFichaModal
          record={record}
          email={privyEmail ?? ""}
          onClose={() => setShowEdit(false)}
          onSaved={(r) => { setRecord(r); setShowEdit(false); }}
        />
      )}
    </div>
  );
}
