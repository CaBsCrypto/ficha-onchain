'use client';

/**
 * LicenciasTab — real DB + on-chain signing
 * ---------------------------------------------------------------------------
 * Flow:
 *  1. Fetch existing licencias from /api/licenses?doctorEmail=X (Neon)
 *  2. "Nueva Licencia" modal:
 *       - "Guardar borrador" → POST /api/licenses (DB, status=draft)
 *       - "Firmar on-chain ✨" → POST /api/licenses → POST /api/documents/mint
 *                              → PATCH /api/licenses (status=signed + hash)
 *                              → fire-and-forget POST /api/notify/license
 *  3. Result screen shows TX hash, Stellar explorer link, SHA-256
 *
 * docType: "LaborRest" (reposo laboral) — maps to LaborRestContent
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { usePrivyEmail } from '@/hooks/usePrivyEmail';

// ── Types ─────────────────────────────────────────────────────────────────────
type LicenseTipo = 'Enfermedad' | 'Accidente' | 'Maternidad';
type LicenseStatus = 'draft' | 'signed' | 'expired';

interface DBLicense {
  id: number;
  doctor_email: string;
  patient_email: string | null;
  patient_name: string;
  patient_rut: string | null;
  fecha_inicio: string;
  dias: number;
  cie10: string;
  tipo: LicenseTipo;
  diagnostico: string | null;
  observaciones: string | null;
  status: LicenseStatus;
  tx_hash: string | null;
  doc_hash: string | null;
  doc_id: number | null;
  mode: 'onchain' | 'simulated' | null;
  created_at: string;
}

interface MintDocData {
  mode: 'onchain' | 'simulated';
  txHash?: string;
  contentHash: string;
  docId?: number;
  explorer?: string;
  simulatedReason?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TIPO_COLOR: Record<LicenseTipo, string> = {
  Enfermedad: 'bg-sky-50 text-sky-700',
  Accidente:  'bg-orange-50 text-orange-700',
  Maternidad: 'bg-pink-50 text-pink-700',
};

// ── Badges ────────────────────────────────────────────────────────────────────
function StatusBadge({ status, mode }: { status: LicenseStatus; mode: 'onchain' | 'simulated' | null }) {
  if (status === 'signed') {
    return mode === 'onchain'
      ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">⚡ On-chain</span>
      : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">📋 Simulada</span>;
  }
  if (status === 'expired') return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">Vencida</span>;
  return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">Borrador</span>;
}

// ── Styling constants ─────────────────────────────────────────────────────────
const inputCls   = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-100';
const selectCls  = inputCls;
const textareaCls = 'w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-100';

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {label}{required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
}

// ── New licence form state ────────────────────────────────────────────────────
interface LicForm {
  patientName:        string;
  patientEmail:       string;
  patientRut:         string;
  fechaInicio:        string;
  dias:               string;
  cie10:              string;
  tipo:               LicenseTipo;
  diagnostico:        string;
  observaciones:      string;
  doctorName:         string;
  doctorRut:          string;
  doctorEspecialidad: string;
}

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM: LicForm = {
  patientName: '', patientEmail: '', patientRut: '',
  fechaInicio: TODAY, dias: '', cie10: '', tipo: 'Enfermedad',
  diagnostico: '', observaciones: '',
  doctorName: '', doctorRut: '', doctorEspecialidad: '',
};

// ── Modal ─────────────────────────────────────────────────────────────────────
interface NewLicModalProps {
  defaultDoctorEmail: string;
  onClose: () => void;
  onSaved: (lic: DBLicense) => void;
}

function NewLicModal({ defaultDoctorEmail, onClose, onSaved }: NewLicModalProps) {
  const [form,      setForm]      = useState<LicForm>(EMPTY_FORM);
  const [phase,     setPhase]     = useState<'form' | 'saving' | 'signing' | 'done' | 'error'>('form');
  const [mintRes,   setMintRes]   = useState<MintDocData | null>(null);
  const [errorMsg,  setErrorMsg]  = useState('');
  const [savedLic,  setSavedLic]  = useState<DBLicense | null>(null);
  const overlayRef                = useRef<HTMLDivElement>(null);

  function set<K extends keyof LicForm>(k: K, v: LicForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  const canSubmit = Boolean(form.patientName && form.fechaInicio && form.dias && form.cie10 && form.tipo);
  const fechaFin  = form.fechaInicio && form.dias ? addDays(form.fechaInicio, parseInt(form.dias)) : '';

  // ── helpers ──────────────────────────────────────────────────────────────
  async function createInDb(): Promise<DBLicense> {
    const res = await fetch('/api/licenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctor_email:  defaultDoctorEmail,
        patient_email: form.patientEmail  || undefined,
        patient_name:  form.patientName,
        patient_rut:   form.patientRut    || undefined,
        fecha_inicio:  form.fechaInicio,
        dias:          parseInt(form.dias),
        cie10:         form.cie10,
        tipo:          form.tipo,
        diagnostico:   form.diagnostico   || undefined,
        observaciones: form.observaciones || undefined,
      }),
    });
    const json = await res.json() as { data?: DBLicense; error?: string };
    if (!res.ok || !json.data) throw new Error(json.error ?? 'create_failed');
    return json.data;
  }

  // ── Draft ─────────────────────────────────────────────────────────────────
  async function handleDraft(e: React.MouseEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPhase('saving');
    try {
      const lic = await createInDb();
      onSaved(lic);
      onClose();
    } catch (err) {
      setErrorMsg(String(err));
      setPhase('error');
    }
  }

  // ── On-chain sign ──────────────────────────────────────────────────────────
  async function handleSign(e: React.MouseEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setPhase('saving');
    let lic: DBLicense;
    try {
      lic = await createInDb();
      setSavedLic(lic);
    } catch (err) {
      setErrorMsg(String(err));
      setPhase('error');
      return;
    }

    setPhase('signing');
    try {
      const expiresAt = fechaFin
        ? Math.floor(new Date(fechaFin + 'T23:59:59').getTime() / 1000)
        : 0;

      const mintResponse = await fetch('/api/documents/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: form.patientEmail || form.patientName,
          docType: 'LaborRest',
          expiresAt,
          payload: {
            resourceType:      'LaborRestCertificate',
            issuerName:        form.doctorName    || defaultDoctorEmail,
            issuerLicenseId:   form.doctorRut     || undefined,
            recipientFullName: form.patientName,
            recipientIdNumber: form.patientRut    || undefined,
            issuedOn:          form.fechaInicio,
            restDays:          parseInt(form.dias),
            startDate:         form.fechaInicio,
            endDate:           fechaFin,
            diagnosisCode:     form.cie10,
            diagnosisText:     form.diagnostico   || undefined,
            notes:             form.observaciones || undefined,
          },
        }),
      });

      const mintJson = await mintResponse.json() as { data?: MintDocData; error?: string };
      if (!mintResponse.ok || mintJson.error) throw new Error(mintJson.error ?? 'mint_failed');

      const result = mintJson.data!;
      setMintRes(result);

      // Patch DB
      await fetch('/api/licenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:       lic.id,
          status:   'signed',
          tx_hash:  result.txHash      ?? null,
          doc_hash: result.contentHash,
          doc_id:   result.docId       ?? null,
          mode:     result.mode,
        }),
      });

      // Fire-and-forget email
      if (form.patientEmail) {
        fetch('/api/notify/license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientEmail: form.patientEmail,
            patientName:  form.patientName,
            dias:         parseInt(form.dias),
            fechaInicio:  form.fechaInicio,
            fechaFin,
            cie10:        form.cie10,
            tipo:         form.tipo,
            doctorName:   form.doctorName || defaultDoctorEmail,
            mode:         result.mode,
            docHash:      result.txHash ?? result.contentHash,
            docId:        result.docId  ?? null,
            explorer:     result.explorer ?? null,
          }),
        }).catch(() => undefined);
      }

      const signed: DBLicense = {
        ...lic,
        status:   'signed',
        tx_hash:  result.txHash      ?? null,
        doc_hash: result.contentHash,
        doc_id:   result.docId       ?? null,
        mode:     result.mode,
      };
      setSavedLic(signed);
      onSaved(signed);
      setPhase('done');
    } catch (err) {
      setErrorMsg(String(err));
      setPhase('error');
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current && phase === 'form') onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-800">Nueva licencia médica</h3>
          {phase === 'form' && (
            <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Saving */}
        {phase === 'saving' && (
          <div className="flex flex-col items-center gap-3 px-6 py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-500" />
            <p className="text-sm text-slate-500">Guardando licencia…</p>
          </div>
        )}

        {/* Signing */}
        {phase === 'signing' && (
          <div className="flex flex-col items-center gap-3 px-6 py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-500" />
            <p className="text-sm font-medium text-slate-700">Firmando en Stellar…</p>
            <p className="text-xs text-slate-400">Anclando hash on-chain</p>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && mintRes && savedLic && (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-lg">⚡</div>
              <div>
                <p className="font-semibold text-slate-800">
                  Licencia {mintRes.mode === 'onchain' ? 'firmada on-chain' : 'emitida (demo)'}
                </p>
                <p className="text-xs text-slate-400">{form.dias} días · {form.cie10} · {form.tipo}</p>
              </div>
            </div>

            {mintRes.mode === 'simulated' && mintRes.simulatedReason && (
              <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                Motivo simulación: {mintRes.simulatedReason}
              </p>
            )}

            <div className="rounded-xl bg-slate-900 p-4 space-y-2">
              {mintRes.txHash && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">TX Hash</p>
                  <p className="break-all font-mono text-[11px] text-slate-200">{mintRes.txHash}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Content Hash (SHA-256)</p>
                <p className="break-all font-mono text-[11px] text-slate-200">{mintRes.contentHash}</p>
              </div>
              {mintRes.docId != null && (
                <p className="text-[10px] text-slate-400">Doc ID on-chain: #{mintRes.docId}</p>
              )}
            </div>

            {mintRes.explorer && (
              <a
                href={mintRes.explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
              >
                Ver en Stellar Expert
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                </svg>
              </a>
            )}

            {form.patientEmail && (
              <p className="text-center text-xs text-slate-400">
                Notificación enviada a <span className="font-medium text-slate-600">{form.patientEmail}</span>
              </p>
            )}

            <button
              onClick={onClose}
              className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="space-y-4 p-6">
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Error: {errorMsg}</div>
            <button
              onClick={() => setPhase('form')}
              className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Volver al formulario
            </button>
          </div>
        )}

        {/* Form */}
        {phase === 'form' && (
          <div className="max-h-[80vh] overflow-y-auto p-6">

            {/* Paciente */}
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Paciente</p>

            <div className="mb-4">
              <FieldLabel label="Nombre completo" required />
              <input className={inputCls} value={form.patientName}
                onChange={e => set('patientName', e.target.value)} placeholder="María González Rojas" />
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="RUT" />
                <input className={inputCls} value={form.patientRut}
                  onChange={e => set('patientRut', e.target.value)} placeholder="12.345.678-9" />
              </div>
              <div>
                <FieldLabel label="Email" />
                <input type="email" className={inputCls} value={form.patientEmail}
                  onChange={e => set('patientEmail', e.target.value)} placeholder="paciente@email.com" />
              </div>
            </div>

            {/* Médico */}
            <p className="mb-3 mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">Médico</p>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Nombre médico" />
                <input className={inputCls} value={form.doctorName}
                  onChange={e => set('doctorName', e.target.value)} placeholder="Dr. Carlos Reyes" />
              </div>
              <div>
                <FieldLabel label="RUT médico" />
                <input className={inputCls} value={form.doctorRut}
                  onChange={e => set('doctorRut', e.target.value)} placeholder="12.345.678-9" />
              </div>
            </div>

            <div className="mb-4">
              <FieldLabel label="Especialidad" />
              <input className={inputCls} value={form.doctorEspecialidad}
                onChange={e => set('doctorEspecialidad', e.target.value)} placeholder="Medicina General, Traumatología…" />
            </div>

            {/* Licencia */}
            <p className="mb-3 mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">Licencia</p>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Fecha inicio" required />
                <input type="date" className={inputCls} value={form.fechaInicio}
                  onChange={e => set('fechaInicio', e.target.value)} />
              </div>
              <div>
                <FieldLabel label="Días de reposo" required />
                <input type="number" min={1} className={inputCls} value={form.dias}
                  onChange={e => set('dias', e.target.value)} placeholder="7" />
              </div>
            </div>

            {fechaFin && (
              <p className="mb-4 -mt-2 text-xs text-slate-400">
                Fin estimado: <span className="font-medium text-slate-600">{fmtDate(fechaFin)}</span>
              </p>
            )}

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="CIE-10" required />
                <input className={inputCls} value={form.cie10}
                  onChange={e => set('cie10', e.target.value)} placeholder="J06.9" />
              </div>
              <div>
                <FieldLabel label="Tipo" required />
                <select className={selectCls} value={form.tipo}
                  onChange={e => set('tipo', e.target.value as LicenseTipo)}>
                  <option value="Enfermedad">Enfermedad</option>
                  <option value="Accidente">Accidente</option>
                  <option value="Maternidad">Maternidad</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <FieldLabel label="Diagnóstico" />
              <input className={inputCls} value={form.diagnostico}
                onChange={e => set('diagnostico', e.target.value)} placeholder="Infección respiratoria aguda…" />
            </div>

            <div className="mb-6">
              <FieldLabel label="Observaciones" />
              <textarea rows={3} className={textareaCls} value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)}
                placeholder="Indicaciones de reposo, restricciones, seguimiento…" />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDraft}
                disabled={!canSubmit}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Guardar borrador
              </button>
              <button
                type="button"
                onClick={handleSign}
                disabled={!canSubmit}
                className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Firmar on-chain ✨
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── License card ──────────────────────────────────────────────────────────────
function LicCard({ lic }: { lic: DBLicense }) {
  const fechaFin = addDays(lic.fecha_inicio, lic.dias);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-800">{lic.patient_name}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TIPO_COLOR[lic.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
              {lic.tipo}
            </span>
            <StatusBadge status={lic.status} mode={lic.mode} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {fmtDate(lic.fecha_inicio)} → {fmtDate(fechaFin)} · {lic.dias} días de reposo
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>CIE-10: {lic.cie10}</span>
        {lic.diagnostico && <span>{lic.diagnostico}</span>}
        <span>Licencia #{lic.id}</span>
      </div>

      {lic.status === 'signed' && lic.doc_hash && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
          <p className="truncate font-mono text-[10px] text-slate-400">{lic.tx_hash ?? lic.doc_hash}</p>
          {lic.mode === 'onchain' && lic.tx_hash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${lic.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:underline"
            >
              Ver en Stellar Expert →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── LicenciasTab ──────────────────────────────────────────────────────────────
export function LicenciasTab() {
  const { user }     = usePrivy();
  const displayEmail = usePrivyEmail();
  const doctorEmail  = user?.email?.address ?? displayEmail ?? '';

  const [licencias, setLicencias] = useState<DBLicense[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchLicencias = useCallback(async () => {
    if (!doctorEmail) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/licenses?doctorEmail=${encodeURIComponent(doctorEmail)}`);
      const json = await res.json() as { data?: DBLicense[] };
      if (json.data) setLicencias(json.data);
    } catch (err) {
      console.error('[LicenciasTab]', err);
    } finally {
      setLoading(false);
    }
  }, [doctorEmail]);

  useEffect(() => { void fetchLicencias(); }, [fetchLicencias]);

  function handleSaved(lic: DBLicense) {
    setLicencias(prev => {
      const idx = prev.findIndex(l => l.id === lic.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = lic;
        return copy;
      }
      return [lic, ...prev];
    });
  }

  const signed  = licencias.filter(l => l.status === 'signed');
  const drafts  = licencias.filter(l => l.status === 'draft');
  const expired = licencias.filter(l => l.status === 'expired');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Licencias médicas</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva Licencia
        </button>
      </div>

      {/* Stats strip */}
      {licencias.length > 0 && (
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl bg-violet-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-violet-700">{signed.length}</p>
            <p className="text-[10px] font-medium text-violet-500 uppercase tracking-wide">Firmadas</p>
          </div>
          <div className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-center">
            <p className="text-lg font-bold text-slate-600">{drafts.length}</p>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Borradores</p>
          </div>
          <div className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-center">
            <p className="text-lg font-bold text-slate-600">{expired.length}</p>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Vencidas</p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
        </div>
      ) : licencias.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No hay licencias emitidas aún.
        </div>
      ) : (
        <div className="space-y-3">
          {licencias.map(lic => <LicCard key={lic.id} lic={lic} />)}
        </div>
      )}

      {showModal && (
        <NewLicModal
          defaultDoctorEmail={doctorEmail}
          onClose={() => setShowModal(false)}
          onSaved={lic => { handleSaved(lic); setShowModal(false); }}
        />
      )}
    </div>
  );
}
