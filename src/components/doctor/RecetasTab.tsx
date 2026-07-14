'use client';

import { useState } from 'react';
import { Modal, FormField, inputCls, selectCls, textareaCls } from './Modal';
import { MOCK_PRESCRIPTIONS, MOCK_PATIENTS } from './types';
import type { MockPrescription, PrescriptionTipo, PrescriptionStatus } from './types';

// ── Status badge ──────────────────────────────────────────────────────────────
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

// ── New prescription form ─────────────────────────────────────────────────────
interface NewRecetaForm {
  patientId: string;
  tipo: PrescriptionTipo;
  medicamento: string;
  concentracion: string;
  formaFarmaceutica: string;
  dosis: string;
  frecuencia: string;
  duracion: string;
  cantidad: string;
  indicaciones: string;
}

const EMPTY_FORM: NewRecetaForm = {
  patientId: '',
  tipo: 'Simple',
  medicamento: '',
  concentracion: '',
  formaFarmaceutica: '',
  dosis: '',
  frecuencia: '',
  duracion: '',
  cantidad: '',
  indicaciones: '',
};

function NuevaRecetaModal({ onClose, onSave }: { onClose: () => void; onSave: (rx: MockPrescription) => void }) {
  const [form, setForm] = useState<NewRecetaForm>(EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof NewRecetaForm>(key: K, val: NewRecetaForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  const canSubmit = form.patientId && form.medicamento && form.concentracion && form.dosis;

  function handleDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const patient = MOCK_PATIENTS.find((p) => p.id === form.patientId);
    onSave({
      id: `rx_${Date.now()}`,
      patientName: patient?.name ?? '',
      medication: `${form.medicamento} ${form.concentracion}`.trim(),
      tipo: form.tipo,
      fecha: new Date().toISOString().slice(0, 10),
      status: 'Activa',
      concentracion: form.concentracion,
      posologia: `${form.dosis} ${form.frecuencia} por ${form.duracion}`.trim(),
    });
    setSaved(true);
  }

  if (saved) {
    return (
      <Modal title="Receta guardada" onClose={onClose}>
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-base font-semibold text-slate-800">Borrador guardado</p>
          <p className="mt-1 text-sm text-slate-500">La receta fue añadida a tu lista.</p>
          <button
            onClick={onClose}
            className="mt-5 rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Nueva receta" onClose={onClose} width="max-w-2xl">
      <form onSubmit={handleDraft} className="space-y-4">
        {/* Patient + tipo */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Paciente" required>
            <select value={form.patientId} onChange={(e) => set('patientId', e.target.value)} className={selectCls}>
              <option value="">Seleccionar…</option>
              {MOCK_PATIENTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Tipo de receta" required>
            <select value={form.tipo} onChange={(e) => set('tipo', e.target.value as PrescriptionTipo)} className={selectCls}>
              <option value="Simple">Simple</option>
              <option value="Retenida">Retenida</option>
              <option value="Magistral">Magistral</option>
            </select>
          </FormField>
        </div>

        {/* Medicamento + concentración */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Medicamento (DCI)" required>
            <input type="text" value={form.medicamento} onChange={(e) => set('medicamento', e.target.value)} placeholder="Ej: Enalapril" className={inputCls} />
          </FormField>
          <FormField label="Concentración" required>
            <input type="text" value={form.concentracion} onChange={(e) => set('concentracion', e.target.value)} placeholder="Ej: 10 mg" className={inputCls} />
          </FormField>
        </div>

        {/* Forma farmacéutica */}
        <FormField label="Forma farmacéutica">
          <input type="text" value={form.formaFarmaceutica} onChange={(e) => set('formaFarmaceutica', e.target.value)} placeholder="Ej: Comprimido, Cápsula, Jarabe…" className={inputCls} />
        </FormField>

        {/* Posología */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Dosis" required>
            <input type="text" value={form.dosis} onChange={(e) => set('dosis', e.target.value)} placeholder="Ej: 1 comp." className={inputCls} />
          </FormField>
          <FormField label="Frecuencia">
            <input type="text" value={form.frecuencia} onChange={(e) => set('frecuencia', e.target.value)} placeholder="Ej: c/12h" className={inputCls} />
          </FormField>
          <FormField label="Duración">
            <input type="text" value={form.duracion} onChange={(e) => set('duracion', e.target.value)} placeholder="Ej: 30 días" className={inputCls} />
          </FormField>
        </div>

        {/* Cantidad */}
        <FormField label="Cantidad a dispensar">
          <input type="number" min={1} value={form.cantidad} onChange={(e) => set('cantidad', e.target.value)} placeholder="Ej: 30" className={inputCls} />
        </FormField>

        {/* Indicaciones */}
        <FormField label="Indicaciones al paciente">
          <textarea value={form.indicaciones} onChange={(e) => set('indicaciones', e.target.value)} placeholder="Tomar con alimentos. Evitar alcohol." rows={3} className={textareaCls} />
        </FormField>

        {/* Actions */}
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
            className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Guardar borrador
          </button>
          <button
            type="button"
            disabled
            title="Próximamente — conexión Stellar"
            className="flex-1 cursor-not-allowed rounded-xl bg-violet-100 py-2.5 text-sm font-medium text-violet-400 opacity-60"
          >
            Firmar on-chain ✨
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── RecetasTab ────────────────────────────────────────────────────────────────
export function RecetasTab() {
  const [recetas, setRecetas] = useState<MockPrescription[]>(MOCK_PRESCRIPTIONS);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Recetas</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva Receta
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {recetas.map((rx) => (
          <div key={rx.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-800">{rx.medication}</p>
                  <TipoBadge tipo={rx.tipo} />
                  <RxStatusBadge status={rx.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{rx.posologia}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>Paciente: {rx.patientName}</span>
              <span>Fecha: {rx.fecha}</span>
              <span>Receta #{rx.id}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <NuevaRecetaModal
          onClose={() => setShowModal(false)}
          onSave={(rx) => setRecetas((prev) => [rx, ...prev])}
        />
      )}
    </div>
  );
}
