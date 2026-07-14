"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../layout";

interface User { privy_id: string; email: string | null; wallet: string | null; created_at: string; }

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function Avatar({ label, color }: { label: string; color: string }) {
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${color}`}>
      {label}
    </div>
  );
}

const COLORS = [
  "bg-violet-100 text-violet-600",
  "bg-sky-100 text-sky-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
];

export default function UsersPage() {
  const { token } = useAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/users?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = (await res.json()) as { users: User[] };
      setUsers(data.users);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.wallet ?? "").toLowerCase().includes(q) ||
      u.privy_id.toLowerCase().includes(q)
    );
  });

  const thisWeek = users.filter(
    (u) => Date.now() - new Date(u.created_at).getTime() < 7 * 86400000
  ).length;

  function shortId(id: string) {
    return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
  }
  function shortWallet(w: string) {
    return w.length > 14 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
  }

  return (
    <div className="px-8 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Usuarios</h1>
          <p className="mt-0.5 text-sm text-slate-400">Usuarios registrados vía Privy</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Stat pills */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-full bg-violet-50 border border-violet-200 px-4 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
          </span>
          <span className="text-sm font-semibold text-violet-700">{users.length} usuarios</span>
        </div>
        {thisWeek > 0 && (
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-2">
            <span className="text-sm font-semibold text-emerald-700">+{thisWeek} esta semana</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por email, wallet o ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400 text-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-300 text-4xl mb-3">👤</p>
            <p className="text-sm text-slate-400">
              {search ? "Sin resultados" : "Los usuarios aparecerán aquí al ingresar al portal"}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left">
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">#</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Usuario</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Wallet Stellar</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Privy ID</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u, i) => {
                const label = u.email ? u.email[0].toUpperCase() : "W";
                const color = COLORS[i % COLORS.length];
                return (
                  <tr key={u.privy_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4 text-sm text-slate-300">{i + 1}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar label={label} color={color} />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{u.email ?? "Sin email"}</p>
                          {!u.email && <p className="text-xs text-slate-400">Solo wallet</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {u.wallet ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-sky-500 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">XLM</span>
                          <span className="font-mono text-xs text-slate-500" title={u.wallet}>
                            {shortWallet(u.wallet)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">Sin wallet</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-slate-400">{shortId(u.privy_id)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-500">{fmt(u.created_at)}</p>
                      <p className="text-xs text-slate-400">{fmtRelative(u.created_at)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
