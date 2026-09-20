"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { accessApi, accessFailure, AccessError } from "@/components/private-portal/access-client";
import { privyEmail } from "@/lib/auth/privy-email";
import { cn } from "@/lib/utils";

// ── Auth context ──────────────────────────────────────────────────────────────
// The admin is a real Privy user whose email is on the ADMIN_EMAILS allowlist —
// same identity model as doctors and patients. `useAdmin()` exposes the admin's
// email (for display / accountability) and a logout.
interface AdminCtx { email: string; logout: () => void; }
const AdminContext = createContext<AdminCtx>({ email: "", logout: () => {} });
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

// ── Shared dark shell for the pre-panel screens ────────────────────────────────
function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #04111f 0%, #0c2440 100%)" }}>
      <div className="w-full max-w-sm px-4">
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
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

const primaryBtn =
  "w-full rounded-xl py-3 text-sm font-semibold text-white transition disabled:opacity-40";
const primaryBtnStyle = {
  background: "linear-gradient(135deg,#0284c7,#0ea5e9)",
  boxShadow: "0 0 20px rgba(14,165,233,0.3)",
} as const;

// ── Login (Privy) ──────────────────────────────────────────────────────────────
function LoginScreen() {
  return (
    <Gate>
      <p className="mb-4 text-sm text-white/60">
        Ingresa con tu cuenta. Solo los administradores autorizados pueden entrar al panel.
      </p>
      <Link href="/login?role=admin" className={`${primaryBtn} block text-center`} style={primaryBtnStyle}>
        Entrar con mi cuenta
      </Link>
    </Gate>
  );
}

// ── Access denied (logged in, not on the allowlist) ────────────────────────────
function AccessProblem({ error, email, onRetry, onLogout }: { error: AccessError; email: string; onRetry: () => void; onLogout: () => void }) {
  return (
    <Gate>
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/15">
          <Icon d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            className="h-5 w-5 text-rose-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{error.status === 403 ? 'Acceso denegado' : error.status === 401 ? 'Vuelve a ingresar' : 'No pudimos verificar el acceso'}</p>
          <p className="mt-2 break-all text-xs text-white/70">Cuenta actual: {email || 'Cuenta de Privy'}</p>
          <p role="alert" className="mt-2 text-sm text-white/70">{error.status === 403 ? 'Esta cuenta no está autorizada como administrador.' : error.message}</p>
          {error.reference && <p className="mt-2 text-xs text-white/60">Referencia: {error.reference}</p>}
        </div>
        {error.status !== 401 && error.status !== 403 && <button onClick={onRetry} className={primaryBtn} style={primaryBtnStyle}>Volver a consultar</button>}
        <button onClick={onLogout}
          className="w-full rounded-xl border border-white/15 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5">
          {error.status === 401 ? 'Volver a ingresar con Privy' : 'Cambiar de cuenta'}
        </button>
      </div>
    </Gate>
  );
}

function Loading() {
  return (
    <Gate>
      <div className="flex items-center justify-center gap-3 py-2 text-sm text-white/50">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        Verificando acceso…
      </div>
    </Gate>
  );
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────
const NAV = [
  { href: "/admin/doctors", label: "Médicos",    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12c1.1.5 2 1.7 2 3M12 12c-1.1.5-2 1.7-2 3m2-3v5" },
];

function AdminSidebar({ email, logout }: { email: string; logout: () => void }) {
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
        {email && (
          <p className="px-3 pb-2 text-[10px] text-white/30 truncate" title={email}>
            {email}
          </p>
        )}
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
function AdminShell({ email, logout, children }: { email: string; logout: () => void; children: React.ReactNode }) {
  return (
    <AdminContext.Provider value={{ email, logout }}>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <AdminSidebar email={email} logout={logout} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}

// ── Root layout ───────────────────────────────────────────────────────────────
function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = usePrivy();
  const router = useRouter();
  const [phase, setPhase] = useState<'checking' | 'admin' | 'error'>('checking');
  const [email, setEmail] = useState("");
  const [error, setError] = useState<AccessError | null>(null);
  const [revision, setRevision] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setPhase("checking");
    if (!leaving) void accessApi<{ admin: boolean; email: string }>('/api/admin/whoami', { signal: controller.signal }).then(result => {
      if (result.admin !== true || typeof result.email !== 'string' || !result.email) throw new AccessError(503, 'access_unverified', 'ACCESS-UNVERIFIED');
      if (current) { setEmail(result.email); setPhase('admin'); }
    }).catch(failure => {
      if (current) { setError(accessFailure(failure)); setPhase('error'); }
    });
    return () => { current = false; controller.abort(); };
  }, [revision, leaving]);

  async function changeAccount() {
    setLeaving(true);
    try { await logout(); router.replace('/login?role=admin'); }
    catch (failure) { setLeaving(false); setError(accessFailure(failure)); setPhase('error'); }
  }
  if (leaving || phase === 'checking') return <Loading />;
  if (phase === 'error' && error) return <AccessProblem error={error} email={privyEmail(user) ?? ''} onRetry={() => setRevision(value => value + 1)} onLogout={() => void changeAccount()} />;
  return <AdminShell email={email} logout={() => void changeAccount()}>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  useEffect(() => { document.title = 'TrustLeaf — Administración'; }, []);
  if (!ready) return <Loading />;
  if (!authenticated || !user) return <LoginScreen />;
  // Remount synchronously on identity changes, before an old response can expose the panel.
  return <AdminAccessGate key={user.id}>{children}</AdminAccessGate>;
}
