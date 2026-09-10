'use client';
import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { privyEmail } from '@/lib/auth/privy-email';
import { WalletBoundary } from '@/components/private-portal/WalletBoundary';
const tabs = [{ id: 'inicio', label: 'Inicio' }, { id: 'consultas', label: 'Consultas' }, { id: 'recetas', label: 'Recetas' }, { id: 'perfil', label: 'Mi cuenta' }];
function Navigation({ mobile = false }: { mobile?: boolean }) {
  const current = useSearchParams().get('tab') ?? 'inicio';
  return <nav aria-label={mobile ? 'Menú móvil del paciente' : 'Menú del paciente'} className={mobile ? 'flex justify-around gap-1 p-2' : 'space-y-1 p-2'}>{tabs.map(tab => <Link key={tab.id} href={`/patient?tab=${tab.id}`} aria-current={current === tab.id ? 'page' : undefined} className={`${mobile ? 'flex-1 text-center' : 'block'} rounded-xl px-3 py-3 text-sm font-medium ${current === tab.id ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>{tab.label}</Link>)}</nav>;
}
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const router = useRouter();
  useEffect(() => { if (ready && !authenticated) router.replace('/login?role=patient'); }, [ready, authenticated, router]);
  if (!ready || !authenticated) return <p role="status" className="p-8 text-center text-sm text-slate-500">Verificando acceso…</p>;
  return <WalletBoundary key={user?.id}><div className="min-h-screen bg-[#f8fafc]">
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur-sm"><div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500 text-xs font-bold text-white">T</span><span className="text-slate-900">Trust<span className="text-sky-500">Leaf</span></span></Link>
      <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Paciente · Stellar Testnet</span>
      <div className="flex min-w-0 items-center gap-3"><span className="hidden max-w-52 truncate text-xs text-slate-500 sm:block">{privyEmail(user)}</span><button onClick={() => void logout()} className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600">Cerrar sesión</button></div>
    </div></header>
    <div className="mx-auto max-w-6xl px-4 py-6 md:flex md:gap-8"><aside className="hidden w-56 shrink-0 md:block"><div className="sticky top-24 rounded-2xl border border-slate-200 bg-white shadow-sm"><p className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Mi portal</p><Suspense><Navigation /></Suspense></div></aside><main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main></div>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white md:hidden"><Suspense><Navigation mobile /></Suspense></div>
  </div></WalletBoundary>;
}
