"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../layout";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DoctorRow { id: number; name: string; email: string; specialty: string | null; status: string; created_at: string; }
interface UserRow { privy_id: string; email: string | null; wallet: string | null; created_at: string; }
interface WaitlistRow { id: number; email: string; created_at: string; }
interface AppointmentRow {
  id: number; doctor_email: string; patient_email: string; patient_name: string;
  date: string; time_slot: string; type: string; status: string;
  consent_tx: string | null; consent_mode: string | null; meet_link: string | null; created_at: string;
}
interface ClinicalRow { id: number; patient_wallet: string; doctor_wallet: string; tx_hash: string | null; mode: string; created_at: string; }
interface LicenseRow {
  id: number; doctor_email: string; patient_name: string; tipo: string; dias: number;
  cie10: string | null; status: string; tx_hash: string | null; mode: string; created_at: string;
}

interface Overview {
  ok: boolean;
  generatedAt: string;
  tables: {
    doctors?: { count?: number; recent?: DoctorRow[] };
    users?: { count?: number; recent?: UserRow[] };
    waitlist?: { count?: number; recent?: WaitlistRow[] };
    availability?: { count?: number };
    appointments?: { count?: number; recent?: AppointmentRow[] };
    clinicalEntries?: { count?: number; recent?: ClinicalRow[] };
    licenses?: { count?: number; recent?: LicenseRow[] };
    painDiary?: { count?: number };
  };
}

type ResetScope = "transactional" | "all";

// ── Helpers ───────────────────────────────────────────────────────────────────
function trunc(s: string | null | undefined): string {
  if (!s) return "—";
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";

// ── Small building blocks ─────────────────────────────────────────────────────
function Badge({ tone, children }: { tone: "emerald" | "amber" | "rose" | "sky" | "slate"; children: React.ReactNode }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-600",
    sky: "bg-sky-100 text-sky-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>;
}

function TxLink({ tx }: { tx: string | null }) {
  if (!tx) return <span className="text-xs text-slate-400">sin tx</span>;
  return (
    <a
      href={`${EXPLORER}${tx}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-mono text-sky-500 hover:text-sky-600 hover:underline"
    >
      {trunc(tx)}
    </a>
  );
}

function StageCard({ n, title, count, children }: {
  n: number; title: string; count: number; children: React.ReactNode;
}) {
  const filled = count > 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          filled ? "bg-sky-500 text-white" : "bg-slate-200 text-slate-500"
        }`}>
          {n}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <span className={`text-3xl font-semibold ${filled ? "text-sky-500" : "text-slate-300"}`}>{count}</span>
          </div>
          <div className="mt-3">
            {filled ? children : <p className="text-sm text-slate-400">— sin datos —</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{children}</div>;
}

// ── Reset dialog ──────────────────────────────────────────────────────────────
function ResetDialog({ token, onClose, onDone }: {
  token: string; onClose: () => void; onDone: () => void;
}) {
  const [loading, setLoading] = useState<ResetScope | null>(null);
  const [error, setError] = useState("");

  async function reset(scope: ResetScope) {
    setLoading(scope);
    setError("");
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, confirm: "RESET", scope }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Error al limpiar");
        setLoading(null);
        return;
      }
      onDone();
      onClose();
    } catch {
      setError("Error de conexión");
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-slate-800">¿Limpiar datos de prueba?</h3>
        <p className="mt-2 text-sm text-slate-500">
          Esta acción es permanente. Elige el alcance de la limpieza.
        </p>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}
        <div className="mt-5 space-y-3">
          <button
            onClick={() => void reset("transactional")}
            disabled={loading !== null}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50"
          >
            <span className="block font-semibold text-slate-800">
              {loading === "transactional" ? "Limpiando…" : "Solo datos de flujo"}
            </span>
            <span className="block text-xs text-slate-500">
              Reservas, consentimientos, fichas, licencias, diario. Mantiene médicos y usuarios.
            </span>
          </button>
          <button
            onClick={() => void reset("all")}
            disabled={loading !== null}
            className="w-full rounded-xl border border-rose-200 px-4 py-3 text-left text-sm transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"
          >
            <span className="block font-semibold text-rose-600">
              {loading === "all" ? "Limpiando…" : "Todo, incluyendo médicos y usuarios"}
            </span>
            <span className="block text-xs text-slate-500">
              Deja el sistema completamente vacío para una demo desde cero.
            </span>
          </button>
        </div>
        <button
          onClick={onClose}
          disabled={loading !== null}
          className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminFlujoPage() {
  const { token } = useAdmin();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReset, setShowReset] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/overview?token=${encodeURIComponent(token)}`);
      const d = (await res.json()) as Overview;
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { void fetchOverview(); }, [fetchOverview]);

  const t = data?.tables;
  const doctors = t?.doctors?.recent ?? [];
  const users = t?.users?.recent ?? [];
  const appointments = t?.appointments?.recent ?? [];
  const clinical = t?.clinicalEntries?.recent ?? [];
  const licenses = t?.licenses?.recent ?? [];

  const doctorsCount = t?.doctors?.count ?? 0;
  const usersCount = t?.users?.count ?? 0;
  const availabilityCount = t?.availability?.count ?? 0;
  const appointmentsCount = t?.appointments?.count ?? 0;
  const clinicalCount = t?.clinicalEntries?.count ?? 0;
  const licensesCount = t?.licenses?.count ?? 0;

  const activeDoctors = doctors.filter((d) => d.status === "active").length;
  const blockedDoctors = doctors.filter((d) => d.status === "blocked").length;
  const consentCount = appointments.filter((a) => a.consent_tx).length;

  const totalRecords =
    doctorsCount + usersCount + (t?.waitlist?.count ?? 0) + availabilityCount +
    appointmentsCount + clinicalCount + licensesCount + (t?.painDiary?.count ?? 0);
  const clean = totalRecords === 0;

  return (
    <div className="px-8 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Flujo del sistema</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data?.generatedAt ? `Generado ${fmtTs(data.generatedAt)}` : "Observabilidad end-to-end del recorrido del paciente"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void fetchOverview()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66" />
            </svg>
            Actualizar
          </button>
          <button
            onClick={() => setShowReset(true)}
            className="flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
            Limpiar datos de prueba
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          Cargando flujo…
        </div>
      ) : (
        <>
          {/* Overall banner */}
          <div className={`mb-6 rounded-2xl border px-5 py-4 text-sm font-medium ${
            clean
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}>
            {clean
              ? "✅ Sistema limpio — listo para una demo desde cero"
              : `${totalRecords} registros en el sistema`}
          </div>

          <div className="space-y-4">
            {/* 1. Médico registrado */}
            <StageCard n={1} title="Médico registrado" count={doctorsCount}>
              <div className="space-y-2">
                {doctors.map((d) => (
                  <Row key={d.id}>
                    <span className="font-medium text-slate-700">{d.name}</span>
                    <Badge tone={d.status === "active" ? "emerald" : "rose"}>
                      {d.status === "active" ? "activo" : "bloqueado"}
                    </Badge>
                  </Row>
                ))}
              </div>
            </StageCard>

            {/* 2. Aprobación del médico */}
            <StageCard n={2} title="Aprobación del médico" count={doctorsCount}>
              <div className="flex gap-3">
                <Badge tone="emerald">{activeDoctors} aceptados</Badge>
                <Badge tone="rose">{blockedDoctors} bloqueados</Badge>
              </div>
            </StageCard>

            {/* 3. Usuario (paciente) creado */}
            <StageCard n={3} title="Usuario (paciente) creado" count={usersCount}>
              <div className="space-y-2">
                {users.map((u) => (
                  <Row key={u.privy_id}>
                    <span className="font-medium text-slate-700">{u.email ?? "—"}</span>
                    <span className="font-mono text-xs text-slate-500">{trunc(u.wallet)}</span>
                  </Row>
                ))}
              </div>
            </StageCard>

            {/* 4. Disponibilidad configurada */}
            <StageCard n={4} title="Disponibilidad configurada" count={availabilityCount}>
              <p className="text-sm text-slate-500">{availabilityCount} bloques horarios configurados.</p>
            </StageCard>

            {/* 5. Reserva de hora */}
            <StageCard n={5} title="Reserva de hora" count={appointmentsCount}>
              <div className="space-y-2">
                {appointments.map((a) => (
                  <Row key={a.id}>
                    <span className="font-medium text-slate-700">{a.patient_name}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{a.date} {a.time_slot}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{a.type}</span>
                    <Badge tone="sky">{a.status}</Badge>
                  </Row>
                ))}
              </div>
            </StageCard>

            {/* 6. Consulta / consentimiento */}
            <StageCard n={6} title="Consulta / consentimiento" count={consentCount}>
              <div className="space-y-2">
                {appointments.filter((a) => a.consent_tx).map((a) => (
                  <Row key={a.id}>
                    <span className="font-medium text-slate-700">{a.patient_name}</span>
                    <Badge tone={a.consent_mode === "onchain" ? "emerald" : "amber"}>
                      {a.consent_mode === "onchain" ? "on-chain" : "simulado"}
                    </Badge>
                    <TxLink tx={a.consent_tx} />
                  </Row>
                ))}
              </div>
            </StageCard>

            {/* 7. Ficha clínica on-chain */}
            <StageCard n={7} title="Ficha clínica on-chain" count={clinicalCount}>
              <div className="space-y-2">
                {clinical.map((c) => (
                  <Row key={c.id}>
                    <span className="font-mono text-xs text-slate-500">{trunc(c.patient_wallet)}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-xs text-slate-500">{trunc(c.doctor_wallet)}</span>
                    <Badge tone={c.mode === "onchain" ? "emerald" : "amber"}>
                      {c.mode === "onchain" ? "on-chain" : "simulado"}
                    </Badge>
                    {c.mode === "onchain" && <TxLink tx={c.tx_hash} />}
                  </Row>
                ))}
              </div>
            </StageCard>

            {/* 8. Licencias médicas */}
            <StageCard n={8} title="Licencias médicas" count={licensesCount}>
              <div className="space-y-2">
                {licenses.map((l) => (
                  <Row key={l.id}>
                    <span className="font-medium text-slate-700">{l.patient_name}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{l.tipo}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{l.dias} días</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{l.status}</span>
                    <Badge tone={l.mode === "onchain" ? "emerald" : "amber"}>
                      {l.mode === "onchain" ? "on-chain" : "simulado"}
                    </Badge>
                    {l.mode === "onchain" && <TxLink tx={l.tx_hash} />}
                  </Row>
                ))}
              </div>
            </StageCard>
          </div>
        </>
      )}

      {showReset && (
        <ResetDialog
          token={token}
          onClose={() => setShowReset(false)}
          onDone={() => void fetchOverview()}
        />
      )}
    </div>
  );
}
