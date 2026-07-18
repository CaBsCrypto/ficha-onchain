'use client';

/**
 * PacientesTab — real DB, no mock data
 * ---------------------------------------------------------------------------
 * - Fetches unique patients from /api/doctor/patients?doctorEmail=X
 *   (aggregated from appointments + medical_licenses)
 * - Detail modal shows real citas and licencias per patient
 * - Search by name or email
 */

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePrivyEmail } from '@/hooks/usePrivyEmail';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { cn } from '@/lib/utils';

interface RxItem {
  id: string;
  medication: string;
  dosage: string;
  status: string; // Registrada | Activa | Revocada | ...
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PatientSummary {
  patient_email: string | null;
  patient_name:  string;
  last_seen:     string;
  appt_count:    number;
  lic_count:     number;
}

interface DBAppointment {
  id: number;
  doctor_email: string;
  patient_email: string;
  patient_name: string;
  date: string;
  time_slot: string;
  type: string;
  motivo: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

interface DBLicense {
  id: number;
  patient_name: string;
  fecha_inicio: string;
  dias: number;
  cie10: string;
  tipo: string;
  diagnostico: string | null;
  status: string;
  tx_hash: string | null;
  doc_hash: string | null;
  mode: 'onchain' | 'simulated' | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-orange-100 text-orange-700',
];
function avatarColor(name: string): string {
  const idx = (name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx] ?? AVATAR_COLORS[0]!;
}

// ── Patient detail modal ──────────────────────────────────────────────────────
type DetailTab = 'resumen' | 'citas' | 'recetas' | 'ficha' | 'licencias';

interface FichaEntry {
  id: number;
  kind: string;
  summary: string;
  detail: string | null;
  content_hash: string;
  tx_hash: string | null;
  mode: string;
  created_at: string;
}

function PatientDetailModal({
  patient,
  doctorEmail,
  onClose,
}: {
  patient: PatientSummary;
  doctorEmail: string;
  onClose: () => void;
}) {
  const [tab,     setTab]     = useState<DetailTab>('resumen');
  const [appts,   setAppts]   = useState<DBAppointment[]>([]);
  const [lics,    setLics]    = useState<DBLicense[]>([]);
  const [rx,      setRx]      = useState<RxItem[]>([]);
  const [ficha,   setFicha]   = useState<FichaEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFicha = useCallback(() => {
    if (!patient.patient_email) return;
    fetch(`/api/ficha/entries?patientEmail=${encodeURIComponent(patient.patient_email)}`)
      .then(r => r.json() as Promise<{ entries?: FichaEntry[] }>)
      .then(j => setFicha(j.entries ?? []))
      .catch(() => setFicha([]));
  }, [patient.patient_email]);

  useEffect(() => { loadFicha(); }, [loadFicha]);

  useEffect(() => {
    if (!patient.patient_email) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/appointments?doctorEmail=${encodeURIComponent(doctorEmail)}&patientEmail=${encodeURIComponent(patient.patient_email)}`)
        .then(r => r.json() as Promise<{ data?: DBAppointment[]; appointments?: DBAppointment[] }>)
        .then(j => j.data ?? j.appointments ?? []),
      fetch(`/api/licenses?patientEmail=${encodeURIComponent(patient.patient_email)}`)
        .then(r => r.json() as Promise<{ data?: DBLicense[] }>)
        .then(j => j.data ?? []),
      // Prescriptions are on-chain, keyed by wallet — resolve the patient's
      // wallet from their email first, then read the chain. authedFetch carries
      // the doctor's token past the /api/prescriptions guard.
      fetch(`/api/patient-wallet?email=${encodeURIComponent(patient.patient_email)}`)
        .then(r => (r.ok ? r.json() as Promise<{ wallet?: string }> : { wallet: undefined }))
        .then(async ({ wallet }) => {
          if (!wallet) return [] as RxItem[];
          const res = await authedFetch(`/api/prescriptions?role=patient&wallet=${wallet}`);
          const j = await res.json() as { prescriptions?: RxItem[] };
          return j.prescriptions ?? [];
        }),
    ])
      .then(([a, l, r]) => { setAppts(a); setLics(l); setRx(r); })
      .catch(err => console.error('[PatientDetail]', err))
      .finally(() => setLoading(false));
  }, [patient.patient_email, doctorEmail]);

  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'resumen',   label: 'Resumen' },
    { id: 'citas',     label: 'Citas',     count: appts.length },
    { id: 'recetas',   label: 'Recetas',   count: rx.length },
    { id: 'ficha',     label: 'Ficha',     count: ficha.length },
    { id: 'licencias', label: 'Licencias', count: lics.length },
  ];

  const rxBadge = (status: string) =>
    status === 'Activa'      ? 'bg-emerald-100 text-emerald-700'
    : status === 'Revocada'  ? 'bg-rose-100 text-rose-700'
    : status === 'Registrada'? 'bg-sky-100 text-sky-700'
    : 'bg-slate-100 text-slate-600';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold', avatarColor(patient.patient_name))}>
            {initials(patient.patient_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-800">{patient.patient_name}</p>
            <p className="truncate text-xs text-slate-400">{patient.patient_email ?? 'Sin email registrado'}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 border-b border-slate-100 px-4 py-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
              )}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', tab === t.id ? 'bg-white/20' : 'bg-slate-200')}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
            </div>
          )}

          {!loading && tab === 'resumen' && (
            <div className="space-y-3">
              <InfoRow label="Nombre"  value={patient.patient_name} />
              <InfoRow label="Email"   value={patient.patient_email ?? '—'} />
              <InfoRow label="Última interacción" value={fmtDate(patient.last_seen)} />
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-sky-50 px-4 py-3 text-center">
                  <p className="text-xl font-bold text-sky-700">{patient.appt_count}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-500">Citas</p>
                </div>
                <div className="flex-1 rounded-xl bg-violet-50 px-4 py-3 text-center">
                  <p className="text-xl font-bold text-violet-700">{patient.lic_count}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Licencias</p>
                </div>
              </div>
              {!patient.patient_email && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  Paciente sin email — las licencias emitidas sin email no pueden recibir notificaciones.
                </div>
              )}
            </div>
          )}

          {!loading && tab === 'citas' && (
            <div className="space-y-2">
              {appts.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Sin citas registradas</p>
              ) : appts.map(a => (
                <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">{a.date} · {a.time_slot}</p>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      a.status === 'scheduled'  ? 'bg-sky-50 text-sky-700'
                      : a.status === 'completed' ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500',
                    )}>
                      {a.status === 'scheduled' ? 'Agendada' : a.status === 'completed' ? 'Completada' : 'Cancelada'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{a.type}{a.motivo ? ` · ${a.motivo}` : ''}</p>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'recetas' && (
            <div className="space-y-2">
              {rx.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Sin recetas on-chain</p>
              ) : rx.map(r => (
                <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">{r.medication}</p>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', rxBadge(r.status))}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{r.dosage} · receta #{r.id}</p>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'ficha' && (
            <FichaEntries
              entries={ficha}
              patient={patient}
              doctorEmail={doctorEmail}
              onAdded={loadFicha}
            />
          )}

          {!loading && tab === 'licencias' && (
            <div className="space-y-2">
              {lics.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Sin licencias registradas</p>
              ) : lics.map(l => (
                <div key={l.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">{l.tipo}</p>
                    {l.status === 'signed' && (
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', l.mode === 'onchain' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700')}>
                        {l.mode === 'onchain' ? '⚡ On-chain' : '📋 Demo'}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Desde {l.fecha_inicio} · {l.dias} días · CIE-10: {l.cie10}
                    {l.diagnostico ? ` · ${l.diagnostico}` : ''}
                  </p>
                  {(l.tx_hash ?? l.doc_hash) && (
                    <p className="mt-1 truncate font-mono text-[9px] text-slate-400">{l.tx_hash ?? l.doc_hash}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} className="w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-2.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right text-sm text-slate-800">{value}</span>
    </div>
  );
}

// ── PacientesTab ──────────────────────────────────────────────────────────────
export function PacientesTab() {
  const { user }     = usePrivy();
  const displayEmail = usePrivyEmail();
  const doctorEmail  = user?.email?.address ?? displayEmail ?? '';

  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<PatientSummary | null>(null);

  const fetchPatients = useCallback(async () => {
    if (!doctorEmail) return;
    setLoading(true);
    try {
      const res  = await authedFetch(`/api/doctor/patients?doctorEmail=${encodeURIComponent(doctorEmail)}`);
      const json = await res.json() as { data?: PatientSummary[] };
      if (json.data) setPatients(json.data);
    } catch (err) {
      console.error('[PacientesTab]', err);
    } finally {
      setLoading(false);
    }
  }, [doctorEmail]);

  useEffect(() => { void fetchPatients(); }, [fetchPatients]);

  const filtered = patients.filter(p =>
    p.patient_name.toLowerCase().includes(query.toLowerCase()) ||
    (p.patient_email ?? '').toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por nombre o email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
        </div>
      ) : patients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">Sin pacientes registrados</p>
          <p className="mt-1 text-xs text-slate-400">
            Aparecerán aquí a medida que agendes citas o emitas licencias.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Desktop table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Paciente</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Última visita</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Citas</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Licencias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p, i) => (
                <tr key={i} onClick={() => setSelected(p)} className="cursor-pointer transition-colors hover:bg-sky-50/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold', avatarColor(p.patient_name))}>
                        {initials(p.patient_name)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{p.patient_name}</p>
                        <p className="text-xs text-slate-400">{p.patient_email ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{fmtDate(p.last_seen)}</td>
                  <td className="px-5 py-3.5">
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">{p.appt_count}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {p.lic_count > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">{p.lic_count}</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">
                    Sin resultados para &ldquo;{query}&rdquo;
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile list */}
          <div className="divide-y divide-slate-100 md:hidden">
            {filtered.map((p, i) => (
              <button key={i} onClick={() => setSelected(p)} className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-sky-50/50">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold', avatarColor(p.patient_name))}>
                  {initials(p.patient_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{p.patient_name}</p>
                  <p className="truncate text-xs text-slate-400">{p.patient_email ?? '—'} · {fmtDate(p.last_seen)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{p.appt_count} citas</span>
                  {p.lic_count > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{p.lic_count} lics</span>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-400">Sin resultados</p>}
          </div>
        </div>
      )}

      {selected !== null && (
        <PatientDetailModal
          patient={selected}
          doctorEmail={doctorEmail}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── Ficha on-chain: history + append form ──────────────────────────────────────
const FICHA_KINDS = ['Condition', 'Observation', 'DiagnosticReport', 'Procedure', 'Note'] as const;

function FichaEntries({
  entries,
  patient,
  doctorEmail,
  onAdded,
}: {
  entries: FichaEntry[];
  patient: PatientSummary;
  doctorEmail: string;
  onAdded: () => void;
}) {
  const [kind,    setKind]    = useState<typeof FICHA_KINDS[number]>('Condition');
  const [summary, setSummary] = useState('');
  const [detail,  setDetail]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState<string>('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim() || !patient.patient_email) return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      // Resolve the patient's wallet so the entry anchors under their record.
      let wallet: string | undefined;
      try {
        const wr = await fetch(`/api/patient-wallet?email=${encodeURIComponent(patient.patient_email)}`);
        if (wr.ok) wallet = ((await wr.json()) as { wallet?: string }).wallet;
      } catch { /* wallet optional */ }

      const res = await authedFetch('/api/ficha/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientEmail: patient.patient_email,
          patientWallet: wallet,
          kind, summary, detail: detail || undefined, doctorEmail,
        }),
      });
      const data = (await res.json()) as { mode?: string; error?: string; reason?: string };
      if (!res.ok) { setError(data.error ?? 'No se pudo agregar la entrada'); return; }
      setResult(data.mode === 'onchain' ? '⚡ Anclada on-chain' : `📋 Registrada (${data.reason ?? 'simulada'})`);
      setSummary(''); setDetail('');
      onAdded();
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100';

  return (
    <div className="space-y-4">
      {/* Append form */}
      <form onSubmit={handleAdd} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agregar a la ficha on-chain</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={kind} onChange={e => setKind(e.target.value as typeof FICHA_KINDS[number])} className={inputCls}>
            {FICHA_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="Resumen (ej: Hipertensión I10)"
            className={`${inputCls} col-span-2`} />
        </div>
        <input value={detail} onChange={e => setDetail(e.target.value)} placeholder="Detalle (opcional)" className={inputCls} />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {result && <p className="text-xs text-emerald-600">{result}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !summary.trim() || !patient.patient_email}
            className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:opacity-40">
            {saving ? 'Anclando…' : 'Agregar entrada'}
          </button>
        </div>
        {!patient.patient_email && (
          <p className="text-[11px] text-amber-600">Este paciente no tiene email — no se puede anclar su ficha.</p>
        )}
      </form>

      {/* History */}
      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Sin entradas en la ficha aún.</p>
      ) : entries.map(en => (
        <div key={en.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">{en.summary}</p>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              en.mode === 'onchain' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700')}>
              {en.mode === 'onchain' ? '⚡ On-chain' : '📋 Demo'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{en.kind}{en.detail ? ` · ${en.detail}` : ''}</p>
          <p className="mt-1 truncate font-mono text-[9px] text-slate-400" title={en.content_hash}>
            hash: {en.content_hash}
          </p>
        </div>
      ))}
    </div>
  );
}
