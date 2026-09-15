'use client';
import { useState } from 'react';
import { DocumentView } from './DocumentView';
import { localDate, usePortalData } from './client';
import { prescriptionLabel } from './state';
import { ConfirmationButton, OperationNotice, ReceiptLink, usePrivateOperation } from './Operation';
import type { PortalRole, PrivatePrescription } from './types';

export function PrescriptionCard({ prescription, role, onChange, unavailable = false }: { prescription: PrivatePrescription; role: PortalRole; onChange: () => void; unavailable?: boolean }) {
  const [documentReady, setDocumentReady] = useState(false);
  const { run, busy, operation, error } = usePrivateOperation(prescription.operation);
  const pending = operation?.state === 'submitted' || prescription.operation?.state === 'submitted';
  async function act(action: 'activate' | 'revoke' | 'mint') {
    await run(action, { prescriptionId: prescription.id }); onChange();
  }
  return <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">{prescription.rxId != null ? `Receta #${prescription.rxId}` : 'Documento preparado'}</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold ${prescription.status === 'Active' && !prescription.expired && prescription.rxId != null ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{prescriptionLabel(prescription)}</span></div>
    <p className="text-sm text-slate-600">Médico: <strong>{prescription.doctorName}</strong><br />Paciente: <strong>{prescription.patientName}</strong></p>
    <p className="text-xs text-slate-500">Vence: {localDate(prescription.expiresAt)} · Hora de Chile</p>
    {(role === 'doctor' || prescription.rxId != null) && <DocumentView id={prescription.id} prescription={prescription} />}
    <ReceiptLink hash={prescription.transactionHash} />
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <OperationNotice operation={operation ?? prescription.operation} />
    {role === 'doctor' && <div className="flex flex-wrap gap-3">
      {prescription.rxId == null && <ConfirmationButton label="Revisar y continuar emisión" title="Emitir la receta preparada" disabled={busy || pending || unavailable || prescription.expired} confirmDisabled={!documentReady} onConfirm={() => act('mint')}><p>Emitirás el documento guardado para <strong>{prescription.patientName}</strong>. Abre y revisa su contenido para habilitar la confirmación.</p><DocumentView id={prescription.id} prescription={prescription} onAvailable={setDocumentReady} /></ConfirmationButton>}
      {prescription.rxId != null && prescription.status === 'Registered' && !prescription.expired && <ConfirmationButton label="Activar receta" title="Activar esta receta" disabled={busy || pending || unavailable} onConfirm={() => act('activate')}><p>Activarás la receta #{prescription.rxId} para <strong>{prescription.patientName}</strong>. Este cambio requiere tu firma y quedará confirmado mediante su propio recibo.</p></ConfirmationButton>}
      {prescription.rxId != null && ['Registered', 'Active'].includes(prescription.status) && <ConfirmationButton danger label="Revocar receta" title="Revocar esta receta" disabled={busy || pending || unavailable} onConfirm={() => act('revoke')}><p>Revocarás la receta #{prescription.rxId} para <strong>{prescription.patientName}</strong>. La receta y su historial se conservarán.</p></ConfirmationButton>}
    </div>}
  </article>;
}

export function PrivatePrescriptions({ role }: { role: PortalRole }) {
  const { data, error, loading, refresh } = usePortalData<{ prescriptions: PrivatePrescription[] }>(`/api/private-prescriptions?role=${role}`);
  const [filter, setFilter] = useState('all');
  const prescriptions = data?.prescriptions ?? [];
  const shown = prescriptions.filter(rx => filter === 'all' || (filter === 'expired' ? rx.expired && !['Revoked', 'Blocked'].includes(rx.status) : rx.status === filter && (filter === 'Revoked' || !rx.expired) && rx.rxId != null));
  return <section className="space-y-5">
    <div><h1 className="text-xl font-semibold text-slate-900">{role === 'doctor' ? 'Mis recetas emitidas' : 'Mis recetas privadas'}</h1><p className="mt-1 text-sm text-slate-500">Estados verificados en Stellar Testnet. El documento clínico permanece cifrado.</p></div>
    <label className="block text-sm text-slate-600">Estado<select value={filter} onChange={e => setFilter(e.target.value)} className="ml-3 rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="all">Todas</option><option value="Registered">Registradas</option><option value="Active">Activas</option><option value="Revoked">Revocadas</option><option value="expired">Vencidas</option></select></label>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error} <button onClick={refresh} className="font-semibold underline">Actualizar</button></div>}
    {loading && <p role="status" className="text-sm text-slate-500">Consultando recetas…</p>}
    {!loading && !error && shown.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No hay recetas en este estado.</p>}
    {shown.map(rx => <PrescriptionCard key={rx.id} prescription={rx} role={role} onChange={refresh} unavailable={!!error} />)}
  </section>;
}
