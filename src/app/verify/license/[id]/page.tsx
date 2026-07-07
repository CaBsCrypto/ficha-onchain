/**
 * /verify/license/[id] — public document verification (no auth required).
 * ---------------------------------------------------------------------------
 * Reads the document directly from Soroban via getDocument(). No share token
 * needed — documents are permanently verifiable by ID, unlike prescriptions
 * which require a 15-minute share token for privacy.
 *
 * This page is safe to share / embed in QR codes.
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getDocument } from "@/lib/stellar/documents";
import { DOC_LABEL, DOC_CATEGORY } from "@/lib/fhir/documents";
import { truncateHash, STELLAR_EXPERT_CONTRACT, CONTRACT_IDS } from "@/lib/stellar/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VerifyLicensePage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="relative min-h-screen bg-canvas bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-spotlight" />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10">
        {/* Logo */}
        <Link
          href="/"
          className="mb-8 flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-sm font-bold text-white shadow-sm shadow-clinical/30">
            T
          </span>
          <span className="text-ink">
            Trust<span className="text-clinical">Leaf</span>
          </span>
        </Link>

        <VerifiedContent id={id} />

        <p className="mt-8 text-center text-xs text-muted/80">
          Verificación pública · lectura directa desde Stellar Soroban Testnet
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main verification component
// ---------------------------------------------------------------------------

async function VerifiedContent({ id }: { id: string }) {
  if (!id || isNaN(Number(id))) {
    return (
      <StateCard
        valid={false}
        title="ID de documento inválido"
        body="El identificador en esta URL no es un ID de documento válido."
      />
    );
  }

  const doc = await getDocument(id);

  if (!doc) {
    return (
      <StateCard
        valid={false}
        title="Documento no encontrado"
        body={`No existe un documento con id ${id} en la red Soroban Testnet, o el contrato aún no está desplegado.`}
      />
    );
  }

  const label = DOC_LABEL[doc.docType];
  const category = DOC_CATEGORY[doc.docType];
  const isValid = doc.status === "active";
  const categoryLabel = CATEGORY_LABEL_MAP[category] ?? category;
  const categoryColor = CATEGORY_COLOR_MAP[category] ?? "bg-slate-600";

  return (
    <Card className="w-full p-0">
      {/* ── Header band ───────────────────────────────────────────────────── */}
      <div
        className={`rounded-t-3xl px-6 py-5 ${
          isValid
            ? "bg-gradient-to-br from-clinical via-indigo-600 to-indigo-700"
            : "bg-gradient-to-br from-slate-600 to-slate-800"
        } text-white`}
      >
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <ShieldCheckIcon />
            {isValid ? "Documento verificado on-chain" : "Documento inválido"}
          </div>
          <StatusBadge status={doc.status} />
        </div>
        <p className="mt-4 text-2xl font-semibold leading-tight">{label}</p>
        <p className="mt-1 text-sm text-white/80">{categoryLabel}</p>
      </div>

      {/* ── Details ─────────────────────────────────────────────────────── */}
      <div className="space-y-0 px-6 py-5">
        <Row label="Documento" value={`#${doc.id}`} />
        <Row label="Tipo" value={label} />
        <Row label="Categoría" value={categoryLabel} />
        <Row label="Emisor" value={truncateHash(doc.issuerWallet)} mono />
        <Row label="Destinatario" value={truncateHash(doc.recipientWallet)} mono />
        <Row label="Emitido" value={formatDate(doc.issuedAt)} />
        {doc.expiresAt > 0 && (
          <Row label="Vence" value={formatDate(doc.expiresAt)} />
        )}
        <Row
          label="content_hash (SHA-256)"
          value={truncateHash(doc.contentHash, 12, 10)}
          mono
        />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-t border-slate-200/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${isValid ? "bg-mint" : "bg-slate-400"}`}
          />
          <span className="text-sm text-muted">
            {isValid ? "Estado activo" : "Estado inactivo"}
          </span>
        </div>
        {CONTRACT_IDS.documentSoulbound && (
          <a
            href={STELLAR_EXPERT_CONTRACT(CONTRACT_IDS.documentSoulbound)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-clinical transition-colors hover:text-clinical-600"
          >
            Ver contrato en Stellar Expert →
          </a>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABEL_MAP: Record<string, string> = {
  medical_certificate: "Certificado Médico",
  professional_license: "Licencia Profesional",
  mental_health: "Certificado de Salud Mental",
};

const CATEGORY_COLOR_MAP: Record<string, string> = {
  medical_certificate: "bg-clinical",
  professional_license: "bg-amber-500",
  mental_health: "bg-mint",
};

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Activo", className: "bg-mint/20 text-mint" },
    revoked: { label: "Revocado", className: "bg-rose-500/20 text-rose-300" },
    expired: { label: "Expirado", className: "bg-slate-400/20 text-slate-300" },
  };
  const { label, className } = map[status] ?? { label: status, className: "bg-white/20 text-white" };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd
        className={`text-right text-sm font-medium text-ink ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function StateCard({
  valid,
  title,
  body,
}: {
  valid: boolean;
  title: string;
  body: string;
}) {
  return (
    <Card className="w-full text-center">
      <div
        className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
          valid
            ? "bg-mint-50 text-mint ring-1 ring-mint/20"
            : "bg-rose-50 text-rose-500 ring-1 ring-rose-500/20"
        }`}
      >
        <AlertIcon />
      </div>
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
      <path
        d="M12 9v4m0 4h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
