'use client';
import { useEffect, useRef, useState } from 'react';
import { appointmentDate, jsonBody, portalApi, santiagoToday, usePortalData } from './client';
import { ConsultationDetail } from './ConsultationDetail';
import type { PortalRole, PrivateAppointment } from './types';

function BookingForm({ onSaved, onClose }: { onSaved: (id: number) => void; onClose: () => void }) {
  const doctors = usePortalData<{ doctors: { id: number; name: string; specialty: string | null }[] }>('/api/doctors', 0);
  const [doctorId, setDoctorId] = useState('');
  const selectedDoctor = doctors.data?.doctors.find(doctor => String(doctor.id) === doctorId);
  const [date, setDate] = useState(santiagoToday());
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  type SlotResult = { data: { date: string | null; slots: { time: string; available: boolean }[] } };
  const [query, setQuery] = useState({ date: santiagoToday(), next: true, revision: 0 });
  const [slotState, setSlotState] = useState<{data: SlotResult | null; loading: boolean; error: string}>({data: null, loading: false, error: ''});
  const requestVersion = useRef(0);
  const clearSlots = () => { requestVersion.current++; setTime(''); setSlotState({data:null,loading:true,error:''}); };
  const slots = { ...slotState, refresh: () => { clearSlots(); setQuery(q => ({...q,revision:q.revision+1})); } };
  useEffect(() => {
    if (!doctorId || !query.date) { setSlotState({data:null,loading:false,error:''}); return; }
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setSlotState({data:null,loading:true,error:''});
    void portalApi<SlotResult>(`/api/doctor/slots?doctorId=${doctorId}&date=${query.date}${query.next ? '&nextAvailable=true' : ''}`, {signal:controller.signal})
      .then(data => { if (version !== requestVersion.current) return; setSlotState({data,loading:false,error:''}); if(query.next && data.data.date) setDate(data.data.date); })
      .catch(failure => { if(version === requestVersion.current) setSlotState({data:null,loading:false,error:failure instanceof Error ? failure.message : 'No se pudo consultar la agenda.'}); });
    return () => { requestVersion.current++; controller.abort(); };
  }, [doctorId, query]);
  async function reserve(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || slots.loading || !time || !doctorId || !slots.data || slots.error) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await portalApi<{ appointment: PrivateAppointment }>('/api/appointments', jsonBody({ doctorId: Number(doctorId), date, timeSlot: time, type: 'Presencial' }));
      if (!result.appointment?.id) throw new Error('No se pudo verificar la reserva. Actualiza tus consultas.');
      onSaved(result.appointment.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo reservar.'); slots.refresh(); setTime(''); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form data-patient-booking onSubmit={reserve} className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Reservar consulta de prueba</h2><button type="button" onClick={onClose} disabled={busy} className="text-sm text-slate-500 underline">Cerrar</button></div>
    <p className="text-sm text-slate-500">Tu cuenta será el paciente de esta reserva. Fechas y horas de Chile.</p>
    <label className="block text-sm text-slate-600">Médico<select required value={doctorId} onChange={e => { clearSlots(); setDoctorId(e.target.value); const today = santiagoToday(); setDate(today); setQuery({date:today,next:true,revision:0}); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="">Selecciona un médico autorizado</option>{doctors.data?.doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.name}{doctor.specialty ? ` · ${doctor.specialty}` : ''}</option>)}</select></label>
    {selectedDoctor && <p data-selected-doctor className="text-sm text-slate-600"><strong>{selectedDoctor.name}</strong>{selectedDoctor.specialty && <span> · {selectedDoctor.specialty}</span>}</p>}
    {doctors.error && <p role="alert" className="text-sm text-rose-700">{doctors.error} <button type="button" onClick={doctors.refresh} className="underline">Reintentar</button></p>}
    <label className="block text-sm text-slate-600">Fecha<input type="date" min={santiagoToday()} required value={date} onChange={e => { clearSlots(); setDate(e.target.value); setQuery({date:e.target.value,next:false,revision:0}); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></label>
    {doctorId && <div><p className="mb-2 text-sm text-slate-600">Horario disponible</p>{slots.loading ? <p role="status" className="text-sm text-slate-500">Consultando agenda…</p> : slots.error ? <p role="alert" className="text-sm text-rose-700">{slots.error} <button type="button" onClick={slots.refresh} className="underline">Reintentar</button></p> : slots.data?.data.slots.length ? <div className="flex flex-wrap gap-2">{slots.data.data.slots.filter(slot => slot.available).map(slot => <button type="button" key={slot.time} aria-pressed={time === slot.time} onClick={() => setTime(slot.time)} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${time === slot.time ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 text-slate-700'}`}>{slot.time}</button>)}</div> : <div className="text-sm text-amber-700"><p>{query.next ? "No hay horas disponibles en los próximos 90 días." : "No hay horas disponibles para la fecha elegida."}</p>{!query.next && <button type="button" className="mt-2 underline" onClick={() => { clearSlots(); setQuery(q => ({...q,next:true})); }}>Ir a la próxima fecha disponible</button>}</div>}</div>}
    {query.next && !slots.loading && !slots.error && slots.data?.data.date && <p role="status" className="text-sm text-emerald-700">Próxima disponibilidad: {new Intl.DateTimeFormat("es-CL", {timeZone:"UTC",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(`${slots.data.data.date}T12:00:00Z`))}</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <button data-patient-primary disabled={busy || slots.loading || !time || !doctorId || !!slots.error || !!doctors.error} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Reservando…' : 'Confirmar reserva'}</button>
  </form>;
}
export function PrivateConsultations({ role }: { role: PortalRole }) {
  const { data, error, loading, refresh } = usePortalData<{ appointments: PrivateAppointment[] }>(`/api/appointments?role=${role}`);
  const [selected, setSelected] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);
  if (selected !== null) return <ConsultationDetail key={selected} id={selected} role={role} onBack={() => { setSelected(null); refresh(); }} />;
  const labels: Record<PrivateAppointment['status'], string> = { scheduled: 'Agendada', in_progress: 'En curso', completed: 'Finalizada', cancelled: 'Cancelada', cancel_requested: 'Cancelación pendiente' };
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold text-slate-900">Mis consultas</h1><p className="mt-1 text-sm text-slate-500">Reserva, asistencia y permiso de emisión son pasos separados.</p></div>{role === 'patient' && !booking && <button data-patient-primary onClick={() => setBooking(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Reservar consulta</button>}</div>
    {booking && <BookingForm onSaved={id => { setBooking(false); setSelected(id); refresh(); }} onClose={() => setBooking(false)} />}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error} <button onClick={refresh} className="underline">Actualizar</button></p>}
    {loading && <p role="status" className="text-sm text-slate-500">Consultando tu agenda…</p>}
    {!loading && !error && !data?.appointments.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No tienes consultas. {role === 'doctor' ? 'Configura tu disponibilidad para recibir reservas.' : 'Elige un médico y un horario para comenzar.'}</p>}
    {data?.appointments.map(appointment => <article data-patient-list-card={role === "patient" ? "" : undefined} key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p data-patient-name className="font-semibold text-slate-900">{role === 'doctor' ? appointment.patient_name || appointment.patient_email : appointment.doctor_name || appointment.doctor_email}</p><p className="mt-1 text-sm text-slate-500">{role === 'patient' ? appointmentDate(appointment.date) : appointment.date.slice(0, 10)} · {appointment.time_slot} · Hora de Chile</p><p data-patient-status={appointment.status} className="mt-2 text-xs font-semibold text-sky-700">{labels[appointment.status]}</p></div><button onClick={() => setSelected(appointment.id)} className="rounded-xl border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700">Abrir consulta</button></article>)}
  </section>;
}
