"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ShareModal } from "@/components/portal/ShareModal";
import { RxStatusBadge } from "@/components/prescriptions/RxStatusBadge";
import { formatLedgerDate } from "@/lib/stellar/status";
import { truncateHash } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import { PRESCRIPTION_TYPE_LABELS } from "@/lib/decreto41";
import type { OnChainPrescription } from "@/lib/stellar";
import type { Consultation } from "@/lib/consultations/store";
import { clearSession, loadSession, type PasskeySession } from "@/lib/passkey";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import { usePrivyEmail } from "@/hooks/usePrivyEmail";
import { authedFetch } from "@/lib/auth/authed-fetch";
import {
  HomeIcon,
  ChevronRightIcon,
  ShareIcon,
  PillIcon,
  FichaIcon,
  LockIcon,
  LockOpenIcon,
  QrIcon,
  UserIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  InfoIcon,
  HeartPulseIcon,
  SyringeIcon,
  StethoscopeIcon,
  CalendarIcon,
  CheckIcon,
  ClipboardCheckIcon,
} from "@/components/icons/PatientIcons";

import {
  type PatientRx,
  type AuthorizedDoctor,
  type HealthRecord,
  type ClinicalEntry,
  type PatientDBLicense,
  type DBAppointment,
  type PublicDoctor,
  type BookingSlot,
  EMPTY_RECORD,
} from "@/components/patient/types";
import { addDaysPatient } from "@/components/patient/dates";
import { RxPharmacyModal } from "@/components/patient/RxPharmacyModal";
import { SectionHeader } from "@/components/patient/SectionHeader";
import { ExpiryAlerts } from "@/components/patient/ExpiryAlerts";
import { Teleconsultas } from "@/components/patient/Teleconsultas";
import { LoadingList } from "@/components/patient/LoadingList";
import { EmptyRxState } from "@/components/patient/EmptyRxState";
import { PatientLicCard } from "@/components/patient/PatientLicCard";
import { AppointmentCard } from "@/components/patient/AppointmentCard";
import { RequestAppointmentForm } from "@/components/patient/RequestAppointmentForm";

type Tab = "inicio" | "recetas" | "licencias" | "ficha" | "accesos" | "consultas";

// ---------------------------------------------------------------------------
// Mock Rx data (demo mode — no contract connected)
// ---------------------------------------------------------------------------
type MockRx = {
  id: number;
  medication: string;
  dosage: string;
  form: string;
  units_total: number;
  balance: number;
  status: string;
  issued: string;
  expires: string;
  rx_hash: string;
  doctor: string;
};

const MOCK_RX: MockRx[] = [
  { id: 1, medication: "Amoxicilina", dosage: "500mg", form: "Cápsulas", units_total: 30, balance: 18, status: "Active", issued: "2026-06-15", expires: "2026-07-15", rx_hash: "a3f8c2e1b9d4f7e2", doctor: "Dr. Ramírez" },
  { id: 2, medication: "Ibuprofeno", dosage: "400mg", form: "Comprimidos", units_total: 20, balance: 0, status: "Burned", issued: "2026-05-20", expires: "2026-06-20", rx_hash: "9c7b1d3e5f2a8b6c", doctor: "Dra. Chen" },
  { id: 3, medication: "Metformina", dosage: "850mg", form: "Comprimidos", units_total: 90, balance: 45, status: "PartiallyDispensed", issued: "2026-06-01", expires: "2026-09-01", rx_hash: "f1e4a8b3c2d7e9f0", doctor: "Dr. Ramírez" },
];

const MOCK_RX_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  Active: { label: "Activa", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  PartiallyDispensed: { label: "Parcialmente dispensada", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  Burned: { label: "Dispensada", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
  Revoked: { label: "Revocada", bg: "bg-red-50", text: "text-red-600", border: "border-red-200", dot: "bg-red-500" },
  Blocked: { label: "Bloqueada", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  Registered: { label: "Registrada", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
};

const MOCK_AUTHORIZED_DOCTORS: AuthorizedDoctor[] = [
  {
    wallet: "GBQD7XK2Q9YAV4RPLM8W6H5T1BUFS0DQKX9ZE7NR",
    name: "Dra. Valentina Reyes",
    specialty: "Medicina Interna",
    grantedAt: "2026-05-10",
    verified: true,
  },
  {
    wallet: "GCMK8P2NJZR5HVQA3DLM7W4F6C9BUFS0DQKX9ZE7",
    name: "Dr. Carlos Muñoz",
    specialty: "Cardiología",
    grantedAt: "2026-06-02",
    verified: true,
  },
];

// ---------------------------------------------------------------------------
// Root — session gate
// ---------------------------------------------------------------------------
export default function PatientPortal() {
  const { authenticated, user, getAccessToken } = usePrivy();
  const { logout: privyLogout } = useLogout({ onSuccess: () => router.push("/") });
  const router = useRouter();
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // If there's an existing passkey session, use it immediately
    const existing = loadSession("patient");
    if (existing) {
      setSession(existing);
      setReady(true);
      return;
    }

    if (!authenticated) {
      setReady(true);
      return;
    }

    // Privy-authenticated user: fetch their real Stellar wallet
    // Retry up to 3 times — new users need a moment for Privy to finish setup
    (async () => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let address: string | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const token = await getAccessToken();
          const res = await fetch("/api/privy/stellar-wallet", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json() as { address?: string; error?: string };
          if (data.address) { address = data.address; break; }
          if (attempt < 2) await delay(2000);
        } catch {
          if (attempt < 2) await delay(2000);
        }
      }

      if (address) {
        setSession({ role: "patient", address, mock: false });
      } else {
        console.warn("[PatientPortal] stellar wallet unavailable — demo mode");
        setSession({
          role: "patient",
          address:
            process.env.NEXT_PUBLIC_DEMO_PATIENT_WALLET ??
            "GD7WGS7MACGCZCECTNO5V3CH3FORZ2JQYILB5VDCQOYYEAJQOS2V4ZFW",
          mock: true,
        });
      }
      setReady(true);
    })();
  }, [authenticated, getAccessToken]);

  // Extract display email from Privy user
  const privyEmail = usePrivyEmail();

  if (!ready) return null;
  // No session and not authenticated → go to landing
  if (!session) {
    router.push("/");
    return null;
  }
  return (
    <PatientDashboard
      session={session}
      privyEmail={privyEmail}
      onLogout={() => {
        clearSession();
        setSession(null);
        privyLogout(); // logs out from Privy + redirects to /
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Dashboard shell
// ---------------------------------------------------------------------------
function PatientDashboardInner({
  session,
  onLogout,
  privyEmail,
}: {
  session: PasskeySession;
  onLogout: () => void;
  privyEmail?: string | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = (searchParams.get("tab") as Tab) ?? "inicio";
  const [items, setItems] = useState<PatientRx[] | null>(null);
  const [rxError, setRxError] = useState<string | null>(null);
  const [share, setShare] = useState<OnChainPrescription | null>(null);
  const [pharmacyRx, setPharmacyRx] = useState<PatientRx | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);

  // Authorized doctors — mock in demo, empty in real (grants live in chain)
  const authorizedDoctors: AuthorizedDoctor[] = session.mock
    ? MOCK_AUTHORIZED_DOCTORS
    : [];

  const loadRx = useCallback(async () => {
    setItems(null);
    setRxError(null);
    try {
      const res = await authedFetch(
        `/api/prescriptions?role=patient&wallet=${session.address}`,
      );
      const data = await res.json();
      setItems(data.prescriptions ?? []);
      if (data.error) setRxError(data.error);
    } catch {
      setRxError("No se pudieron cargar las recetas");
      setItems([]);
    }
  }, [session.address]);

  useEffect(() => {
    loadRx();
  }, [loadRx]);

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
        // Non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.address]);

  // Active RX count (not expired)
  const activeRxCount = useMemo(
    () => items?.filter((rx) => !rx.expired).length ?? 0,
    [items],
  );

  // Info bar — user identity shown above tab content
  const [copied, setCopied] = useState(false);
  function copyAddress() {
    navigator.clipboard.writeText(session.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      {/* Session info bar */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* Avatar circle */}
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-600">
            {privyEmail ? privyEmail[0].toUpperCase() : "P"}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800 leading-none">
              {privyEmail ?? "Paciente"}
            </p>
            <button
              onClick={copyAddress}
              title="Copiar dirección completa"
              className="flex items-center gap-1 group text-left"
            >
              <p className="text-[11px] text-slate-400 font-mono mt-0.5 group-hover:text-sky-500 transition-colors">
                {truncateHash(session.address, 6, 6)}
              </p>
              <span className="text-[10px] text-slate-300 group-hover:text-sky-400 transition-colors mt-0.5">
                {copied ? "✓" : "⎘"}
              </span>
            </button>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-rose-50 hover:text-rose-500"
        >
          Salir
        </button>
      </div>

      {/* Tab content */}
      {tab === "inicio" && (
        <InicioTab
          session={session}
          activeRxCount={activeRxCount}
          authorizedDoctors={authorizedDoctors}
          onGoToRecetas={() => router.push("/patient?tab=recetas")}
          onGoToFicha={() => router.push("/patient?tab=ficha")}
          onGoToConsultas={() => router.push("/patient?tab=consultas")}
        />
      )}
      {tab === "recetas" && (
        <RecetasTab
          items={items}
          error={rxError}
          consultations={consultations}
          onReload={loadRx}
          onShare={setShare}
          onShowPharmacy={setPharmacyRx}
          wallet={session.address}
          mock={session.mock}
        />
      )}
      {tab === "licencias" && <LicenciasTab />}
      {tab === "ficha" && (
        <FichaTab wallet={session.address} mock={session.mock} />
      )}
      {tab === "accesos" && (
        <AccesosTab wallet={session.address} mock={session.mock} />
      )}
      {tab === "consultas" && (
        <ConsultasTab wallet={session.address} mock={session.mock} />
      )}

      {share && (
        <ShareModal
          rx={share}
          patientWallet={session.address}
          onClose={() => setShare(null)}
        />
      )}

      {pharmacyRx && (
        <RxPharmacyModal rx={pharmacyRx} onClose={() => setPharmacyRx(null)} />
      )}
    </div>
  );
}

function PatientDashboard({
  session,
  onLogout,
  privyEmail,
}: {
  session: PasskeySession;
  onLogout: () => void;
  privyEmail?: string | null;
}) {
  return (
    <Suspense>
      <PatientDashboardInner session={session} onLogout={onLogout} privyEmail={privyEmail} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// NEW: Inicio Tab — home screen for the patient
// ---------------------------------------------------------------------------
function InicioTab({
  session,
  activeRxCount,
  authorizedDoctors,
  onGoToRecetas,
  onGoToFicha,
  onGoToConsultas,
}: {
  session: PasskeySession;
  activeRxCount: number;
  authorizedDoctors: AuthorizedDoctor[];
  onGoToRecetas: () => void;
  onGoToFicha: () => void;
  onGoToConsultas: () => void;
}) {
  const privyEmail = usePrivyEmail();
  const displayName = privyEmail ?? "Mi portal";
  const avatarLetter = privyEmail ? privyEmail[0].toUpperCase() : "P";

  return (
    <div className="space-y-5">
      {/* ── Patient hero card ── */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-clinical to-clinical/80 p-6 text-white shadow-lg shadow-clinical/20">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30 text-2xl font-bold">
            {avatarLetter}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/70">Portal del paciente</p>
            <h2 className="text-xl font-semibold truncate">
              {displayName}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-white/60">
              {truncateHash(session.address, 6, 4)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Recetas activas
          </p>
          <p className="mt-1 text-3xl font-bold text-ink">{activeRxCount}</p>
          <p className="mt-0.5 text-xs text-muted">on-chain</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Médicos con acceso
          </p>
          <p className="mt-1 text-3xl font-bold text-ink">
            {authorizedDoctors.length}
          </p>
          <p className="mt-0.5 text-xs text-muted">autorizados</p>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Acceso rápido
        </h2>

        {/* Primary CTA — Ver recetas */}
        <button
          onClick={onGoToRecetas}
          className="flex w-full items-center gap-4 rounded-2xl border border-clinical/20 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.98] hover:border-clinical/40 hover:shadow-md"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
            <PillIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Ver mis recetas</p>
            <p className="text-sm text-muted">
              {activeRxCount > 0
                ? `${activeRxCount} receta${activeRxCount !== 1 ? "s" : ""} activa${activeRxCount !== 1 ? "s" : ""}`
                : "Sin recetas activas"}
            </p>
          </div>
          {activeRxCount > 0 && (
            <span className="shrink-0 rounded-full bg-clinical px-2.5 py-1 text-xs font-bold text-white">
              {activeRxCount}
            </span>
          )}
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>

        {/* Secondary CTA — Mi ficha */}
        <button
          onClick={onGoToFicha}
          className="flex w-full items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.98] hover:border-slate-300 hover:shadow-md"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-ink">
            <FichaIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Mi ficha médica</p>
            <p className="text-sm text-muted">Historial, alergias, condiciones</p>
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>

        {/* Consultas CTA */}
        <button
          onClick={onGoToConsultas}
          className="flex w-full items-center gap-4 rounded-2xl border border-emerald-100 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.98] hover:border-emerald-200 hover:shadow-md"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <CalendarIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Mis consultas</p>
            <p className="text-sm text-muted">Citas agendadas y próximas visitas</p>
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>
      </div>

      {/* ── Active doctors ── */}
      {authorizedDoctors.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Médicos con acceso activo
          </h2>
          <div className="space-y-2">
            {authorizedDoctors.map((doc) => (
              <div
                key={doc.wallet}
                className="flex items-center gap-3 rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/70"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-clinical/10 text-clinical">
                  <StethoscopeIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{doc.name}</p>
                  <p className="text-xs text-muted">{doc.specialty}</p>
                </div>
                {doc.verified && (
                  <ShieldCheckIcon className="h-4 w-4 shrink-0 text-mint" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted/70">
        © 2026 Browns Studio · TrustLeaf · Stellar Testnet
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Mis Recetas — redesigned with RxCard
// ---------------------------------------------------------------------------
function RecetasTab({
  items,
  error,
  consultations,
  onReload,
  onShare,
  onShowPharmacy,
  wallet,
  mock,
}: {
  items: PatientRx[] | null;
  error: string | null;
  consultations: Consultation[];
  onReload: () => void;
  onShare: (rx: OnChainPrescription) => void;
  onShowPharmacy: (rx: PatientRx) => void;
  wallet: string;
  mock?: boolean;
}) {
  const showMock = mock && (items === null || items.length === 0);

  return (
    <div className="space-y-4">
      {consultations.length > 0 && <Teleconsultas items={consultations} />}

      {items === null ? (
        <LoadingList />
      ) : showMock ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-200/70">
            <InfoIcon className="h-3.5 w-3.5 shrink-0" />
            Datos de demostración · no conectado a la blockchain
          </div>
          {MOCK_RX.map((rx) => (
            <MockRxCard key={rx.id} rx={rx} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyRxState error={error} onRetry={onReload} />
      ) : (
        <div className="space-y-4">
          {error && <p className="text-xs text-amber-600">Aviso: {error}</p>}
          <ExpiryAlerts items={items} />
          {items.map((rx) => (
            <RxCard
              key={rx.id}
              rx={rx}
              onShowPharmacy={onShowPharmacy}
              onShare={onShare}
              onReload={onReload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RxCard — real on-chain prescription card (redesigned)
// ---------------------------------------------------------------------------
function RxCard({
  rx,
  onShowPharmacy,
  onShare,
  onReload,
}: {
  rx: PatientRx;
  onShowPharmacy: (rx: PatientRx) => void;
  onShare: (rx: OnChainPrescription) => void;
  onReload: () => void;
}) {
  const pct = rx.unitsTotal > 0 ? (rx.balance / rx.unitsTotal) * 100 : 0;
  const barColor =
    pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-rose-500";

  // A prescription that is still "Registrada" (and not expired) can be
  // activated by the patient — this flips it to "Activa" on-chain.
  const canActivate = rx.status === "Registrada" && !rx.expired;
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  async function handleActivate() {
    setActivating(true);
    setActivateError(null);
    try {
      const res = await authedFetch("/api/prescriptions/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rxId: rx.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setActivateError(data.error ?? "No se pudo activar la receta");
        return;
      }
      onReload();
    } catch {
      setActivateError("No se pudo activar la receta");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      {/* ── Status bar ── */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <RxStatusBadge status={rx.status} expired={rx.expired} />
        {rx.prescriptionType && (
          <Badge tone="clinical">
            {PRESCRIPTION_TYPE_LABELS[rx.prescriptionType]}
          </Badge>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted">
          #{rx.id}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* ── Medication ── */}
        <div>
          <h3 className="text-lg font-semibold leading-tight text-ink">
            {rx.medication}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{rx.dosage}</p>
          {rx.diagnosis && (
            <p className="mt-0.5 text-xs text-muted">
              {rx.diagnosis}
              {rx.cie10Code ? ` (${rx.cie10Code})` : ""}
            </p>
          )}
        </div>

        {/* ── Units progress bar ── */}
        {rx.unitsTotal > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted">
              <span>Unidades disponibles</span>
              <span className="font-semibold text-ink">
                {rx.balance}/{rx.unitsTotal}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  barColor,
                )}
                style={{
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ── Calendar dates ── */}
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              Emitida{" "}
              <span className="font-medium text-ink">
                {formatLedgerDate(rx.timestamp)}
              </span>
            </span>
          </div>
          {rx.expiresAt > 0 && (
            <div
              className={cn(
                "flex items-center gap-1.5",
                rx.expired
                  ? "font-medium text-rose-600"
                  : rx.expiringSoon
                    ? "font-medium text-amber-600"
                    : "",
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              <span>
                {rx.expired ? "Expiró" : "Vence"}{" "}
                <span className="font-medium">
                  {formatLedgerDate(rx.expiresAt)}
                </span>
                {rx.expiringSoon && !rx.expired && (
                  <span className="ml-1 text-amber-500">
                    ({rx.daysLeft}d)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* ── Footer: hash + actions ── */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1.5">
            <LockIcon className="h-3.5 w-3.5 text-muted/60" />
            <span className="font-mono text-[10px] text-muted/70">
              {truncateHash(rx.doctorWallet, 4, 4)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onShare(rx)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50"
            >
              <ShareIcon /> Compartir
            </button>
            {canActivate ? (
              <button
                onClick={handleActivate}
                disabled={activating}
                className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:pointer-events-none disabled:opacity-50"
              >
                <LockOpenIcon className="h-3.5 w-3.5" />
                {activating ? "Activando…" : "Activar"}
              </button>
            ) : (
              <button
                onClick={() => onShowPharmacy(rx)}
                disabled={rx.expired}
                className="flex items-center gap-1 rounded-lg bg-clinical/10 px-2.5 py-1.5 text-xs font-semibold text-clinical transition-colors hover:bg-clinical/20 disabled:pointer-events-none disabled:opacity-40"
              >
                <QrIcon /> Ver QR
              </button>
            )}
          </div>
        </div>
        {activateError && (
          <p className="text-right text-[11px] text-rose-500">{activateError}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockRxCard — demo mode prescription card
// ---------------------------------------------------------------------------
function MockRxCard({ rx }: { rx: MockRx }) {
  const cfg =
    MOCK_RX_STATUS_CONFIG[rx.status] ?? MOCK_RX_STATUS_CONFIG.Registered;
  const pct =
    rx.units_total > 0 ? (rx.balance / rx.units_total) * 100 : 0;
  const barColor =
    pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-rose-500";
  const shortHash = `${rx.rx_hash.slice(0, 8)}...${rx.rx_hash.slice(-4)}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      {/* ── Status bar ── */}
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-2.5",
          cfg.bg,
          cfg.border,
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
        <span className={cn("text-xs font-semibold", cfg.text)}>
          {cfg.label}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted">
          #{rx.id}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* ── Medication ── */}
        <div>
          <h3 className="text-lg font-semibold leading-tight text-ink">
            {rx.medication}
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {rx.dosage} · {rx.form}
          </p>
          <p className="mt-0.5 text-xs text-muted">{rx.doctor}</p>
        </div>

        {/* ── Units progress bar ── */}
        {rx.units_total > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted">
              <span>Unidades disponibles</span>
              <span className="font-semibold text-ink">
                {rx.balance}/{rx.units_total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", barColor)}
                style={{
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ── Calendar dates ── */}
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              Emitida{" "}
              <span className="font-medium text-ink">{rx.issued}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              Vence{" "}
              <span className="font-medium text-ink">{rx.expires}</span>
            </span>
          </div>
        </div>

        {/* ── Footer: hash + QR button ── */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1.5">
            <LockIcon className="h-3.5 w-3.5 text-muted/60" />
            <span className="font-mono text-[10px] text-muted/70">
              {shortHash}
            </span>
          </div>
          {rx.status === "Active" && (
            <button className="flex items-center gap-1 rounded-lg bg-clinical/10 px-2.5 py-1.5 text-xs font-semibold text-clinical transition-colors hover:bg-clinical/20">
              <QrIcon /> Ver QR
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Mi Ficha Médica (mejorada)
// ---------------------------------------------------------------------------
interface ClinicalDoc {
  id: number;
  category: string;
  title: string;
  file_name: string | null;
  mime_type: string | null;
  content_hash: string;
  tx_hash: string | null;
  mode: string;
  created_at: string;
}

function FichaTab({ wallet, mock }: { wallet: string; mock: boolean }) {
  const privyEmail   = usePrivyEmail();
  const displayName  = privyEmail ?? (mock ? "Mi Cuenta" : "Tu perfil");
  const avatarLetter = privyEmail ? privyEmail[0].toUpperCase() : "P";

  const [record,    setRecord]    = useState<HealthRecord | null>(null);
  const [entries,   setEntries]   = useState<ClinicalEntry[]>([]);
  const [docs,      setDocs]      = useState<ClinicalDoc[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showEdit,  setShowEdit]  = useState(false);

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
    fetch(`/api/ficha/entries?patientEmail=${encodeURIComponent(privyEmail)}`)
      .then(r => r.json() as Promise<{ entries?: ClinicalEntry[] }>)
      .then(j => setEntries(j.entries ?? []))
      .catch(() => setEntries([]));
    // Exam / lab documents attached by the patient's doctors.
    authedFetch(`/api/ficha/document?patientEmail=${encodeURIComponent(privyEmail)}`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then((j: { documents?: ClinicalDoc[] }) => setDocs(j.documents ?? []))
      .catch(() => setDocs([]));
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
          Tu ficha médica vive on-chain en Soroban — solo los médicos con acceso
          que tú autoricen pueden verla completa.{" "}
          {mock
            ? "Datos de ejemplo · tu historial real estará aquí cuando conectes tu wallet."
            : "Los datos de resumen se leen desde tu wallet."}
        </p>
      </div>

      {/* ── Identity card ── */}
      <Card className="p-0">
        <div className="flex items-center gap-4 border-b border-slate-200/70 px-6 py-5">
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
                        {doc.category}
                      </span>
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
                  <button
                    onClick={() => void viewDoc(doc.id)}
                    className="shrink-0 rounded-lg bg-clinical/10 px-3 py-1.5 text-xs font-semibold text-clinical transition-colors hover:bg-clinical/20"
                  >
                    Ver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
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
            Tus datos personales no están en la blockchain. Solo tu wallet
            actúa como identificador — el resto vive cifrado, bajo tu control,
            y solo los médicos que tú autoricen pueden leerlo.
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-muted/70">
        © 2026 Browns Studio · TrustLeaf · Datos anclados en Stellar Testnet
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Mis Licencias Médicas — real DB
// ---------------------------------------------------------------------------
function LicenciasTab() {
  const privyEmail = usePrivyEmail();
  const [licencias, setLicencias] = useState<PatientDBLicense[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!privyEmail) { setLoading(false); return; }
    setLoading(true);
    authedFetch(`/api/licenses?patientEmail=${encodeURIComponent(privyEmail)}`)
      .then(r => r.json() as Promise<{ data?: PatientDBLicense[] }>)
      .then(json => { if (json.data) setLicencias(json.data); })
      .catch(err => console.error('[LicenciasTab patient]', err))
      .finally(() => setLoading(false));
  }, [privyEmail]);

  const active  = licencias.filter(l => l.status === 'signed' && new Date(addDaysPatient(l.fecha_inicio, l.dias) + 'T23:59:59') >= new Date());
  const past    = licencias.filter(l => l.status !== 'signed' || new Date(addDaysPatient(l.fecha_inicio, l.dias) + 'T23:59:59') < new Date());

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200/60 bg-violet-50/40 px-4 py-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
        <p className="text-xs leading-relaxed text-violet-800">
          <span className="font-semibold">Licencias médicas on-chain.</span>{" "}
          Cada licencia emitida por tu médico queda registrada en Stellar
          Soroban — verificable por empleadores e instituciones de salud.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-violet-500" />
        </div>
      ) : licencias.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
            <ClipboardCheckIcon className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium text-ink">Sin licencias registradas</p>
          <p className="mt-1 text-xs text-muted">
            Tus licencias médicas aparecerán aquí cuando un médico las emita on-chain.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Vigentes</p>
              <div className="space-y-3">
                {active.map(lic => <PatientLicCard key={lic.id} lic={lic} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Historial</p>
              <div className="space-y-3">
                {past.map(lic => <PatientLicCard key={lic.id} lic={lic} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Mis Accesos (grant / revoke doctor access)
// ---------------------------------------------------------------------------
function AccesosTab({ wallet, mock }: { wallet: string; mock: boolean }) {
  const [doctors, setDoctors] = useState<AuthorizedDoctor[]>(
    mock ? MOCK_AUTHORIZED_DOCTORS : [],
  );
  const [grantWallet, setGrantWallet] = useState("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "ok" | "err";
    msg: string;
  } | null>(null);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!grantWallet.trim() || !grantWallet.startsWith("G")) return;
    setGranting(true);
    setNotice(null);

    // Demo: simulated grant (real: call smart contract)
    await new Promise((r) => setTimeout(r, 1200));
    setDoctors((prev) => [
      ...prev,
      {
        wallet: grantWallet.trim(),
        name: "Médico " + truncateHash(grantWallet.trim(), 4, 3),
        specialty: "Pendiente de verificación",
        grantedAt: new Date().toISOString().split("T")[0],
        verified: false,
      },
    ]);
    setNotice({
      type: "ok",
      msg: `Acceso otorgado a ${truncateHash(grantWallet.trim(), 6, 4)}. La transacción se ancló en Soroban (simulado).`,
    });
    setGrantWallet("");
    setGranting(false);
  }

  async function handleRevoke(doc: AuthorizedDoctor) {
    setRevoking(doc.wallet);
    setNotice(null);
    await new Promise((r) => setTimeout(r, 1000));
    setDoctors((prev) => prev.filter((d) => d.wallet !== doc.wallet));
    setNotice({
      type: "ok",
      msg: `Acceso revocado para ${doc.name}. El grant se eliminó del contrato (simulado).`,
    });
    setRevoking(null);
  }

  return (
    <div className="space-y-5">
      {/* Privacy banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-clinical/20 bg-clinical-50/60 px-4 py-3.5">
        <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-clinical" />
        <p className="text-xs leading-relaxed text-clinical-600">
          <span className="font-semibold">Tú decides quién ve tu ficha.</span>{" "}
          Cada acceso es un grant on-chain en Soroban. Los médicos sin
          autorización no pueden leer tus datos médicos — ni siquiera el equipo
          de TrustLeaf.
        </p>
      </div>

      {/* Notice */}
      {notice && (
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-xs ring-1 ring-inset",
            notice.type === "ok"
              ? "bg-mint-50 text-mint ring-mint/20"
              : "bg-rose-50 text-rose-600 ring-rose-500/20",
          )}
        >
          {notice.msg}
        </div>
      )}

      {/* Authorized doctors list */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-ink">Médicos con acceso</h2>
            <p className="text-xs text-muted">
              {doctors.length === 0
                ? "Aún no has autorizado a ningún médico."
                : `${doctors.length} médico${doctors.length > 1 ? "s" : ""} con acceso a tu ficha`}
            </p>
          </div>
          {mock && <Badge tone="muted">demo</Badge>}
        </div>

        {doctors.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-muted">
              <LockOpenIcon className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted">
              Usa el formulario abajo para autorizar a tu médico.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100/80">
            {doctors.map((doc) => (
              <div
                key={doc.wallet}
                className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-clinical-50 text-clinical">
                    <StethoscopeIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{doc.name}</p>
                      {doc.verified ? (
                        <Badge tone="mint">
                          <ShieldCheckIcon className="h-3 w-3" /> Verificado
                        </Badge>
                      ) : (
                        <Badge tone="muted">Pendiente</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted">{doc.specialty}</p>
                    <p className="font-mono text-[10px] text-muted/70">
                      {truncateHash(doc.wallet, 6, 4)} · desde {doc.grantedAt}
                    </p>
                  </div>
                </div>
                <button
                  disabled={revoking === doc.wallet}
                  onClick={() => handleRevoke(doc)}
                  className="min-h-[44px] shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-rose-500 ring-1 ring-inset ring-rose-500/30 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  {revoking === doc.wallet ? "Revocando…" : "Revocar acceso"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Grant access form */}
      <Card className="p-0">
        <div className="border-b border-slate-200/70 px-6 py-5">
          <h2 className="text-base font-semibold text-ink">Autorizar nuevo médico</h2>
          <p className="text-xs text-muted">
            Ingresa la wallet Stellar (G…) del médico que quieres que acceda a tu ficha.
          </p>
        </div>
        <form onSubmit={handleGrant} className="px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              Wallet del médico <span className="text-rose-500">*</span>
            </span>
            <input
              value={grantWallet}
              onChange={(e) => setGrantWallet(e.target.value)}
              placeholder="GBQD7XK2Q9YAVN4RPLM8W6H5T…"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-base text-ink placeholder:font-sans placeholder:text-sm placeholder:text-muted/60 focus:border-clinical focus:outline-none focus:ring-2 focus:ring-clinical/20"
            />
          </label>
          {grantWallet && !grantWallet.startsWith("G") && (
            <p className="mt-1.5 text-xs text-rose-500">Las wallets Stellar empiezan con "G"</p>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={granting || !grantWallet.trim() || !grantWallet.startsWith("G")}
            >
              {granting ? "Firmando grant…" : "Autorizar acceso"}
            </Button>
          </div>
        </form>
      </Card>

      <p className="text-center text-xs text-muted/70">
        © 2026 Browns Studio · TrustLeaf · Stellar Testnet
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Mis Consultas — citas reales desde la BD
// ---------------------------------------------------------------------------

function ConsultasTab({ wallet: _wallet, mock }: { wallet: string; mock: boolean }) {
  const privyEmail = usePrivyEmail();
  const [appointments, setAppointments] = useState<DBAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Fetch real appointments by patient email
  const loadAppts = useCallback(() => {
    if (!privyEmail) { setLoading(false); return; }
    authedFetch(`/api/appointments?patientEmail=${encodeURIComponent(privyEmail)}`)
      .then((r) => r.json())
      .then((data: { appointments?: DBAppointment[] }) => {
        setAppointments(data.appointments ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [privyEmail]);

  useEffect(() => { loadAppts(); }, [loadAppts]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const isUpcoming = (s: DBAppointment['status']) => s === 'scheduled' || s === 'in_progress';

  const upcoming = appointments.filter(
    (a) => a.date.slice(0, 10) >= todayISO && isUpcoming(a.status)
  ).sort((a, b) => a.date.localeCompare(b.date) || a.time_slot.localeCompare(b.time_slot));

  const past = appointments.filter(
    (a) => a.date.slice(0, 10) < todayISO || !isUpcoming(a.status)
  ).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CalendarIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">Mis consultas</h1>
            <p className="text-sm text-muted">
              {privyEmail ?? 'Cargando…'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Solicitar
        </button>
      </div>

      {mock && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Modo demo — las citas de tu médico asignado aparecerán aquí cuando se conecte una cuenta real.
        </div>
      )}

      {/* Request form (inline) */}
      {showForm && privyEmail && (
        <RequestAppointmentForm
          patientEmail={privyEmail}
          onSaved={(a) => {
            setAppointments((prev) => [...prev, a]);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Próximas citas ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-muted">
                  <CalendarIcon className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-ink">Sin citas próximas</p>
                <p className="mt-1 text-xs text-muted">
                  Cuando un médico te agende una consulta, aparecerá aquí.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((a) => (
                  <AppointmentCard key={a.id} appt={a} patientEmail={privyEmail ?? ''} onReload={loadAppts} />
                ))}
              </div>
            )}
          </section>

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Historial ({past.length})
              </h2>
              <div className="space-y-3">
                {past.map((a) => (
                  <AppointmentCard key={a.id} appt={a} patientEmail={privyEmail ?? ''} onReload={loadAppts} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

