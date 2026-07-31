"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivyEmail } from "@/hooks/usePrivyEmail";
import { authedFetch } from "@/lib/auth/authed-fetch";
import { CalendarIcon } from "@/components/icons/PatientIcons";
import { type DBAppointment } from "@/components/patient/types";
import { AppointmentCard } from "@/components/patient/AppointmentCard";
import { RequestAppointmentForm } from "@/components/patient/RequestAppointmentForm";

// ---------------------------------------------------------------------------
// Tab: Mis Consultas — citas reales desde la BD
// ---------------------------------------------------------------------------

export function ConsultasTab({ wallet: _wallet, mock }: { wallet: string; mock: boolean }) {
  const privyEmail = usePrivyEmail();
  const [appointments, setAppointments] = useState<DBAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Fetch real appointments by patient email
  const loadAppts = useCallback(() => {
    if (!privyEmail) { setLoading(false); return; }
    authedFetch(`/api/appointments?patientEmail=${encodeURIComponent(privyEmail)}`)
      .then((r) => r.json())
      .then((data: { appointments?: DBAppointment[] }) => {
        setAppointments(data.appointments ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [privyEmail]);

  useEffect(() => { loadAppts(); }, [loadAppts]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const isUpcoming = (s: DBAppointment['status']) => s === 'scheduled' || s === 'in_progress';

  const upcoming = appointments.filter(
    (a) => a.date.slice(0, 10) >= todayISO && isUpcoming(a.status)
  ).sort((a, b) => a.date.localeCompare(b.date) || a.time_slot.localeCompare(b.time_slot));

  const past = appointments.filter(
    (a) => a.date.slice(0, 10) < todayISO || !isUpcoming(a.status)
  ).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CalendarIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">Mis consultas</h1>
            <p className="text-sm text-muted">
              {privyEmail ?? 'Cargando…'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Solicitar
        </button>
      </div>

      {mock && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Modo demo — las citas de tu médico asignado aparecerán aquí cuando se conecte una cuenta real.
        </div>
      )}

      {/* Request form (inline) */}
      {showForm && privyEmail && (
        <RequestAppointmentForm
          patientEmail={privyEmail}
          onSaved={(a) => {
            setAppointments((prev) => [...prev, a]);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Próximas citas ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-muted">
                  <CalendarIcon className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-ink">Sin citas próximas</p>
                <p className="mt-1 text-xs text-muted">
                  Cuando un médico te agende una consulta, aparecerá aquí.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((a) => (
                  <AppointmentCard key={a.id} appt={a} patientEmail={privyEmail ?? ''} onReload={loadAppts} />
                ))}
              </div>
            )}
          </section>

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Historial ({past.length})
              </h2>
              <div className="space-y-3">
                {past.map((a) => (
                  <AppointmentCard key={a.id} appt={a} patientEmail={privyEmail ?? ''} onReload={loadAppts} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
