"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/auth/authed-fetch";

interface Stats {
  waitlist: { total: number; thisWeek: number; today: number };
  users:    { total: number; thisWeek: number };
  doctors?: { active: number; total: number };
}

function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-4xl font-semibold ${accent ? "text-sky-500" : "text-slate-800"}`}>{value}</p>
      {sub && <p className="mt-1 text-sm text-slate-400">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authedFetch(`/api/admin/stats`)
      .then((r) => r.json())
      .then((d) => { setStats(d as Stats); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const now = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="px-8 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400 capitalize">{now}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          Cargando stats…
        </div>
      ) : stats ? (
        <>
          {/* Stats */}
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Resumen general</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Waitlist total"    value={stats.waitlist.total}   accent />
              <StatCard label="Esta semana"       value={stats.waitlist.thisWeek} sub="nuevos en waitlist" />
              <StatCard label="Usuarios activos"  value={stats.users.total}       sub={`+${stats.users.thisWeek} esta semana`} />
              <StatCard label="Médicos activos"   value={stats.doctors?.active ?? 0} sub={`${stats.doctors?.total ?? 0} registrados`} />
            </div>
          </section>

          {/* Quick links */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Acceso rápido</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <a href="/admin/waitlist"
                className="group flex items-center gap-4 rounded-2xl bg-white border border-slate-200 p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-500 group-hover:bg-sky-100 transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-800">Waitlist</p>
                  <p className="text-xs text-slate-400">{stats.waitlist.total} registros</p>
                </div>
              </a>
              <a href="/admin/users"
                className="group flex items-center gap-4 rounded-2xl bg-white border border-slate-200 p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-500 group-hover:bg-violet-100 transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-800">Usuarios</p>
                  <p className="text-xs text-slate-400">{stats.users.total} registrados</p>
                </div>
              </a>
              <a href="/admin/doctors"
                className="group flex items-center gap-4 rounded-2xl bg-white border border-slate-200 p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    <path d="M12 12c0 1.66-1.34 3-3 3" /><path d="M12 12V17" /><path d="M12 17h3" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-800">Médicos</p>
                  <p className="text-xs text-slate-400">{stats.doctors?.active ?? 0} activos</p>
                </div>
              </a>
            </div>
          </section>
        </>
      ) : (
        <p className="text-sm text-rose-400">No se pudieron cargar las stats.</p>
      )}
    </div>
  );
}
