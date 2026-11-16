'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { canAuthorizeIssuance } from './state';
import { appointmentDate, jsonBody, localDate, portalApi, PortalApiError, usePortalData } from './client';
import { ConfirmationButton, OperationNotice, ReceiptLink, usePrivateOperation, type ReviewSponsorshipQuote } from './Operation';
import { PrescriptionCard } from './Prescriptions';
import { testPatientLabel } from './test-patient-label';
import { useDoctorClinicalInbox } from './DoctorClinicalInbox';
import type { AppointmentAction, ConsultationState, PortalRole, PrescriptionDocument, PrivatePrescription } from './types';

const bookingLabels: Record<'es' | 'en', Record<string, string>> = {
  es: { prepared: 'Esperando acreditación', submitted: 'Acreditación enviada', confirmed: 'Reserva acreditada', cancel_requested: 'Cancelación pendiente', revoked: 'Reserva revocada', consumed: 'Reserva utilizada', cancelled: 'Reserva cancelada', failed: 'Acreditación fallida' },
  en: { prepared: 'Awaiting attestation', submitted: 'Attestation submitted', confirmed: 'Booking attested', cancel_requested: 'Cancellation pending', revoked: 'Booking revoked', consumed: 'Booking used', cancelled: 'Booking cancelled', failed: 'Attestation failed' },
};
const consentLabels = {
  es: { absent: 'Sin permiso de emisión', active: 'Permiso vigente', expired: 'Permiso vencido', consumed: 'Permiso utilizado para esta receta' },
  en: { absent: 'No issuance permission', active: 'Permission active', expired: 'Permission expired', consumed: 'Permission used for this prescription' },
};
const fieldClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100';
const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0369a1] px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700';

export function ConsultationDetail({ id, role, onBack }: { id: number; role: PortalRole; onBack: () => void }) {
  const language = usePortalLanguage();
  const english = language === 'en';
  const { data, error, loading, refresh } = usePortalData<ConsultationState>(`/api/private-consultations/${id}`);
  const inbox = useDoctorClinicalInbox();
  const regular = data?.appointmentMode === 'regular';
  const { run, busy, operation, error: operationError } = usePrivateOperation(regular ? null : data?.operations?.[0]);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [document, setDocument] = useState<PrescriptionDocument>({ medication: '', dosage: '', instructions: '' });
  const lock = useRef(false);
  async function appointmentAction(action: AppointmentAction) {
    if (lock.current) return;
    lock.current = true; setSaving(true); setActionError('');
    try {
      await portalApi('/api/appointments', { ...jsonBody({ id, action }), method: 'PATCH' });
    } catch (failure) {
      setActionError(appointmentActionError(failure, language));
    } finally {
      refresh();
      lock.current = false;
      setSaving(false);
    }
  }
  async function consent(action: 'consent' | 'withdraw_consent', reviewQuote: ReviewSponsorshipQuote) {
    await run(action, { appointmentId: id }, reviewQuote);
    refresh();
  }
  async function issue(reviewQuote: ReviewSponsorshipQuote) {
    if (lock.current) throw new Error(english ? 'The prescription is being prepared.' : 'La receta se está preparando.');
    lock.current = true; setIssuing(true); setActionError('');
    try {
      const saved = await portalApi<{ prescription: PrivatePrescription }>('/api/private-prescriptions', jsonBody({ appointmentId: id, document, validDays: 30 }));
      if (!saved.prescription?.id) throw new Error(english ? 'Could not verify the saved document.' : 'No se pudo verificar el documento guardado.');
      await run('mint', { prescriptionId: saved.prescription.id }, reviewQuote);
    } finally { lock.current = false; setIssuing(false); refresh(); }
  }
  if (loading && !data) return <section role="status" className="space-y-4">
    <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-hidden />
    <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-hidden />
    <p className="text-sm text-slate-500">{english ? 'Checking the appointment…' : 'Consultando la cita…'}</p>
  </section>;
  const appointment = error ? undefined : data?.appointment;
  const patientName = appointment?.patient_name || appointment?.patient_email;
  const patientLabel = regular ? patientName : testPatientLabel(patientName ?? '', english);
  const attended = appointment?.attended_at ?? appointment?.attendance_at;
  const pending = saving || (!regular && (busy || issuing || operation?.state === 'submitted' || !!data?.operations?.some(op => op.state === 'submitted')));
  const unavailable = !!error || pending;
  const inProgress = appointment?.status === 'in_progress';
  const scheduled = appointment?.status === 'scheduled';
  const needsAttendance = role === 'patient' && !attended && (scheduled || inProgress);
  const canAttend = needsAttendance && (data?.appointmentActions?.attend ?? !regular);
  const canStart = role === 'doctor' && scheduled && !!attended && (data?.appointmentActions?.start ?? !regular);
  const canCancel = regular
    ? role === 'patient' && scheduled && data?.appointmentActions?.cancel === true
    : (scheduled || inProgress) && (data?.appointmentActions?.cancel ?? data?.consent.status !== 'consumed');
  const canComplete = role === 'doctor' && inProgress &&
    (data?.appointmentActions?.complete ?? (!regular && data?.prescription?.rxId != null));
  const canManageClinicalPermissions = role === 'patient' && !error && inProgress && !!attended &&
    !!appointment?.started_at && data?.canManageClinicalPermissions === true;
  const matchingRecords = role === 'doctor' && inProgress && attended && appointment?.started_at && !inbox.error
    ? inbox.data?.records.filter(record => record.activeAppointmentIds?.includes(id)) : undefined;
  const recordId = matchingRecords?.length === 1 ? matchingRecords[0].historyId : undefined;
  const canOpenSharedRecord = !!recordId && /^[a-f0-9]{64}$/.test(recordId) && !unavailable &&
    !inbox.recordNavigationBlocked && inbox.canNavigateToRecord(recordId);
  const checkInOpening = data?.checkIn?.state === 'upcoming' ? Date.parse(data.checkIn.opensAt) : NaN;
  const checkInDate = Number.isFinite(checkInOpening) ? new Intl.DateTimeFormat(english ? 'en-US' : 'es-CL',
    { dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23', timeZone: 'America/Santiago' }).format(checkInOpening) : null;
  const waitingForDoctor = role === 'patient' && !!attended && scheduled;
  const waitingForPermission = role === 'doctor' && inProgress && !!attended && !!appointment?.started_at &&
    inbox.enabled && !!inbox.data && !inbox.error && matchingRecords?.length === 0;
  const mintReady = !regular && !!data && inProgress && !!attended && data.booking?.state === 'confirmed' &&
    !data.booking.cancellation_requested_at && Number(data.booking.valid_until) * 1000 > Date.now() && data.consent.status === 'active' && Number(data.consent.validUntil ?? 0) * 1000 > Date.now();
  const card = 'rounded-2xl border border-slate-200 bg-white p-4' + (role === 'patient' ? ' sm:p-6' : '');
  return <section data-patient-detail={role === 'patient' ? '' : undefined} className="space-y-6">
    <button type="button" onClick={onBack} disabled={busy || saving || issuing} className="min-h-11 text-sm font-semibold text-sky-800 hover:underline focus-visible:outline-2 focus-visible:outline-sky-700">{english ? '← Back to my appointments' : '← Volver a mis consultas'}</button>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{english ? 'Could not verify this appointment.' : error} <button type="button" onClick={refresh} className="min-h-11 font-semibold underline">{english ? 'Refresh status' : 'Actualizar estado'}</button></div>}
    {data && appointment && <>
      <div className={card}>
        <h1 className="text-[26px] font-semibold leading-tight text-slate-900">{regular ? (english ? 'Appointment' : 'Consulta') : (english ? 'Test appointment' : 'Consulta de prueba')} #{id}</h1>
        <p className="mt-2 text-lg font-semibold text-slate-900">{role === 'patient' ? appointment.doctor_name || appointment.doctor_email : patientLabel}</p>
        <p className="mt-1 text-sm text-slate-600">{appointmentDate(appointment.date, language)} · {appointment.time_slot} · {english ? 'Chile time' : 'Hora de Chile'}</p>
        <div data-patient-progress aria-live="polite" className={`mt-4 grid gap-3 ${regular ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          <Status confirmed={!!attended} title={english ? 'Patient attendance' : 'Asistencia del paciente'} value={attendanceLabel(language, role, scheduled, !!attended)} />
          <Status confirmed={!!appointment.started_at} title={english ? 'Doctor started appointment' : 'Inicio por el médico'} value={appointment.started_at ? (english ? 'Appointment started' : 'Consulta iniciada') : (english ? 'Pending' : 'Pendiente')} />
          {!regular && <Status title={english ? "Stellar booking" : "Reserva Stellar"} value={data.booking ? bookingLabels[language][data.booking.state] ?? (english ? 'Checking status' : 'Verificando estado') : (english ? 'Awaiting attendance and start' : 'Esperando asistencia e inicio')} />}
        </div>
        {!regular && <ReceiptLink hash={data.booking?.attestation_hash ?? data.booking?.transaction_hash} />}
        {!regular && data.booking?.state === 'prepared' && <p className="mt-3 text-sm text-amber-700">{english ? "The booking is waiting for attestation. It stays pending until the booking worker runs." : "La solicitud espera al procesador de reservas. Si está apagado, permanecerá pendiente."}</p>}
        {appointment.status === 'cancelled' && <p className="mt-3 font-semibold text-rose-700">{english ? "Appointment cancelled" : "Consulta cancelada"}</p>}
        {appointment.status === 'cancel_requested' && <p role="status" className="mt-3 text-sm font-semibold text-amber-700">{english ? "Cancellation requested. The appointment will show as cancelled after confirmation." : "Cancelación solicitada. Esperamos la confirmación antes de mostrar la reserva como cancelada."}</p>}
        {appointment.status === 'completed' && <p className="mt-3 font-semibold text-slate-600">{english ? "Appointment completed" : "Consulta finalizada"}</p>}
        <div data-patient-actions={role === 'patient' ? '' : undefined} className="mt-4 flex flex-wrap gap-3 empty:hidden">
          {canManageClinicalPermissions && !unavailable && <Link
            href={{ pathname: '/patient', query: { tab: 'historial', appointmentId: id, lang: language } }}
            prefetch={false} className={primaryButton}>{english ? 'Manage record access' : 'Gestionar acceso a mi ficha'}</Link>}
          {needsAttendance && <button type="button" disabled={unavailable || !canAttend} onClick={() => void appointmentAction('attend')} className={primaryButton}>{english ? 'Confirm my attendance' : 'Confirmar mi asistencia'}</button>}
          {role === 'doctor' && scheduled && attended && <button type="button" disabled={unavailable || !canStart} onClick={() => void appointmentAction('start')} className={primaryButton}>{english ? 'Start now' : 'Iniciar ahora'}</button>}
          {canOpenSharedRecord && <Link href={'/doctor?tab=historial&record=' + recordId + '&lang=' + language}
            prefetch={false} className={primaryButton} onNavigate={event => {
              if (!inbox.canNavigateToRecord(recordId)) event.preventDefault();
            }}>{english ? 'Open shared record' : 'Abrir ficha compartida'}</Link>}
          {canComplete && <button type="button" disabled={unavailable} onClick={() => void appointmentAction('complete')} className={secondaryButton}>{english ? 'Complete appointment' : 'Finalizar consulta'}</button>}
          {canCancel && <button type="button" disabled={unavailable || (!regular && data.booking?.state === 'cancel_requested')} onClick={() => void appointmentAction('cancel')}
            className="inline-flex min-h-11 items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700 disabled:opacity-40">
            {regular ? (english ? 'Cancel appointment' : 'Cancelar consulta') : (english ? 'Request cancellation' : 'Solicitar cancelación')}
          </button>}
        </div>
        {!unavailable && needsAttendance && !canAttend && <p className="mt-3 text-sm text-amber-800">{checkInDate
          ? (english ? `Confirm attendance from ${checkInDate} (Chile time).` : `Confirma tu asistencia desde el ${checkInDate} (hora de Chile).`)
          : data.checkIn?.state === 'closed' ? (english ? 'The attendance window has closed.' : 'El plazo para confirmar tu asistencia ya terminó.')
          : (english ? 'Confirm attendance on the scheduled day, starting 30 minutes before the appointment (Chile time).'
            : 'Confirma tu asistencia el día de la consulta, desde 30 minutos antes de la hora reservada (hora de Chile).')}</p>}
        {!unavailable && role === 'doctor' && scheduled && attended && !canStart && <p className="mt-3 text-sm text-amber-800">{checkInDate
          ? (english ? `You can start from ${checkInDate} (Chile time), with active medical authorization.`
            : `Podrás iniciar desde el ${checkInDate} (hora de Chile), con autorización médica vigente.`)
          : data.checkIn?.state === 'closed' ? (english ? 'The start window has closed.' : 'El plazo para iniciar la consulta ya terminó.')
          : (english ? 'Starting requires verified attendance and active medical authorization.'
            : 'Para iniciar necesitas asistencia verificada y autorización médica vigente.')}</p>}
        {waitingForDoctor && <p className="mt-3 text-sm text-amber-800">{english ? 'The doctor has not started the appointment yet.' : 'El médico aún no inicia la consulta.'}</p>}
        {waitingForPermission && <p className="mt-3 text-sm text-amber-800">{english ? 'The patient’s record access has not been verified for this appointment.' : 'Aún no hay acceso verificado a la ficha del paciente para esta consulta.'}</p>}
        {actionError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
      </div>
      {!regular && <>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">{english ? "Permission to issue one prescription" : "Permiso para una emisión"}</h2>
        <p className="text-sm text-slate-600">{english ? "The patient confirms attendance first, then grants this doctor separate permission to issue one prescription for this appointment." : "Confirmar asistencia no concede permiso para emitir. El paciente autoriza por separado a este médico, para esta consulta y una sola receta."}</p>
        <p className="text-sm font-semibold text-slate-800">{consentLabels[language][data.consent.status]}</p>
        {data.consent.validUntil && <p className="text-xs text-slate-500">{english ? 'Expires' : 'Vence'}: {localDate(data.consent.validUntil, language)} · {english ? "Chile time" : "Hora de Chile"}</p>}
        {role === 'patient' && <>
          {data.consent.status !== 'consumed' && data.consent.status !== 'active' && <ConfirmationButton label={english ? "Authorize one prescription" : "Autorizar una emisión"} title={english ? "Authorize this doctor to issue one prescription" : "Autorizar a este médico para una receta"} disabled={unavailable || !canAuthorizeIssuance(data)} onConfirm={reviewQuote => consent('consent', reviewQuote)}>
            <p>{english ? 'Doctor' : 'Médico'}: <strong>{appointment.doctor_name || appointment.doctor_email}</strong>.</p><p>{english ? 'Patient' : 'Paciente'}: <strong>{patientLabel}</strong>. {english ? 'Appointment' : 'Consulta'} #{id}.</p>
            <p>{english ? 'You will allow one prescription to be issued. This permission expires by' : 'Permitirás una sola emisión. El permiso vence como máximo el'} <strong>{localDate(Number(data.booking?.valid_until), language)}</strong> {english ? 'and can be withdrawn before use.' : 'y puedes retirarlo antes de que se utilice.'}</p>
          </ConfirmationButton>}
          {data.consent.status === 'active' && <ConfirmationButton danger label={english ? "Withdraw permission" : "Retirar permiso"} title={english ? "Withdraw issuance permission" : "Retirar el permiso de emisión"} disabled={unavailable} onConfirm={reviewQuote => consent('withdraw_consent', reviewQuote)}><p>{english ? "You will withdraw this appointment’s unused permission. The new status appears after its receipt is confirmed." : "Retirarás el permiso que aún no se ha utilizado en esta consulta. Esperaremos su recibo antes de mostrarlo como retirado."}</p></ConfirmationButton>}
          {!canAuthorizeIssuance(data) && data.consent.status === 'absent' && <p className="text-xs text-slate-500">{english ? "Available after you confirm attendance, the doctor starts the appointment and the booking is attested." : "Se habilitará después de tu asistencia, el inicio por el médico y la acreditación de la reserva."}</p>}
        </>}
      </div>
      {operationError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{operationError}</p>}
      {operation?.id !== data.prescription?.operation?.id && <OperationNotice operation={operation} />}
      {!operation && data.operations?.filter(op => op.id !== data.prescription?.operation?.id).slice(0, 3).map(op => <OperationNotice key={op.id} operation={op} />)}
      {role === 'doctor' && (!data.prescription || issuing) && <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">{english ? "Prepare a private prescription" : "Preparar receta privada"}</h2>
          <button type="button" disabled={unavailable || !mintReady || !!(document.medication.trim() && document.dosage.trim() && document.instructions.trim())}
            onClick={() => setDocument(value => ({
              medication: value.medication.trim() ? value.medication : (english ? `Fictional product DEMO-${id}` : `Producto ficticio DEMO-${id}`),
              dosage: value.dosage.trim() ? value.dosage : (english ? 'Synthetic instructions for technical validation. Do not administer.' : 'Indicación sintética para validación técnica; no administrar.'),
              instructions: value.instructions.trim() ? value.instructions : (english ? `Test appointment #${id}. Synthetic demonstration document. No clinical use.` : `Consulta de prueba #${id}. Documento sintético de demostración, sin uso clínico.`),
            }))}
            className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-40">
            {english ? "Fill in test data" : "Rellenar datos de prueba"}
          </button>
        </div>
        <p className="text-sm text-slate-600">{english ? 'Recipient' : 'Destinatario'}: <strong>{patientLabel}</strong>. {english ? "Test validity: 30 days." : "Vigencia de prueba: 30 días."}</p>
        <p className="text-xs text-slate-500">{english ? "Use only fictional medication and synthetic data for this demonstration." : "Utiliza exclusivamente medicamentos y datos sintéticos para esta demostración."}</p>
        <fieldset disabled={unavailable || !mintReady} className="space-y-3 disabled:opacity-50">
          <label className="block text-sm text-slate-600">{english ? "Test medication" : "Medicamento de prueba"}<input maxLength={300} value={document.medication} onChange={e => setDocument(value => ({ ...value, medication: e.target.value }))} className={fieldClass} placeholder={english ? "Synthetic medication A" : "Medicamento sintético A"} /></label>
          <label className="block text-sm text-slate-600">{english ? "Test dosage and directions" : "Dosis e indicación de prueba"}<input maxLength={600} value={document.dosage} onChange={e => setDocument(value => ({ ...value, dosage: e.target.value }))} className={fieldClass} placeholder={english ? "Synthetic instructions for validation" : "Indicación sintética para validación"} /></label>
          <label className="block text-sm text-slate-600">{english ? "Instructions" : "Instrucciones"}<textarea maxLength={2000} value={document.instructions} onChange={e => setDocument(value => ({ ...value, instructions: e.target.value }))} className={fieldClass} rows={3} /></label>
        </fieldset>
        {!mintReady && <p className="text-sm text-amber-700">{english ? "Issuance requires a started appointment, an attested booking and active patient permission." : "Para emitir se requieren una consulta iniciada, reserva acreditada y permiso vigente del paciente."}</p>}
        <ConfirmationButton label={english ? "Review and issue prescription" : "Revisar y emitir receta"} title={english ? "Review prescription before issuing" : "Revisar receta antes de emitir"} disabled={unavailable || !mintReady || !document.medication.trim() || !document.dosage.trim() || !document.instructions.trim()} onConfirm={issue}>
          <p>{english ? 'Recipient' : 'Destinatario'}: <strong>{patientLabel}</strong>.</p>
          <p className="whitespace-pre-wrap"><strong>{document.medication}</strong><br />{document.dosage}<br />{document.instructions}</p>
          <p>{english ? "TrustLeaf encrypts and saves this document before submission. It appears as registered once the receipt is confirmed. Activation requires a separate signature." : "Guardaremos este documento cifrado antes de transmitir. Tras el recibo aparecerá como registrada; la activación será una acción posterior con tu firma."}</p>
        </ConfirmationButton>
      </div>}
      {data.prescription && !issuing && <PrescriptionCard prescription={data.prescription} role={role} onChange={refresh} unavailable={unavailable} />}
      </>}
    </>}
  </section>;
}

function attendanceLabel(language: 'en' | 'es', role: PortalRole, scheduled: boolean, attended: boolean) {
  if (role === 'doctor' && scheduled) {
    if (attended) return language === 'en' ? 'Patient ready' : 'Paciente listo';
    return language === 'en' ? 'Waiting for patient attendance' : 'Esperando confirmación de asistencia';
  }
  if (attended) return language === 'en' ? 'Confirmed' : 'Confirmada';
  return language === 'en' ? 'Pending' : 'Pendiente';
}

function appointmentActionError(failure: unknown, language: 'en' | 'es') {
  if (language === 'es') return failure instanceof Error ? failure.message : 'No se pudo confirmar el cambio.';
  if (failure instanceof PortalApiError) {
    if (failure.code === 'consultation_outside_checkin_window') return 'Attendance and start are available from 30 minutes before the appointment, on the scheduled day (Chile time).';
    if (failure.code === 'consultation_attendance_required') return 'Wait for the patient to confirm attendance before starting the appointment.';
    if (failure.code === 'appointment_has_prescription_booking') return 'This appointment has a linked prescription booking. Refresh its status before continuing.';
    if (failure.code === 'consultation_not_open') return 'This appointment has closed. Check its current status.';
  }
  return 'Could not confirm the change.';
}
function Status({ title, value, confirmed = false }: { title: string; value: string; confirmed?: boolean }) {
  return <div className={'rounded-xl p-3 ' + (confirmed ? 'bg-emerald-50' : 'bg-slate-50')}>
    <p className="text-sm text-slate-600">{title}</p>
    <p className={'mt-1 text-sm font-semibold ' + (confirmed ? 'text-emerald-800' : 'text-slate-800')}>{value}</p>
  </div>;
}
