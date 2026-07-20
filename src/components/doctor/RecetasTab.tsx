'use client';

import { useState, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { Modal, FormField, inputCls, selectCls, textareaCls } from './Modal';
import { MOCK_PRESCRIPTIONS } from './types';
import type { MockPrescription, PrescriptionTipo, PrescriptionStatus } from './types';

// ── Status badges ─────────────────────────────────────────────────────────────
function RxStatusBadge({ status }: { status: PrescriptionStatus }) {
  const cls: Record<PrescriptionStatus, string> = {
    Activa:     'bg-emerald-50 text-emerald-700',
    Dispensada: 'bg-sky-50 text-sky-700',
    Vencida:    'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[status]}`}>
      {status}
    </span>
  );
}

function TipoBadge({ tipo }: { tipo: PrescriptionTipo }) {
  const cls: Record<PrescriptionTipo, string> = {
    Simple:    'bg-blue-50 text-blue-700',
    Retenida:  'bg-amber-50 text-amber-700',
    Magistral: 'bg-violet-50 text-violet-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[tipo]}`}>
      {tipo}
    </span>
  );
}

function ModeBadge({ mode }: { mode: 'onchain' | 'simulated' }) {
  return mode === 'onchain' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      On-chain ✓
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
      Simulada
    </span>
  );
}

// ── Mint result type ──────────────────────────────────────────────────────────
interface MintResult {
  mode: 'onchain' | 'simulated';
  rxId: number | null;
  hash: string;
  rxHash: string;
  explorer?: string;
  reason?: string;
}

// ── Form state ────────────────────────────────────────────────────────────────
interface RecetaForm {
  // Paciente
  patientEmail:  string;
  patientWallet: string;   // optional G... Stellar address
  patientName:   string;
  patientRut:    string;
  patientSex:    'MASCULINO' | 'FEMENINO' | 'NO_ESPECIFICADO';
  patientDob:    string;   // YYYY-MM-DD
  // Prescriptor
  doctorName:    string;
  doctorRut:     string;
  doctorSpecialty: string;
  clinicName:    string;
  // Clínico
  tipo:          PrescriptionTipo;
  medicamento:   string;
  concentracion: string;
  dosis:         string;
  frecuencia:    string;
  duracion:      string;
  cantidad:      string;
  diagnostico:   string;
  cie10:         string;
  indicaciones:  string;
}

const EMPTY_FORM: RecetaForm = {
  patientEmail:    '',
  patientWallet:   '',
  patientName:     '',
  patientRut:      '',
  patientSex:      'NO_ESPECIFICADO',
  patientDob:      '',
  doctorName:      '',
  doctorRut:       '',
  doctorSpecialty: '',
  clinicName:      'TrustLeaf Clínica',
  tipo:            'Simple',
  medicamento:     '',
  concentracion:   '',
  dosis:           '',
  frecuencia:      '',
  duracion:        '',
  cantidad:        '30',
  diagnostico:     '',
  cie10:           '',
  indicaciones:    '',
};

// ── Nueva Receta modal ────────────────────────────────────────────────────────
function NuevaRecetaModal({
  onClose,
  onSave,
  defaultDoctorEmail,
}: {
  onClose: () => void;
  onSave: (rx: MockPrescription, mint: MintResult | null) => void;
  defaultDoctorEmail: string;
}) {
  const [form, setForm] = useState<RecetaForm>({ ...EMPTY_FORM });
  const [signing, setSigning]         = useState(false);
  const [mintResult, setMintResult]   = useState<MintResult | null>(null);
  const [error, setError]             = useState('');
  const [step, setStep]               = useState<'form' | 'result'>('form');
  const [walletStatus, setWalletStatus] = useState<'idle' | 'looking' | 'found' | 'not_found'>('idle');
  const emailDebounce                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  function set<K extends keyof RecetaForm>(key: K, val: RecetaForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setError('');
  }

  // Auto-lookup patient wallet when email is entered
  function handlePatientEmailChange(email: string) {
    set('patientEmail', email);
    if (emailDebounce.current) clearTimeout(emailDebounce.current);
    if (!email.includes('@')) { setWalletStatus('idle'); return; }
    setWalletStatus('looking');
    emailDebounce.current = setTimeout(async () => {
      try {
        const res = await authedFetch(`/api/patient-wallet?email=${encodeURIComponent(email)}`);
        if (res.ok) {
          const data = await res.json() as { wallet: string };
          set('patientWallet', data.wallet);
          setWalletStatus('found');
        } else {
          setWalletStatus('not_found');
        }
      } catch {
        setWalletStatus('not_found');
      }
    }, 600);
  }

  const canSubmit =
    form.patientName && form.patientRut && form.medicamento &&
    form.concentracion && form.dosis && form.diagnostico && form.cantidad;

  // Save as local draft (no on-chain)
  function handleDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSave(makeMock(), null);
    onClose();
  }

  function makeMock(): MockPrescription {
    return {
      id: `rx_${Date.now()}`,
      patientName: form.patientName,
      medication: `${form.medicamento} ${form.concentracion}`.trim(),
      tipo: form.tipo,
      fecha: new Date().toISOString().slice(0, 10),
      status: 'Activa',
      concentracion: form.concentracion,
      posologia: [form.dosis, form.frecuencia, form.duracion ? `por ${form.duracion}` : '']
        .filter(Boolean).join(' '),
    };
  }

  // Sign on-chain via /api/mint
  async function handleSign() {
    if (!canSubmit) return;
    setSigning(true);
    setError('');
    try {
      const patient = form.patientWallet.startsWith('G') ? form.patientWallet : (form.patientEmail || form.patientName);
      const res = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient,
          // Patient identity (Decreto 41)
          patientName:       form.patientName,
          patientDocType:    'RUT',
          patientDocNumber:  form.patientRut,
          patientSex:        form.patientSex,
          patientBirthDate:  form.patientDob,
          patientEmail:      form.patientEmail || undefined,
          healthSystem:      'FONASA',
          // Prescriber
          doctorName:        form.doctorName || defaultDoctorEmail,
          doctorRut:         form.doctorRut || '00000000-0',
          doctorSpecialty:   form.doctorSpecialty || 'Medicina General',
          clinicName:        form.clinicName,
          clinicRut:         '76000000-0',
          // Clinical content
          medication:        form.medicamento,
          dosage:            `${form.concentracion} — ${form.dosis}`,
          quantity:          parseInt(form.cantidad) || 30,
          refills:           0,
          prescriptionType:  form.tipo === 'Simple' ? 'SIMPLE' : form.tipo === 'Retenida' ? 'RETENIDA' : 'MAGISTRAL',
          diagnosis:         form.diagnostico,
          cie10Code:         form.cie10 || undefined,
          notes:             form.indicaciones || undefined,
        }),
      });
      const data = await res.json() as MintResult & { error?: string; details?: string[] };
      if (!res.ok) {
        setError(data.error ?? 'Error al firmar');
        setSigning(false);
        return;
      }
      setMintResult(data);
      setStep('result');
      onSave(makeMock(), data);

      // Fire-and-forget email notification to patient (best-effort)
      if (form.patientEmail) {
        void fetch('/api/notify/prescription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientEmail: form.patientEmail,
            patientName:  form.patientName || form.patientEmail,
            medication:   `${form.medicamento} ${form.concentracion}`.trim(),
            dosage:       [form.dosis, form.frecuencia, form.duracion ? `por ${form.duracion}` : ''].filter(Boolean).join(' '),
            doctorName:   form.doctorName || defaultDoctorEmail,
            clinicName:   form.clinicName,
            mode:         data.mode,
            rxHash:       data.rxHash,
            rxId:         data.rxId ?? null,
            explorer:     data.explorer ?? null,
          }),
        }).catch(() => { /* non-critical */ });
      }
    } catch {
      setError('Error de conexión — revisa tu red');
    }
    setSigning(false);
  }

  // ── Result screen ────────────────────────────────────────────────────────────
  if (step === 'result' && mintResult) {
    return (
      <Modal title="Receta firmada" onClose={onClose}>
        <div className="py-4 text-center">
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${mintResult.mode === 'onchain' ? 'bg-violet-50' : 'bg-amber-50'}`}>
            {mintResult.mode === 'onchain' ? (
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-violet-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>

          <ModeBadge mode={mintResult.mode} />
          <p className="mt-3 text-base font-semibold text-slate-800">
            {mintResult.mode === 'onchain' ? '¡Receta anclada en Stellar!' : 'Receta emitida (simulada)'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {mintResult.mode === 'onchain'
              ? `Receta #${mintResult.rxId ?? '—'} registrada en Soroban`
              : mintResult.reason ?? 'Modo demo activo'}
          </p>

          {/* Hash */}
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-left">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {mintResult.mode === 'onchain' ? 'TX Hash' : 'RX Hash (SHA-256)'}
            </p>
            <p className="break-all font-mono text-[11px] text-slate-600">
              {mintResult.mode === 'onchain' ? mintResult.hash : mintResult.rxHash}
            </p>
          </div>

          {mintResult.explorer && (
            <a
              href={mintResult.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-violet-500 underline hover:text-violet-700"
            >
              Ver en Stellar Expert
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}

          <button
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <Modal title="Nueva receta" onClose={onClose} width="max-w-2xl">
      <form onSubmit={handleDraft} className="space-y-5">

        {/* ── Sección paciente ── */}
        <fieldset>
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Identificación del paciente (Decreto 41)
          </legend>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Nombre completo" required>
                <input type="text" value={form.patientName} onChange={(e) => set('patientName', e.target.value)} placeholder="Ej: María González López" className={inputCls} />
              </FormField>
              <FormField label="RUT" required>
                <input type="text" value={form.patientRut} onChange={(e) => set('patientRut', e.target.value)} placeholder="12.345.678-9" className={inputCls} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Sexo">
                <select value={form.patientSex} onChange={(e) => set('patientSex', e.target.value as RecetaForm['patientSex'])} className={selectCls}>
                  <option value="NO_ESPECIFICADO">No especificado</option>
                  <option value="FEMENINO">Femenino</option>
                  <option value="MASCULINO">Masculino</option>
                </select>
              </FormField>
              <FormField label="Fecha de nacimiento">
                <input type="date" value={form.patientDob} onChange={(e) => set('patientDob', e.target.value)} className={inputCls} />
              </FormField>
              <FormField label="Email del paciente">
                <input
                  type="email"
                  value={form.patientEmail}
                  onChange={(e) => handlePatientEmailChange(e.target.value)}
                  placeholder="paciente@mail.cl"
                  className={inputCls}
                />
              </FormField>
            </div>
            <FormField label="Wallet Stellar (G…) — se autocompleta si el paciente usa TrustLeaf">
              <div className="relative">
                <input
                  type="text"
                  value={form.patientWallet}
                  onChange={(e) => { set('patientWallet', e.target.value); setWalletStatus('idle'); }}
                  placeholder="GBQD7XK2Q9YAV4RPLM8W6H5T…"
                  className={inputCls}
                />
                {walletStatus === 'looking' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeOpacity={0.2} /><path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                    </svg>
                  </span>
                )}
                {walletStatus === 'found' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-emerald-600">✓ encontrado</span>
                )}
                {walletStatus === 'not_found' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-500">sin wallet</span>
                )}
              </div>
            </FormField>
          </div>
        </fieldset>

        {/* ── Sección prescriptor ── */}
        <fieldset>
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Prescriptor
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Nombre del médico">
              <input type="text" value={form.doctorName} onChange={(e) => set('doctorName', e.target.value)} placeholder={defaultDoctorEmail || 'Dr. Nombre Apellido'} className={inputCls} />
            </FormField>
            <FormField label="RUT médico">
              <input type="text" value={form.doctorRut} onChange={(e) => set('doctorRut', e.target.value)} placeholder="12.000.000-0" className={inputCls} />
            </FormField>
            <FormField label="Especialidad">
              <input type="text" value={form.doctorSpecialty} onChange={(e) => set('doctorSpecialty', e.target.value)} placeholder="Medicina General" className={inputCls} />
            </FormField>
            <FormField label="Nombre del centro">
              <input type="text" value={form.clinicName} onChange={(e) => set('clinicName', e.target.value)} placeholder="Clínica / Centro de salud" className={inputCls} />
            </FormField>
          </div>
        </fieldset>

        {/* ── Sección clínica ── */}
        <fieldset>
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Contenido clínico
          </legend>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Medicamento (DCI)" required>
                <input type="text" value={form.medicamento} onChange={(e) => set('medicamento', e.target.value)} placeholder="Ej: Enalapril" className={inputCls} />
              </FormField>
              <FormField label="Concentración" required>
                <input type="text" value={form.concentracion} onChange={(e) => set('concentracion', e.target.value)} placeholder="Ej: 10 mg" className={inputCls} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Tipo de receta" required>
                <select value={form.tipo} onChange={(e) => set('tipo', e.target.value as PrescriptionTipo)} className={selectCls}>
                  <option value="Simple">Simple</option>
                  <option value="Retenida">Retenida</option>
                  <option value="Magistral">Magistral</option>
                </select>
              </FormField>
              <FormField label="Dosis" required>
                <input type="text" value={form.dosis} onChange={(e) => set('dosis', e.target.value)} placeholder="Ej: 1 comp." className={inputCls} />
              </FormField>
              <FormField label="Cantidad a dispensar" required>
                <input type="number" min={1} value={form.cantidad} onChange={(e) => set('cantidad', e.target.value)} placeholder="30" className={inputCls} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Frecuencia">
                <input type="text" value={form.frecuencia} onChange={(e) => set('frecuencia', e.target.value)} placeholder="Ej: c/12h" className={inputCls} />
              </FormField>
              <FormField label="Duración">
                <input type="text" value={form.duracion} onChange={(e) => set('duracion', e.target.value)} placeholder="Ej: 30 días" className={inputCls} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Diagnóstico" required>
                <input type="text" value={form.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} placeholder="Ej: Hipertensión arterial esencial" className={inputCls} />
              </FormField>
              <FormField label="Código CIE-10">
                <input type="text" value={form.cie10} onChange={(e) => set('cie10', e.target.value)} placeholder="Ej: I10" className={inputCls} />
              </FormField>
            </div>
            <FormField label="Indicaciones al paciente">
              <textarea value={form.indicaciones} onChange={(e) => set('indicaciones', e.target.value)} placeholder="Tomar con alimentos. Evitar alcohol." rows={2} className={textareaCls} />
            </FormField>
          </div>
        </fieldset>

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Guardar borrador
          </button>
          <button
            type="button"
            disabled={!canSubmit || signing}
            onClick={() => void handleSign()}
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" strokeOpacity={0.2} />
                  <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                </svg>
                Firmando…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Firmar on-chain ✨
              </span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── RecetasTab ────────────────────────────────────────────────────────────────
export function RecetasTab() {
  const { user } = usePrivy();
  const doctorEmail = user?.email?.address ?? '';

  const [recetas, setRecetas] = useState<MockPrescription[]>(MOCK_PRESCRIPTIONS);
  const [showModal, setShowModal] = useState(false);
  const [lastMint, setLastMint] = useState<MintResult | null>(null);

  function handleSave(rx: MockPrescription, mint: MintResult | null) {
    setRecetas((prev) => [rx, ...prev]);
    if (mint) setLastMint(mint);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Recetas</h2>
          {doctorEmail && <p className="text-xs text-slate-400">{doctorEmail}</p>}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva Receta
        </button>
      </div>

      {/* Last mint banner */}
      {lastMint && (
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${
          lastMint.mode === 'onchain'
            ? 'bg-violet-50 text-violet-800 ring-violet-200'
            : 'bg-amber-50 text-amber-800 ring-amber-200'
        }`}>
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div className="min-w-0">
            <p className="font-semibold">
              {lastMint.mode === 'onchain'
                ? `Receta #${lastMint.rxId ?? '—'} anclada en Stellar Soroban`
                : 'Última receta emitida en modo simulado'}
            </p>
            <p className="mt-0.5 font-mono text-xs opacity-70 break-all">
              {lastMint.mode === 'onchain' ? lastMint.hash : lastMint.rxHash}
            </p>
            {lastMint.explorer && (
              <a href={lastMint.explorer} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-block text-xs underline hover:opacity-80">
                Ver en Stellar Expert →
              </a>
            )}
          </div>
          <button onClick={() => setLastMint(null)} className="ml-auto shrink-0 text-xs opacity-50 hover:opacity-80">✕</button>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {recetas.map((rx) => (
          <div key={rx.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
              <TipoBadge tipo={rx.tipo} />
              <RxStatusBadge status={rx.status} />
              <span className="ml-auto font-mono text-[10px] text-slate-400">{rx.id}</span>
            </div>
            <div className="p-4">
              <p className="font-semibold text-slate-800">{rx.medication}</p>
              {rx.posologia && <p className="mt-0.5 text-sm text-slate-500">{rx.posologia}</p>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>Paciente: {rx.patientName}</span>
                <span>Fecha: {rx.fecha}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <NuevaRecetaModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          defaultDoctorEmail={doctorEmail}
        />
      )}
    </div>
  );
}
