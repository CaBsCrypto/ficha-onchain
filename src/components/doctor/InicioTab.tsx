'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { MOCK_PRESCRIPTIONS, MOCK_LICENSES } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Appointment {
  id: number;
  patient_email: string;
  patient_name: string;
  date: string;
  time_slot: string;
  type: 'Presencial' | 'Telemedicina';
  motivo: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
}

// ── Quick actions ─────────────────────────────────────────────────────────────
interface QuickAction {
  label: string;
  href: string;
  color: string;
  icon: React.ReactNode;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Nueva Consulta',
    href: '/doctor?tab=consultas',
    color: 'bg-sky-500 hover:bg-sky-600 text-white',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
      </svg>
    ),
  },
  {
    label: 'Nueva Receta',
    href: '/doctor?tab=recetas',
    color: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 6h5a3 3 0 010 6H5V6zm0 6 6 6M5 12h4" /><path d="m15 13 5 6m0-6-5 6" />
      </svg>
    ),
  },
  {
    label: 'Nueva Licencia',
    href: '/doctor?tab=licencias',
    color: 'bg-amber-500 hover:bg-amber-600 text-white',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    label: 'Ver Pacientes',
    href: '/doctor?tab=pacientes',
    color: 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="4" /><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7" />
        <path d="M19 8c1.1.5 2 1.7 2 3M21 21c0-2.5-1.8-4.5-4-5.3" />
      </svg>
    ),
  },
];

// ── InicioTab ─────────────────────────────────────────────────────────────────
export function InicioTab() {
  const { user } = usePrivy();
  const doctorEmail = user?.email?.address ?? '';

  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [loading, setLoading] = useState(true);

  const today = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!doctorEmail) { setLoading(false); return; }
    authedFetch(`/api/appointments?doctorEmail=${encodeURIComponent(doctorEmail)}`)
      .then((r) => r.json())
      .then((data: { appointments?: Appointment[] }) => {
        const all = data.appointments ?? [];
        setTotalAppointments(all.length);
        setTodayAppointments(
          all
            .filter((a) => {
              const d = typeof a.date === 'string' ? a.date.slice(0, 10) : '';
              return d === todayISO && a.status === 'scheduled';
            })
            .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [doctorEmail, todayISO]);

  const statsData = [
    {
      label: 'Consultas hoy',
      value: loading ? '…' : String(todayAppointments.length),
      sub: `${totalAppointments} en total`,
      color: 'bg-sky-50 text-sky-600',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      ),
    },
    {
      label: 'Recetas emitidas',
      value: String(MOCK_PRESCRIPTIONS.length),
      sub: 'Datos de muestra',
      color: 'bg-emerald-50 text-emerald-600',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 6h5a3 3 0 010 6H5V6zm0 6 6 6M5 12h4" />
          <path d="m15 13 5 6m0-6-5 6" />
        </svg>
      ),
    },
    {
      label: 'Licencias activas',
      value: String(MOCK_LICENSES.filter((l) => l.status === 'Emitida' || l.status === 'Validada').length),
      sub: 'Datos de muestra',
      color: 'bg-amber-50 text-amber-600',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">Bienvenido{doctorEmail ? `, ${doctorEmail.split('@')[0]}` : ''}</h1>
        <p className="mt-1 text-sm text-slate-500 capitalize">{today}</p>
        {loading ? (
          <p className="mt-3 text-sm text-slate-400">Cargando consultas…</p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Tienes{' '}
            <span className="font-semibold text-sky-600">
              {todayAppointments.length} consulta{todayAppointments.length !== 1 ? 's' : ''}
            </span>{' '}
            agendadas para hoy.
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {statsData.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
            <p className="text-sm font-medium text-slate-600">{s.label}</p>
            <p className="mt-0.5 text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Today's consultations (real data) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Consultas de hoy</h2>
          <Link href="/doctor?tab=consultas" className="text-xs text-sky-500 hover:underline">Ver todas →</Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        ) : todayAppointments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            No hay consultas agendadas para hoy.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayAppointments.map((a) => (
              <div key={a.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 font-semibold text-sm">
                  {a.time_slot}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{a.patient_name || a.patient_email}</p>
                  {a.motivo && <p className="text-xs text-slate-500">{a.motivo}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  a.type === 'Presencial'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-violet-50 text-violet-700'
                }`}>
                  {a.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Acciones rápidas</h2>
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm transition-colors ${a.color}`}
            >
              {a.icon}
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
