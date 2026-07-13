// Copyright © 2026 Browns Studio
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { clearUserRole } from "../lib/user-role";

interface NavLink {
  href: string;
  label: string;
  roleKey?: string;
}

// Landing nav — cleaner, focused on conversion
const LANDING_NAV_LINKS: NavLink[] = [
  { href: "/#how-it-works", label: "Cómo funciona" },
  { href: "/for-doctors", label: "Para Médicos" },
  { href: "/caregiver/types", label: "Cuidadores" },
  { href: "/farmacia", label: "Portal Farmacia" },
  { href: "/pricing", label: "Precios" },
];

// Portal nav — full app navigation
const PORTAL_NAV_LINKS: NavLink[] = [
  { href: "/patient", label: "Paciente", roleKey: "patient" },
  { href: "/doctor", label: "Médico", roleKey: "doctor" },
  { href: "/farmacia", label: "Farmacia", roleKey: "farmacia" },
  { href: "/verify/demo", label: "Verificar" },
  { href: "/caregiver", label: "Cuidadores" },
  { href: "/pricing", label: "Precios" },
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      )}
    </svg>
  );
}

// ─── Auth section (desktop) ───────────────────────────────────────────────────
function AuthSection({ variant = "landing", onClose }: { variant?: "landing" | "portal"; onClose?: () => void }) {
  const { authenticated, logout, user, login } = usePrivy();

  function getDisplayName(): string {
    if (user?.email?.address) return user.email.address;
    if (user?.google?.email) return user.google.email;
    if (user?.wallet?.address) {
      const addr = user.wallet.address;
      return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    }
    return "Mi cuenta";
  }

  function getInitial(): string {
    return getDisplayName().charAt(0).toUpperCase();
  }

  async function handleLogout() {
    clearUserRole();
    await logout();
    onClose?.();
  }

  const isLight = variant === "landing";

  if (authenticated) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={isLight
            ? { background: "rgba(14,165,233,0.12)", color: "#0284C7", border: "1px solid rgba(14,165,233,0.3)" }
            : { background: "rgba(16,185,129,0.2)", color: "#10B981", border: "1px solid rgba(16,185,129,0.4)" }
          }
          title={getDisplayName()}
        >
          {getInitial()}
        </div>
        <span className={`hidden lg:block text-xs max-w-[140px] truncate ${isLight ? "text-slate-500" : "text-slate-400"}`} title={getDisplayName()}>
          {getDisplayName()}
        </span>
        <button
          onClick={handleLogout}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
            isLight
              ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
              : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
          }`}
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (isLight) {
    // Landing nav auth: Demo Paciente | Demo Médico | Iniciar sesión | Unirse
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login?demo=paciente"
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-200 text-sky-600 bg-sky-50 hover:bg-sky-100 transition-colors"
        >
          Demo Paciente
        </Link>
        <Link
          href="/login?demo=medico"
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:border-sky-200 hover:text-sky-600 transition-colors"
        >
          Demo Médico
        </Link>
        <button
          onClick={() => { login(); onClose?.(); }}
          className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          Iniciar sesión
        </button>
        <Link
          href="/#cta"
          className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#0EA5E9] hover:bg-[#0284C7] text-white transition-colors"
        >
          Unirse a la lista
        </Link>
      </div>
    );
  }

  // Portal nav auth
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => { login(); onClose?.(); }}
        className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
      >
        Iniciar sesión
      </button>
      <Link
        href="/patient/onboarding"
        onClick={onClose}
        className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#10B981] hover:bg-[#059669] text-slate-900 transition-colors"
      >
        Registrarse
      </Link>
    </div>
  );
}

// ─── Mobile auth section ──────────────────────────────────────────────────────
function MobileAuthSection({ onClose, variant = "landing" }: { onClose: () => void; variant?: "landing" | "portal" }) {
  const { authenticated, logout, user, login } = usePrivy();

  function getDisplayName(): string {
    if (user?.email?.address) return user.email.address;
    if (user?.google?.email) return user.google.email;
    if (user?.wallet?.address) {
      const addr = user.wallet.address;
      return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    }
    return "Mi cuenta";
  }

  async function handleLogout() {
    clearUserRole();
    await logout();
    onClose();
  }

  const isLight = variant === "landing";

  if (authenticated) {
    return (
      <div className="pt-2 pb-1 space-y-2">
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl ${isLight ? "bg-sky-50 border border-sky-200" : "bg-green-900/20 border border-green-800/30"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isLight ? "bg-sky-100 text-sky-600" : "bg-green-900/30 text-green-400"}`}>
            {getDisplayName().charAt(0).toUpperCase()}
          </div>
          <span className={`text-sm truncate ${isLight ? "text-slate-600" : "text-slate-300"}`}>
            {getDisplayName()}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className={`w-full text-center px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
            isLight ? "border-slate-200 text-slate-500" : "border-slate-700 text-slate-400"
          }`}
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (isLight) {
    return (
      <div className="pt-2 pb-1 space-y-2">
        <Link
          href="/login?demo=paciente"
          onClick={onClose}
          className="block text-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-sky-50 border border-sky-200 text-sky-600"
        >
          Demo Paciente
        </Link>
        <Link
          href="/login?demo=medico"
          onClick={onClose}
          className="block text-center px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600"
        >
          Demo Médico
        </Link>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => { login(); onClose(); }}
            className="text-center px-4 py-2.5 border border-slate-200 text-sm font-medium rounded-xl text-slate-500"
          >
            Iniciar sesión
          </button>
          <Link
            href="/#cta"
            onClick={onClose}
            className="text-center px-4 py-2.5 text-sm font-semibold rounded-xl bg-[#0EA5E9] text-white"
          >
            Unirse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2 pb-1 grid grid-cols-2 gap-2">
      <button
        onClick={() => { login(); onClose(); }}
        className="text-center px-4 py-2.5 border border-slate-700 text-sm font-medium rounded-xl text-slate-400"
      >
        Iniciar sesión
      </button>
      <Link
        href="/patient/onboarding"
        onClick={onClose}
        className="text-center px-4 py-2.5 text-sm font-semibold rounded-xl bg-[#10B981] text-slate-900"
      >
        Registrarse
      </Link>
    </div>
  );
}

interface NavbarProps {
  variant?: "landing" | "portal";
  activeRole?: string;
}

export default function Navbar({ variant = "landing", activeRole }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isLight = variant === "landing";

  const NAV_LINKS = isLight ? LANDING_NAV_LINKS : PORTAL_NAV_LINKS;

  function isActive(link: NavLink): boolean {
    if (activeRole && link.roleKey) return link.roleKey === activeRole;
    return pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
  }

  return (
    <header className={`sticky top-0 z-50 w-full backdrop-blur-md ${
      isLight
        ? "border-b border-slate-200 bg-white/95"
        : "border-b border-slate-800 bg-slate-900/95"
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-transform group-hover:scale-105 ${
              isLight ? "bg-[#0EA5E9] text-white" : "bg-[#10B981] text-slate-900"
            }`}>
              T
            </div>
            <span className={`font-bold text-base ${isLight ? "text-slate-900" : "text-white"}`}>
              Trust<span className={isLight ? "text-[#0EA5E9]" : "text-[#10B981]"}>Leaf</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isLight
                      ? active
                        ? "text-sky-600 bg-sky-50"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      : active
                      ? "text-green-400 bg-green-900/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isLight ? "bg-sky-500" : "bg-green-400"}`} />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-2">
            <AuthSection variant={variant} />
          </div>

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`md:hidden p-2 rounded-lg transition-colors ${
              isLight
                ? "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 top-16 z-40 bg-black/30 backdrop-blur-sm md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className={`md:hidden relative z-50 border-t px-4 py-3 space-y-1 shadow-xl ${
            isLight ? "border-slate-200 bg-white" : "border-slate-800 bg-slate-900"
          }`}>
            {NAV_LINKS.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isLight
                      ? active
                        ? "bg-sky-50 text-sky-600"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      : active
                      ? "bg-green-900/20 text-green-400"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {active && (
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLight ? "bg-sky-500" : "bg-green-400"}`} />
                  )}
                  {link.label}
                </Link>
              );
            })}
            <MobileAuthSection onClose={() => setMenuOpen(false)} variant={variant} />
          </div>
        </>
      )}
    </header>
  );
}
