'use client';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
export function Navbar() {
  const { authenticated, logout } = usePrivy();
  return <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/60 bg-white/90 backdrop-blur-sm"><nav aria-label="Acceso a TrustLeaf" className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-sm text-white shadow-sm">T</span><span className="text-ink">Trust<span className="text-clinical">Leaf</span></span></Link>
    <div className="flex items-center gap-3 text-sm font-medium"><Link href="/login?role=patient" className="text-slate-600 hover:text-sky-700">Paciente</Link><Link href="/login?role=doctor" className="text-slate-600 hover:text-sky-700">Médico</Link>{authenticated && <button onClick={() => void logout()} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50">Salir</button>}</div>
  </nav></header>;
}
