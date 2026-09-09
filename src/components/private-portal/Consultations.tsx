'use client';
import { useRef, useState } from 'react';
import { jsonBody, portalApi, santiagoToday, usePortalData } from './client';
import { ConsultationDetail } from './ConsultationDetail';
import type { PortalRole, PrivateAppointment } from './types';

function BookingForm({ onSaved, onClose }: { onSaved: (id: number) => void; onClose: () => void }) {
  const doctors = usePortalData<{ doctors: { id: number; name: string; specialty: string | null }[] }>('/api/doctors', 0);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(santiagoToday());
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const slots = usePortalData<{ data: { slots: { time: string; available: boolean }[]; time_off?: string | null } }>(doctorId && date ? `/api/doctor/slots?doctorId=${doctorId}&date=${date}` : null, 0);
  async function reserve(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || !time || !doctorId || !slots.data || slots.error) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await portalApi<{ appointment: PrivateAppointment }>('/api/appointments', jsonBody({ doctorId: Number(doctorId), date, timeSlot: time, type: 'Presencial' }));
      if (!result.appointment?.id) throw new Error('No se pudo verificar la reserva. Actualiza tus consultas.');
      onSaved(result.appointment.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo reservar.'); slots.refresh(); setTime(''); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form onSubmit={reserve} className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Reservar consulta de prueba</h2><button type="button" onClick={onClose} disabled={busy} className="text-sm text-slate-500 underline">Cerrar</button></div>
    <p className="text-sm text-slate-500">Tu cuenta será el paciente de esta reserva. Fechas y horas de Chile.</p>
    <label className="block text-sm text-slate-600">Médico<select required value={doctorId} onChange={e => { setDoctorId(e.target.value); setTime(''); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="">Selecciona un médico autorizado</option>{doctors.data?.doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name}{doctor.specialty ? ` · ${doctor.specialty}` : ''}</option>)}</select></label>
    {doctors.error && <p role="alert" className="text-sm text-rose-700">{doctors.error} <button type="button" onClick={doctors.refresh} className="underline">Reintentar</button></p>}
    <label className="block text-sm text-slate-600">Fecha<input type="date" min={santiagoToday()} required value={date} onChange={e => { setDate(e.target.value); setTime(''); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
    {doctorId && <div><p className="mb-2 text-sm text-slate-600">Horario disponible</p>{slots.loading ? <p role="status" className="text-sm text-slate-500">Consultando agenda…</p> : slots.error ? <p role="alert" className="text-sm text-rose-700">{slots.error}</p> : slots.data?.data.slots.length ? <div className="flex flex-wrap gap-2">{slots.data.data.slots.filter(slot => slot.available).map(slot => <button type="button" key={slot.time} aria-pressed={time === slot.time} onClick={() => setTime(slot.time)} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${time === slot.time ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 text-slate-700'}`}>{slot.time}</button>)}</div> : <p className="text-sm text-amber-700">No hay horas disponibles. Elige otra fecha.</p>}</div>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <button disabled={busy || !time || !doctorId || !!slots.error || !!doctors.error} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Reservando…' : 'Confirmar reserva'}</button>
  </form>;
}
export function PrivateConsultations({ role }: { role: PortalRole }) {
  const { data, error, loading, refresh } = usePortalData<{ appointments: PrivateAppointment[] }>(`/api/appointments?role=${role}`);
  const [selected, setSelected] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);
  if (selected !== null) return <ConsultationDetail key={selected} id={selected} role={role} onBack={() => { setSelected(null); refresh(); }} />;
  const labels: Record<PrivateAppointment['status'], string> = { scheduled: 'Agendada', in_progress: 'En curso', completed: 'Finalizada', cancelled: 'Cancelada', cancel_requested: 'Cancelación pendiente' };
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold text-slate-900">Mis consultas</h1><p className="mt-1 text-sm text-slate-500">Reserva, asistencia y permiso de emisión son pasos separados.</p></div>{role === 'patient' && <button onClick={() => setBooking(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Reservar consulta</button>}</div>
    {booking && <BookingForm onSaved={id => { setBooking(false); setSelected(id); refresh(); }} onClose={() => setBooking(false)} />}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error} <button onClick={refresh} className="underline">Actualizar</button></p>}
    {loading && <p role="status" className="text-sm text-slate-500">Consultando tu agenda…</p>}
    {!loading && !error && !data?.appointments.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No tienes consultas. {role === 'doctor' ? 'Configura tu disponibilidad para recibir reservas.' : 'Elige un médico y un horario para comenzar.'}</p>}
    {data?.appointments.map(appointment => <article key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="font-semibold text-slate-900">{role === 'doctor' ? appointment.patient_name || appointment.patient_email : appointment.doctor_name || appointment.doctor_email}</p><p className="mt-1 text-sm text-slate-500">{appointment.date.slice(0, 10)} · {appointment.time_slot} · Hora de Chile</p><p className="mt-2 text-xs font-semibold text-sky-700">{labels[appointment.status]}</p></div><button onClick={() => setSelected(appointment.id)} className="rounded-xl border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700">Abrir consulta</button></article>)}
  </section>;
}
