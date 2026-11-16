'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { privyEmail } from '@/lib/auth/privy-email';
import { cn } from '@/lib/utils';
import { WalletBoundary } from '@/components/private-portal/WalletBoundary';
import { PatientIcon } from '@/components/private-portal/PatientIcon';
import styles from '@/components/private-portal/patient-mobile.module.css';
const tabs = [
  { id: 'inicio', es: 'Inicio', en: 'Home' },
  { id: 'consultas', es: 'Consultas', en: 'Appointments' },
  { id: 'historial', es: 'Ficha clínica', en: 'Clinical record' },
  { id: 'recetas', es: 'Recetas', en: 'Prescriptions' },
  { id: 'perfil', es: 'Cuenta', en: 'Account' },
] as const;
const copy = {
  es: {
    title: 'Portal del paciente', navigation: 'Menú del paciente', mobileNavigation: 'Menú móvil del paciente',
    checking: 'Verificando acceso…', badge: 'Paciente', portal: 'Mi portal', account: 'Mi cuenta',
    signingOut: 'Cerrando sesión…', signOut: 'Cerrar sesión', signOutError: 'No pudimos cerrar la sesión. Vuelve a intentarlo.',
  },
  en: {
    title: 'Patient portal', navigation: 'Patient navigation', mobileNavigation: 'Mobile patient navigation',
    checking: 'Checking access…', badge: 'Patient', portal: 'My portal', account: 'My account',
    signingOut: 'Signing out…', signOut: 'Sign out', signOutError: 'We could not sign you out. Please try again.',
  },
};
function Navigation({ mobile = false }: { mobile?: boolean }) {
  const current = useSearchParams().get('tab') ?? 'inicio';
  const language = usePortalLanguage();
  const labels = copy[language];
  return <nav aria-label={mobile ? labels.mobileNavigation : labels.navigation} className={mobile ? styles.mobileNavList : 'space-y-1 p-2'}>
    {tabs.map(tab => {
      const active = current === tab.id;
      return <Link key={tab.id} href={`/patient?tab=${tab.id}`} aria-current={active ? 'page' : undefined}
        className={cn(styles.focusable, mobile ? styles.mobileNavItem : 'flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-medium',
          !mobile && (active ? 'bg-sky-100 font-semibold text-sky-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'))}>
        {mobile && <PatientIcon name={tab.id} />}
        <span className="min-w-0 max-w-full">{tab[language]}</span>
      </Link>;
    })}
  </nav>;
}
function AccountActions({ children }: { children: React.ReactNode }) {
  const current = useSearchParams().get('tab');
  return current === 'perfil' ? <div className={styles.mobileOnly} data-patient-account-actions>{children}</div> : null;
}
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const router = useRouter();
  const labels = copy[usePortalLanguage()];
  useEffect(() => { document.title = `TrustLeaf — ${labels.title}`; }, [labels.title]);
  const signingOut = useRef(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  useEffect(() => { if (ready && !authenticated) router.replace(signingOut.current ? '/' : '/login/patient'); }, [ready, authenticated, router]);
  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true; setLogoutBusy(true); setLogoutError(false);
    try { await logout(); router.replace('/'); }
    catch { signingOut.current = false; setLogoutBusy(false); setLogoutError(true); }
  }
  if (!ready || !authenticated) return <p role="status" className="p-8 text-center text-sm text-slate-500">{labels.checking}</p>;
  return <WalletBoundary key={user?.id}><div className={cn(styles.portal, 'min-h-screen bg-canvas text-ink')}>
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur-sm"><div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <Link href="/" className={cn(styles.focusable, 'flex min-h-11 items-center gap-2 rounded-md font-semibold')}>
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-[#0369a1] text-xs font-bold text-white">T</span>
        <span className="text-ink">Trust<span className="text-[#0369a1]">Leaf</span><span className={cn(styles.mobileOnly, 'text-xs font-medium text-slate-600')}>Stellar Testnet · Demo</span></span>
      </Link>
      <span data-patient-desktop className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900">{labels.badge} · Stellar Testnet</span>
      <Link href="/patient?tab=perfil" className={cn(styles.mobileOnly, styles.focusable)} data-patient-account-link aria-label={labels.account}><PatientIcon name="perfil" /><span>{labels.account}</span></Link>
      <div data-patient-desktop className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="hidden max-w-52 truncate text-xs text-slate-600 sm:block">{privyEmail(user)}</span>
        <button disabled={logoutBusy} onClick={() => void signOut()} className={cn(styles.focusable, 'min-h-11 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-50')}>{logoutBusy ? labels.signingOut : labels.signOut}</button>
        {logoutError && <p role="alert" className="text-sm text-rose-800">{labels.signOutError}</p>}
      </div>
    </div></header>
    <div className="mx-auto max-w-6xl px-4 py-6 md:flex md:gap-8 md:px-6">
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-600">{labels.portal}</p>
          <Suspense><Navigation /></Suspense>
        </div>
      </aside>
      <main className={cn(styles.shellMain, 'min-w-0 flex-1 md:pb-6')}>
        {children}
        <Suspense><AccountActions>
          <button disabled={logoutBusy} onClick={() => void signOut()} className={cn(styles.focusable, 'min-h-11 w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50')}>{logoutBusy ? labels.signingOut : labels.signOut}</button>
          {logoutError && <p role="alert" className="mt-3 text-sm text-rose-800">{labels.signOutError}</p>}
        </AccountActions></Suspense>
      </main>
    </div>
    <div data-patient-navigation className={cn(styles.mobileNav, 'fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 md:hidden')}>
      <Suspense><Navigation mobile /></Suspense>
    </div>
  </div></WalletBoundary>;
}
