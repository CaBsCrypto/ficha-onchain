'use client';
import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { authedFetch } from '@/lib/auth/authed-fetch';
import type { SponsorshipStatus } from '@/lib/sponsorship/status';

const unavailable = 'No pudimos consultar el estado del patrocinio. Vuelve a intentarlo.';
const amount = (value: string) => {
  const n = BigInt(value), unit = BigInt(10_000_000), whole = n / unit, fraction = (n % unit).toString().padStart(7, '0');
  return whole.toString() + ',' + fraction + ' XLM';
};
function verified(value: unknown): SponsorshipStatus {
  const s = value as SponsorshipStatus;
  const integer = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const stroops = (v: unknown) => typeof v === 'string' && /^(0|[1-9][0-9]{0,39})$/.test(v);
  if (!s || s.network !== 'testnet' || s.coverage !== 'new_reservations_only' || typeof s.requestedEnabled !== 'boolean' || typeof s.configurationValid !== 'boolean' ||
      typeof s.spendingEnabled !== 'boolean' || s.quoteMaxAgeSeconds !== 90 || !/^\d{4}-\d{2}-\d{2}$/.test(s.utcDay) ||
      !Number.isFinite(Date.parse(s.resetAt)) || !Number.isFinite(Date.parse(s.verifiedAt)) ||
      !s.sponsorBuckets || s.sponsorBuckets.scope !== 'all_sponsors_today' || !integer(s.sponsorBuckets.count) ||
      ![s.sponsorBuckets.recordedLimitStroops,s.sponsorBuckets.reservedStroops,s.sponsorBuckets.spentStroops].every(stroops) ||
      !s.reservations || s.reservations.scope !== 'all_testnet_days' || !s.reservations.counts ||
      !['reserved','signed','submitted','settled','released'].every(k => integer(s.reservations.counts[k as keyof typeof s.reservations.counts])) ||
      !integer(s.reservations.pendingCount) || s.reservations.oldestPendingAt !== null && !Number.isFinite(Date.parse(s.reservations.oldestPendingAt)) ||
      s.reservations.oldestPendingAgeSeconds !== null && !integer(s.reservations.oldestPendingAgeSeconds) ||
      s.policy !== null && (!s.policy || ![s.policy.maxFeeStroops,s.policy.entryLimitStroops,s.policy.sponsorDailyLimitStroops,s.policy.patientDailyLimitStroops,s.policy.emergencyReserveStroops].every(stroops))) throw Error(unavailable);
  return s;
}
/** Explicit GET only. No polling, chain calls, wallet access or changes to spending switches. */
export function ClinicalSponsorshipStatus() {
  const { ready, authenticated, user } = usePrivy(), identity = ready && authenticated ? user?.id ?? '' : '';
  const identityRef = useRef(identity); identityRef.current = identity;
  const active = useRef(false), abort = useRef<AbortController | null>(null);
  const [data, setData] = useState<SponsorshipStatus | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    active.current = true; abort.current?.abort(); setData(null); setBusy(false); setError('');
    return () => { active.current = false; abort.current?.abort(); };
  }, [identity]);
  async function refresh() {
    if (!identity || busy) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const selectedIdentity = identity; let message = unavailable;
    setBusy(true); setData(null); setError('');
    const current = () => active.current && !controller.signal.aborted && identityRef.current === selectedIdentity;
    try {
      const response = await authedFetch('/api/admin/sponsorship-status', { method: 'GET', cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401) message = 'Tu sesión venció. Vuelve a iniciar sesión.';
        if (response.status === 403) message = 'Esta cuenta no tiene acceso al estado administrativo.';
        throw Error();
      }
      const result = verified(await response.json());
      if (current()) setData(result);
    } catch { if (current()) setError(message); }
    finally { if (current()) setBusy(false); }
  }
  return <section aria-label="Estado del patrocinio" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Patrocinio de Stellar Testnet</h2>
      <button type="button" disabled={!identity || busy} onClick={() => void refresh()} className="min-h-11 rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-50">{busy ? 'Consultando…' : 'Consultar estado del patrocinio'}</button>
    </div>
    <p className="text-sm text-slate-600">Consulta administrativa del presupuesto nuevo. Esta tarjeta no habilita gastos, solicita firmas ni acredita autorización clínica.</p>
    <p className="text-sm text-slate-600">Este control incluye sólo operaciones registradas por el sistema nuevo de presupuestos; los cargos anteriores del ensayo se conservan en su informe.</p>
    {busy && <p role="status" className="text-sm text-slate-600">Comprobando agregados…</p>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    {data && <div className="space-y-3 text-sm">
      <p role="status" className={data.spendingEnabled ? 'text-emerald-800' : 'text-slate-700'}>{data.spendingEnabled ? 'Patrocinio habilitado para las rutas integradas.' : data.requestedEnabled ? 'Gastos bloqueados: configuración no válida.' : 'Patrocinio deshabilitado.'}</p>
      <p className="text-slate-600">Día UTC: {data.utcDay}. Reinicio de topes diarios: {new Date(data.resetAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} (Chile).</p>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div><dt className="text-slate-500">Consumido hoy</dt><dd className="font-semibold">{amount(data.sponsorBuckets.spentStroops)}</dd></div>
        <div><dt className="text-slate-500">Reservado hoy</dt><dd className="font-semibold">{amount(data.sponsorBuckets.reservedStroops)}</dd></div>
        <div><dt className="text-slate-500">Pendientes de todas las fechas</dt><dd className="font-semibold">{data.reservations.pendingCount}</dd></div>
      </dl>
      <p className="text-xs text-slate-500">Agregado de {data.sponsorBuckets.count} cuentas patrocinadoras registradas; las cuentas de pacientes no se suman otra vez. Es contabilidad de presupuesto, no saldo de wallets.</p>
      {data.policy && <dl className="grid gap-2 sm:grid-cols-2">
        <div><dt className="text-slate-500">Tope por operación</dt><dd>{amount(data.policy.maxFeeStroops)}</dd></div>
        <div><dt className="text-slate-500">Tope por entrada y correcciones</dt><dd>{amount(data.policy.entryLimitStroops)}</dd></div>
        <div><dt className="text-slate-500">Tope diario por paciente</dt><dd>{amount(data.policy.patientDailyLimitStroops)}</dd></div>
        <div><dt className="text-slate-500">Tope diario por patrocinador</dt><dd>{amount(data.policy.sponsorDailyLimitStroops)}</dd></div>
        <div><dt className="text-slate-500">Reserva de emergencia</dt><dd>{amount(data.policy.emergencyReserveStroops)}</dd></div>
      </dl>}
      {data.reservations.oldestPendingAt && <p className="text-slate-600">Pendiente más antiguo: {new Date(data.reservations.oldestPendingAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} (Chile); antigüedad {data.reservations.oldestPendingAgeSeconds} segundos al consultar.</p>}
      <p className="text-xs text-slate-500">Cotizaciones vigentes para una firma nueva: {data.quoteMaxAgeSeconds} segundos. Confirmaciones o fallos finales: {data.reservations.counts.settled}; liberados sin firma: {data.reservations.counts.released}.</p>
    </div>}
  </section>;
}
