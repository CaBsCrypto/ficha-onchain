'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivyEmail } from '@/hooks/usePrivyEmail';
import { FormField, inputCls, selectCls, textareaCls } from './Modal';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DoctorProfile {
  id: string;
  name: string;
  email: string;
  specialty: string | null;
  bio: string | null;
  telemedicine: boolean;
  license_num: string | null;
  status: string;
  created_at: string;
}

interface AvailabilityBlock {
  weekday: number;      // 0=Sunday .. 6=Saturday
  start_time: string;   // "HH:MM"
  end_time: string;     // "HH:MM"
  slot_minutes: number;
}

const WEEKDAYS = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
] as const;

// Monday-first display order (weekdays 1..6, then 0)
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" strokeOpacity={0.2} />
      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
    </svg>
  );
}

// ── DisponibilidadTab ─────────────────────────────────────────────────────────
export function DisponibilidadTab() {
  const doctorEmail = usePrivyEmail() ?? '';

  // Profile state
  const [specialty, setSpecialty] = useState('');
  const [bio, setBio] = useState('');
  const [telemedicine, setTelemedicine] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  // Availability state
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [savingGrid, setSavingGrid] = useState(false);
  const [gridError, setGridError] = useState('');
  const [gridSaved, setGridSaved] = useState(false);

  // New-block draft
  const [draftWeekday, setDraftWeekday] = useState(1);
  const [draftStart, setDraftStart] = useState('09:00');
  const [draftEnd, setDraftEnd] = useState('13:00');
  const [draftSlot, setDraftSlot] = useState(30);

  const [loading, setLoading] = useState(true);

  // ── Load profile + availability ──────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!doctorEmail) return;
    setLoading(true);
    setProfileError('');
    setGridError('');
    try {
      const [pRes, aRes] = await Promise.all([
        fetch(`/api/doctor/profile?doctorEmail=${encodeURIComponent(doctorEmail)}`),
        fetch(`/api/doctor/availability?doctorEmail=${encodeURIComponent(doctorEmail)}`),
      ]);

      const pData = await pRes.json() as { data?: DoctorProfile | null; error?: string };
      if (pRes.ok) {
        const p = pData.data;
        if (p) {
          setSpecialty(p.specialty ?? '');
          setBio(p.bio ?? '');
          setTelemedicine(Boolean(p.telemedicine));
          setProfileMissing(false);
        } else {
          setProfileMissing(true);
        }
      } else {
        setProfileError(pData.error ?? 'No se pudo cargar el perfil');
      }

      const aData = await aRes.json() as { data?: AvailabilityBlock[]; error?: string };
      if (aRes.ok) {
        setBlocks((aData.data ?? []).map((b) => ({
          weekday: b.weekday,
          start_time: b.start_time,
          end_time: b.end_time,
          slot_minutes: b.slot_minutes,
        })));
      } else {
        setGridError(aData.error ?? 'No se pudo cargar la disponibilidad');
      }
    } catch {
      setProfileError('Error de conexión — revisa tu red');
    }
    setLoading(false);
  }, [doctorEmail]);

  useEffect(() => { void load(); }, [load]);

  // ── Save profile ─────────────────────────────────────────────────────────────
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setProfileSaved(false);
    try {
      const res = await fetch('/api/doctor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorEmail,
          specialty,
          bio,
          telemedicine,
        }),
      });
      const data = await res.json() as { data?: DoctorProfile; error?: string };
      if (!res.ok) {
        setProfileError(data.error ?? 'No se pudo guardar el perfil');
        setSavingProfile(false);
        return;
      }
      setProfileSaved(true);
      setProfileMissing(false);
    } catch {
      setProfileError('Error de conexión — revisa tu red');
    }
    setSavingProfile(false);
  }

  // ── Availability grid helpers ────────────────────────────────────────────────
  function addBlock() {
    setGridSaved(false);
    setGridError('');
    if (draftEnd <= draftStart) {
      setGridError('La hora de término debe ser posterior a la de inicio');
      return;
    }
    setBlocks((prev) => [
      ...prev,
      { weekday: draftWeekday, start_time: draftStart, end_time: draftEnd, slot_minutes: draftSlot },
    ]);
  }

  function removeBlock(target: AvailabilityBlock) {
    setGridSaved(false);
    setBlocks((prev) => prev.filter((b) => b !== target));
  }

  async function handleSaveGrid() {
    setSavingGrid(true);
    setGridError('');
    setGridSaved(false);
    try {
      const res = await fetch('/api/doctor/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorEmail, blocks }),
      });
      const data = await res.json() as { data?: AvailabilityBlock[]; error?: string };
      if (!res.ok) {
        setGridError(data.error ?? 'No se pudo guardar la disponibilidad');
        setSavingGrid(false);
        return;
      }
      setBlocks((data.data ?? []).map((b) => ({
        weekday: b.weekday,
        start_time: b.start_time,
        end_time: b.end_time,
        slot_minutes: b.slot_minutes,
      })));
      setGridSaved(true);
    } catch {
      setGridError('Error de conexión — revisa tu red');
    }
    setSavingGrid(false);
  }

  // Blocks grouped by weekday, in display order, sorted by start time
  const grouped = DISPLAY_ORDER
    .map((wd) => ({
      weekday: wd,
      items: blocks
        .filter((b) => b.weekday === wd)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    }))
    .filter((g) => g.items.length > 0);

  if (!doctorEmail) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Disponibilidad</h2>
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-200">
          Inicia sesión para configurar tu perfil y horarios.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Disponibilidad</h2>
        <p className="text-xs text-slate-400">{doctorEmail}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          {profileMissing && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-200">
              Tu cuenta médica aún no está registrada por el administrador. Podrás guardar tu
              perfil una vez que sea habilitada.
            </div>
          )}

          {/* ── Profile card ── */}
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Perfil profesional
            </p>
            <div className="space-y-4">
              <FormField label="Especialidad">
                <input
                  type="text"
                  value={specialty}
                  onChange={(e) => { setSpecialty(e.target.value); setProfileSaved(false); }}
                  placeholder="Ej: Medicina General"
                  className={inputCls}
                />
              </FormField>

              <FormField label="Biografía / presentación">
                <textarea
                  value={bio}
                  onChange={(e) => { setBio(e.target.value); setProfileSaved(false); }}
                  placeholder="Breve descripción para tus pacientes."
                  rows={4}
                  maxLength={2000}
                  className={textareaCls}
                />
                <span className="mt-1 block text-right text-[10px] text-slate-400">
                  {bio.length}/2000
                </span>
              </FormField>

              <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-slate-700">Telemedicina</span>
                  <span className="block text-xs text-slate-400">
                    Habilita consultas por videollamada
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={telemedicine}
                  onClick={() => { setTelemedicine((v) => !v); setProfileSaved(false); }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    telemedicine ? 'bg-sky-500' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      telemedicine ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>

            {profileError && (
              <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{profileError}</div>
            )}
            {profileSaved && (
              <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Perfil guardado.
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingProfile ? (
                  <span className="flex items-center justify-center gap-2"><Spinner /> Guardando…</span>
                ) : 'Guardar perfil'}
              </button>
            </div>
          </form>

          {/* ── Availability card ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Disponibilidad semanal
            </p>
            <p className="mb-4 text-xs text-slate-400">
              Define bloques recurrentes por día. Los pacientes reservarán dentro de estos horarios.
            </p>

            {/* Add block row */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Día">
                  <select
                    value={draftWeekday}
                    onChange={(e) => setDraftWeekday(Number(e.target.value))}
                    className={selectCls}
                  >
                    {DISPLAY_ORDER.map((wd) => (
                      <option key={wd} value={wd}>{WEEKDAYS[wd]}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Inicio">
                  <input
                    type="time"
                    value={draftStart}
                    onChange={(e) => setDraftStart(e.target.value)}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Término">
                  <input
                    type="time"
                    value={draftEnd}
                    onChange={(e) => setDraftEnd(e.target.value)}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Duración por cita (min)">
                  <select
                    value={draftSlot}
                    onChange={(e) => setDraftSlot(Number(e.target.value))}
                    className={selectCls}
                  >
                    {[15, 20, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={addBlock}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Agregar bloque
                </button>
              </div>
            </div>

            {/* Grouped grid */}
            <div className="mt-4 space-y-3">
              {grouped.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  Aún no has agregado bloques de disponibilidad.
                </p>
              ) : (
                grouped.map((g) => (
                  <div key={g.weekday}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {WEEKDAYS[g.weekday]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {g.items.map((b, i) => (
                        <span
                          key={`${b.start_time}-${b.end_time}-${i}`}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                        >
                          <span className="font-medium">{b.start_time}–{b.end_time}</span>
                          <span className="text-xs text-slate-400">{b.slot_minutes} min</span>
                          <button
                            type="button"
                            onClick={() => removeBlock(b)}
                            aria-label="Eliminar bloque"
                            className="text-slate-400 transition-colors hover:text-rose-500"
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {gridError && (
              <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{gridError}</div>
            )}
            {gridSaved && (
              <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Disponibilidad guardada.
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveGrid()}
                disabled={savingGrid}
                className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingGrid ? (
                  <span className="flex items-center justify-center gap-2"><Spinner /> Guardando…</span>
                ) : 'Guardar disponibilidad'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
