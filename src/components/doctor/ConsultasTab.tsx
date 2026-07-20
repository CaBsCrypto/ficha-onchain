'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { Modal, FormField, inputCls, selectCls, textareaCls } from './Modal';
import type { ConsultationType } from './types';

// ── DB types ──────────────────────────────────────────────────────────────────
interface Appointment {
  id: number;
  doctor_email: string;
  patient_email: string;
  patient_name: string;
  date: string;
  time_slot: string;
  type: ConsultationType;
  motivo: string | null;
  notes: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  meet_link: string | null;
  created_at: string;
}

// ── Form ──────────────────────────────────────────────────────────────────────
interface NewConsultaForm {
  patientEmail: string;
  patientName: string;
  date: string;
  time: string;
  type: ConsultationType;
  motivo: string;
  notes: string;
}

const EMPTY_FORM: NewConsultaForm = {
  patientEmail: '',
  patientName: '',
  date: '',
  time: '',
  type: 'Presencial',
  motivo: '',
  notes: '',
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Appointment['status'] }) {
  const map: Record<Appointment['status'], { label: string; cls: string }> = {
    scheduled:  { label: 'Agendada',   cls: 'bg-sky-50 text-sky-700' },
    completed:  { label: 'Completada', cls: 'bg-emerald-50 text-emerald-700' },
    cancelled:  { label: 'Cancelada',  cls: 'bg-rose-50 text-rose-600' },
  };
  const { label, cls } = map[status] ?? map.scheduled;
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

// ── Nueva consulta modal ──────────────────────────────────────────────────────
function NuevaConsultaModal({
  doctorEmail,
  onClose,
  onSaved,
}: {
  doctorEmail: string;
  onClose: () => void;
  onSaved: (a: Appointment) => void;
}) {
  const [form, setForm] = useState<NewConsultaForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof NewConsultaForm>(key: K, val: NewConsultaForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setError('');
  }

  const canSubmit = form.patientEmail && form.date && form.time && form.motivo;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await authedFetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorEmail,
          patientEmail: form.patientEmail,
          patientName: form.patientName || form.patientEmail,
          date: form.date,
          timeSlot: form.time,
          type: form.type,
          motivo: form.motivo || null,
          notes: form.notes || null,
        }),
      });
      const data = (await res.json()) as { appointment?: Appointment; error?: string };
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); setLoading(false); return; }
      onSaved(data.appointment!);
      onClose();
    } catch {
      setError('Error de conexión');
    }
    setLoading(false);
  }

  return (
    <Modal title="Nueva consulta" onClose={onClose} width="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient email */}
        <FormField label="Email del paciente" required>
          <input
            type="email"
            value={form.patientEmail}
            onChange={(e) => set('patientEmail', e.target.value)}
            placeholder="paciente@email.cl"
            className={inputCls}
          />
        </FormField>

        {/* Patient name */}
        <FormField label="Nombre del paciente">
          <input
            type="text"
            value={form.patientName}
            onChange={(e) => set('patientName', e.target.value)}
            placeholder="Ej: María González (opcional)"
            className={inputCls}
          />
        </FormField>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Fecha" required>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="Hora" required>
            <input
              type="time"
              value={form.time}
              onChange={(e) => set('time', e.target.value)}
              className={inputCls}
            />
          </FormField>
        </div>

        {/* Type */}
        <FormField label="Tipo" required>
          <select
            value={form.type}
            onChange={(e) => set('type', e.target.value as ConsultationType)}
            className={selectCls}
          >
            <option value="Presencial">Presencial</option>
            <option value="Telemedicina">Telemedicina</option>
          </select>
        </FormField>

        {/* Motivo */}
        <FormField label="Motivo de consulta" required>
          <input
            type="text"
            value={form.motivo}
            onChange={(e) => set('motivo', e.target.value)}
            placeholder="Ej: Control hipertensión"
            className={inputCls}
          />
        </FormField>

        {/* Notas clínicas */}
        <FormField label="Notas clínicas">
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Observaciones, anamnesis, examen físico…"
            rows={3}
            className={textareaCls}
          />
        </FormField>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Guardando…' : 'Guardar consulta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── ConsultasTab ──────────────────────────────────────────────────────────────
export function ConsultasTab() {
  const { user } = usePrivy();
  const doctorEmail = user?.email?.address ?? '';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchAppointments = useCallback(async () => {
    if (!doctorEmail) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/appointments?doctorEmail=${encodeURIComponent(doctorEmail)}`);
      const data = (await res.json()) as { appointments?: Appointment[] };
      setAppointments(data.appointments ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [doctorEmail]);

  useEffect(() => { void fetchAppointments(); }, [fetchAppointments]);

  async function updateStatus(id: number, status: Appointment['status']) {
    setUpdatingId(id);
    await authedFetch('/api/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status } : a));
    setUpdatingId(null);
  }

  async function deleteAppointment(id: number) {
    setUpdatingId(id);
    await authedFetch('/api/appointments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setUpdatingId(null);
  }

  // Group by date
  const byDate = appointments.reduce<Record<string, Appointment[]>>((acc, a) => {
    const dateKey = typeof a.date === 'string' ? a.date.slice(0, 10) : String(a.date);
    (acc[dateKey] ??= []).push(a);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort();

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Consultas</h2>
          {doctorEmail && <p className="text-xs text-slate-400 mt-0.5">{doctorEmail}</p>}
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!doctorEmail}
          className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-600 disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva Consulta
        </button>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        </div>
      ) : (
        /* Day view */
        <div className="space-y-6">
          {sortedDates.map((date) => {
            const day = new Date(date + 'T00:00:00').toLocaleDateString('es-CL', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            });
            return (
              <div key={date}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 capitalize">{day}</h3>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
                  {byDate[date]
                    ?.slice()
                    .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
                    .map((a) => (
                      <div key={a.id} className="flex items-center gap-4 px-5 py-4">
                        {/* Time */}
                        <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                          <span className="text-xs font-bold">{a.time_slot}</span>
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">
                            {a.patient_name || a.patient_email}
                          </p>
                          {a.patient_name && a.patient_name !== a.patient_email && (
                            <p className="text-xs text-slate-400">{a.patient_email}</p>
                          )}
                          {a.motivo && <p className="text-xs text-slate-500">{a.motivo}</p>}
                        </div>
                        {/* Type badge */}
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          a.type === 'Presencial'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-violet-50 text-violet-700'
                        }`}>
                          {a.type}
                        </span>
                        {/* Status badge */}
                        <StatusBadge status={a.status} />
                        {/* Join video call — telemedicine only */}
                        {a.type === 'Telemedicina' && a.meet_link && a.status === 'scheduled' && (
                          <a
                            href={a.meet_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Entrar a la videollamada"
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-600"
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 7l-7 5 7 5V7zM1 5h15v14H1z" />
                            </svg>
                            Entrar
                          </a>
                        )}
                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {a.status === 'scheduled' && (
                            <button
                              onClick={() => void updateStatus(a.id, 'completed')}
                              disabled={updatingId === a.id}
                              title="Marcar como completada"
                              className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 disabled:opacity-40 transition"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          )}
                          {a.status === 'scheduled' && (
                            <button
                              onClick={() => void updateStatus(a.id, 'cancelled')}
                              disabled={updatingId === a.id}
                              title="Cancelar consulta"
                              className="rounded-lg p-1.5 text-amber-400 hover:bg-amber-50 disabled:opacity-40 transition"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => void deleteAppointment(a.id)}
                            disabled={updatingId === a.id}
                            title="Eliminar"
                            className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 disabled:opacity-40 transition"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
          {sortedDates.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              No hay consultas agendadas. ¡Crea la primera!
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && doctorEmail && (
        <NuevaConsultaModal
          doctorEmail={doctorEmail}
          onClose={() => setShowModal(false)}
          onSaved={(a) => setAppointments((prev) => [...prev, a])}
        />
      )}
    </div>
  );
}
