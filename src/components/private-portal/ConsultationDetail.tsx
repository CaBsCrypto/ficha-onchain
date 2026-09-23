'use client';
import { useRef, useState } from 'react';
import { canAuthorizeIssuance } from './state';
import { jsonBody, localDate, portalApi, usePortalData } from './client';
import { ConfirmationButton, OperationNotice, ReceiptLink, usePrivateOperation } from './Operation';
import { PrescriptionCard } from './Prescriptions';
import type { ConsultationState, PortalRole, PrescriptionDocument, PrivatePrescription } from './types';

const bookingLabels: Record<string, string> = { prepared: 'Esperando acreditación', submitted: 'Acreditación enviada', confirmed: 'Reserva acreditada', cancel_requested: 'Cancelación pendiente', revoked: 'Reserva revocada', consumed: 'Reserva utilizada', cancelled: 'Reserva cancelada', failed: 'Acreditación fallida' };
const consentLabels = { absent: 'Sin permiso de emisión', active: 'Permiso vigente', expired: 'Permiso vencido', consumed: 'Permiso utilizado para esta receta' };
const fieldClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100';

export function ConsultationDetail({ id, role, onBack }: { id: number; role: PortalRole; onBack: () => void }) {
  const { data, error, loading, refresh } = usePortalData<ConsultationState>(`/api/private-consultations/${id}`);
  const { run, busy, operation, error: operationError } = usePrivateOperation(data?.operations?.[0]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [document, setDocument] = useState<PrescriptionDocument>({ medication: '', dosage: '', instructions: '' });
  const lock = useRef(false);
  async function appointmentAction(action: 'attend' | 'start' | 'complete' | 'cancel') {
    if (lock.current) return;
    lock.current = true; setSaving(true); setActionError('');
    try { await portalApi('/api/appointments', { ...jsonBody({ id, action }), method: 'PATCH' }); refresh(); }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : 'No se pudo confirmar el cambio.'); }
    finally { lock.current = false; setSaving(false); }
  }
  async function consent(action: 'consent' | 'withdraw_consent') { await run(action, { appointmentId: id }); refresh(); }
  async function issue() {
    if (lock.current) throw new Error('La receta se está preparando.');
    lock.current = true; setSaving(true); setActionError('');
    try {
      const saved = await portalApi<{ prescription: PrivatePrescription }>('/api/private-prescriptions', jsonBody({ appointmentId: id, document, validDays: 30 }));
      if (!saved.prescription?.id) throw new Error('No se pudo verificar el documento guardado.');
      await run('mint', { prescriptionId: saved.prescription.id });
    } finally { lock.current = false; setSaving(false); refresh(); }
  }
  if (loading && !data) return <section role="status" className="space-y-4">
    <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-hidden />
    <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-hidden />
    <p className="text-sm text-slate-500">Consultando la reserva y sus permisos…</p>
  </section>;
  const appointment = data?.appointment;
  const attended = appointment?.attended_at ?? appointment?.attendance_at;
  const pending = busy || saving || operation?.state === 'submitted' || !!data?.operations?.some(op => op.state === 'submitted');
  const unavailable = !!error || pending;
  const inProgress = appointment?.status === 'in_progress';
  const mintReady = !!data && inProgress && !!attended && data.booking?.state === 'confirmed' &&
    !data.booking.cancellation_requested_at && Number(data.booking.valid_until) * 1000 > Date.now() && data.consent.status === 'active' && Number(data.consent.validUntil ?? 0) * 1000 > Date.now();
  return <section className="space-y-5">
    <button onClick={onBack} disabled={busy || saving} className="text-sm font-semibold text-sky-700 hover:underline">← Volver a mis consultas</button>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error} <button onClick={refresh} className="font-semibold underline">Actualizar estado</button></div>}
    {data && appointment && <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Consulta de prueba #{id}</h1>
        <p className="mt-2 text-sm text-slate-600">Médico: <strong>{appointment.doctor_name || appointment.doctor_email}</strong><br />Paciente: <strong>{appointment.patient_name || appointment.patient_email}</strong></p>
        <p className="mt-2 text-sm text-slate-500">{appointment.date.slice(0, 10)} · {appointment.time_slot} · Hora de Chile</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Status title="Asistencia del paciente" value={attended ? 'Confirmada' : 'Pendiente'} />
          <Status title="Inicio por el médico" value={appointment.started_at ? 'Consulta iniciada' : 'Pendiente'} />
          <Status title="Reserva Stellar" value={data.booking ? bookingLabels[data.booking.state] ?? 'Verificando estado' : 'Esperando asistencia e inicio'} />
        </div>
        <ReceiptLink hash={data.booking?.attestation_hash ?? data.booking?.transaction_hash} />
        {data.booking?.state === 'prepared' && <p className="mt-3 text-sm text-amber-700">La solicitud espera al procesador de reservas. Si está apagado, permanecerá pendiente.</p>}
        {appointment.status === 'cancelled' && <p className="mt-3 font-semibold text-rose-700">Consulta cancelada</p>}
        {appointment.status === 'cancel_requested' && <p role="status" className="mt-3 text-sm font-semibold text-amber-700">Cancelación solicitada. Esperamos la confirmación antes de mostrar la reserva como cancelada.</p>}
        {appointment.status === 'completed' && <p className="mt-3 font-semibold text-slate-600">Consulta finalizada</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        {role === 'patient' && !attended && ['scheduled', 'in_progress'].includes(appointment.status) && <button disabled={unavailable} onClick={() => void appointmentAction('attend')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Confirmar mi asistencia</button>}
        {role === 'doctor' && appointment.status === 'scheduled' && <button disabled={unavailable} onClick={() => void appointmentAction('start')} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Iniciar consulta</button>}
        {['scheduled', 'in_progress'].includes(appointment.status) && data.consent.status !== 'consumed' && <button disabled={unavailable || data.booking?.state === 'cancel_requested'} onClick={() => void appointmentAction('cancel')} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-40">Solicitar cancelación</button>}
        {role === 'doctor' && inProgress && data.prescription?.rxId != null && <button disabled={unavailable} onClick={() => void appointmentAction('complete')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Finalizar consulta</button>}
      </div>
      {actionError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Permiso para una emisión</h2>
        <p className="text-sm text-slate-600">Confirmar asistencia no concede permiso para emitir. El paciente autoriza por separado a este médico, para esta consulta y una sola receta.</p>
        <p className="text-sm font-semibold text-slate-800">{consentLabels[data.consent.status]}</p>
        {data.consent.validUntil && <p className="text-xs text-slate-500">Vence: {localDate(data.consent.validUntil)} · Hora de Chile</p>}
        {role === 'patient' && <>
          {data.consent.status !== 'consumed' && data.consent.status !== 'active' && <ConfirmationButton label="Autorizar una emisión" title="Autorizar a este médico para una receta" disabled={unavailable || !canAuthorizeIssuance(data)} onConfirm={() => consent('consent')}>
            <p>Médico: <strong>{appointment.doctor_name || appointment.doctor_email}</strong>.</p><p>Paciente: <strong>{appointment.patient_name || appointment.patient_email}</strong>. Consulta #{id}.</p>
            <p>Permitirás una sola emisión. El permiso vence como máximo el <strong>{localDate(Number(data.booking?.valid_until))}</strong> y puedes retirarlo antes de que se utilice.</p>
          </ConfirmationButton>}
          {data.consent.status === 'active' && <ConfirmationButton danger label="Retirar permiso" title="Retirar el permiso de emisión" disabled={unavailable} onConfirm={() => consent('withdraw_consent')}><p>Retirarás el permiso que aún no se ha utilizado en esta consulta. Esperaremos su recibo antes de mostrarlo como retirado.</p></ConfirmationButton>}
          {!canAuthorizeIssuance(data) && data.consent.status === 'absent' && <p className="text-xs text-slate-500">Se habilitará después de tu asistencia, el inicio por el médico y la acreditación de la reserva.</p>}
        </>}
      </div>
      {operationError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{operationError}</p>}
      {operation?.id !== data.prescription?.operation?.id && <OperationNotice operation={operation} />}
      {!operation && data.operations?.filter(op => op.id !== data.prescription?.operation?.id).slice(0, 3).map(op => <OperationNotice key={op.id} operation={op} />)}
      {role === 'doctor' && !data.prescription && <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Preparar receta privada</h2>
          <button type="button" disabled={unavailable || !mintReady || !!(document.medication.trim() && document.dosage.trim() && document.instructions.trim())}
            onClick={() => setDocument(value => ({
              medication: value.medication.trim() ? value.medication : `Producto ficticio DEMO-${id}`,
              dosage: value.dosage.trim() ? value.dosage : 'Indicación sintética para validación técnica; no administrar.',
              instructions: value.instructions.trim() ? value.instructions : `Consulta de prueba #${id}. Documento sintético de demostración, sin uso clínico.`,
            }))}
            className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-40">
            Rellenar datos de prueba
          </button>
        </div>
        <p className="text-sm text-slate-600">Destinatario: <strong>{appointment.patient_name || appointment.patient_email}</strong>. Vigencia de prueba: 30 días.</p>
        <p className="text-xs text-slate-500">Utiliza exclusivamente medicamentos y datos sintéticos para esta demostración.</p>
        <fieldset disabled={unavailable || !mintReady} className="space-y-3 disabled:opacity-50">
          <label className="block text-sm text-slate-600">Medicamento de prueba<input maxLength={300} value={document.medication} onChange={e => setDocument(value => ({ ...value, medication: e.target.value }))} className={fieldClass} placeholder="Medicamento sintético A" /></label>
          <label className="block text-sm text-slate-600">Dosis e indicación de prueba<input maxLength={600} value={document.dosage} onChange={e => setDocument(value => ({ ...value, dosage: e.target.value }))} className={fieldClass} placeholder="Indicación sintética para validación" /></label>
          <label className="block text-sm text-slate-600">Instrucciones<textarea maxLength={2000} value={document.instructions} onChange={e => setDocument(value => ({ ...value, instructions: e.target.value }))} className={fieldClass} rows={3} /></label>
        </fieldset>
        {!mintReady && <p className="text-sm text-amber-700">Para emitir se requieren una consulta iniciada, reserva acreditada y permiso vigente del paciente.</p>}
        <ConfirmationButton label="Revisar y emitir receta" title="Revisar receta antes de emitir" disabled={unavailable || !mintReady || !document.medication.trim() || !document.dosage.trim() || !document.instructions.trim()} onConfirm={issue}>
          <p>Destinatario: <strong>{appointment.patient_name || appointment.patient_email}</strong>.</p>
          <p className="whitespace-pre-wrap"><strong>{document.medication}</strong><br />{document.dosage}<br />{document.instructions}</p>
          <p>Guardaremos este documento cifrado antes de transmitir. Tras el recibo aparecerá como registrada; la activación será una acción posterior con tu firma.</p>
        </ConfirmationButton>
      </div>}
      {data.prescription && <PrescriptionCard prescription={data.prescription} role={role} onChange={refresh} unavailable={unavailable} />}
    </>}
  </section>;
}
function Status({ title, value }: { title: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{title}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div>;
}
