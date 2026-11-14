'use client';
import Link from 'next/link';
import { PatientIcon } from './PatientIcon';
import styles from './patient-mobile.module.css';
import { usePrivy } from '@privy-io/react-auth';
import { usePortalLanguage } from '@/hooks/useLanguage';
import { privyEmail } from '@/lib/auth/privy-email';
import { usePortalWallet } from './WalletBoundary';
import type { PortalRole } from './types';

export function PortalIdentity({ role }: { role: PortalRole }) {
  const english = usePortalLanguage() === 'en';
  const { user } = usePrivy();
  const wallet = usePortalWallet();
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-xl font-semibold text-slate-900">{english ? 'My account' : 'Mi cuenta'}</h1>
    <p className="mt-3 break-all text-sm text-slate-700">{privyEmail(user)}</p>
    <p className="mt-1 text-sm text-slate-500">{english ? (role === 'doctor' ? 'Doctor portal' : 'Patient portal') : (role === 'doctor' ? 'Portal médico' : 'Portal del paciente')} · Stellar Testnet</p>
    <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer font-medium">{english ? 'My Stellar wallet' : 'Mi wallet Stellar'}</summary><p className="mt-2 break-all font-mono text-xs">{wallet.address}</p><p className="mt-2">{english ? 'Privy restores this account when you sign in. TrustLeaf covers Testnet fees.' : 'Privy recupera esta misma cuenta al iniciar sesión. No necesitas comprar XLM.'}</p></details>
  </section>;
}
export function PortalHome({ role }: { role: PortalRole }) {
  const english = usePortalLanguage() === 'en';
  const base = role === 'doctor' ? '/doctor' : '/patient';
  return <>
    {role === 'patient' && <section className={styles.mobileOnly}>
      <div data-patient-home>
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sky-700">{english ? 'Your portal · Testnet' : 'Tu portal · Testnet'}</p><h1>{english ? 'Your care portal' : 'Tu espacio de atención'}</h1><p className="mt-3 text-base text-slate-600">{english ? 'Find your appointments and prescriptions in one place.' : 'Tus consultas y recetas, en un solo lugar.'}</p></div>
        <Link href="/patient?tab=consultas" data-patient-home-card><span><PatientIcon name="consultas" /></span><div><h2>{english ? 'My appointments' : 'Mis consultas'}</h2><p>{english ? 'Book a time and review your appointments.' : 'Reserva un horario y revisa tu atención.'}</p></div><span aria-hidden="true">→</span></Link>
        <Link href="/patient?tab=recetas" data-patient-home-card><span><PatientIcon name="recetas" /></span><div><h2>{english ? 'My prescriptions' : 'Mis recetas'}</h2><p>{english ? 'Open your documents and check their status.' : 'Abre tus documentos y consulta su estado.'}</p></div><span aria-hidden="true">→</span></Link>
        <Link href="/patient?tab=historial" data-patient-home-card><span><PatientIcon name="historial" /></span><div><h2>{english ? 'Clinical record' : 'Ficha clínica'}</h2><p>{english ? 'Review your entries, files and permissions.' : 'Consulta tus antecedentes, archivos y permisos.'}</p></div><span aria-hidden="true">→</span></Link>
        <p className="text-xs leading-5">{english ? 'Synthetic data · For testing only · Stellar Testnet' : 'Datos sintéticos · Sin uso clínico · Stellar Testnet'}</p>
      </div>
    </section>}
    <div data-patient-desktop={role === 'patient' ? '' : undefined} className="space-y-5">
    <PortalIdentity role={role} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href={`${base}?tab=consultas`} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-sky-300"><h2 className="font-semibold text-slate-800">{english ? 'My appointments' : 'Mis consultas'}</h2><p className="mt-2 text-sm text-slate-500">{role === 'doctor' ? (english ? 'Start an appointment and prepare the prescription for the right patient.' : 'Inicia la consulta y prepara la receta para el paciente correcto.') : (english ? 'Book an appointment, confirm attendance and authorize prescription issuance separately.' : 'Reserva, confirma tu asistencia y autoriza por separado una emisión.')}</p></Link>
      <Link href={`${base}?tab=recetas`} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-sky-300"><h2 className="font-semibold text-slate-800">{english ? 'My prescriptions' : 'Mis recetas'}</h2><p className="mt-2 text-sm text-slate-500">{role === 'doctor' ? (english ? 'Check your prescriptions, then sign to activate or revoke them.' : 'Consulta el estado, activa y revoca tus recetas con tu firma.') : (english ? 'Check the status and open your private documents.' : 'Consulta sus estados y abre tus documentos privados.')}</p></Link>
    </div>
    {role === 'patient' && <Link href="/patient?tab=historial" className="block rounded-2xl border border-sky-200 bg-white p-6 shadow-sm hover:border-sky-400"><h2 className="font-semibold text-slate-800">{english ? 'Clinical record' : 'Ficha clínica'}</h2><p className="mt-2 text-sm text-slate-500">{english ? 'Review your entries, files, versions and doctor permissions.' : 'Consulta tus antecedentes, archivos, versiones y permisos para médicos.'}</p></Link>}
    {role === 'doctor' && <Link href="/doctor?tab=disponibilidad" className="inline-block rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700">{english ? 'Set my availability' : 'Configurar mi disponibilidad'}</Link>}
    <p className="text-xs text-slate-500">{english ? 'This test environment uses synthetic data. You sign confirmations with Privy, and TrustLeaf covers Testnet fees.' : 'Entorno de prueba con datos sintéticos. Tus confirmaciones se firman con Privy y TrustLeaf cubre las comisiones.'}</p>
  </div></>;
}
