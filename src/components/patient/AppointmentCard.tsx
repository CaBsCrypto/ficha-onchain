"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";
import { ShieldCheckIcon } from "@/components/icons/PatientIcons";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import type { DBAppointment } from "./types";

export function AppointmentCard({
  appt,
  patientEmail,
  onReload,
}: {
  appt: DBAppointment;
  patientEmail: string;
  onReload: () => void;
}) {
  // appt.date may arrive as a plain "YYYY-MM-DD" or a full ISO timestamp
  // (Neon serialises DATE columns with a time part); take the date portion so
  // appending 'T00:00:00' never yields "Invalid Date".
  const dateLabel = new Date((appt.date ?? '').slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const consented = Boolean(appt.consent_mode) || appt.status === 'in_progress';
  const [granting, setGranting] = useState(false);
  const [grantErr, setGrantErr] = useState('');

  async function startConsultation() {
    setGranting(true);
    setGrantErr('');
    try {
      const res = await authedFetch('/api/ficha/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appt.id, patientEmail }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setGrantErr(data.error ?? 'No se pudo autorizar'); return; }
      onReload();
    } catch {
      setGrantErr('Error de conexión');
    } finally {
      setGranting(false);
    }
  }

  const videoVisible =
    appt.type === 'Telemedicina' && appt.meet_link &&
    (appt.status === 'scheduled' || appt.status === 'in_progress');

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
      {/* Top band */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <span className="text-xs font-semibold capitalize text-slate-500">{dateLabel}</span>
        <span className="ml-auto text-xs font-bold text-slate-700">{appt.time_slot}</span>
      </div>
      <div className="flex items-center gap-4 p-4">
        {/* Time chip */}
        <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <span className="text-xs font-bold">{appt.time_slot}</span>
        </div>
        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{appt.doctor_email}</p>
          {appt.motivo && (
            <p className="text-xs text-muted">{appt.motivo}</p>
          )}
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            appt.type === 'Presencial'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-violet-50 text-violet-700'
          }`}>
            {appt.type}
          </span>
        </div>
        <AppointmentStatusBadge status={appt.status} />
      </div>
      {/* Join video call — telemedicine, while scheduled or in progress */}
      {videoVisible && (
        <a
          href={appt.meet_link!}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 border-t border-slate-100 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 7l-7 5 7 5V7zM1 5h15v14H1z" />
          </svg>
          Entrar a la consulta
        </a>
      )}

      {/* Consent: start the consultation → authorize the doctor on the ficha */}
      {consented ? (
        <div className="flex items-center justify-center gap-2 border-t border-slate-100 bg-mint-50 px-4 py-2.5 text-sm font-semibold text-mint">
          <ShieldCheckIcon className="h-4 w-4" />
          Acceso otorgado a tu médico
        </div>
      ) : appt.status === 'scheduled' ? (
        <button
          onClick={startConsultation}
          disabled={granting}
          className="flex w-full items-center justify-center gap-2 border-t border-slate-100 bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
        >
          {granting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <ShieldCheckIcon className="h-4 w-4" />
          )}
          {granting ? 'Autorizando…' : 'Iniciar consulta · Autorizar a mi médico'}
        </button>
      ) : null}
      {grantErr && <p className="border-t border-slate-100 px-4 py-2 text-xs text-rose-600">{grantErr}</p>}
    </div>
  );
}
