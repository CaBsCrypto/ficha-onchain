"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";
import type { BookingSlot, DBAppointment, PublicDoctor } from "./types";

// Simple inline form to request an appointment with a known doctor
export function RequestAppointmentForm({
  patientEmail,
  onSaved,
  onClose,
}: {
  patientEmail: string;
  onSaved: (a: DBAppointment) => void;
  onClose: () => void;
}) {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [doctorEmail, setDoctorEmail] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<BookingSlot[] | null>(null);
  const [slotsMsg, setSlotsMsg] = useState('');
  const [time, setTime] = useState('');
  const [motivo, setMotivo] = useState('');
  const [type, setType] = useState<'Presencial' | 'Telemedicina'>('Presencial');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const todayISO = new Date().toISOString().slice(0, 10);
  const canSubmit = doctorEmail && date && time && motivo;

  // Load the bookable doctors once.
  useEffect(() => {
    fetch('/api/doctors')
      .then((r) => r.json())
      .then((d: { doctors?: PublicDoctor[] }) => setDoctors(d.doctors ?? []))
      .catch(() => setDoctors([]));
  }, []);

  // Whenever doctor + date are chosen, fetch that day's free slots. The API
  // already subtracts days off, taken slots and past times — we just render.
  useEffect(() => {
    setTime('');
    if (!doctorEmail || !date) { setSlots(null); setSlotsMsg(''); return; }
    let cancelled = false;
    setSlots(null);
    setSlotsMsg('');
    fetch(`/api/doctor/slots?doctorEmail=${encodeURIComponent(doctorEmail)}&date=${date}`)
      .then((r) => r.json())
      .then((d: { data?: { slots?: BookingSlot[]; time_off?: string | null }; error?: string }) => {
        if (cancelled) return;
        if (d.error) { setSlots([]); setSlotsMsg('No se pudo cargar la disponibilidad'); return; }
        const free = (d.data?.slots ?? []).filter((s) => s.available);
        setSlots(free);
        if (d.data?.time_off) setSlotsMsg(`El médico no atiende ese día (${d.data.time_off}).`);
        else if (free.length === 0) setSlotsMsg('No hay horas libres ese día. Prueba otra fecha.');
        else setSlotsMsg('');
      })
      .catch(() => { if (!cancelled) { setSlots([]); setSlotsMsg('Error de conexión'); } });
    return () => { cancelled = true; };
  }, [doctorEmail, date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorEmail,
          patientEmail,
          patientName: patientEmail,
          date,
          timeSlot: time,
          type,
          motivo,
        }),
      });
      const data = await res.json() as { appointment?: DBAppointment; error?: string };
      if (!res.ok) { setError(data.error ?? 'Error'); setLoading(false); return; }
      onSaved(data.appointment!);
    } catch {
      setError('Error de conexión');
    }
    setLoading(false);
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-ink focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100';

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Solicitar consulta</h3>
        <button onClick={onClose} className="text-xs text-muted hover:text-ink">✕</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Médico *</label>
          <select
            value={doctorEmail}
            onChange={(e) => setDoctorEmail(e.target.value)}
            className={inputCls}
          >
            <option value="">Selecciona un médico…</option>
            {doctors.map((d) => (
              <option key={d.email} value={d.email}>
                {d.name}{d.specialty ? ` · ${d.specialty}` : ''}
              </option>
            ))}
          </select>
          {doctors.length === 0 && (
            <p className="mt-1 text-xs text-muted">No hay médicos disponibles aún.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Fecha *</label>
          <input
            type="date"
            min={todayISO}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Free slots — derived from the doctor's grid, minus taken/past/off */}
        {doctorEmail && date && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Hora disponible *</label>
            {slots === null ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                Buscando horas libres…
              </div>
            ) : slots.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {slotsMsg || 'No hay horas libres ese día.'}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {slots.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => setTime(s.time)}
                    className={`rounded-xl border py-2 text-xs font-semibold transition-all ${
                      time === s.time
                        ? 'border-emerald-400 bg-emerald-500 text-white'
                        : 'border-slate-200 text-ink hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Motivo *</label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Control de presión arterial"
            className={inputCls}
          />
        </div>
        <div className="flex gap-2">
          {(['Presencial', 'Telemedicina'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                type === t
                  ? 'border-emerald-400 bg-emerald-100 text-emerald-700'
                  : 'border-slate-200 text-muted hover:border-emerald-200'
              }`}
            >
              {t === 'Presencial' ? '🏥 Presencial' : '💻 Telemedicina'}
            </button>
          ))}
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
        >
          {loading ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  );
}
