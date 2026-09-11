'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivyEmail } from '@/hooks/usePrivyEmail';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { FormField, inputCls, selectCls } from './Modal';

// ── Types ─────────────────────────────────────────────────────────────────────
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
  const [dateGuide, setDateGuide] = useState<Record<number, string>>({});

  useEffect(() => {
    function refreshDates() {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
      const today = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
      const format = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
      });
      setDateGuide(Object.fromEntries(DISPLAY_ORDER.map(weekday => {
        const offset = (weekday - today.getUTCDay() + 7) % 7;
        const date = new Date(today);
        date.setUTCDate(date.getUTCDate() + offset);
        return [weekday, `${format.format(date)}${offset === 0 ? ' · hoy' : ''}`];
      })));
    }
    refreshDates();
    const timer = window.setInterval(refreshDates, 60_000);
    window.addEventListener('focus', refreshDates);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshDates); };
  }, []);

  // Availability state
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [savedBlocks, setSavedBlocks] = useState<AvailabilityBlock[] | null>(null);
  const fingerprint = (items: AvailabilityBlock[]) => JSON.stringify(items.map(b => `${b.weekday}:${b.start_time}:${b.end_time}:${b.slot_minutes}`).sort());
  const dirty = savedBlocks !== null && fingerprint(blocks) !== fingerprint(savedBlocks);
  const [savingGrid, setSavingGrid] = useState(false);
  const [gridError, setGridError] = useState('');
  const [gridSaved, setGridSaved] = useState(false);

  // New-block draft
  const [draftWeekday, setDraftWeekday] = useState(1);
  const [draftStart, setDraftStart] = useState('09:00');
  const [draftEnd, setDraftEnd] = useState('13:00');
  const [draftSlot, setDraftSlot] = useState(30);

  const [loading, setLoading] = useState(true);

  // ── Load availability ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!doctorEmail) return;
    setLoading(true);
    setGridError('');
    try {
      const aRes = await authedFetch(`/api/doctor/availability?doctorEmail=${encodeURIComponent(doctorEmail)}`);
      const aData = await aRes.json() as { data?: AvailabilityBlock[]; error?: string };
      if (aRes.ok) {
        setSavedBlocks(aData.data ?? []);
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
      setGridError('Error de conexión — revisa tu red');
    }
    setLoading(false);
  }, [doctorEmail]);

  useEffect(() => { void load(); }, [load]);

  // ── Availability grid helpers ────────────────────────────────────────────────
  function addBlock() {
    if (savingGrid) return;
    setGridSaved(false);
    setGridError('');
    if (draftEnd <= draftStart) {
      setGridError('La hora de término debe ser posterior a la de inicio');
      return;
    }
    // Reject a block that overlaps an existing one on the same day, so the
    // doctor gets the feedback here instead of on save. "HH:MM" strings compare
    // correctly, so start < otherEnd && otherStart < end means they collide.
    // The API enforces the same rule server-side — this just surfaces it early.
    const clash = blocks.some(
      (b) =>
        b.weekday === draftWeekday &&
        draftStart < b.end_time &&
        b.start_time < draftEnd,
    );
    if (clash) {
      setGridError(`Ese horario se cruza con un bloque que ya tienes el ${WEEKDAYS[draftWeekday]}`);
      return;
    }
    setBlocks((prev) => [
      ...prev,
      { weekday: draftWeekday, start_time: draftStart, end_time: draftEnd, slot_minutes: draftSlot },
    ]);
  }

  function removeBlock(target: AvailabilityBlock) {
    if (savingGrid) return;
    setGridSaved(false);
    setBlocks((prev) => prev.filter((b) => b !== target));
  }

  async function handleSaveGrid() {
    if (!dirty || savingGrid || loading) return;
    if (!blocks.length && !window.confirm("Quitar toda la disponibilidad. Las citas existentes se conservarán. ¿Continuar?")) return;
    setSavingGrid(true);
    setGridError('');
    setGridSaved(false);
    try {
      const res = await authedFetch('/api/doctor/availability', {
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
      setSavedBlocks(data.data ?? []);
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
        <p className="break-all text-xs text-slate-500">{doctorEmail}</p>
        <p className="mt-2 text-sm text-slate-600">Todas las horas corresponden a Chile continental (America/Santiago), incluidos sus cambios de horario.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          {/* ── Availability card ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Disponibilidad semanal
            </p>
            <p className="mb-4 text-xs text-slate-400">
              Los horarios se repiten cada semana. La fecha junto a cada día indica su próxima ocurrencia, incluido hoy, como guía; no limita el bloque a esa fecha.
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
                      <option key={wd} value={wd}>{WEEKDAYS[wd]}{dateGuide[wd] ? ` · ${dateGuide[wd]}` : ''}</option>
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
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
                  Completa el horario y pulsa Agregar bloque.
                </p>
              ) : (
                grouped.map((g) => (
                  <div key={g.weekday} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {WEEKDAYS[g.weekday]}
                      {dateGuide[g.weekday] && <span className="mt-1 block font-normal normal-case tracking-normal">{dateGuide[g.weekday]}</span>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {g.items.map((b, i) => (
                        <span
                          key={`${b.start_time}-${b.end_time}-${i}`}
                          className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
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
              <div role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{gridError}</div>
            )}
            {gridSaved && (
              <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Disponibilidad guardada · {savedBlocks?.length ?? 0} bloques semanales.
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveGrid()}
                disabled={savingGrid || loading || !dirty}
                className="w-full rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
