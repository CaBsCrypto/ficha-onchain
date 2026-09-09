import Link from 'next/link';
import { Navbar } from '@/components/landing/Navbar';
export default function Home() {
  return <><Navbar /><main className="relative flex-1 overflow-hidden bg-grid px-6 pb-16 pt-28 sm:pt-36"><div aria-hidden className="pointer-events-none absolute inset-0 bg-spotlight" /><div className="relative mx-auto max-w-6xl">
    <span className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Stellar Testnet · Datos sintéticos</span>
    <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-6xl">Tu consulta.<br /><span className="text-gradient">Tu receta privada.</span></h1>
    <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">Accede con Privy, confirma tus acciones dentro de TrustLeaf y consulta tus recetas. Tu wallet Stellar firma y TrustLeaf cubre las comisiones.</p>
    <div className="mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
      <Link href="/login?role=patient" className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:border-sky-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Paciente</p><h2 className="mt-2 text-2xl font-semibold text-slate-900">Mis consultas y recetas</h2><p className="mt-3 text-sm leading-6 text-slate-500">Reserva una consulta, confirma asistencia, autoriza una emisión y abre tu documento privado.</p><span className="mt-6 inline-block rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Ingresar como paciente →</span></Link>
      <Link href="/login?role=doctor" className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:border-sky-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-widest text-sky-600">Médico</p><h2 className="mt-2 text-2xl font-semibold text-slate-900">Mi agenda y emisiones</h2><p className="mt-3 text-sm leading-6 text-slate-500">Consulta tu autorización, inicia la consulta y emite, activa o revoca recetas con tu propia firma.</p><span className="mt-6 inline-block rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white">Ingresar como médico →</span></Link>
    </div>
    <p className="mt-8 max-w-2xl text-sm leading-6 text-slate-500">Demostración técnica con cuentas de prueba. Solo DoctorRegistryPrivate y PrescriptionPrivate v2. El documento se guarda cifrado; los estados y recibos de Stellar son públicos.</p>
    <Link href="/login?role=admin" className="mt-5 inline-block text-sm font-medium text-sky-700 underline">Acceso de administración</Link>
  </div></main></>;
}
