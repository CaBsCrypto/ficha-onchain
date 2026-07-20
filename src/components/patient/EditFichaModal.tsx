"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";
import type { HealthRecord } from "./types";

// ── Edit modal for ficha ──────────────────────────────────────────────────────
export function EditFichaModal({
  record,
  email,
  onClose,
  onSaved,
}: {
  record: HealthRecord | null;
  email: string;
  onClose: () => void;
  onSaved: (r: HealthRecord) => void;
}) {
  const [bloodType,   setBloodType]   = useState(record?.blood_type               ?? '');
  const [height,      setHeight]      = useState(record?.height_cm                ?? '');
  const [weight,      setWeight]      = useState(record?.weight_kg                ?? '');
  const [bmi,         setBmi]         = useState(record?.bmi                      ?? '');
  const [allergyText, setAllergyText] = useState((record?.allergies ?? []).join(', '));
  const [docName,     setDocName]     = useState(record?.primary_doctor           ?? '');
  const [docSpec,     setDocSpec]     = useState(record?.primary_doctor_specialty ?? '');
  const [notes,       setNotes]       = useState(record?.notes                    ?? '');
  // Identidad legal (Decreto 41)
  const [fullName,    setFullName]    = useState(record?.full_name                ?? '');
  const [rut,         setRut]         = useState(record?.rut                      ?? '');
  const [birthdate,   setBirthdate]   = useState(record?.birthdate?.slice(0, 10)  ?? '');
  const [phone,       setPhone]       = useState(record?.phone                    ?? '');
  const [address,     setAddress]     = useState(record?.address                  ?? '');
  const [prevision,   setPrevision]   = useState(record?.prevision                ?? '');
  const [emergency,   setEmergency]   = useState(record?.emergency_contact        ?? '');
  const [saving,      setSaving]      = useState(false);

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-100';
  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const allergies = allergyText.split(',').map(s => s.trim()).filter(Boolean);
      const bmiCalc   = height && weight
        ? (parseFloat(weight) / ((parseFloat(height) / 100) ** 2)).toFixed(1)
        : bmi || null;
      // patient_email is no longer sent — the server writes the token's own row.
      const res  = await authedFetch('/api/patient/ficha', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blood_type:                bloodType || null,
          height_cm:                 height ? `${height} cm` : null,
          weight_kg:                 weight ? `${weight} kg` : null,
          bmi:                       bmiCalc,
          allergies,
          conditions:                record?.conditions   ?? [],
          vaccinations:              record?.vaccinations ?? [],
          primary_doctor:            docName  || null,
          primary_doctor_specialty:  docSpec  || null,
          notes:                     notes    || null,
          full_name:                 fullName  || null,
          rut:                       rut       || null,
          birthdate:                 birthdate || null,
          phone:                     phone     || null,
          address:                   address   || null,
          prevision:                 prevision || null,
          emergency_contact:         emergency || null,
        }),
      });
      const json = await res.json() as { data?: HealthRecord };
      if (json.data) { onSaved(json.data); onClose(); }
    } catch (err) {
      console.error('[EditFicha]', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold text-slate-800">Editar ficha médica</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="max-h-[75vh] overflow-y-auto p-6 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Datos personales</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Nombre completo</label>
              <input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="María Paz Torres Fuentes" />
            </div>
            <div>
              <label className={labelCls}>RUT</label>
              <input className={inputCls} value={rut} onChange={e => setRut(e.target.value)} placeholder="12.345.678-9" />
            </div>
            <div>
              <label className={labelCls}>Fecha de nacimiento</label>
              <input type="date" className={inputCls} value={birthdate} onChange={e => setBirthdate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+56 9 1234 5678" />
            </div>
            <div>
              <label className={labelCls}>Previsión</label>
              <select className={inputCls} value={prevision} onChange={e => setPrevision(e.target.value)}>
                <option value="">—</option>
                {['Fonasa A','Fonasa B','Fonasa C','Fonasa D','Isapre','Particular','Otra'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Dirección</label>
              <input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="Av. Siempre Viva 742, Santiago" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Contacto de emergencia</label>
              <input className={inputCls} value={emergency} onChange={e => setEmergency(e.target.value)} placeholder="Roberto Torres · +56 9 8765 4321" />
            </div>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 pt-2">Datos básicos</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Grupo sanguíneo</label>
              <select className={inputCls} value={bloodType} onChange={e => setBloodType(e.target.value)}>
                <option value="">—</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Talla (cm)</label>
              <input type="number" className={inputCls} value={height} onChange={e => setHeight(e.target.value)} placeholder="165" />
            </div>
            <div>
              <label className={labelCls}>Peso (kg)</label>
              <input type="number" className={inputCls} value={weight} onChange={e => setWeight(e.target.value)} placeholder="68" />
            </div>
            <div>
              <label className={labelCls}>IMC (auto)</label>
              <input readOnly className={`${inputCls} cursor-not-allowed opacity-60`}
                value={height && weight ? (parseFloat(weight) / ((parseFloat(height) / 100) ** 2)).toFixed(1) : bmi ?? ''} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Alergias (separadas por coma)</label>
            <input className={inputCls} value={allergyText} onChange={e => setAllergyText(e.target.value)} placeholder="Penicilina, Ibuprofeno…" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 pt-2">Médico de cabecera</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nombre</label>
              <input className={inputCls} value={docName} onChange={e => setDocName(e.target.value)} placeholder="Dr. Valentina Reyes" />
            </div>
            <div>
              <label className={labelCls}>Especialidad</label>
              <input className={inputCls} value={docSpec} onChange={e => setDocSpec(e.target.value)} placeholder="Medicina Interna" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notas personales</label>
            <textarea rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-100"
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="Alergias específicas, observaciones…" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
