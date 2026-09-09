'use client';
import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { rolePath } from '@/components/private-portal/state';

function LoginContent() {
  const params = useSearchParams();
  const role = params.get('role');
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const destination = rolePath(role);
  useEffect(() => { if (ready && authenticated) router.replace(destination); }, [ready, authenticated, router, destination]);
  const label = role === 'doctor' ? 'médico' : role === 'admin' ? 'administrador' : 'paciente';
  return <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
    <Link href="/" className="text-xl font-semibold text-slate-900">Trust<span className="text-sky-600">Leaf</span></Link>
    <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-sky-700">Stellar Testnet · Datos de prueba</p>
    <h1 className="mt-2 text-2xl font-semibold text-slate-900">Ingresar como {label}</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">Accede con tu correo mediante Privy. Conservas tu propia cuenta Stellar y TrustLeaf paga las comisiones.</p>
    <button disabled={!ready || authenticated} onClick={login} className="mt-6 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40">{authenticated ? 'Abriendo tu portal…' : ready ? 'Continuar con Privy' : 'Preparando acceso…'}</button>
    <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500"><Link href="/login?role=patient" className="underline">Paciente</Link><Link href="/login?role=doctor" className="underline">Médico</Link><Link href="/login?role=admin" className="underline">Administrador</Link></div>
  </section></main>;
}
export default function LoginPage() { return <Suspense fallback={<p className="p-8 text-sm text-slate-500">Preparando acceso…</p>}><LoginContent /></Suspense>; }
