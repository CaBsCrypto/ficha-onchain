"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AccessScreen } from "@/components/portal/AccessScreen";
import { ShareModal } from "@/components/portal/ShareModal";
import { RxStatusBadge } from "@/components/prescriptions/RxStatusBadge";
import { formatLedgerDate } from "@/lib/stellar/status";
import { truncateHash } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import { PRESCRIPTION_TYPE_LABELS } from "@/lib/decreto41";
import type { OnChainPrescription, WithExpiry } from "@/lib/stellar";
import type { Consultation } from "@/lib/consultations/store";
import { clearSession, loadSession, type PasskeySession } from "@/lib/passkey";
import {
  HomeIcon,
  ChevronRightIcon,
  CloseIcon,
  ShareIcon,
  PillIcon,
  FichaIcon,
  LockIcon,
  LockOpenIcon,
  QrIcon,
  VideoIcon,
  UserIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  ClockIcon,
  InfoIcon,
  HeartPulseIcon,
  SyringeIcon,
  StethoscopeIcon,
  CalendarIcon,
  CheckIcon,
  ClipboardCheckIcon,
} from "@/components/icons/PatientIcons";

type PatientRx = WithExpiry<OnChainPrescription>;
type Tab = "inicio" | "recetas" | "licencias" | "ficha" | "accesos";

// ---------------------------------------------------------------------------
// Mock health record data (demo mode — labeled clearly in UI)
// ---------------------------------------------------------------------------
const MOCK_FICHA = {
  bloodType: "A+",
  allergies: ["Penicilina", "AINES (ibuprofeno)"],
  conditions: [
    { label: "Hipertensión arterial", since: "2021", controlled: true },
    { label: "Hipotiroidismo", since: "2019", controlled: true },
  ],
  lastVisit: "2026-06-18",
  nextAppointment: "2026-07-22",
  primaryDoctor: "Dra. Valentina Reyes",
  primaryDoctorSpecialty: "Medicina Interna",
  height: "165 cm",
  weight: "68 kg",
  bmi: "25.0",
  vaccinations: [
    { name: "COVID-19 (bivalente)", date: "2025-10" },
    { name: "Influenza", date: "2026-04" },
    { name: "Hepatitis B", date: "2022-08" },
  ],
};

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

// ---------------------------------------------------------------------------
// Mock License data (demo mode)
// ---------------------------------------------------------------------------
type MockLicense = {
  id: number;
  type: string;
  days: number;
  start: string;
  end: string;
  status: string;
  doctor: string;
  hash: string;
};

const MOCK_LICENSES: MockLicense[] = [
  { id: 1, type: "Enfermedad común", days: 7, start: "2026-06-10", end: "2026-06-17", status: "Vencida", doctor: "Dr. Ramírez", hash: "b2c5f8a1d3e6f9c2" },
  { id: 2, type: "Accidente laboral", days: 14, start: "2026-07-01", end: "2026-07-15", status: "Activa", doctor: "Dra. Chen", hash: "e7d3a9c4f2b1e8a5" },
];

const MOCK_RX_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  Active: { label: "Activa", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  PartiallyDispensed: { label: "Parcialmente dispensada", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  Burned: { label: "Dispensada", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
  Revoked: { label: "Revocada", bg: "bg-red-50", text: "text-red-600", border: "border-red-200", dot: "bg-red-500" },
  Blocked: { label: "Bloqueada", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  Registered: { label: "Registrada", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
};

const LICENSE_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  Activa: { label: "Activa", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  Vencida: { label: "Vencida", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
  "En revisión": { label: "En revisión", bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", dot: "bg-yellow-400" },
};

interface AuthorizedDoctor {
  wallet: string;
  name: string;
  specialty: string;
  grantedAt: string;
  verified: boolean;
}

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
  const [session, setSession] = useState<PasskeySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession("patient"));
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!session) {
    return <AccessScreen role="patient" onAuthenticated={setSession} />;
  }
  return (
    <PatientDashboard
      session={session}
      onLogout={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Dashboard shell
// ---------------------------------------------------------------------------
function PatientDashboard({
  session,
  onLogout,
}: {
  session: PasskeySession;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("inicio");
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
      const res = await fetch(
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

  const SECTION_TITLES: Record<Tab, string> = {
    inicio: "Mi Portal de Salud",
    recetas: "Mis Recetas",
    licencias: "Mis Licencias",
    ficha: "Mi Ficha",
    accesos: "Mis Accesos",
  };

  return (
    <main className="min-h-screen bg-canvas">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href="/"
                className="text-xs font-medium text-muted hover:text-clinical"
              >
                TrustLeaf
              </Link>
              <h1 className="truncate text-base font-semibold text-ink sm:text-lg">
                {SECTION_TITLES[tab]}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="hidden font-mono text-xs text-muted sm:block">
                {truncateHash(session.address, 5, 4)}
              </p>
              {session.mock && <Badge tone="muted">demo</Badge>}
              <button
                onClick={onLogout}
                className="min-h-[44px] rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Content — pb-24 clears the fixed bottom nav ── */}
      <div className="mx-auto max-w-3xl px-4 py-6 pb-28">
        {tab === "inicio" && (
          <InicioTab
            session={session}
            activeRxCount={activeRxCount}
            authorizedDoctors={authorizedDoctors}
            onGoToRecetas={() => setTab("recetas")}
            onGoToFicha={() => setTab("ficha")}
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
      </div>

      {/* ── Bottom Navigation ── */}
      <BottomNav tab={tab} setTab={setTab} rxCount={activeRxCount} />

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
    </main>
  );
}

// ---------------------------------------------------------------------------
// NEW: Bottom Navigation Bar
// ---------------------------------------------------------------------------
function BottomNav({
  tab,
  setTab,
  rxCount,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  rxCount: number;
}) {
  const items: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "inicio",
      label: "Inicio",
      icon: <HomeIcon className="h-5 w-5" />,
    },
    {
      id: "recetas",
      label: "Recetas",
      icon: <PillIcon className="h-5 w-5" />,
    },
    {
      id: "licencias",
      label: "Licencias",
      icon: <ClipboardCheckIcon className="h-5 w-5" />,
    },
    {
      id: "ficha",
      label: "Ficha",
      icon: <FichaIcon className="h-5 w-5" />,
    },
    {
      id: "accesos",
      label: "Accesos",
      icon: <LockIcon className="h-5 w-5" />,
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200/70 bg-white/95 backdrop-blur-sm"
      aria-label="Navegación principal"
    >
      {/* Safe area padding for iOS home bar */}
      <div className="mx-auto flex max-w-3xl pb-safe">
        {items.map(({ id, label, icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-clinical" : "text-muted hover:text-ink",
              )}
            >
              <span className="relative">
                {icon}
                {/* Badge for active rx count on Recetas tab */}
                {id === "recetas" && rxCount > 0 && !active && (
                  <span className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-clinical text-[9px] font-bold text-white">
                    {rxCount > 9 ? "9+" : rxCount}
                  </span>
                )}
              </span>
              <span>{label}</span>
              {active && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-clinical" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
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
}: {
  session: PasskeySession;
  activeRxCount: number;
  authorizedDoctors: AuthorizedDoctor[];
  onGoToRecetas: () => void;
  onGoToFicha: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* ── Patient hero card ── */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-clinical to-clinical/80 p-6 text-white shadow-lg shadow-clinical/20">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30">
            <UserIcon className="h-7 w-7 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/70">Portal del paciente</p>
            <h2 className="text-xl font-semibold">
              {session.mock ? "Demo Paciente" : "Mi portal"}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-white/60">
              {truncateHash(session.address, 6, 4)}
            </p>
          </div>
        </div>
        {session.mock && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/25">
            <InfoIcon className="h-3 w-3" /> Modo demo · datos simulados
          </div>
        )}
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
// NEW: Rx Pharmacy Modal — full-screen on mobile, modal on desktop
// ---------------------------------------------------------------------------
function RxPharmacyModal({
  rx,
  onClose,
}: {
  rx: PatientRx;
  onClose: () => void;
}) {
  const qrSeed = `${rx.id}:${rx.doctorWallet}:${rx.medication}`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Receta: ${rx.medication}`}
    >
      {/* Backdrop — only visible on sm+ */}
      <div
        className="absolute inset-0 hidden bg-ink/40 backdrop-blur-sm sm:block"
        onClick={onClose}
      />

      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-sm sm:rounded-3xl sm:shadow-2xl">
        {/* ── Pharmacy header band ── */}
        <div className="flex shrink-0 items-center justify-between bg-clinical px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/70">Vista farmacia</p>
            <h2 className="truncate text-base font-semibold leading-tight">
              {rx.medication}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-3 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* ── Status bar ── */}
        <div
          className={cn(
            "flex shrink-0 items-center justify-center gap-2 py-2.5 text-sm font-semibold",
            rx.expired
              ? "bg-rose-50 text-rose-600"
              : rx.status === "Quemada"
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-600",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              rx.expired
                ? "bg-rose-500"
                : rx.status === "Quemada"
                  ? "bg-amber-500"
                  : "bg-emerald-500",
            )}
          />
          {rx.expired
            ? "Receta vencida"
            : rx.status === "Quemada"
              ? "Ya dispensada"
              : "Receta activa ✓"}
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* QR — big and centered for easy scanning */}
          <div className="flex justify-center bg-white px-6 py-6">
            <div className="overflow-hidden rounded-2xl border-4 border-slate-100 bg-white p-4 shadow-inner">
              <QrCodeDisplay seed={qrSeed} size={196} />
            </div>
          </div>

          <div className="space-y-4 px-5 pb-8">
            {/* Medication — large text */}
            <div className="text-center">
              <h3 className="text-2xl font-bold leading-tight text-ink">
                {rx.medication}
              </h3>
              <p className="mt-1.5 text-base text-muted">{rx.dosage}</p>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Key details grid */}
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Receta N°
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold text-ink">
                  #{rx.id}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Emitida
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {formatLedgerDate(rx.timestamp)}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Médico
                </dt>
                <dd className="mt-0.5 font-mono text-xs font-semibold text-ink">
                  {truncateHash(rx.doctorWallet, 4, 4)}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Unidades
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">
                  {rx.balance}/{rx.unitsTotal}
                </dd>
              </div>
            </dl>

            {/* Expiry notice */}
            {rx.expiresAt > 0 && (
              <div
                className={cn(
                  "rounded-xl px-4 py-3 text-sm",
                  rx.expired
                    ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                    : rx.expiringSoon
                      ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                      : "bg-slate-50 text-muted",
                )}
              >
                <span className="font-semibold">
                  {rx.expired ? "Expiró: " : "Vence: "}
                </span>
                {formatLedgerDate(rx.expiresAt)}
                {rx.expiringSoon && !rx.expired && (
                  <span className="ml-1 text-amber-600">
                    (en {rx.daysLeft} día{rx.daysLeft === 1 ? "" : "s"})
                  </span>
                )}
              </div>
            )}

            <p className="text-center text-xs text-muted">
              El farmacéutico escanea el QR para verificar on-chain
            </p>
          </div>
        </div>

        {/* ── Footer action ── */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-4 pb-safe">
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-ink transition-colors hover:bg-slate-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deterministic visual QR code (no external lib — visual placeholder)
// ---------------------------------------------------------------------------
function QrCodeDisplay({ seed, size = 196 }: { seed: string; size?: number }) {
  const modules = 25;
  const cells = useMemo(() => {
    const grid: boolean[][] = [];
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    for (let r = 0; r < modules; r++) {
      grid[r] = [];
      for (let c = 0; c < modules; c++) {
        h = (h * 1103515245 + 12345 + r * 97 + c * 131) >>> 0;
        grid[r][c] = ((h >> 8) & 1) === 1;
      }
    }
    return grid;
  }, [seed]);

  const unit = size / modules;
  const finders = [
    [0, 0],
    [0, modules - 7],
    [modules - 7, 0],
  ];
  const inFinder = (r: number, c: number) =>
    finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Código QR de la receta"
      className="rounded-lg"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {cells.map((row, r) =>
        row.map((on, c) =>
          on && !inFinder(r, c) ? (
            <rect
              key={`${r}-${c}`}
              x={c * unit}
              y={r * unit}
              width={unit}
              height={unit}
              rx={unit * 0.25}
              fill="#0f172a"
            />
          ) : null,
        ),
      )}
      {finders.map(([fr, fc], i) => (
        <g key={i} transform={`translate(${fc * unit}, ${fr * unit})`}>
          <rect
            width={unit * 7}
            height={unit * 7}
            rx={unit * 1.4}
            fill="#0f172a"
          />
          <rect
            x={unit}
            y={unit}
            width={unit * 5}
            height={unit * 5}
            rx={unit}
            fill="#ffffff"
          />
          <rect
            x={unit * 2}
            y={unit * 2}
            width={unit * 3}
            height={unit * 3}
            rx={unit * 0.7}
            fill="#0ea5e9"
          />
        </g>
      ))}
    </svg>
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
}: {
  rx: PatientRx;
  onShowPharmacy: (rx: PatientRx) => void;
  onShare: (rx: OnChainPrescription) => void;
}) {
  const pct = rx.unitsTotal > 0 ? (rx.balance / rx.unitsTotal) * 100 : 0;
  const barColor =
    pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-rose-500";

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
            <button
              onClick={() => onShowPharmacy(rx)}
              disabled={rx.expired}
              className="flex items-center gap-1 rounded-lg bg-clinical/10 px-2.5 py-1.5 text-xs font-semibold text-clinical transition-colors hover:bg-clinical/20 disabled:pointer-events-none disabled:opacity-40"
            >
              <QrIcon /> Ver QR
            </button>
          </div>
        </div>
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
function FichaTab({ wallet, mock }: { wallet: string; mock: boolean }) {
  const ficha = MOCK_FICHA;

  return (
    <div className="space-y-5">
      {/* Demo notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs leading-relaxed text-amber-800">
          Tu ficha médica vive on-chain en Soroban — solo los médicos con acceso
          que tú autoricen pueden verla completa.{" "}
          {mock
            ? "Datos de ejemplo en modo demo."
            : "Los datos de resumen se leen desde tu wallet."}
        </p>
      </div>

      {/* ── Identity card ── */}
      <Card className="p-0">
        <div className="flex items-center gap-4 border-b border-slate-200/70 px-6 py-5">
          {/* Avatar con inicial */}
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-clinical/10 text-clinical">
            <span className="text-2xl font-bold leading-none">
              {mock ? "P" : "?"}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              {mock ? "Paciente Demo" : "Tu perfil"}
            </h2>
            <p className="font-mono text-xs text-muted">
              {truncateHash(wallet, 6, 6)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Badge tone="mint">
                <ShieldCheckIcon className="h-3 w-3" /> Verificada on-chain
              </Badge>
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
                {ficha.bloodType}
              </span>
            </div>
          </div>
          {[
            { label: "Talla", value: ficha.height },
            { label: "Peso", value: ficha.weight },
            { label: "IMC", value: ficha.bmi },
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
            {ficha.primaryDoctor}
          </p>
          <p className="text-xs text-muted">{ficha.primaryDoctorSpecialty}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">
                Última visita
              </p>
              <p className="mt-0.5 font-medium text-ink">{ficha.lastVisit}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">
                Próxima cita
              </p>
              <p className="mt-0.5 font-medium text-clinical">
                {ficha.nextAppointment}
              </p>
            </div>
          </div>
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
// Tab: Mis Licencias Médicas
// ---------------------------------------------------------------------------
function LicenciasTab() {
  const licenses = MOCK_LICENSES;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200/60 bg-violet-50/40 px-4 py-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
        <p className="text-xs leading-relaxed text-violet-800">
          <span className="font-semibold">Licencias médicas on-chain.</span>{" "}
          Cada licencia emitida por tu médico queda registrada en Stellar
          Soroban — verificable por empleadores e instituciones de salud.
          Datos de demostración.
        </p>
      </div>

      {licenses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
            <ClipboardCheckIcon className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium text-ink">
            Sin licencias registradas
          </p>
          <p className="mt-1 text-xs text-muted">
            Tus licencias médicas aparecerán aquí cuando un médico las emita
            on-chain.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {licenses.map((lic) => (
            <LicenseCard key={lic.id} license={lic} />
          ))}
        </div>
      )}
    </div>
  );
}

function LicenseCard({ license }: { license: MockLicense }) {
  const cfg =
    LICENSE_STATUS_CONFIG[license.status] ?? LICENSE_STATUS_CONFIG["Vencida"];
  const shortHash = `${license.hash.slice(0, 8)}...${license.hash.slice(-4)}`;

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
        <span className="ml-auto text-[10px] font-medium text-muted">
          {license.days} días
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* ── Type + doctor ── */}
        <div>
          <h3 className="text-base font-semibold text-ink">{license.type}</h3>
          <p className="mt-0.5 text-sm text-muted">{license.doctor}</p>
        </div>

        {/* ── Duration pill ── */}
        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
          <ClockIcon className="h-4 w-4 shrink-0 text-muted" />
          <p className="text-sm">
            <span className="font-semibold text-ink">{license.days} días</span>
            <span className="text-muted"> de reposo médico</span>
          </p>
        </div>

        {/* ── Date range ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Inicio
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted" />
              <span className="text-sm font-semibold text-ink">
                {license.start}
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Fin
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted" />
              <span className="text-sm font-semibold text-ink">
                {license.end}
              </span>
            </div>
          </div>
        </div>

        {/* ── On-chain hash ── */}
        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2">
          <LockIcon className="h-3.5 w-3.5 text-muted/60" />
          <span className="font-mono text-[10px] text-muted/70">
            {shortHash}
          </span>
        </div>
      </div>
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
// Shared sub-components
// ---------------------------------------------------------------------------
function SectionHeader({
  icon, title, bg,
}: { icon: React.ReactNode; title: string; bg: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200/70 px-6 py-4">
      <div className={cn("grid h-9 w-9 place-items-center rounded-xl", bg)}>{icon}</div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
    </div>
  );
}

function ExpiryAlerts({ items }: { items: PatientRx[] }) {
  const expired = items.filter((rx) => rx.expired);
  const expiringSoon = items.filter((rx) => rx.expiringSoon);
  if (expired.length === 0 && expiringSoon.length === 0) return null;
  return (
    <div className="space-y-3">
      {expired.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <p className="font-semibold">
              {expired.length === 1 ? "Tienes 1 receta expirada sin dispensar" : `Tienes ${expired.length} recetas expiradas sin dispensar`}
            </p>
            <p className="mt-0.5 text-rose-600/90">
              Solicita a tu médico una nueva prescripción antes de acudir a la farmacia.
            </p>
          </div>
        </div>
      )}
      {expiringSoon.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">
              {expiringSoon.length === 1 ? "1 receta vence pronto" : `${expiringSoon.length} recetas vencen pronto`}
            </p>
            <p className="mt-0.5 text-amber-700/90">
              {expiringSoon.length === 1
                ? `Vence ${formatLedgerDate(expiringSoon[0].expiresAt)} (en ${Math.max(0, expiringSoon[0].daysLeft)} día${expiringSoon[0].daysLeft === 1 ? "" : "s"}).`
                : "Algunas de tus recetas vencen en los próximos días."}{" "}
              Dispénsalas a tiempo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Teleconsultas({ items }: { items: Consultation[] }) {
  return (
    <section aria-label="Teleconsultas" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Tus teleconsultas</h2>
      {items.map((c) => {
        const when = c.scheduledAt
          ? new Date(c.scheduledAt).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })
          : "A convenir";
        return (
          <Card key={c.id} className="p-0">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#1a73e8]/10 text-[#1a73e8]">
                    <VideoIcon />
                  </div>
                  <h3 className="text-base font-semibold text-ink">Consulta médica</h3>
                  <Badge tone={c.status === "completed" ? "muted" : "clinical"}>
                    {c.status === "completed" ? "Completada" : "Programada"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium">Cuándo:</span> {when}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium uppercase tracking-wide">Meet:</span>
                  <a href={c.meetLink} target="_blank" rel="noopener noreferrer"
                    className="min-w-0 truncate font-mono text-[#1a73e8] hover:underline">
                    {c.meetLink}
                  </a>
                  <span className="shrink-0 rounded bg-[#1a73e8]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#1a73e8]">
                    {c.meetingCode}
                  </span>
                </div>
              </div>
              <a href={c.meetLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1765cc]">
                <VideoIcon /> Abrir Meet
              </a>
            </div>
          </Card>
        );
      })}
    </section>
  );
}

function LoadingList() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-3xl border border-slate-200/70 bg-white" />
      ))}
      <p className="text-center text-xs text-muted">Cargando desde Soroban…</p>
    </div>
  );
}

function EmptyRxState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Card className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
        <PillIcon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-ink">Aún no tienes recetas</h2>
      <p className="mt-2 text-sm text-muted">
        Cuando un médico emita una prescripción a tu wallet, aparecerá aquí, leída directamente desde Stellar Soroban.
      </p>
      {error && <p className="mt-3 text-xs text-amber-600">Detalle: {error}</p>}
      <Button variant="secondary" className="mt-5" onClick={onRetry}>Actualizar</Button>
    </Card>
  );
}

