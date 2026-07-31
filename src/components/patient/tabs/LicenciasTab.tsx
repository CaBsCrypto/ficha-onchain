"use client";

import { useEffect, useState } from "react";
import { usePrivyEmail } from "@/hooks/usePrivyEmail";
import { authedFetch } from "@/lib/auth/authed-fetch";
import {
  InfoIcon,
  ClipboardCheckIcon,
} from "@/components/icons/PatientIcons";
import { type PatientDBLicense } from "@/components/patient/types";
import { addDaysPatient } from "@/components/patient/dates";
import { PatientLicCard } from "@/components/patient/PatientLicCard";

// ---------------------------------------------------------------------------
// Tab: Mis Licencias Médicas — real DB
// ---------------------------------------------------------------------------
export function LicenciasTab() {
  const privyEmail = usePrivyEmail();
  const [licencias, setLicencias] = useState<PatientDBLicense[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!privyEmail) { setLoading(false); return; }
    setLoading(true);
    authedFetch(`/api/licenses?patientEmail=${encodeURIComponent(privyEmail)}`)
      .then(r => r.json() as Promise<{ data?: PatientDBLicense[] }>)
      .then(json => { if (json.data) setLicencias(json.data); })
      .catch(err => console.error('[LicenciasTab patient]', err))
      .finally(() => setLoading(false));
  }, [privyEmail]);

  const active  = licencias.filter(l => l.status === 'signed' && new Date(addDaysPatient(l.fecha_inicio, l.dias) + 'T23:59:59') >= new Date());
  const past    = licencias.filter(l => l.status !== 'signed' || new Date(addDaysPatient(l.fecha_inicio, l.dias) + 'T23:59:59') < new Date());

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200/60 bg-violet-50/40 px-4 py-3.5">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
        <p className="text-xs leading-relaxed text-violet-800">
          <span className="font-semibold">Licencias médicas on-chain.</span>{" "}
          Cada licencia emitida por tu médico queda registrada en Stellar
          Soroban — verificable por empleadores e instituciones de salud.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-violet-500" />
        </div>
      ) : licencias.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-muted">
            <ClipboardCheckIcon className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium text-ink">Sin licencias registradas</p>
          <p className="mt-1 text-xs text-muted">
            Tus licencias médicas aparecerán aquí cuando un médico las emita on-chain.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Vigentes</p>
              <div className="space-y-3">
                {active.map(lic => <PatientLicCard key={lic.id} lic={lic} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Historial</p>
              <div className="space-y-3">
                {past.map(lic => <PatientLicCard key={lic.id} lic={lic} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
