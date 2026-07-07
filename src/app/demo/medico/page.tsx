"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { truncateHash } from "@/lib/stellar";

/* ---------------------------------------------------------------------------
   Demo — Portal del Médico (mockup, sin conexión real a blockchain)
   EHR completo: acceso biométrico (Stellar Passkey Kit) → panel con sidebar →
   agenda, pacientes, emisión de prescripciones (NFT en Stellar Testnet),
   historial de atenciones, estadísticas y cuenta.
--------------------------------------------------------------------------- */

const DOCTOR = {
  name: "Dra. Valentina Reyes",
  specialty: "Medicina Interna",
  subspecialty: "Endocrinología Clínica",
  license: "SIS 148.220",
  university: "Universidad de Chile",
  graduationYear: "2014",
  institution: "Clínica Los Andes · Santiago",
  office: "Av. Providencia 2134, Of. 806, Providencia",
  wallet: "GBQD7XK2Q9YAVN4RPLM8W6H5TJC1BUFS0DQKX9ZE7NRXYHG2VW1F3K2",
  memberSince: "Jun 2026",
  recordsIssued: 47,
  patientsSeen: 23,
};

const STELLAR_EXPERT_ACCOUNT = (wallet: string) =>
  `https://stellar.expert/explorer/testnet/account/${wallet}`;

const WEEK_SUMMARY = { citas: 18, urgencias: 3, canceladas: 2 };

/* --------------------------------- Tipos --------------------------------- */

type PrescriptionStatus = "Active" | "Revoked";

interface Prescription {
  id: string;
  patient: string;
  medication: string;
  status: PrescriptionStatus;
  hashId: string;
}

type SectionId =
  | "agenda"
  | "pacientes"
  | "emitir"
  | "historial"
  | "estadisticas"
  | "cuenta";

/* --------------------------------- Mock data ----------------------------- */

const INITIAL_PRESCRIPTIONS: Prescription[] = [
  {
    id: "RX-1042",
    patient: "María González",
    medication: "Amoxicilina 500mg",
    status: "Active",
    hashId: "CBGZ4K…9F1A2E",
  },
  {
    id: "RX-1039",
    patient: "Juan Pérez",
    medication: "Losartán 50mg",
    status: "Active",
    hashId: "CDQ7M2…07B4CC",
  },
  {
    id: "RX-1031",
    patient: "María González",
    medication: "Ibuprofeno 400mg",
    status: "Revoked",
    hashId: "CAX9L0…3D22FF",
  },
];

type ApptType = "Control" | "Primera vez" | "Urgencia";
type ApptStatus = "Confirmado" | "Pendiente";

interface Appointment {
  time: string;
  patient: string;
  age: number;
  type: ApptType;
  status: ApptStatus;
  reason: string;
}

interface ApptDay {
  label: string;
  date: string;
  appts: Appointment[];
}

const AGENDA: ApptDay[] = [
  {
    label: "Hoy",
    date: "Domingo 5 de julio",
    appts: [
      {
        time: "09:00",
        patient: "María González",
        age: 58,
        type: "Control",
        status: "Confirmado",
        reason: "Seguimiento hipertensión · ajuste de dosis",
      },
      {
        time: "10:30",
        patient: "Roberto Salinas",
        age: 45,
        type: "Primera vez",
        status: "Confirmado",
        reason: "Evaluación general · fatiga persistente",
      },
      {
        time: "12:00",
        patient: "Camila Torres",
        age: 29,
        type: "Urgencia",
        status: "Pendiente",
        reason: "Dolor abdominal agudo en fosa ilíaca derecha",
      },
      {
        time: "16:15",
        patient: "Juan Pérez",
        age: 64,
        type: "Control",
        status: "Pendiente",
        reason: "Revisión perfil lipídico · tolerancia a Losartán",
      },
    ],
  },
  {
    label: "Mañana",
    date: "Lunes 6 de julio",
    appts: [
      {
        time: "08:30",
        patient: "Fernanda Ruiz",
        age: 34,
        type: "Primera vez",
        status: "Confirmado",
        reason: "Chequeo preventivo · antecedentes familiares",
      },
      {
        time: "11:00",
        patient: "Andrés Molina",
        age: 52,
        type: "Control",
        status: "Pendiente",
        reason: "Revisión de resonancia lumbar",
      },
      {
        time: "15:45",
        patient: "Sofía Herrera",
        age: 61,
        type: "Control",
        status: "Confirmado",
        reason: "Control diabetes tipo 2 · HbA1c de seguimiento",
      },
    ],
  },
];

/** Cita destacada como "próxima" en la agenda (con countdown demo). */
const NEXT_APPOINTMENT = { ...AGENDA[0].appts[0], countdown: "En 45 minutos" };

type PatientStatus = "Activo" | "En seguimiento" | "Alta";

interface Patient {
  name: string;
  age: number;
  lastVisit: string;
  nextAppt: string | null;
  diagnosis: string;
  status: PatientStatus;
}

const PATIENTS: Patient[] = [
  { name: "María González", age: 58, lastVisit: "3 jul 2026", nextAppt: "5 jul 2026", diagnosis: "Hipertensión esencial", status: "En seguimiento" },
  { name: "Juan Pérez", age: 64, lastVisit: "2 jul 2026", nextAppt: "5 jul 2026", diagnosis: "Dislipidemia mixta", status: "En seguimiento" },
  { name: "Camila Torres", age: 29, lastVisit: "1 jul 2026", nextAppt: "5 jul 2026", diagnosis: "Migraña crónica", status: "Activo" },
  { name: "Roberto Salinas", age: 45, lastVisit: "28 jun 2026", nextAppt: "6 jul 2026", diagnosis: "Chequeo preventivo", status: "Activo" },
  { name: "Fernanda Ruiz", age: 34, lastVisit: "25 jun 2026", nextAppt: "6 jul 2026", diagnosis: "Dermatitis atópica", status: "Activo" },
  { name: "Andrés Molina", age: 52, lastVisit: "22 jun 2026", nextAppt: "6 jul 2026", diagnosis: "Lumbago crónico", status: "En seguimiento" },
  { name: "Sofía Herrera", age: 61, lastVisit: "19 jun 2026", nextAppt: "6 jul 2026", diagnosis: "Diabetes mellitus tipo 2", status: "En seguimiento" },
  { name: "Diego Castro", age: 40, lastVisit: "12 jun 2026", nextAppt: null, diagnosis: "Gastritis crónica", status: "Alta" },
  { name: "Valentina Núñez", age: 27, lastVisit: "5 jun 2026", nextAppt: null, diagnosis: "Ansiedad generalizada", status: "Activo" },
  { name: "Ignacio Vera", age: 70, lastVisit: "30 may 2026", nextAppt: null, diagnosis: "Insuficiencia cardíaca leve", status: "Alta" },
];

type AtencionTipo = "Consulta" | "Control" | "Urgencia" | "Teleconsulta";

interface Atencion {
  date: string;
  time: string;
  patient: string;
  tipo: AtencionTipo;
  cie10: string;
  diagnosis: string;
  issued: boolean;
  duration: number; // minutos
  hash: string;
  month: string;
}

const HISTORIAL: Atencion[] = [
  { date: "3 jul 2026", time: "09:15", patient: "María González", tipo: "Control", cie10: "I10", diagnosis: "Hipertensión esencial", issued: true, duration: 20, hash: "CBGZ4K…9F1A2E", month: "Jul 2026" },
  { date: "3 jul 2026", time: "11:00", patient: "Diego Castro", tipo: "Consulta", cie10: "K29", diagnosis: "Gastritis crónica", issued: true, duration: 25, hash: "CDA71M…22B4CC", month: "Jul 2026" },
  { date: "2 jul 2026", time: "10:30", patient: "Juan Pérez", tipo: "Control", cie10: "E78", diagnosis: "Dislipidemia mixta", issued: true, duration: 15, hash: "CDQ7M2…07B4CC", month: "Jul 2026" },
  { date: "2 jul 2026", time: "16:40", patient: "Camila Torres", tipo: "Teleconsulta", cie10: "G43", diagnosis: "Migraña sin aura", issued: true, duration: 20, hash: "CFX3P9…5A17DE", month: "Jul 2026" },
  { date: "1 jul 2026", time: "12:10", patient: "Camila Torres", tipo: "Urgencia", cie10: "N39", diagnosis: "Infección urinaria baja", issued: true, duration: 30, hash: "CAX9L0…3D22FF", month: "Jul 2026" },
  { date: "30 jun 2026", time: "09:40", patient: "Sofía Herrera", tipo: "Control", cie10: "E11", diagnosis: "Diabetes mellitus tipo 2", issued: true, duration: 25, hash: "CB9K2T…8801AA", month: "Jun 2026" },
  { date: "28 jun 2026", time: "15:20", patient: "Roberto Salinas", tipo: "Consulta", cie10: "Z00", diagnosis: "Chequeo preventivo", issued: false, duration: 30, hash: "—", month: "Jun 2026" },
  { date: "25 jun 2026", time: "10:05", patient: "Fernanda Ruiz", tipo: "Consulta", cie10: "L23", diagnosis: "Dermatitis de contacto", issued: true, duration: 20, hash: "CCT5W1…9920BE", month: "Jun 2026" },
  { date: "22 jun 2026", time: "11:30", patient: "Andrés Molina", tipo: "Control", cie10: "M54", diagnosis: "Lumbago mecánico", issued: true, duration: 15, hash: "CEP0R7…41C3DA", month: "Jun 2026" },
  { date: "19 jun 2026", time: "17:00", patient: "Valentina Núñez", tipo: "Teleconsulta", cie10: "F41", diagnosis: "Ansiedad generalizada", issued: true, duration: 25, hash: "CGH8N4…77E5BB", month: "Jun 2026" },
  { date: "15 jun 2026", time: "08:50", patient: "Juan Pérez", tipo: "Consulta", cie10: "Z00", diagnosis: "Chequeo preventivo anual", issued: false, duration: 20, hash: "—", month: "Jun 2026" },
  { date: "11 jun 2026", time: "13:15", patient: "Ignacio Vera", tipo: "Urgencia", cie10: "I50", diagnosis: "Insuficiencia cardíaca", issued: true, duration: 35, hash: "CJK2V9…0EA6FC", month: "Jun 2026" },
  { date: "6 jun 2026", time: "09:25", patient: "María González", tipo: "Control", cie10: "K21", diagnosis: "Reflujo gastroesofágico", issued: true, duration: 20, hash: "CLM7X3…B341AD", month: "Jun 2026" },
  { date: "30 may 2026", time: "16:10", patient: "Diego Castro", tipo: "Consulta", cie10: "K29", diagnosis: "Gastritis crónica", issued: true, duration: 20, hash: "CNP4Q8…6C72EE", month: "May 2026" },
  { date: "22 may 2026", time: "10:45", patient: "Andrés Molina", tipo: "Teleconsulta", cie10: "M54", diagnosis: "Lumbago mecánico", issued: false, duration: 15, hash: "—", month: "May 2026" },
];

/** Iniciales para el avatar placeholder (máx 2 letras). */
function initials(name: string): string {
  return name
    .replace(/^(Dra?\.|Sr\.?|Sra\.?)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Genera un pseudo-hash tipo Stellar contract-id (solo para demo). */
function fakeStellarHash(seed: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let head = "";
  let tail = "";
  for (let i = 0; i < 5; i += 1) {
    head += alphabet[(seed * 7 + i * 13) % alphabet.length];
    tail += alphabet[(seed * 11 + i * 17 + 3) % alphabet.length];
  }
  return `${head}…${tail}`;
}

/* ----------------------------- Navegación -------------------------------- */

const NAV: {
  id: SectionId;
  label: string;
  icon: (p: IconProps) => React.ReactElement;
}[] = [
  { id: "agenda", label: "Mi Agenda", icon: CalendarIcon },
  { id: "pacientes", label: "Mis Pacientes", icon: UsersIcon },
  { id: "emitir", label: "Emitir Prescripción", icon: PencilIcon },
  { id: "historial", label: "Historial de Atenciones", icon: HistoryIcon },
  { id: "estadisticas", label: "Estadísticas", icon: ChartIcon },
  { id: "cuenta", label: "Mi Cuenta", icon: SettingsIcon },
];

const SECTION_META: Record<SectionId, { title: string; subtitle: string }> = {
  agenda: {
    title: "Mi Agenda",
    subtitle: "Tus próximas citas confirmadas y pendientes.",
  },
  pacientes: {
    title: "Mis Pacientes",
    subtitle: "Directorio clínico con estado, diagnóstico y próxima cita.",
  },
  emitir: {
    title: "Emitir Prescripción",
    subtitle: "Firma una receta verificable en Stellar Testnet.",
  },
  historial: {
    title: "Historial de Atenciones",
    subtitle: "Consultas pasadas con diagnóstico CIE-10 y registro on-chain.",
  },
  estadisticas: {
    title: "Estadísticas",
    subtitle: "Resumen de tu actividad clínica y prescripciones.",
  },
  cuenta: {
    title: "Mi Cuenta",
    subtitle: "Datos de tu perfil y billetera verificada.",
  },
};

/* --------------------------------- Página -------------------------------- */

export default function MedicoDemoPage() {
  const [authenticated, setAuthenticated] = useState(false);

  if (!authenticated) {
    return (
      <main className="relative min-h-screen bg-canvas bg-grid">
        <div className="pointer-events-none absolute inset-0 bg-spotlight" />
        <div className="relative mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
          <AccessScreen onAuthenticated={() => setAuthenticated(true)} />
        </div>
      </main>
    );
  }

  return <DashboardShell onLogout={() => setAuthenticated(false)} />;
}

/* --------------------------------- Acceso -------------------------------- */

function AccessScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [authenticating, setAuthenticating] = useState(false);

  function handleAuth() {
    setAuthenticating(true);
    // Simula el prompt biométrico + firma de passkey.
    window.setTimeout(onAuthenticated, 1600);
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center">
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
              "h-9 w-9 text-clinical transition-transform",
              authenticating && "animate-pulse",
            )}
          />
        </div>

        <h1 className="text-2xl font-semibold text-ink">Portal del Médico</h1>
        <p className="mt-2 text-sm text-muted">
          Autentícate con tu passkey para acceder a tu panel clínico y emitir
          prescripciones verificables.
        </p>

        <Button
          size="lg"
          className="mt-8 w-full"
          onClick={handleAuth}
          disabled={authenticating}
        >
          {authenticating ? (
            <>
              <Spinner /> Verificando identidad…
            </>
          ) : (
            <>
              <FaceIdIcon className="h-5 w-5" /> Autenticar con Face ID /
              Touch ID
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={onAuthenticated}
          disabled={authenticating}
          className="mt-4 text-sm text-muted/70 underline underline-offset-4 transition-colors hover:text-clinical disabled:opacity-50"
        >
          Entrar en modo demo →
        </button>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Badge tone="clinical">
            <ShieldIcon className="h-3.5 w-3.5" /> Stellar Passkey Kit
          </Badge>
          <Badge tone="muted">Testnet</Badge>
        </div>

        <p className="mt-6 text-xs text-muted/80">
          Demo · no se transmiten datos reales ni claves privadas.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------ Dashboard shell -------------------------- */

function DashboardShell({ onLogout }: { onLogout: () => void }) {
  const [section, setSection] = useState<SectionId>("agenda");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(
    INITIAL_PRESCRIPTIONS,
  );

  function handleIssue(data: NewPrescriptionData) {
    const seq = prescriptions.length + 1;
    const next: Prescription = {
      id: `RX-${1042 + seq}`,
      patient: data.patient,
      medication: data.medication,
      status: "Active",
      hashId: fakeStellarHash(seq + data.patient.length),
    };
    setPrescriptions((prev) => [next, ...prev]);
  }

  const meta = SECTION_META[section];

  function go(id: SectionId) {
    setSection(id);
    setSidebarOpen(false);
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar
        section={section}
        open={sidebarOpen}
        onNavigate={go}
        onLogout={onLogout}
      />

      {/* Área principal */}
      <div className="md:pl-60">
        {/* Top bar (mobile hamburger + título) */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-sm md:px-8 md:py-5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-muted transition-colors hover:text-ink md:hidden"
            aria-label="Abrir menú"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-ink md:text-2xl">
              {meta.title}
            </h1>
            <p className="hidden truncate text-sm text-muted sm:block">
              {meta.subtitle}
            </p>
          </div>
        </header>

        <main className="px-4 py-6 md:px-8 md:py-8">
          {section === "agenda" && <AgendaSection />}
          {section === "pacientes" && (
            <PacientesSection
              prescriptions={prescriptions}
              onEmitir={() => go("emitir")}
            />
          )}
          {section === "emitir" && (
            <EmitirSection onIssue={handleIssue} onDone={() => go("estadisticas")} />
          )}
          {section === "historial" && <HistorialSection />}
          {section === "estadisticas" && (
            <EstadisticasSection prescriptions={prescriptions} />
          )}
          {section === "cuenta" && <CuentaSection />}
        </main>
      </div>
    </div>
  );
}

/* --------------------------------- Sidebar ------------------------------- */

function Sidebar({
  section,
  open,
  onNavigate,
  onLogout,
}: {
  section: SectionId;
  open: boolean;
  onNavigate: (id: SectionId) => void;
  onLogout: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-gradient-to-b from-slate-900 to-slate-950 text-slate-300 transition-transform duration-300 md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-white shadow-sm shadow-clinical/30">
            <span className="text-sm font-bold">T</span>
          </span>
          <span className="text-white">
            Trust<span className="text-clinical">Leaf</span>
          </span>
        </Link>
      </div>

      {/* Perfil del médico */}
      <div className="mx-3 mb-2 rounded-2xl bg-white/5 p-4 ring-1 ring-inset ring-white/10">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-clinical to-mint text-sm font-semibold text-white">
            VR
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {DOCTOR.name}
            </p>
            <p className="truncate text-xs text-slate-400">{DOCTOR.specialty}</p>
          </div>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mint-50/10 px-2.5 py-1 text-xs font-medium text-mint ring-1 ring-inset ring-mint/25">
          <CheckIcon className="h-3.5 w-3.5" /> Médico Verificado
        </div>
      </div>

      {/* Navegación */}
      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map((it) => {
          const Icon = it.icon;
          const active = section === it.id;
          return (
            <div key={it.id}>
              {it.id === "estadisticas" && (
                <div className="my-2 border-t border-white/10" />
              )}
              <button
                onClick={() => onNavigate(it.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "border-violet-500 bg-white/5 text-white"
                    : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    active ? "text-violet-300" : "text-slate-500",
                  )}
                />
                <span className="truncate text-left">{it.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      {/* Wallet + salir */}
      <div className="border-t border-white/10 p-3">
        <div className="rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-inset ring-white/10">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <WalletIcon className="h-4 w-4 text-mint" />
            <span className="font-medium text-slate-300">Wallet conectada</span>
          </div>
          <code className="mt-1 block font-mono text-xs text-slate-400">
            {truncateHash(DOCTOR.wallet, 5, 4)}
          </code>
        </div>
        <button
          onClick={onLogout}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
        >
          <LogoutIcon className="h-5 w-5 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------- Mi Agenda ------------------------------- */

function AgendaSection() {
  return (
    <div className="space-y-8">
      {/* Resumen semanal */}
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        <span className="text-sm font-semibold text-ink">Esta semana</span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <SummaryStat value={WEEK_SUMMARY.citas} label="citas" tone="clinical" />
          <span className="text-slate-300">·</span>
          <SummaryStat value={WEEK_SUMMARY.urgencias} label="urgencias" tone="rose" />
          <span className="text-slate-300">·</span>
          <SummaryStat value={WEEK_SUMMARY.canceladas} label="canceladas" tone="muted" />
        </div>
      </Card>

      {/* Próxima cita destacada */}
      <NextAppointmentCard />

      {AGENDA.map((day) => (
        <section key={day.label}>
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="text-base font-semibold text-ink">{day.label}</h2>
            <span className="text-sm text-muted">{day.date}</span>
          </div>
          <div className="space-y-3">
            {day.appts.map((a, i) => (
              <AppointmentRow key={`${day.label}-${i}`} appt={a} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SummaryStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "clinical" | "rose" | "muted";
}) {
  const color =
    tone === "clinical" ? "text-clinical" : tone === "rose" ? "text-rose-500" : "text-ink";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("text-lg font-semibold", color)}>{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

function NextAppointmentCard() {
  const a = NEXT_APPOINTMENT;
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-clinical via-indigo-600 to-indigo-700 p-6 text-white shadow-xl shadow-indigo-500/30 ring-1 ring-white/10 md:p-7">
      <div className="bg-spotlight pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
            <ClockIcon className="h-3.5 w-3.5" /> Próxima cita · {a.countdown}
          </div>
          <p className="mt-3 text-xl font-semibold">{a.patient}</p>
          <p className="text-sm text-white/80">
            {a.age} años · {a.type}
          </p>
          <p className="mt-1 text-sm text-white/70">{a.reason}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <span className="text-3xl font-semibold tabular-nums">{a.time}</span>
          <span className="text-xs uppercase tracking-wide text-white/70">hoy</span>
        </div>
      </div>
    </div>
  );
}

function AppointmentRow({ appt }: { appt: Appointment }) {
  const leftBorder =
    appt.type === "Urgencia"
      ? "border-l-rose-500"
      : appt.status === "Confirmado"
        ? "border-l-mint"
        : "border-l-amber-500";
  return (
    <Card
      className={cn("flex items-center gap-4 border-l-4 p-4 md:p-5", leftBorder)}
      interactive
    >
      {/* Hora */}
      <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-slate-50 py-2 text-center ring-1 ring-inset ring-slate-200/70">
        <span className="text-base font-semibold text-ink">{appt.time}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted">hrs</span>
      </div>

      {/* Avatar */}
      <div className="hidden h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-clinical/80 to-indigo-500 text-sm font-semibold text-white sm:grid">
        {initials(appt.patient)}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-medium text-ink">{appt.patient}</p>
          <span className="text-xs text-muted">
            · {appt.age} años · {appt.type}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">{appt.reason}</p>
      </div>

      {/* Estado */}
      <ApptBadge appt={appt} />
    </Card>
  );
}

function ApptBadge({ appt }: { appt: Appointment }) {
  if (appt.type === "Urgencia") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-500/25">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Urgencia
      </span>
    );
  }
  if (appt.status === "Confirmado") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-mint-50 px-3 py-1 text-xs font-semibold text-mint ring-1 ring-inset ring-mint/25">
        <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Confirmado
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600 ring-1 ring-inset ring-amber-500/25">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Pendiente
    </span>
  );
}

/* ------------------------------ Mis Pacientes ---------------------------- */

const PATIENT_FILTERS: ("Todos" | PatientStatus)[] = [
  "Todos",
  "Activo",
  "En seguimiento",
  "Alta",
];

function PacientesSection({
  prescriptions,
  onEmitir,
}: {
  prescriptions: Prescription[];
  onEmitir: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Todos" | PatientStatus>("Todos");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PATIENTS.filter((p) => {
      const matchesName = p.name.toLowerCase().includes(q);
      const matchesStatus = filter === "Todos" || p.status === filter;
      return matchesName && matchesStatus;
    });
  }, [query, filter]);

  const followUp = PATIENTS.filter((p) => p.status === "En seguimiento").length;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pacientes totales"
          value={String(PATIENTS.length)}
          icon={<UsersIcon className="h-5 w-5 text-clinical" />}
        />
        <StatCard
          label="En seguimiento"
          value={String(followUp)}
          icon={<HistoryIcon className="h-5 w-5 text-amber-500" />}
        />
        <StatCard
          label="Recetas emitidas"
          value={String(prescriptions.length)}
          icon={<DocIcon className="h-5 w-5 text-mint" />}
        />
      </section>

      {/* Búsqueda + filtros + acción */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar paciente…"
              aria-label="Buscar paciente"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-clinical focus:outline-none focus:ring-2 focus:ring-clinical/20"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PATIENT_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
                  filter === f
                    ? "bg-clinical text-white ring-clinical"
                    : "bg-white text-muted ring-slate-200 hover:text-ink",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full lg:w-auto" onClick={onEmitir}>
          <PlusIcon className="h-4 w-4" /> Nueva Prescripción
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-muted">
                <th className="px-6 py-4 font-medium">Paciente</th>
                <th className="px-6 py-4 font-medium">Edad</th>
                <th className="px-6 py-4 font-medium">Última atención</th>
                <th className="px-6 py-4 font-medium">Próxima cita</th>
                <th className="px-6 py-4 font-medium">Diagnóstico principal</th>
                <th className="px-6 py-4 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.name}
                  className="cursor-pointer border-b border-slate-100 transition-all duration-150 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-clinical/80 to-indigo-500 text-xs font-semibold text-white">
                        {initials(p.name)}
                      </div>
                      <span className="font-medium text-ink">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted">{p.age}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-muted">
                    {p.lastVisit}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {p.nextAppt ? (
                      <span className="text-ink">{p.nextAppt}</span>
                    ) : (
                      <span className="text-muted/60">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-ink">{p.diagnosis}</td>
                  <td className="px-6 py-4">
                    <PatientStatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted">
                    No hay pacientes que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PatientStatusBadge({ status }: { status: PatientStatus }) {
  const map: Record<PatientStatus, string> = {
    Activo: "bg-mint-50 text-mint ring-mint/25",
    "En seguimiento": "bg-amber-50 text-amber-600 ring-amber-500/25",
    Alta: "bg-slate-100 text-muted ring-slate-200",
  };
  const dot: Record<PatientStatus, string> = {
    Activo: "bg-mint",
    "En seguimiento": "bg-amber-500",
    Alta: "bg-slate-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
        map[status],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot[status])} /> {status}
    </span>
  );
}

/* --------------------------- Emitir Prescripción ------------------------- */

function EmitirSection({
  onIssue,
  onDone,
}: {
  onIssue: (data: NewPrescriptionData) => void;
  onDone: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-0">
        <div className="border-b border-slate-200/70 px-5 py-5 md:px-8">
          <h2 className="text-lg font-semibold text-ink">Nueva Prescripción</h2>
          <p className="text-xs text-muted">
            Se emitirá como registro verificable en Stellar Testnet.
          </p>
        </div>
        <PrescriptionForm onIssue={onIssue} onDone={onDone} />
      </Card>
    </div>
  );
}

interface NewPrescriptionData {
  patient: string;
  medication: string;
}

type FormStep = "form" | "issuing" | "done";

function PrescriptionForm({
  onIssue,
  onDone,
}: {
  onIssue: (data: NewPrescriptionData) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<FormStep>("form");
  const [patient, setPatient] = useState("");
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [txHash, setTxHash] = useState("");

  const canSubmit =
    patient.trim() && medication.trim() && dosage.trim() && duration.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStep("issuing");
    // Simula el envío de la transacción a Soroban.
    window.setTimeout(() => {
      setTxHash(fakeStellarHash(patient.length + medication.length + 5));
      onIssue({ patient: patient.trim(), medication: medication.trim() });
      setStep("done");
    }, 2200);
  }

  if (step === "done") {
    return <SuccessState txHash={txHash} onDone={onDone} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-6 md:px-8">
      <Field label="Dirección del paciente (o nombre demo)">
        <input
          value={patient}
          onChange={(e) => setPatient(e.target.value)}
          placeholder="María González — o GBQD…X4F2"
          disabled={step === "issuing"}
          className={inputClass}
        />
      </Field>

      <Field label="Medicamento">
        <input
          value={medication}
          onChange={(e) => setMedication(e.target.value)}
          placeholder="Amoxicilina 500mg"
          disabled={step === "issuing"}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Dosis y frecuencia">
          <input
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="1 cápsula c/8h"
            disabled={step === "issuing"}
            className={inputClass}
          />
        </Field>
        <Field label="Duración (días)">
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="7"
            disabled={step === "issuing"}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Notas clínicas">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tomar con alimentos. Suspender si aparece rash."
          rows={3}
          disabled={step === "issuing"}
          className={cn(inputClass, "resize-none")}
        />
      </Field>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={!canSubmit || step === "issuing"}
        >
          {step === "issuing" ? (
            <>
              <Spinner /> Firmando en Stellar…
            </>
          ) : (
            <>
              <ShieldIcon className="h-4 w-4" /> Emitir Prescripción en Stellar
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function SuccessState({
  txHash,
  onDone,
}: {
  txHash: string;
  onDone: () => void;
}) {
  return (
    <div className="px-5 py-10 text-center md:px-8">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mint-50 ring-1 ring-mint/20">
        <CheckIcon className="h-8 w-8 text-mint" />
      </div>
      <h3 className="text-lg font-semibold text-ink">Prescripción emitida ✓</h3>
      <p className="mt-1 text-sm text-muted">
        El registro fue acuñado y ya aparece en tus estadísticas.
      </p>

      <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left">
        <span className="text-xs uppercase tracking-wide text-muted">
          Hash ID de la transacción
        </span>
        <p className="mt-1 break-all font-mono text-sm text-clinical-600">
          {txHash}
        </p>
      </div>

      <Button className="mt-6 w-full" onClick={onDone}>
        Ver estadísticas
      </Button>
    </div>
  );
}

/* ------------------------ Historial de Atenciones ------------------------ */

const ATENCION_TIPOS: ("Todos" | AtencionTipo)[] = [
  "Todos",
  "Consulta",
  "Control",
  "Urgencia",
  "Teleconsulta",
];

function mostFrequent(items: string[]): string {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  let best = "—";
  let max = 0;
  for (const [k, v] of counts) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

function HistorialSection() {
  const [tipo, setTipo] = useState<"Todos" | AtencionTipo>("Todos");
  const [month, setMonth] = useState<string>("Todos");

  const months = useMemo(() => {
    const seen: string[] = [];
    for (const a of HISTORIAL) if (!seen.includes(a.month)) seen.push(a.month);
    return ["Todos", ...seen];
  }, []);

  const rows = useMemo(
    () =>
      HISTORIAL.filter(
        (a) =>
          (tipo === "Todos" || a.tipo === tipo) &&
          (month === "Todos" || a.month === month),
      ),
    [tipo, month],
  );

  const avgDuration = rows.length
    ? Math.round(rows.reduce((s, a) => s + a.duration, 0) / rows.length)
    : 0;
  const topDiagnosis = mostFrequent(rows.map((a) => a.diagnosis));

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Atenciones"
          value={String(rows.length)}
          icon={<HistoryIcon className="h-5 w-5 text-clinical" />}
        />
        <StatCard
          label="Duración promedio"
          value={`${avgDuration} min`}
          icon={<ClockIcon className="h-5 w-5 text-clinical" />}
        />
        <StatCard
          label="Diagnóstico frecuente"
          value={topDiagnosis}
          valueClassName="text-base leading-snug"
          icon={<PulseIcon className="h-5 w-5 text-mint" />}
        />
      </section>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <FilterGroup
          label="Tipo"
          options={ATENCION_TIPOS}
          value={tipo}
          onChange={(v) => setTipo(v as "Todos" | AtencionTipo)}
        />
        <FilterGroup
          label="Mes"
          options={months}
          value={month}
          onChange={setMonth}
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-4 font-medium">Fecha y hora</th>
                <th className="px-5 py-4 font-medium">Paciente</th>
                <th className="px-5 py-4 font-medium">Tipo</th>
                <th className="px-5 py-4 font-medium">Diagnóstico (CIE-10)</th>
                <th className="px-5 py-4 font-medium">Duración</th>
                <th className="px-5 py-4 font-medium">Receta</th>
                <th className="px-5 py-4 font-medium">On-chain</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr
                  key={`${a.date}-${a.time}-${i}`}
                  className="border-b border-slate-100 transition-all duration-150 last:border-0 even:bg-gray-50/50 hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-5 py-4 text-muted">
                    {a.date}
                    <span className="block text-xs text-muted/70">{a.time}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-ink">
                    {a.patient}
                  </td>
                  <td className="px-5 py-4">
                    <TipoBadge tipo={a.tipo} />
                  </td>
                  <td className="px-5 py-4 text-ink">
                    <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-muted">
                      {a.cie10}
                    </span>
                    {a.diagnosis}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-muted">
                    {a.duration} min
                  </td>
                  <td className="px-5 py-4">
                    {a.issued ? (
                      <Badge tone="mint">
                        <CheckIcon className="h-3.5 w-3.5" /> Emitida
                      </Badge>
                    ) : (
                      <Badge tone="muted">—</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-clinical-600">
                    {a.hash}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted">
                    No hay atenciones para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
              value === o
                ? "bg-clinical text-white ring-clinical"
                : "bg-white text-muted ring-slate-200 hover:text-ink",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: AtencionTipo }) {
  const map: Record<AtencionTipo, string> = {
    Consulta: "bg-clinical-50 text-clinical-600 ring-clinical/20",
    Control: "bg-indigo-50 text-indigo-600 ring-indigo-500/20",
    Urgencia: "bg-rose-50 text-rose-600 ring-rose-500/25",
    Teleconsulta: "bg-violet-50 text-violet-600 ring-violet-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        map[tipo],
      )}
    >
      {tipo}
    </span>
  );
}

/* -------------------------------- Mi Cuenta ------------------------------ */

/* -------------------------------- Estadísticas --------------------------- */

function EstadisticasSection({
  prescriptions,
}: {
  prescriptions: Prescription[];
}) {
  const activePatients = PATIENTS.filter((p) => p.status !== "Alta").length;
  const monthAtenciones = HISTORIAL.filter((a) => a.month === "Jul 2026").length;
  const avgDuration = Math.round(
    HISTORIAL.reduce((s, a) => s + a.duration, 0) / HISTORIAL.length,
  );

  // Diagnósticos más frecuentes (de todo el historial).
  const diagnosisCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of HISTORIAL)
      counts.set(a.diagnosis, (counts.get(a.diagnosis) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, []);
  const maxCount = diagnosisCounts[0]?.[1] ?? 1;

  const recent = prescriptions.slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pacientes activos"
          value={String(activePatients)}
          icon={<UsersIcon className="h-5 w-5 text-clinical" />}
        />
        <StatCard
          label="Atenciones este mes"
          value={String(monthAtenciones)}
          icon={<HistoryIcon className="h-5 w-5 text-clinical" />}
        />
        <StatCard
          label="Prescripciones emitidas"
          value={String(DOCTOR.recordsIssued)}
          icon={<DocIcon className="h-5 w-5 text-mint" />}
        />
        <StatCard
          label="Duración promedio"
          value={`${avgDuration} min`}
          icon={<ClockIcon className="h-5 w-5 text-clinical" />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Diagnósticos más frecuentes */}
        <Card className="p-0">
          <div className="border-b border-slate-200/70 px-6 py-4">
            <h2 className="text-base font-semibold text-ink">
              Diagnósticos más frecuentes
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {diagnosisCounts.map(([name, count]) => (
              <li key={name} className="px-6 py-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-ink">{name}</span>
                  <span className="shrink-0 font-semibold text-muted">
                    {count}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-clinical to-indigo-500"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Últimas prescripciones emitidas */}
        <Card className="p-0">
          <div className="border-b border-slate-200/70 px-6 py-4">
            <h2 className="text-base font-semibold text-ink">
              Últimas prescripciones emitidas
            </h2>
          </div>
          {recent.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">
              Aún no has emitido prescripciones.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-6 py-3.5 text-sm"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-clinical/80 to-indigo-500 text-xs font-semibold text-white">
                    {initials(p.patient)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {p.medication}
                    </p>
                    <p className="truncate text-xs text-muted">{p.patient}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-clinical-600">
                    {p.hashId}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------- Mi Cuenta ------------------------------ */

function CuentaSection() {
  const profile = [
    { label: "Especialidad", value: DOCTOR.specialty },
    { label: "Subespecialidad", value: DOCTOR.subspecialty },
    { label: "Registro profesional", value: DOCTOR.license },
    { label: "Universidad", value: DOCTOR.university },
    { label: "Año de titulación", value: DOCTOR.graduationYear },
    { label: "Institución actual", value: DOCTOR.institution },
    { label: "Consultorio", value: DOCTOR.office },
  ];

  const activity = [
    { label: "En TrustLeaf desde", value: DOCTOR.memberSince },
    { label: "Fichas emitidas", value: String(DOCTOR.recordsIssued) },
    { label: "Pacientes atendidos", value: String(DOCTOR.patientsSeen) },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Perfil */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-clinical to-indigo-500 text-xl font-semibold text-white">
            {initials(DOCTOR.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{DOCTOR.name}</h2>
              <Badge tone="mint">
                <CheckIcon className="h-3.5 w-3.5" /> Médico Verificado
              </Badge>
            </div>
            <p className="text-sm text-muted">
              {DOCTOR.specialty} · {DOCTOR.subspecialty}
            </p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-slate-100">
          {profile.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <dt className="shrink-0 text-muted">{r.label}</dt>
              <dd className="text-right font-medium text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Wallet */}
      <Card>
        <div className="flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-mint" />
          <h3 className="text-base font-semibold text-ink">Wallet conectada</h3>
          <Badge tone="muted" className="ml-auto">Stellar Testnet</Badge>
        </div>
        <code className="mt-4 block break-all rounded-xl bg-slate-50 px-4 py-3 font-mono text-xs text-ink ring-1 ring-inset ring-slate-200/70">
          {DOCTOR.wallet}
        </code>
        <a
          href={STELLAR_EXPERT_ACCOUNT(DOCTOR.wallet)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-clinical transition-colors hover:text-clinical-600"
        >
          Ver en Stellar Expert
          <ExternalLinkIcon className="h-4 w-4" />
        </a>
      </Card>

      {/* Actividad */}
      <Card>
        <h3 className="text-base font-semibold text-ink">Actividad</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {activity.map((a) => (
            <div
              key={a.label}
              className="rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70"
            >
              <p className="text-2xl font-semibold text-ink">{a.value}</p>
              <p className="mt-1 text-xs text-muted">{a.label}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------- Componentes UI ---------------------------- */

function StatCard({
  label,
  value,
  icon,
  valueClassName,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="border-gray-100 p-6 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50">
          {icon}
        </div>
      </div>
      <p
        className={cn(
          "mt-3 text-2xl font-bold text-clinical",
          valueClassName,
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-clinical focus:outline-none focus:ring-2 focus:ring-clinical/20 disabled:opacity-60";

/* --------------------------------- Icons --------------------------------- */
/* Inline SVGs (stroke = currentColor) para no depender de librerías externas. */

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

type IconProps = { className?: string };

function FingerprintIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 10a2 2 0 0 1 2 2v1a6 6 0 0 0 1.5 4" />
      <path d="M6.3 15.2a10 10 0 0 1-.3-2.4A6 6 0 0 1 12 6.8c1.2 0 2.3.3 3.3.9" />
      <path d="M8 12.8a4 4 0 0 1 8 0c0 2 .5 3.5 1.2 4.6" />
      <path d="M12 12.8V13a9 9 0 0 0 2 5.6" />
      <path d="M9.5 18.6A7.5 7.5 0 0 1 8 14" />
      <path d="M4.5 9A9 9 0 0 1 18 6.2" />
    </svg>
  );
}

function FaceIdIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9 10v1M15 10v1M12 9v4l-1 1M9.5 15a4 4 0 0 0 5 0" />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function LogoutIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function DocIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

function UsersIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 19v-1.5a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 5.8" />
    </svg>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

function PencilIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function HistoryIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 8v4l3 2" />
    </svg>
  );
}

function ChartIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function WalletIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
      <path d="M21 12v3h-4a2 2 0 1 1 0-4h4a1 1 0 0 1 0 1z" />
    </svg>
  );
}

function MenuIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function ClockIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PulseIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h6v6M21 3l-9 9M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </svg>
  );
}
