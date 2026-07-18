'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { usePrivyEmail } from '@/hooks/usePrivyEmail';

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function IconHome({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21c0-4 3.1-7 7-7s7 3 7 7" />
      <path d="M19 8c1.1.5 2 1.7 2 3M21 21c0-2.5-1.8-4.5-4-5.3" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconRx({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6h5a3 3 0 010 6H5V6zm0 6 6 6M5 12h4" />
      <path d="m15 13 5 6m0-6-5 6" />
    </svg>
  );
}

function IconDoc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// ── Nav item type ─────────────────────────────────────────────────────────────
interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  tab: string;
}

// ── Nav hook (uses useSearchParams — must be inside Suspense) ─────────────────
function useDoctorNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') ?? 'inicio';

  const items: NavItem[] = [
    { href: '/doctor?tab=inicio',    label: 'Inicio',    icon: <IconHome className="h-5 w-5" />,     tab: 'inicio'    },
    { href: '/doctor?tab=consultas', label: 'Consultas', icon: <IconCalendar className="h-5 w-5" />, tab: 'consultas' },
    { href: '/doctor?tab=disponibilidad', label: 'Disponibilidad', icon: <IconClock className="h-5 w-5" />, tab: 'disponibilidad' },
    { href: '/doctor?tab=pacientes', label: 'Pacientes', icon: <IconUsers className="h-5 w-5" />,    tab: 'pacientes' },
  ];

  function isActive(item: NavItem): boolean {
    if (pathname === '/doctor') return currentTab === item.tab;
    return false;
  }

  return { items, isActive };
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────
function SidebarNav() {
  const { items, isActive } = useDoctorNav();
  return (
    <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col">
      <div className="sticky top-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Portal Médico</p>
        </div>
        <nav className="flex flex-col p-2">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                )}
              >
                <span className={cn('shrink-0', active ? 'text-white' : 'text-slate-400')}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────
function MobileBottomNav() {
  const { items, isActive } = useDoctorNav();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white shadow-[0_-1px_12px_rgba(0,0,0,0.06)] md:hidden">
      <div className="mx-auto flex max-w-3xl">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-sky-500' : 'text-slate-400 hover:text-slate-700',
              )}
            >
              {active && (
                <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-sky-500" />
              )}
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl transition-all', active ? 'bg-sky-50' : '')}>
                {item.icon}
              </span>
              <span className={active ? 'font-semibold text-sky-500' : ''}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ── Doctor shell ──────────────────────────────────────────────────────────────
function DoctorShell({ children }: { children: React.ReactNode }) {
  const { logout } = usePrivy();
  const email = usePrivyEmail();

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          {/* Logo + badge */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500 text-white shadow-sm">
                <span className="text-xs font-bold">T</span>
              </span>
              <span className="text-slate-900">
                Trust<span className="text-sky-500">Leaf</span>
              </span>
            </Link>
            <span className="hidden rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 sm:inline-flex">
              Portal Médico
            </span>
          </div>

          {/* Right side: profile link + logout */}
          <div className="flex items-center gap-3">
            <Link
              href="/doctor?tab=perfil"
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              title="Mi perfil"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-semibold text-sky-600">
                {(email ?? '?').charAt(0).toUpperCase()}
              </span>
              {email !== null && (
                <span className="hidden max-w-[160px] truncate lg:block">{email}</span>
              )}
            </Link>
            <button
              onClick={() => void logout()}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      {/* Layout: sidebar + main content */}
      <div className="mx-auto max-w-6xl px-4 py-6 md:flex md:gap-8">
        <Suspense>
          <SidebarNav />
        </Suspense>
        <main className="min-w-0 flex-1 pb-28 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <Suspense>
        <MobileBottomNav />
      </Suspense>
    </div>
  );
}

// ── Layout (default export) ───────────────────────────────────────────────────
export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) router.push('/');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  return <DoctorShell>{children}</DoctorShell>;
}
