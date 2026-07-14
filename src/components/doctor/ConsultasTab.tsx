'use client';

import { useState } from 'react';
import { Modal, FormField, inputCls, selectCls, textareaCls } from './Modal';
import { MOCK_CONSULTATIONS, MOCK_PATIENTS } from './types';
import type { MockConsultation, ConsultationType } from './types';

// ── Mock consultations state ──────────────────────────────────────────────────

interface NewConsultaForm {
  patientId: string;
  date: string;
  time: string;
  type: ConsultationType;
  motivo: string;
  notasClinicas: string;
  cie10: string;
}

const EMPTY_FORM: NewConsultaForm = {
  patientId: '',
  date: '',
  time: '',
  type: 'Presencial',
  motivo: '',
  notasClinicas: '',
  cie10: '',
};

// ── Nueva consulta modal ──────────────────────────────────────────────────────
function NuevaConsultaModal({ onClose, onSave }: { onClose: () => void; onSave: (c: MockConsultation) => void }) {
  const [form, setForm] = useState<NewConsultaForm>(EMPTY_FORM);

  function set<K extends keyof NewConsultaForm>(key: K, val: NewConsultaForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  const canSubmit = form.patientId && form.date && form.time && form.motivo;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const patient = MOCK_PATIENTS.find((p) => p.id === form.patientId);
    onSave({
      id: `c_${Date.now()}`,
      patientId: form.patientId,
      patientName: patient?.name ?? '',
      date: form.date,
      time: form.time,
      type: form.type,
      motivo: form.motivo,
    });
    onClose();
  }

  return (
    <Modal title="Nueva consulta" onClose={onClose} width="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient selector */}
        <FormField label="Paciente" required>
          <select
            value={form.patientId}
            onChange={(e) => set('patientId', e.target.value)}
            className={selectCls}
          >
            <option value="">Seleccionar paciente…</option>
            {MOCK_PATIENTS.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.rut}</option>
            ))}
          </select>
        </FormField>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Fecha" required>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="Hora" required>
            <input
              type="time"
              value={form.time}
              onChange={(e) => set('time', e.target.value)}
              className={inputCls}
            />
          </FormField>
        </div>

        {/* Type */}
        <FormField label="Tipo" required>
          <select
            value={form.type}
            onChange={(e) => set('type', e.target.value as ConsultationType)}
            className={selectCls}
          >
            <option value="Presencial">Presencial</option>
            <option value="Telemedicina">Telemedicina</option>
          </select>
        </FormField>

        {/* Motivo */}
        <FormField label="Motivo de consulta" required>
          <input
            type="text"
            value={form.motivo}
            onChange={(e) => set('motivo', e.target.value)}
            placeholder="Ej: Control hipertensión"
            className={inputCls}
          />
        </FormField>

        {/* Notas clínicas */}
        <FormField label="Notas clínicas">
          <textarea
            value={form.notasClinicas}
            onChange={(e) => set('notasClinicas', e.target.value)}
            placeholder="Observaciones, anamnesis, examen físico…"
            rows={3}
            className={textareaCls}
          />
        </FormField>

        {/* CIE-10 */}
        <FormField label="Diagnóstico CIE-10">
          <input
            type="text"
            value={form.cie10}
            onChange={(e) => set('cie10', e.target.value)}
            placeholder="Ej: I10 — Hipertensión esencial"
            className={inputCls}
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
            className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Guardar consulta
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── ConsultasTab ──────────────────────────────────────────────────────────────
export function ConsultasTab() {
  const [consultas, setConsultas] = useState<MockConsultation[]>(MOCK_CONSULTATIONS);
  const [showModal, setShowModal] = useState(false);

  function addConsulta(c: MockConsultation) {
    setConsultas((prev) => [...prev, c]);
  }

  const byDate = consultas.reduce<Record<string, MockConsultation[]>>((acc, c) => {
    (acc[c.date] ??= []).push(c);
    return acc;
  }, {});

  const sortedDates = Object.keys(byDate).sort();

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Consultas</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva Consulta
        </button>
      </div>

      {/* Day view */}
      <div className="space-y-6">
        {sortedDates.map((date) => {
          const day = new Date(date + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          return (
            <div key={date}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 capitalize">{day}</h3>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
                {byDate[date]
                  ?.slice()
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((c) => (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                        <span className="text-xs font-bold">{c.time}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{c.patientName}</p>
                        <p className="text-xs text-slate-500">{c.motivo}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.type === 'Presencial'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-violet-50 text-violet-700'
                      }`}>
                        {c.type}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
        {sortedDates.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            No hay consultas agendadas. ¡Crea la primera!
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <NuevaConsultaModal onClose={() => setShowModal(false)} onSave={addConsulta} />
      )}
    </div>
  );
}
