'use client';
import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/auth/authed-fetch';

type Signup = { email: string; role: string | null; created_at: string };
class WaitlistReadError extends Error {}
export default function WaitlistPage() {
  const [rows, setRows] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setRows([]); setLoading(true); setError('');
    void (async () => {
      try {
        const response = await authedFetch('/api/waitlist', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new WaitlistReadError(response.status === 401 ? 'Tu sesión venció. Vuelve a ingresar.' : response.status === 403 ? 'Esta cuenta no tiene acceso al listado.' : 'No pudimos consultar el registro. Inténtalo nuevamente.');
        const body = await response.json();
        if (!Array.isArray(body?.signups) || !body.signups.every((row: Signup) => row && typeof row.email === 'string' && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at)) && (row.role === null || row.role === 'doctor' || row.role === 'patient'))) throw new WaitlistReadError('No pudimos verificar la respuesta del registro.');
        if (current) setRows(body.signups);
      } catch (failure) {
        if (current) { setRows([]); setError(failure instanceof WaitlistReadError ? failure.message : 'No pudimos consultar el registro. Inténtalo nuevamente.'); }
      } finally { if (current) setLoading(false); }
    })();
    return () => { current = false; controller.abort(); };
  }, [revision]);
  const shown = rows.filter(row => row.email.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-slate-900">Registro de interés</h1><p className="mt-1 text-sm text-slate-600">Correos privados del waitlist. Este registro no crea cuentas ni autorizaciones médicas.</p></div><button disabled={loading} onClick={() => setRevision(value => value + 1)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Actualizar</button></div>
    {loading ? <p role="status">Consultando inscritos…</p> : error ? <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error} <button onClick={() => setRevision(value => value + 1)} className="min-h-11 font-semibold underline">Reintentar</button></div> : <>
      <p className="text-sm text-slate-600">{rows.length} registros</p>
      <label className="block text-sm font-medium">Buscar por correo<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></label>
      {!rows.length ? <p>No hay inscripciones todavía.</p> : !shown.length ? <p>No hay coincidencias con tu búsqueda.</p> : <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">{shown.map(row => <li key={row.email} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="break-all font-medium text-slate-900">{row.email}</p><p className="text-sm text-slate-600">{row.role === 'doctor' ? 'Médico' : row.role === 'patient' ? 'Paciente' : 'Rol no indicado'}</p></div><time dateTime={row.created_at} className="text-sm text-slate-600">{new Date(row.created_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} · Hora de Chile</time></li>)}</ul>}
    </>}
  </section>;
}
