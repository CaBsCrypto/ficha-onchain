"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { truncateHash } from "@/lib/stellar/config";
import type { DocumentType, DocumentStatus } from "@/types";

// ---------------------------------------------------------------------------
// Inline lookup tables (mirrors fhir/documents.ts — avoids importing a
// server-only module that uses node:crypto in a client component).
// ---------------------------------------------------------------------------

const DOC_LABELS: Record<DocumentType, string> = {
  LaborRest: "Certificado de Reposo Laboral",
  LaborFitness: "Certificado de Aptitud Laboral",
  Disability: "Certificado de Incapacidad",
  MedicalLicense: "Licencia Médica",
  DegreeTitle: "Certificado de Título",
  ProfCredential: "Credencial de Habilitación Profesional",
  PsychCare: "Certificado de Atención Psicológica",
  PsychEval: "Certificado de Evaluación Psicológica",
  TreatmentDischarge: "Alta de Tratamiento Psicológico",
};

const DOC_CATEGORY: Record<DocumentType, string> = {
  LaborRest: "medical_certificate",
  LaborFitness: "medical_certificate",
  Disability: "medical_certificate",
  MedicalLicense: "professional_license",
  DegreeTitle: "professional_license",
  ProfCredential: "professional_license",
  PsychCare: "mental_health",
  PsychEval: "mental_health",
  TreatmentDischarge: "mental_health",
};

const CATEGORY_LABELS: Record<string, string> = {
  medical_certificate: "Certificado Médico",
  professional_license: "Licencia Profesional",
  mental_health: "Salud Mental",
};

type BadgeTone = "clinical" | "mint" | "muted" | "amber";

function categoryTone(category: string): BadgeTone {
  if (category === "medical_certificate") return "clinical";
  if (category === "professional_license") return "amber";
  return "mint";
}

function statusTone(status: DocumentStatus): BadgeTone {
  if (status === "active") return "mint";
  return "muted";
}

function statusLabel(status: DocumentStatus): string {
  if (status === "active") return "Activo";
  if (status === "revoked") return "Revocado";
  return "Expirado";
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Public document shape (matches OnChainDocument from stellar/documents.ts)
// ---------------------------------------------------------------------------

export interface LicenseDoc {
  id: string;
  docType: DocumentType;
  issuerWallet: string;
  recipientWallet: string;
  contentHash: string;
  issuedAt: number;
  expiresAt: number;
  status: DocumentStatus;
}

// ---------------------------------------------------------------------------
// QR Modal
// ---------------------------------------------------------------------------

function QrModal({
  docId,
  label,
  onClose,
}: {
  docId: string;
  label: string;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrError, setQrError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const url = `${window.location.origin}/verify/license/${docId}`;
    setQrError(false);
    QRCode.toDataURL(url, {
      width: 280,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrError(true));
  }, [docId]);

  // Cerrar con Escape (accesibilidad de teclado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copyLink() {
    const url = `${window.location.origin}/verify/license/${docId}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Verificar documento"
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Verificar documento</h2>
            <p className="text-sm text-muted">{label}</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-slate-100 hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center">
          {qrError ? (
            <div className="grid h-[240px] w-[240px] place-items-center rounded-2xl bg-rose-50 px-6 text-center text-sm text-rose-600">
              No se pudo generar el código QR. Usa el enlace de verificación.
            </div>
          ) : !qrDataUrl ? (
            <div className="grid h-[240px] w-[240px] animate-pulse place-items-center rounded-2xl bg-slate-50 text-sm text-muted">
              Generando…
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="Código QR de verificación"
              width={240}
              height={240}
              className="rounded-2xl ring-1 ring-slate-200"
            />
          )}
          <p className="mt-3 text-center text-xs text-muted/80">
            Escanear para verificar en{" "}
            <span className="font-mono text-clinical">/verify/license/{docId}</span>
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={copyLink}>
            {copied ? "¡Copiado!" : "Copiar enlace"}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Listo
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LicenseCard
// ---------------------------------------------------------------------------

export function LicenseCard({ doc }: { doc: LicenseDoc }) {
  const [showQr, setShowQr] = useState(false);

  const label = DOC_LABELS[doc.docType];
  const category = DOC_CATEGORY[doc.docType];
  const catLabel = CATEGORY_LABELS[category] ?? category;

  return (
    <>
      <Card className="p-0">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold text-ink">{label}</h3>
              <Badge tone={categoryTone(category)}>{catLabel}</Badge>
              <Badge tone={statusTone(doc.status)}>{statusLabel(doc.status)}</Badge>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>Documento #{doc.id}</span>
              <span>Emitido {formatDate(doc.issuedAt)}</span>
              {doc.expiresAt > 0 && (
                <span>Vence {formatDate(doc.expiresAt)}</span>
              )}
              <span className="font-mono">
                Para {truncateHash(doc.recipientWallet, 4, 4)}
              </span>
            </div>

            <p className="mt-1 font-mono text-xs text-muted/60">
              {doc.contentHash.slice(0, 24)}…
            </p>
          </div>

          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => setShowQr(true)}
          >
            <QrIcon />
            Ver QR
          </Button>
        </div>
      </Card>

      {showQr && (
        <QrModal
          docId={doc.id}
          label={label}
          onClose={() => setShowQr(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function QrIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-1.5"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3" />
      <path d="M21 14v.01" />
      <path d="M14 21h.01" />
      <path d="M17 21h4" />
      <path d="M21 17v4" />
    </svg>
  );
}
