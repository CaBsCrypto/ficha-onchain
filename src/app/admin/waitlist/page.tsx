"use client";

import { useState, useEffect } from "react";

interface Signup {
  email: string;
  role: string | null;
  created_at: string;
}

interface ApiResponse {
  count: number;
  signups: Signup[];
  error?: string;
}

export default function WaitlistAdminPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);

  async function fetchSignups(t: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/waitlist?token=${encodeURIComponent(t)}`);
      const json = (await res.json()) as ApiResponse;
      if (res.ok) {
        setData(json);
        setAuthed(true);
      } else {
        setData({ count: 0, signups: [], error: "Token incorrecto" });
      }
    } catch {
      setData({ count: 0, signups: [], error: "Error de conexión" });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (token.trim()) fetchSignups(token.trim());
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-lg shadow-sky-500/30">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
                <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-800">TrustLeaf Admin</h1>
            <p className="mt-1 text-sm text-slate-500">Waitlist dashboard</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Token de acceso
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || !token.trim()}
                className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
              >
                {loading ? "Verificando…" : "Entrar"}
              </button>
              {data?.error && (
                <p className="text-center text-xs text-rose-500">{data.error}</p>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  const signups = data?.signups ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500 text-white">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-semibold text-slate-800">Waitlist Admin</span>
          </div>
          <button
            onClick={() => { setAuthed(false); setData(null); setToken(""); }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Stats row */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total signups</p>
            <p className="mt-1 text-3xl font-semibold text-slate-800">{data?.count ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Último registro</p>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {signups[0] ? formatDate(signups[0].created_at) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Con rol</p>
            <p className="mt-1 text-3xl font-semibold text-slate-800">
              {signups.filter((s) => s.role).length}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">
              Registros ({signups.length})
            </h2>
          </div>

          {signups.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              Sin registros todavía.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">#</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Email</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Rol</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-400">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {signups.map((s, i) => (
                  <tr key={s.email} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-400">{i + 1}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">{s.email}</td>
                    <td className="px-6 py-4">
                      {s.role ? (
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                          {s.role}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <button
          onClick={() => fetchSignups(token)}
          className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 transition"
        >
          ↻ Actualizar
        </button>
      </main>
    </div>
  );
}
