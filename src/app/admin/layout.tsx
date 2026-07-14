"use client";

import { useState, createContext, useContext, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// ── Auth context ──────────────────────────────────────────────────────────────
interface AdminCtx { token: string; logout: () => void; }
const AdminContext = createContext<AdminCtx>({ token: "", logout: () => {} });
export function useAdmin() { return useContext(AdminContext); }

// ── Icons ─────────────────────────────────────────────────────────────────────
function Icon({ d, className }: { d: string | string[]; className?: string }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className ?? "h-5 w-5"}>
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onAuth }: { onAuth: (t: string) => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(false);
    const res = await fetch(`/api/admin/stats?token=${encodeURIComponent(token)}`);
    setLoading(false);
    if (res.ok) { onAuth(token); }
    else { setError(true); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #04111f 0%, #0c2440 100%)" }}>
      <div className="w-full max-w-sm px-4">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white"
            style={{ background: "linear-gradient(135deg,#0284c7,#0ea5e9)", boxShadow: "0 0 32px rgba(14,165,233,0.4)" }}>
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
              <path d="M9 12l2 2 4-4" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">TrustLeaf Admin</h1>
          <p className="mt-1 text-sm text-white/40">Panel de administración</p>
        </div>

        <div className="overflow-hidden rounded-2xl"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(14,165,233,0.15)" }}>
          <div className="h-px w-full" style={{ background: "linear-gradient(90deg,transparent,#0ea5e9,transparent)" }} />
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">
                Token de acceso
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => { setToken(e.target.value); setError(false); }}
                placeholder="••••••••••••••••"
                autoFocus
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition"
                style={{
                  background: "rgba(14,165,233,0.07)",
                  border: error ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(14,165,233,0.2)",
                }}
              />
              {error && <p className="mt-1.5 text-xs text-rose-400">Token incorrecto</p>}
            </div>
            <button
              type="submit"
              disabled={loading || !token}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#0284c7,#0ea5e9)", boxShadow: "0 0 20px rgba(14,165,233,0.3)" }}
            >
              {loading ? "Verificando…" : "Entrar al panel"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────
const NAV = [
  { href: "/admin",         label: "Dashboard",  icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/admin/waitlist",label: "Waitlist",   icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { href: "/admin/users",   label: "Usuarios",   icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { href: "/admin/doctors", label: "Médicos",    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12c1.1.5 2 1.7 2 3M12 12c-1.1.5-2 1.7-2 3m2-3v5" },
];

function AdminSidebar({ token, logout }: { token: string; logout: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-56 flex-col"
      style={{ background: "linear-gradient(180deg,#04111f 0%,#062440 100%)", borderRight: "1px solid rgba(14,165,233,0.1)" }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b" style={{ borderColor: "rgba(14,165,233,0.1)" }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl text-white"
          style={{ background: "linear-gradient(135deg,#0284c7,#0ea5e9)" }}>
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
            <path d="M9 12l2 2 4-4" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-none">TrustLeaf</p>
          <p className="text-[10px] text-white/30 mt-0.5">Admin Panel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">Menú</p>
        {NAV.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "text-white"
                  : "text-white/40 hover:text-white/80 hover:bg-white/5"
              )}
              style={active ? { background: "rgba(14,165,233,0.18)", borderLeft: "2px solid #0ea5e9" } : {}}>
              <Icon d={item.icon} className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t" style={{ borderColor: "rgba(14,165,233,0.1)" }}>
        <Link href="/" className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/30 hover:text-white/60 transition">
          <Icon d="M10 19l-7-7m0 0l7-7m-7 7h18" className="h-3.5 w-3.5" />
          Volver al sitio
        </Link>
        <button onClick={logout}
          className="mt-1 flex w-full items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400/60 hover:text-rose-400 transition">
          <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="h-3.5 w-3.5" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function AdminShell({ token, logout, children }: { token: string; logout: () => void; children: React.ReactNode }) {
  return (
    <AdminContext.Provider value={{ token, logout }}>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <AdminSidebar token={token} logout={logout} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}

// ── Root layout ───────────────────────────────────────────────────────────────
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  // Persist token in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem("admin_token");
    if (saved) setToken(saved);
  }, []);

  function handleAuth(t: string) {
    sessionStorage.setItem("admin_token", t);
    setToken(t);
  }

  function handleLogout() {
    sessionStorage.removeItem("admin_token");
    setToken(null);
  }

  if (!token) return <LoginScreen onAuth={handleAuth} />;
  return <AdminShell token={token} logout={handleLogout}>{children}</AdminShell>;
}
