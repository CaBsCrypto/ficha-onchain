'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// Nav icons (inline SVG to avoid import issues in layout)
function IconHome({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" />
    </svg>
  );
}
function IconPill({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h6.5" /><path d="M13.5 4H20a2 2 0 012 2v12a2 2 0 01-2 2h-6.5" /><path d="M10.5 4v16" />
    </svg>
  );
}
function IconClipboard({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" /><path d="M8 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2h-2" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IconFicha({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}
function IconLock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
function IconHeart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchTab?: string;
  matchPath?: string;
};

function PatientNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') ?? 'inicio';

  const items: NavItem[] = [
    { href: '/patient?tab=inicio',     label: 'Inicio',          icon: <IconHome className="h-5 w-5" />,      matchTab: 'inicio'    },
    { href: '/patient?tab=recetas',    label: 'Recetas',         icon: <IconPill className="h-5 w-5" />,      matchTab: 'recetas'   },
    { href: '/patient?tab=licencias',  label: 'Licencias',       icon: <IconClipboard className="h-5 w-5" />, matchTab: 'licencias' },
    { href: '/patient?tab=ficha',      label: 'Mi Ficha',        icon: <IconFicha className="h-5 w-5" />,     matchTab: 'ficha'     },
    { href: '/patient?tab=accesos',    label: 'Accesos',         icon: <IconLock className="h-5 w-5" />,      matchTab: 'accesos'   },
    { href: '/patient/pain-diary',     label: 'Diario de Dolor', icon: <IconHeart className="h-5 w-5" />,     matchPath: '/patient/pain-diary' },
  ];

  function isActive(item: NavItem): boolean {
    if (item.matchPath) return pathname === item.matchPath || pathname.startsWith(item.matchPath);
    if (item.matchTab && pathname === '/patient') return currentTab === item.matchTab;
    return false;
  }

  return { items, isActive };
}

function SidebarNav() {
  const { items, isActive } = PatientNav();
  return (
    <aside className="hidden md:flex md:w-56 lg:w-60 md:flex-col md:shrink-0">
      <div className="sticky top-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Sidebar header */}
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Mi portal</p>
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

function MobileBottomNav() {
  const { items, isActive } = PatientNav();
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
              {/* Active dot at top */}
              {active && (
                <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-sky-500" />
              )}
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl transition-all', active ? 'bg-sky-50' : '')}>
                {item.icon}
              </span>
              <span className={active ? 'text-sky-500 font-semibold' : ''}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function PatientShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0ea5e9] text-white shadow-sm">
              <span className="text-xs font-bold">T</span>
            </span>
            <span className="text-slate-900">
              Trust<span className="text-[#0ea5e9]">Leaf</span>
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            ← Volver
          </Link>
        </div>
      </header>

      {/* ── Layout: sidebar + content ── */}
      <div className="mx-auto max-w-6xl px-4 py-6 md:flex md:gap-8">
        <Suspense>
          <SidebarNav />
        </Suspense>

        <main className="min-w-0 flex-1 pb-28 md:pb-6">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <Suspense>
        <MobileBottomNav />
      </Suspense>
    </div>
  );
}

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) router.push('/');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0ea5e9] border-t-transparent" />
      </div>
    );
  }

  return <PatientShell>{children}</PatientShell>;
}
