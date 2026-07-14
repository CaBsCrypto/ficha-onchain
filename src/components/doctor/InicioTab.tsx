'use client';

import Link from 'next/link';
import { MOCK_CONSULTATIONS } from './types';

// ── Stat cards ────────────────────────────────────────────────────────────────
interface Stat {
  label: string;
  value: string;
  sub: string;
  color: string;
  icon: React.ReactNode;
}

const STATS: Stat[] = [
  {
    label: 'Pacientes activos',
    value: '24',
    sub: '+2 este mes',
    color: 'bg-sky-50 text-sky-600',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="4" /><path d="M2 21c0-4 3.1-7 7-7h4" />
        <path d="M19 11v6m-3-3h6" />
      </svg>
    ),
  },
  {
    label: 'Consultas hoy',
    value: '6',
    sub: '3 pendientes',
    color: 'bg-violet-50 text-violet-600',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    label: 'Recetas emitidas',
    value: '147',
    sub: '5 este mes',
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
    value: '8',
    sub: '2 por vencer',
    color: 'bg-amber-50 text-amber-600',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h4" />
      </svg>
    ),
  },
];

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
  const today = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">Bienvenido, Dr.</h1>
        <p className="mt-1 text-sm text-slate-500 capitalize">{today}</p>
        <p className="mt-3 text-sm text-slate-600">
          Tienes <span className="font-semibold text-sky-600">{MOCK_CONSULTATIONS.length} consultas</span> agendadas para hoy.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map((s) => (
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

      {/* Upcoming consultations */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-800">Consultas de hoy</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {MOCK_CONSULTATIONS.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 font-semibold text-sm">
                {c.time}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{c.patientName}</p>
                <p className="text-xs text-slate-500">{c.motivo}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                c.type === 'Presencial'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-violet-50 text-violet-700'
              }`}>
                {c.type}
              </span>
            </div>
          ))}
        </div>
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
