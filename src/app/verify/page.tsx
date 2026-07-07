/**
 * /verify?token=... — public prescription verifier.
 * ---------------------------------------------------------------------------
 * No login. Validates the short-lived share token (signature + 15-min expiry),
 * then reads the prescription straight from Soroban Testnet and displays it.
 * A pharmacy scans the patient's QR and lands here.
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RxStatusBadge } from "@/components/prescriptions/RxStatusBadge";
import { verifyShareToken } from "@/lib/share/token";
import { getPrescription, getDoctor } from "@/lib/stellar/client";
import { statusMeta, formatLedgerDate } from "@/lib/stellar/status";
import { PRESCRIPTION_TYPE_LABELS } from "@/lib/decreto41";
import {
  truncateHash,
  STELLAR_EXPERT_CONTRACT,
  CONTRACT_IDS,
} from "@/lib/stellar/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="relative min-h-screen bg-canvas bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-spotlight" />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10">
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

        {!token ? (
          <StateCard
            tone="muted"
            title="Sin token de verificación"
            body="Este enlace no incluye un token. Escanea el código QR desde la app del paciente."
          />
        ) : (
          <VerifiedContent token={token} />
        )}

        <p className="mt-8 text-center text-xs text-muted/80">
          Verificación pública · lectura directa desde Stellar Soroban Testnet
        </p>
      </div>
    </main>
  );
}

async function VerifiedContent({ token }: { token: string }) {
  const result = await verifyShareToken(token);

  if (!result.valid) {
    return result.reason === "expired" ? (
      <StateCard
        tone="rose"
        title="El enlace expiró"
        body="Los tokens de acceso a recetas caducan a los 15 minutos por seguridad. Pídele al paciente que genere uno nuevo."
      />
    ) : (
      <StateCard
        tone="rose"
        title="Token inválido"
        body="No pudimos validar la firma de este enlace. Puede haber sido alterado."
      />
    );
  }

  const rx = await getPrescription(result.claims.rxId);
  if (!rx) {
    return (
      <StateCard
        tone="rose"
        title="Receta no encontrada"
        body={`No existe una prescripción con id ${result.claims.rxId} en la red.`}
      />
    );
  }

  const doctor = await getDoctor(rx.doctorWallet);
  const meta = statusMeta(rx.status);
  const minutesLeft = Math.max(
    0,
    Math.round((result.expiresAt - Date.now()) / 60000),
  );

  return (
    <Card className="w-full p-0">
      {/* Header band */}
      <div
        className={`rounded-t-3xl px-6 py-5 ${
          meta.active
            ? "bg-gradient-to-br from-clinical via-indigo-600 to-indigo-700"
            : "bg-gradient-to-br from-slate-600 to-slate-800"
        } text-white`}
      >
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <ShieldCheck /> Receta verificada on-chain
          </div>
          <RxStatusBadge status={rx.status} />
        </div>
        <p className="mt-4 text-2xl font-semibold">{rx.medication}</p>
        <p className="text-sm text-white/80">{rx.dosage}</p>
      </div>

      <div className="space-y-1 px-6 py-5">
        <Row label="Prescripción" value={`#${rx.id}`} />
        <Row
          label="Médico"
          value={doctor?.fullName ?? truncateHash(rx.doctorWallet)}
          sub={doctor?.licenseId ? `Registro ${doctor.licenseId}` : undefined}
        />
        <Row label="Paciente" value={truncateHash(rx.patientWallet)} mono />
        {rx.prescriptionType && (
          <Row
            label="Tipo de receta"
            value={PRESCRIPTION_TYPE_LABELS[rx.prescriptionType]}
          />
        )}
        {rx.diagnosis && (
          <Row
            label="Diagnóstico"
            value={rx.diagnosis}
            sub={rx.cie10Code ? `CIE-10 ${rx.cie10Code}` : undefined}
          />
        )}
        <Row
          label="Unidades"
          value={`${rx.balance} / ${rx.unitsTotal} disponibles`}
        />
        {typeof rx.refills === "number" && (
          <Row label="Repeticiones permitidas" value={String(rx.refills)} />
        )}
        <Row label="Emitida" value={formatLedgerDate(rx.timestamp)} />
        <Row
          label="rx_hash (SHA-256)"
          value={truncateHash(rx.rxHash, 10, 8)}
          sub="Ancla la ficha FHIR completa (Decreto 41)"
          mono
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Badge tone="muted">Acceso válido {minutesLeft} min más</Badge>
        <a
          href={STELLAR_EXPERT_CONTRACT(CONTRACT_IDS.prescriptionSoulbound)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-clinical transition-colors hover:text-clinical-600"
        >
          Ver contrato en Stellar Expert →
        </a>
      </div>
    </Card>
  );
}

function Row({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="text-right">
        <span
          className={`text-sm font-medium text-ink ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </dd>
    </div>
  );
}

function StateCard({
  tone,
  title,
  body,
}: {
  tone: "rose" | "muted";
  title: string;
  body: string;
}) {
  return (
    <Card className="w-full text-center">
      <div
        className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
          tone === "rose"
            ? "bg-rose-50 text-rose-500 ring-1 ring-rose-500/20"
            : "bg-slate-100 text-muted ring-1 ring-slate-200"
        }`}
      >
        <AlertIcon />
      </div>
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </Card>
  );
}

function ShieldCheck() {
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
