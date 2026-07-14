'use client';

import { useState } from 'react';
import { Modal } from './Modal';
import { MOCK_PATIENTS, MOCK_PRESCRIPTIONS, MOCK_LICENSES } from './types';
import type { MockPatient, PatientStatus } from './types';
import { cn } from '@/lib/utils';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PatientStatus }) {
  const cls: Record<PatientStatus, string> = {
    Activo:  'bg-emerald-50 text-emerald-700',
    Nuevo:   'bg-sky-50 text-sky-700',
    Crónico: 'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[status]}`}>
      {status}
    </span>
  );
}

// ── Patient detail modal ──────────────────────────────────────────────────────
type DetailTab = 'resumen' | 'dolor' | 'recetas' | 'licencias';

function PatientDetailModal({ patient, onClose }: { patient: MockPatient; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>('resumen');
  const patientRxs = MOCK_PRESCRIPTIONS.filter((rx) => rx.patientName === patient.name);
  const patientLics = MOCK_LICENSES.filter((lic) => lic.patientName === patient.name);

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'resumen',   label: 'Resumen' },
    { id: 'dolor',     label: 'Dolor' },
    { id: 'recetas',   label: 'Recetas' },
    { id: 'licencias', label: 'Licencias' },
  ];

  return (
    <Modal title={patient.name} onClose={onClose} width="max-w-xl">
      {/* Internal tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
              tab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Resumen */}
      {tab === 'resumen' && (
        <div className="space-y-3">
          <Row label="RUT"          value={patient.rut} />
          <Row label="Edad"         value={`${patient.age} años`} />
          <Row label="Condición"    value={patient.condition} />
          <Row label="Email"        value={patient.email} />
          <Row label="Última visita" value={patient.lastVisit} />
          <Row label="Estado"       value={<StatusBadge status={patient.status} />} />
        </div>
      )}

      {/* Dolor */}
      {tab === 'dolor' && (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700">Mapa de dolor 3D — próximamente en consulta en vivo</p>
          <p className="mt-1 text-xs text-slate-400">Esta función estará disponible durante videoconsultas activas.</p>
        </div>
      )}

      {/* Recetas */}
      {tab === 'recetas' && (
        <div className="space-y-2">
          {patientRxs.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-4">Sin recetas registradas</p>
          ) : patientRxs.map((rx) => (
            <div key={rx.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">{rx.medication}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  rx.status === 'Activa' ? 'bg-emerald-50 text-emerald-700'
                  : rx.status === 'Dispensada' ? 'bg-sky-50 text-sky-700'
                  : 'bg-slate-100 text-slate-500'
                }`}>{rx.status}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{rx.posologia} · {rx.tipo} · {rx.fecha}</p>
            </div>
          ))}
        </div>
      )}

      {/* Licencias */}
      {tab === 'licencias' && (
        <div className="space-y-2">
          {patientLics.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-4">Sin licencias registradas</p>
          ) : patientLics.map((lic) => (
            <div key={lic.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">{lic.tipo}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  lic.status === 'Validada' ? 'bg-emerald-50 text-emerald-700'
                  : lic.status === 'Emitida' ? 'bg-sky-50 text-sky-700'
                  : 'bg-slate-100 text-slate-500'
                }`}>{lic.status}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Desde {lic.fechaInicio} · {lic.dias} días · CIE-10: {lic.cie10}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-2.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  );
}

// ── PacientesTab ──────────────────────────────────────────────────────────────
export function PacientesTab() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MockPatient | null>(null);

  const filtered = MOCK_PATIENTS.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.rut.includes(query) ||
      p.condition.toLowerCase().includes(query.toLowerCase()),
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
          placeholder="Buscar por nombre, RUT o condición…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Desktop table */}
        <table className="hidden w-full text-sm md:table">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">RUT</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Última visita</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <tr
                key={p.id}
                onClick={() => setSelected(p)}
                className="cursor-pointer transition-colors hover:bg-sky-50/50"
              >
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.condition}</p>
                </td>
                <td className="px-5 py-3.5 font-mono text-slate-600">{p.rut}</td>
                <td className="px-5 py-3.5 text-slate-600">{p.lastVisit}</td>
                <td className="px-5 py-3.5"><StatusBadge status={p.status} /></td>
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
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-sky-50/50"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600 text-sm font-bold">
                {p.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-500">{p.rut} · {p.lastVisit}</p>
              </div>
              <StatusBadge status={p.status} />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Sin resultados</p>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selected !== null && (
        <PatientDetailModal patient={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
