'use client';
import { useEffect, useRef, useState } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { appointmentDate, jsonBody, portalApi, santiagoToday, usePortalData } from './client';
import { ConsultationDetail } from './ConsultationDetail';
import { testPatientLabel } from './test-patient-label';
import type { PortalRole, PrivateAppointment } from './types';

const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0369a1] px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-40';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-40';
const field = 'mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-700';

function BookingForm({ onSaved, onClose }: { onSaved: (id: number) => void; onClose: () => void }) {
  const language = usePortalLanguage();
  const english = language === 'en';
  const doctors = usePortalData<{ doctors: { id: number; name: string; specialty: string | null }[] }>('/api/doctors', 0);
  const doctorLabels = (doctors.data?.doctors ?? []).map(doctor => ({
    doctor, label: `${doctor.name}${doctor.specialty ? ` · ${doctor.specialty}` : ''}`,
  }));
  const labelCounts = new Map<string, number>();
  for (const { label } of doctorLabels) {
    const key = label.trim().toLocaleLowerCase('es');
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }
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
      .catch(failure => { if(version === requestVersion.current) setSlotState({data:null,loading:false,error:english ? 'Could not check availability.' : failure instanceof Error ? failure.message : 'No se pudo consultar la agenda.'}); });
    return () => { requestVersion.current++; controller.abort(); };
  }, [doctorId, query, english]);
  async function reserve(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || slots.loading || !time || !doctorId || !slots.data || slots.error) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await portalApi<{ appointment: PrivateAppointment }>('/api/appointments', jsonBody({ doctorId: Number(doctorId), date, timeSlot: time, type: 'Presencial' }));
      const id = result.appointment?.id;
      if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
        throw new Error(english ? 'Could not verify the booking. Refresh your appointments.' : 'No se pudo verificar la reserva. Actualiza tus consultas.');
      }
      onSaved(id);
    } catch (failure) { setError(english ? 'Could not book the appointment. Check availability and try again.' : failure instanceof Error ? failure.message : 'No se pudo reservar.'); slots.refresh(); setTime(''); }
    finally { lock.current = false; setBusy(false); }
  }
  const times = slots.data?.data.slots.filter(value => value.available) ?? [];
  return <form data-patient-booking aria-label={english ? 'Book an appointment' : 'Reservar consulta'} onSubmit={reserve}
    className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">{english ? 'Book an appointment' : 'Reservar consulta'}</h2>
      <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>{english ? 'Close' : 'Cerrar'}</button></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium text-slate-700">{english ? 'Doctor' : 'Médico'}
        <select required value={doctorId} onChange={e => {
          clearSlots();
          setDoctorId(e.target.value);
          const today = santiagoToday();
          setDate(today);
          setQuery({ date: today, next: true, revision: 0 });
        }} className={field}>
          <option value="">{english ? 'Select an authorized doctor' : 'Selecciona un médico autorizado'}</option>
          {doctorLabels.map(({ doctor, label }) => <option key={doctor.id} value={doctor.id}>{label}
            {(labelCounts.get(label.trim().toLocaleLowerCase('es')) ?? 0) > 1 ? ` · ${english ? 'Profile' : 'Perfil'} #${doctor.id}` : ''}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">{english ? 'Date · Chile time' : 'Fecha · Hora de Chile'}
        <input type="date" min={santiagoToday()} required value={date} onChange={e => {
          clearSlots();
          setDate(e.target.value);
          setQuery({ date: e.target.value, next: false, revision: 0 });
        }} className={field} />
      </label>
    </div>
    {doctors.error && <p role="alert" className="text-sm text-rose-700">{english ? 'Could not load authorized doctors.' : doctors.error} <button type="button" onClick={doctors.refresh} className="underline">{english ? "Retry" : "Reintentar"}</button></p>}
    {doctorId && <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-slate-900">{english ? 'Available times' : 'Horarios disponibles'}</legend>
      {slots.loading ? <p role="status" className="text-sm text-slate-600">{english ? 'Checking availability…' : 'Consultando agenda…'}</p>
        : slots.error ? <p role="alert" className="text-sm text-rose-800">{slots.error} <button type="button" className="min-h-11 underline" onClick={slots.refresh}>{english ? 'Retry' : 'Reintentar'}</button></p>
        : times.length > 0 ? <div className="flex flex-wrap gap-2">
          {times.map(slot => <button type="button" key={slot.time} aria-pressed={time === slot.time} disabled={busy}
            onClick={() => setTime(slot.time)} className={time === slot.time ? primaryButton : secondaryButton}>{slot.time}</button>)}
        </div> : <div className="text-sm text-amber-800">
          <p>{query.next
            ? (english ? 'No times are available in the next 90 days.' : 'No hay horas disponibles en los próximos 90 días.')
            : (english ? 'No times are available on the selected date.' : 'No hay horas disponibles para la fecha elegida.')}</p>
          {!query.next && <button type="button" className={secondaryButton + ' mt-2'} onClick={() => {
            clearSlots();
            setQuery(q => ({ ...q, next: true }));
          }}>{english ? 'Go to the next available date' : 'Ir a la próxima fecha disponible'}</button>}
        </div>}
    </fieldset>}
    {query.next && !slots.loading && !slots.error && slots.data?.data.date && <p role="status" className="text-sm text-emerald-800">
      {english ? 'Next available date' : 'Próxima disponibilidad'}: {appointmentDate(slots.data.data.date, language)}
    </p>}
    {selectedDoctor && <div data-selected-doctor className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700" aria-live="polite">
      <p className="font-semibold text-slate-900">{selectedDoctor.name}{selectedDoctor.specialty && ` · ${selectedDoctor.specialty}`}</p>
      {time && !slots.loading && !slots.error && <p className="mt-1">{appointmentDate(date, language)} · {time} · {english ? 'Chile time' : 'Hora de Chile'}</p>}
    </div>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <button data-patient-primary disabled={busy || slots.loading || !time || !doctorId || !!slots.error || !!doctors.error} className={primaryButton}>
      {busy ? (english ? 'Booking…' : 'Reservando…') : (english ? 'Confirm booking' : 'Confirmar reserva')}
    </button>
  </form>;
}
export function PrivateConsultations({ role, appointmentId, onNavigate }: {
  role: PortalRole;
  appointmentId?: number;
  onNavigate: (appointmentId?: number) => void;
}) {
  const language = usePortalLanguage();
  const english = language === 'en';
  const { data, error, loading, refresh } = usePortalData<{ appointments: PrivateAppointment[]; canBook?: boolean }>(
    appointmentId === undefined ? `/api/appointments?role=${role}` : null);
  const [booking, setBooking] = useState(false);
  const patient = role === 'patient';
  const canBook = patient && !!data && !error && data.canBook !== false;
  if (appointmentId !== undefined) return <ConsultationDetail key={appointmentId} id={appointmentId} role={role} onBack={() => onNavigate()} />;
  const today = santiagoToday();
  const appointments = error ? [] : data?.appointments ?? [];
  const inProgress = appointments.filter(appointment => appointment.status === 'in_progress');
  const scheduled = appointments.filter(appointment => appointment.status === 'scheduled' && appointment.date.slice(0, 10) >= today);
  const previous = appointments.filter(appointment => appointment.status !== 'in_progress' &&
    (appointment.status !== 'scheduled' || appointment.date.slice(0, 10) < today));
  const labels: Record<PrivateAppointment['status'], string> = english ? { scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', cancel_requested: 'Cancellation pending' } : { scheduled: 'Agendada', in_progress: 'En curso', completed: 'Finalizada', cancelled: 'Cancelada', cancel_requested: 'Cancelación pendiente' };
  const card = 'rounded-2xl border border-slate-200 bg-white p-4' + (patient ? ' sm:p-6' : '');
  const rows = (items: PrivateAppointment[], empty?: string) => items.length ? <ul className="divide-y divide-slate-200">
    {items.map(appointment => <li data-patient-list-card={patient ? '' : undefined} key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p data-patient-name className="break-words font-semibold text-slate-900">{patient
          ? appointment.doctor_name || appointment.doctor_email
          : testPatientLabel(appointment.patient_name || appointment.patient_email, english)}</p>
        <p className="mt-1 text-sm text-slate-600">{appointmentDate(appointment.date, language)} · {appointment.time_slot} · {english ? 'Chile time' : 'Hora de Chile'}</p>
        <p data-patient-status={appointment.status} className={'mt-1 text-sm font-medium ' +
          (appointment.status === 'in_progress' ? 'text-emerald-800' : 'text-slate-600')}>{labels[appointment.status]}</p>
      </div>
      <button type="button" onClick={() => onNavigate(appointment.id)} className={secondaryButton}>{english ? 'Open appointment' : 'Abrir consulta'}</button>
    </li>)}
  </ul> : <p className="text-sm text-slate-600">{empty}</p>;
  return <section className="space-y-6">
    <h1 className="text-[26px] font-semibold leading-tight text-slate-900">{english ? 'My appointments' : 'Mis consultas'}</h1>
    {canBook && !booking && <div className={card}>
      <button type="button" data-patient-primary onClick={() => setBooking(true)} className={primaryButton}>{english ? 'Book an appointment' : 'Reservar consulta'}</button>
    </div>}
    {canBook && booking && <BookingForm onSaved={id => { setBooking(false); onNavigate(id); }} onClose={() => setBooking(false)} />}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
      {english ? 'Could not load your appointments.' : error} <button type="button" onClick={refresh} className="min-h-11 font-semibold underline">{english ? 'Refresh' : 'Actualizar'}</button>
    </p>}
    {loading && <p role="status" className="text-sm text-slate-600">{english ? 'Checking your appointments…' : 'Consultando tu agenda…'}</p>}
    {data && !error && <>
      <section className={card + ' space-y-3'} aria-labelledby="consultations-in-progress">
        <h2 id="consultations-in-progress" className="text-lg font-semibold text-slate-900">{english ? 'In progress' : 'En curso'}</h2>
        {rows(inProgress, english ? 'No appointments in progress.' : 'No hay consultas en curso.')}
      </section>
      <section className={card + ' space-y-3'} aria-labelledby="consultations-scheduled">
        <h2 id="consultations-scheduled" className="text-lg font-semibold text-slate-900">{english ? 'Scheduled' : 'Agendadas'}</h2>
        {rows(scheduled, english ? 'No scheduled appointments.' : 'No hay consultas agendadas.')}
      </section>
      {previous.length > 0 && <details className={card}>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-700">
          <span>{english ? 'Past appointments' : 'Consultas anteriores'} <span className="font-normal text-slate-600">({previous.length})</span></span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="border-t border-slate-200 pt-3">{rows(previous)}</div>
      </details>}
    </>}
  </section>;
}
