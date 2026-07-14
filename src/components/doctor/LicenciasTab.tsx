'use client';

import { useState } from 'react';
import { Modal, FormField, inputCls, selectCls, textareaCls } from './Modal';
import { MOCK_LICENSES, MOCK_PATIENTS } from './types';
import type { MockLicense, LicenseTipo, LicenseStatus } from './types';

// ── Status badge ──────────────────────────────────────────────────────────────
function LicStatusBadge({ status }: { status: LicenseStatus }) {
  const cls: Record<LicenseStatus, string> = {
    Emitida:  'bg-sky-50 text-sky-700',
    Validada: 'bg-emerald-50 text-emerald-700',
    Vencida:  'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[status]}`}>
      {status}
    </span>
  );
}

// ── Nueva licencia form ───────────────────────────────────────────────────────
interface NewLicenciaForm {
  patientId: string;
  fechaInicio: string;
  dias: string;
  cie10: string;
  tipo: LicenseTipo;
  observaciones: string;
}

const EMPTY_FORM: NewLicenciaForm = {
  patientId: '',
  fechaInicio: '',
  dias: '',
  cie10: '',
  tipo: 'Enfermedad',
  observaciones: '',
};

function NuevaLicenciaModal({ onClose, onSave }: { onClose: () => void; onSave: (lic: MockLicense) => void }) {
  const [form, setForm] = useState<NewLicenciaForm>(EMPTY_FORM);

  function set<K extends keyof NewLicenciaForm>(key: K, val: NewLicenciaForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  const canSubmit = form.patientId && form.fechaInicio && form.dias && form.cie10;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const patient = MOCK_PATIENTS.find((p) => p.id === form.patientId);
    onSave({
      id: `lic_${Date.now()}`,
      patientName: patient?.name ?? '',
      fechaInicio: form.fechaInicio,
      dias: parseInt(form.dias, 10),
      cie10: form.cie10,
      tipo: form.tipo,
      status: 'Emitida',
    });
    onClose();
  }

  return (
    <Modal title="Nueva licencia médica" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient */}
        <FormField label="Paciente" required>
          <select value={form.patientId} onChange={(e) => set('patientId', e.target.value)} className={selectCls}>
            <option value="">Seleccionar paciente…</option>
            {MOCK_PATIENTS.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.rut}</option>
            ))}
          </select>
        </FormField>

        {/* Fecha inicio + días */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Fecha de inicio" required>
            <input
              type="date"
              value={form.fechaInicio}
              onChange={(e) => set('fechaInicio', e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="Días de reposo" required>
            <input
              type="number"
              min={1}
              value={form.dias}
              onChange={(e) => set('dias', e.target.value)}
              placeholder="Ej: 7"
              className={inputCls}
            />
          </FormField>
        </div>

        {/* CIE-10 */}
        <FormField label="Código CIE-10" required>
          <input
            type="text"
            value={form.cie10}
            onChange={(e) => set('cie10', e.target.value)}
            placeholder="Ej: J06.9"
            className={inputCls}
          />
        </FormField>

        {/* Tipo */}
        <FormField label="Tipo de licencia" required>
          <select value={form.tipo} onChange={(e) => set('tipo', e.target.value as LicenseTipo)} className={selectCls}>
            <option value="Enfermedad">Enfermedad</option>
            <option value="Accidente">Accidente</option>
            <option value="Maternidad">Maternidad</option>
          </select>
        </FormField>

        {/* Observaciones */}
        <FormField label="Observaciones">
          <textarea
            value={form.observaciones}
            onChange={(e) => set('observaciones', e.target.value)}
            placeholder="Indicaciones adicionales, restricciones, seguimiento…"
            rows={3}
            className={textareaCls}
          />
        </FormField>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Emitir licencia
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── LicenciasTab ──────────────────────────────────────────────────────────────
export function LicenciasTab() {
  const [licencias, setLicencias] = useState<MockLicense[]>(MOCK_LICENSES);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Licencias médicas</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva Licencia
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {licencias.map((lic) => {
          const fechaFin = new Date(lic.fechaInicio + 'T00:00:00');
          fechaFin.setDate(fechaFin.getDate() + lic.dias);
          const finStr = fechaFin.toISOString().slice(0, 10);

          return (
            <div key={lic.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-800">{lic.patientName}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {lic.tipo}
                    </span>
                    <LicStatusBadge status={lic.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {lic.fechaInicio} → {finStr} · {lic.dias} días de reposo
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>CIE-10: {lic.cie10}</span>
                <span>Licencia #{lic.id}</span>
              </div>
            </div>
          );
        })}
        {licencias.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            No hay licencias emitidas.
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <NuevaLicenciaModal
          onClose={() => setShowModal(false)}
          onSave={(lic) => setLicencias((prev) => [lic, ...prev])}
        />
      )}
    </div>
  );
}
