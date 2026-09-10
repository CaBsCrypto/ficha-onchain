'use client';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { privyEmail } from '@/lib/auth/privy-email';
import { usePortalWallet } from './WalletBoundary';
import type { PortalRole } from './types';

export function PortalIdentity({ role }: { role: PortalRole }) {
  const { user } = usePrivy();
  const wallet = usePortalWallet();
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-xl font-semibold text-slate-900">Mi cuenta</h1>
    <p className="mt-3 break-all text-sm text-slate-700">{privyEmail(user)}</p>
    <p className="mt-1 text-sm text-slate-500">Portal {role === 'doctor' ? 'médico' : 'del paciente'} · Stellar Testnet</p>
    <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer font-medium">Mi wallet Stellar</summary><p className="mt-2 break-all font-mono text-xs">{wallet.address}</p><p className="mt-2">Privy recupera esta misma cuenta al iniciar sesión. No necesitas comprar XLM.</p></details>
  </section>;
}
export function PortalHome({ role }: { role: PortalRole }) {
  const base = role === 'doctor' ? '/doctor' : '/patient';
  return <div className="space-y-5">
    <PortalIdentity role={role} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href={`${base}?tab=consultas`} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-sky-300"><h2 className="font-semibold text-slate-800">Mis consultas</h2><p className="mt-2 text-sm text-slate-500">{role === 'doctor' ? 'Inicia la consulta y prepara la receta para el paciente correcto.' : 'Reserva, confirma tu asistencia y autoriza por separado una emisión.'}</p></Link>
      <Link href={`${base}?tab=recetas`} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-sky-300"><h2 className="font-semibold text-slate-800">Mis recetas</h2><p className="mt-2 text-sm text-slate-500">{role === 'doctor' ? 'Consulta el estado, activa y revoca tus recetas con tu firma.' : 'Consulta sus estados y abre tus documentos privados.'}</p></Link>
    </div>
    {role === 'doctor' && <Link href="/doctor?tab=disponibilidad" className="inline-block rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700">Configurar mi disponibilidad</Link>}
    <p className="text-xs text-slate-500">Entorno de prueba con datos sintéticos. Tus confirmaciones se firman con Privy y TrustLeaf cubre las comisiones.</p>
  </div>;
}
