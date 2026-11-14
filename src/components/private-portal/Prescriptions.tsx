'use client';
import { useState } from 'react';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { DocumentView } from './DocumentView';
import { localDate, usePortalData } from './client';
import { prescriptionLabel } from './state';
import { ConfirmationButton, OperationNotice, ReceiptLink, usePrivateOperation, type ReviewSponsorshipQuote } from './Operation';
import type { PortalRole, PrivatePrescription } from './types';

export function PrescriptionCard({ prescription, role, onChange, unavailable = false }: { prescription: PrivatePrescription; role: PortalRole; onChange: () => void; unavailable?: boolean }) {
  const language = usePortalLanguage();
  const english = language === 'en';
  const [documentReady, setDocumentReady] = useState(false);
  const { run, busy, operation, error } = usePrivateOperation(prescription.operation);
  const pending = operation?.state === 'submitted' || prescription.operation?.state === 'submitted';
  async function act(action: 'activate' | 'revoke' | 'mint', reviewQuote: ReviewSponsorshipQuote) {
    await run(action, { prescriptionId: prescription.id }, reviewQuote); onChange();
  }
  return <article data-patient-list-card={role === "patient" ? "" : undefined} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">{prescription.rxId != null ? `${english ? 'Prescription' : 'Receta'} #${prescription.rxId}` : (english ? 'Document prepared' : 'Documento preparado')}</h3><span data-prescription-status={prescription.status} className={`max-w-full whitespace-normal rounded-full px-3 py-1 text-xs font-semibold ${prescription.status === 'Active' && !prescription.expired && prescription.rxId != null ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{prescriptionLabel(prescription, language)}</span></div>
    <p className="text-sm text-slate-600">{english ? 'Doctor' : 'Médico'}: <strong>{prescription.doctorName}</strong><span data-patient-desktop={role === "patient" ? "" : undefined}><br />{english ? 'Patient' : 'Paciente'}: <strong>{prescription.patientName}</strong></span></p>

    <p className="text-xs text-slate-500">{english ? 'Expires' : 'Vence'}: {localDate(prescription.expiresAt, language)} · {english ? "Chile time" : "Hora de Chile"}</p>
    {(role === 'doctor' || prescription.rxId != null) && <div data-patient-document><DocumentView id={prescription.id} prescription={prescription} /></div>}
    <ReceiptLink hash={prescription.transactionHash} />
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <OperationNotice operation={operation ?? prescription.operation} />
    {role === 'doctor' && <div className="flex flex-wrap gap-3">
      {prescription.rxId == null && <ConfirmationButton label={english ? "Review and continue issuance" : "Revisar y continuar emisión"} title={english ? "Issue the prepared prescription" : "Emitir la receta preparada"} disabled={busy || pending || unavailable || prescription.expired} confirmDisabled={!documentReady} onConfirm={reviewQuote => act('mint', reviewQuote)}><p>{english ? 'You will issue the saved document for' : 'Emitirás el documento guardado para'} <strong>{prescription.patientName}</strong>. {english ? 'Open and review it to enable confirmation.' : 'Abre y revisa su contenido para habilitar la confirmación.'}</p><DocumentView id={prescription.id} prescription={prescription} onAvailable={setDocumentReady} /></ConfirmationButton>}
      {prescription.rxId != null && prescription.status === 'Registered' && !prescription.expired && <ConfirmationButton label={english ? "Activate prescription" : "Activar receta"} title={english ? "Activate this prescription" : "Activar esta receta"} disabled={busy || pending || unavailable} onConfirm={reviewQuote => act('activate', reviewQuote)}><p>{english ? 'You will activate prescription' : 'Activarás la receta'} #{prescription.rxId} {english ? 'for' : 'para'} <strong>{prescription.patientName}</strong>. {english ? 'This change requires your signature and has its own receipt.' : 'Este cambio requiere tu firma y quedará confirmado mediante su propio recibo.'}</p></ConfirmationButton>}
      {prescription.rxId != null && ['Registered', 'Active'].includes(prescription.status) && <ConfirmationButton danger label={english ? "Revoke prescription" : "Revocar receta"} title={english ? "Revoke this prescription" : "Revocar esta receta"} disabled={busy || pending || unavailable} onConfirm={reviewQuote => act('revoke', reviewQuote)}><p>{english ? 'You will revoke prescription' : 'Revocarás la receta'} #{prescription.rxId} {english ? 'for' : 'para'} <strong>{prescription.patientName}</strong>. {english ? 'The prescription and its history will be kept.' : 'La receta y su historial se conservarán.'}</p></ConfirmationButton>}
    </div>}
  </article>;
}

export function PrivatePrescriptions({ role }: { role: PortalRole }) {
  const language = usePortalLanguage();
  const english = language === 'en';
  const { data, error, loading, refresh } = usePortalData<{ prescriptions: PrivatePrescription[]; checkedAt?: string }>(`/api/private-prescriptions?role=${role}`, role === 'patient' ? 0 : 3000);
  const [filter, setFilter] = useState('all');
  const prescriptions = data?.prescriptions ?? [];
  const shown = prescriptions.filter(rx => filter === 'all' || (filter === 'expired' ? rx.expired && !['Revoked', 'Blocked'].includes(rx.status) : rx.status === filter && (filter === 'Revoked' || !rx.expired) && rx.rxId != null));
  if (role === 'patient') {
    const active = (rx: PrivatePrescription) => rx.status === 'Active' && !rx.expired && rx.rxId != null;
    shown.sort((a, b) => Number(active(b)) - Number(active(a)));
  }
  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold text-slate-900">{role === 'doctor' ? (english ? 'My issued prescriptions' : 'Mis recetas emitidas') : (english ? 'My private prescriptions' : 'Mis recetas privadas')}</h1><p className="mt-1 text-sm text-slate-500">{error ? (data ? (english ? 'Showing the last verified results. The current Stellar Testnet status is unavailable.' : 'Datos de la última consulta correcta. No se pudo verificar el estado actual en Stellar Testnet.') : (english ? 'Could not verify prescription statuses on Stellar Testnet.' : 'No se pudo verificar el estado de las recetas en Stellar Testnet.')) : data ? (english ? 'Statuses verified on Stellar Testnet.' : 'Estados verificados en Stellar Testnet.') : (english ? 'Checking statuses on Stellar Testnet.' : 'Consultando estados en Stellar Testnet.')} {english ? "The clinical document remains encrypted." : "El documento clínico permanece cifrado."}</p></div><button onClick={refresh} disabled={loading} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">{english ? "Refresh" : "Actualizar"}</button></div>
    {data?.checkedAt && Number.isFinite(Date.parse(data.checkedAt)) && <p className="text-xs text-slate-500">{english ? 'Checked at' : 'Consulta comprobada'}: {localDate(Date.parse(data.checkedAt) / 1000, language)} · {english ? "Chile time" : "Hora de Chile"}.{role === 'patient' && (english ? ' Select Refresh to check again.' : ' Pulsa Actualizar para volver a comprobar los estados.')}</p>}
    <label data-patient-filter className="block text-sm text-slate-600">{english ? "Status" : "Estado"}<select value={filter} onChange={e => setFilter(e.target.value)} className="ml-3 rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="all">{english ? "All" : "Todas"}</option><option value="Registered">{english ? "Registered" : "Registradas"}</option><option value="Active">{english ? "Active" : "Activas"}</option><option value="Revoked">{english ? "Revoked" : "Revocadas"}</option><option value="expired">{english ? "Expired" : "Vencidas"}</option></select></label>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{english ? 'Could not load prescriptions.' : error} <button onClick={refresh} className="font-semibold underline">{english ? "Refresh" : "Actualizar"}</button></div>}
    {loading && <p role="status" className="text-sm text-slate-500">{english ? "Checking prescriptions…" : "Consultando recetas…"}</p>}
    {!loading && !error && shown.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{english ? "No prescriptions have this status." : "No hay recetas en este estado."}</p>}
    {shown.map(rx => <PrescriptionCard key={rx.id} prescription={rx} role={role} onChange={refresh} unavailable={!!error} />)}
  </section>;
}
