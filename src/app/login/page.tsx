'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { rolePath } from '@/components/private-portal/state';
import { useLanguage } from '@/hooks/useLanguage';
import { PageTitle } from '@/components/PageTitle';
import { cn } from '@/lib/utils';
import type { Language } from '@/types';
import { privyEmail } from '@/lib/auth/privy-email';

function LangSwitch() {
  const { lang, setLang } = useLanguage();
  const options: Language[] = ['en', 'es'];
  return (
    <div className="flex items-center rounded-full border border-slate-200 bg-white/80 p-0.5 text-xs font-medium backdrop-blur-sm">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => setLang(opt)}
          aria-pressed={lang === opt}
          className={cn(
            'rounded-full px-2.5 py-1 uppercase transition-colors',
            lang === opt ? 'bg-clinical text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

const ROLE_CONFIG = {
  patient: {
    badge: { es: 'Portal del Paciente', en: 'Patient Portal' },
    title: { es: 'Tus consultas y recetas privadas', en: 'Your consultations & private prescriptions' },
    subtitle: {
      es: 'Accede a tu historial médico, gestiona consentimientos y abre tus documentos clínicos cifrados.',
      en: 'Access your medical history, manage consents, and open your encrypted clinical documents.'
    },
    accentClass: 'text-emerald-600',
    bgBadgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    borderActive: 'border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-700 bg-emerald-50/50',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25',
    glowColor: 'from-emerald-500/10 via-teal-500/5 to-transparent',
    features: [
      {
        title: { es: 'Control total de tu consentimiento', en: 'Complete consent control' },
        desc: {
          es: 'Tú autorizas cada emisión de receta directamente con tu wallet Stellar integrada.',
          en: 'You authorize every prescription issuance directly with your integrated Stellar wallet.'
        }
      },
      {
        title: { es: 'Documentos clínicos cifrados', en: 'Encrypted clinical documents' },
        desc: {
          es: 'Solo tú y el médico emisor pueden acceder a tus documentos privados desde TrustLeaf.',
          en: 'Only you and the prescribing doctor can access your private documents through TrustLeaf.'
        }
      },
      {
        title: { es: 'Cero costos de red', en: 'Zero network fees' },
        desc: {
          es: 'TrustLeaf cubre el 100% de las comisiones de transacción en Stellar Testnet.',
          en: 'TrustLeaf sponsors 100% of network transaction fees on Stellar Testnet.'
        }
      }
    ]
  },
  doctor: {
    badge: { es: 'Portal Médico Profesional', en: 'Professional Doctor Portal' },
    title: { es: 'Gestión clínica y emisión on-chain', en: 'Clinical management & on-chain issuance' },
    subtitle: {
      es: 'Consulta tu acreditación médica, gestiona tu agenda e inicia consultas con emisión privada y segura.',
      en: 'Check your medical authorization, manage your schedule, and issue private on-chain prescriptions.'
    },
    accentClass: 'text-sky-600',
    bgBadgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    borderActive: 'border-sky-500 ring-2 ring-sky-500/20 text-sky-700 bg-sky-50/50',
    buttonClass: 'bg-sky-600 hover:bg-sky-700 shadow-sky-600/25',
    glowColor: 'from-sky-500/10 via-blue-500/5 to-transparent',
    features: [
      {
        title: { es: 'Acreditación verificada en Stellar', en: 'Verified accreditation on Stellar' },
        desc: {
          es: 'Tu registro profesional se valida contra el smart contract DoctorRegistryPrivate.',
          en: 'Your professional credentials are validated against DoctorRegistryPrivate contract.'
        }
      },
      {
        title: { es: 'Emisión, activación y revocación', en: 'Issuance, activation & revocation' },
        desc: {
          es: 'Firma con tu wallet propietaria manteniendo el secreto médico y la trazabilidad legal.',
          en: 'Sign with your owner wallet while preserving medical privacy and legal traceability.'
        }
      },
      {
        title: { es: 'Agenda y consultas coordinadas', en: 'Coordinated schedule & consultations' },
        desc: {
          es: 'Confirmación de asistencia y atestación de reservas sincronizadas en tiempo real.',
          en: 'Real-time synchronized attendance confirmation and booking attestation.'
        }
      }
    ]
  },
  admin: {
    badge: { es: 'Administración & Registro', en: 'Administration & Registry' },
    title: { es: 'Gobernanza y control médico', en: 'Governance & medical verification' },
    subtitle: {
      es: 'Autoriza médicos en el registro on-chain, audita postulaciones y gestiona el ecosistema seguro.',
      en: 'Authorize doctors on-chain, audit applications, and manage the secure clinical ecosystem.'
    },
    accentClass: 'text-indigo-600',
    bgBadgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    borderActive: 'border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-700 bg-indigo-50/50',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25',
    glowColor: 'from-indigo-500/10 via-purple-500/5 to-transparent',
    features: [
      {
        title: { es: 'Autorización on-chain de profesionales', en: 'On-chain doctor authorization' },
        desc: {
          es: 'Aprobación mediante contratos inteligentes con vigencia y posibilidad de revocación.',
          en: 'Smart contract approvals with verifiable expiration and revocation capabilities.'
        }
      },
      {
        title: { es: 'Revisión de expedientes cifrados', en: 'Encrypted dossier review' },
        desc: {
          es: 'Acceso exclusivo al proceso administrativo sin comprometer el secreto médico de los pacientes.',
          en: 'Administrative workflow access without compromising patient clinical privacy.'
        }
      },
      {
        title: { es: 'Monitoreo de transacciones Stellar', en: 'Stellar transaction monitoring' },
        desc: {
          es: 'Trazabilidad de atestaciones, registros y operaciones del worker en Testnet.',
          en: 'Full traceability of attestations, registrations, and worker operations on Testnet.'
        }
      }
    ]
  }
} as const;

type RoleKey = keyof typeof ROLE_CONFIG;

function LoginContent() {
  const params = useSearchParams();
  const rawRole = params.get('role');
  const activeRole: RoleKey = rawRole === 'doctor' ? 'doctor' : rawRole === 'admin' ? 'admin' : 'patient';
  
  const router = useRouter();
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { lang } = useLanguage();
  const destination = rolePath(activeRole);

  const [changingAccount, setChangingAccount] = useState(false);
  const [accessError, setAccessError] = useState(false);
  async function changeAccount() {
    setChangingAccount(true); setAccessError(false);
    try { await logout(); }
    catch { setAccessError(true); }
    finally { setChangingAccount(false); }
  }

  const config = ROLE_CONFIG[activeRole];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      <PageTitle title={lang === 'es' ? 'Acceso a TrustLeaf' : 'TrustLeaf sign in'} />
      {/* Dynamic Background Glow */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-radial opacity-70 transition-all duration-700',
          config.glowColor
        )}
      />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />

      {/* Header */}
      <header className="relative z-10 border-b border-slate-200/60 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-white shadow-sm shadow-clinical/30">
              <span className="text-sm font-bold">T</span>
            </span>
            <span className="text-ink">
              Trust<span className="text-clinical">Leaf</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-medium text-slate-500 hover:text-slate-800 sm:text-sm"
            >
              {lang === 'es' ? '← Volver al inicio' : '← Back to Home'}
            </Link>
            <LangSwitch />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10 sm:py-16">
        {/* Role Selector Tabs */}
        <div className="mx-auto mb-10 flex max-w-md justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur-sm">
          <Link
            href="/login?role=patient"
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:text-sm',
              activeRole === 'patient'
                ? ROLE_CONFIG.patient.borderActive
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <span>🧑‍💼</span>
            <span>{lang === 'es' ? 'Paciente' : 'Patient'}</span>
          </Link>
          <Link
            href="/login?role=doctor"
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:text-sm',
              activeRole === 'doctor'
                ? ROLE_CONFIG.doctor.borderActive
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <span>🧑‍⚕️</span>
            <span>{lang === 'es' ? 'Médico' : 'Doctor'}</span>
          </Link>
          <Link
            href="/login?role=admin"
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:text-sm',
              activeRole === 'admin'
                ? ROLE_CONFIG.admin.borderActive
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <span>⚙️</span>
            <span>{lang === 'es' ? 'Admin' : 'Admin'}</span>
          </Link>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left Column: Role Details & Benefits */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-semibold shadow-2xs backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clinical opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-clinical" />
              </span>
              <span className={config.accentClass}>{config.badge[lang]}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">Stellar Testnet</span>
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              {config.title[lang]}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
              {config.subtitle[lang]}
            </p>

            {/* Feature Highlights */}
            <div className="mt-8 space-y-4">
              {config.features.map((feature, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3.5 rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-2xs backdrop-blur-xs transition-all hover:bg-white"
                >
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{feature.title[lang]}</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">{feature.desc[lang]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Interactive Login Box */}
          <div className="lg:col-span-5">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/95 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {lang === 'es' ? 'Acceso Seguro' : 'Secure Login'}
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    {lang === 'es' ? 'Iniciar Sesión' : 'Sign In'}
                  </h3>
                </div>
                <div className={cn('grid h-11 w-11 place-items-center rounded-2xl border text-xl shadow-inner', config.bgBadgeClass)}>
                  {activeRole === 'doctor' ? '🩺' : activeRole === 'admin' ? '🛡️' : '📋'}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <p className="text-xs leading-relaxed text-slate-500 sm:text-sm">
                  {lang === 'es'
                    ? 'Ingresa mediante tu correo electrónico con Privy. TrustLeaf crea o recupera tu misma wallet Stellar.'
                    : 'Sign in with your email via Privy. TrustLeaf creates or recovers your same Stellar wallet.'}
                </p>

                {ready && authenticated && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-medium">{lang === 'es' ? 'Cuenta actual' : 'Current account'}</p>
                  <p className="mt-1 break-all">{privyEmail(user) ?? (lang === 'es' ? 'Cuenta de Privy' : 'Privy account')}</p>
                  <p className="mt-2 text-xs text-slate-500">{lang === 'es' ? 'Elegir un portal no cambia tu cuenta ni concede permisos.' : 'Choosing a portal does not change your account or grant permissions.'}</p>
                </div>}
                {accessError && <p role="alert" className="text-sm text-rose-700">{lang === 'es' ? 'No pudimos cerrar la sesión. Vuelve a intentarlo antes de cambiar de cuenta.' : 'We could not sign out. Try again before changing accounts.'}</p>}

                {/* Primary Action Button */}
                <button
                  disabled={!ready || changingAccount}
                  onClick={() => authenticated ? router.replace(destination) : login()}
                  className={cn(
                    'group relative flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-semibold text-white shadow-lg transition-all duration-200 disabled:opacity-50',
                    config.buttonClass
                  )}
                >
                  {authenticated ? (
                    <>
                      <span>{lang === 'es' ? 'Continuar con esta cuenta' : 'Continue with this account'}</span>
                    </>
                  ) : ready ? (
                    <>
                      <span>{lang === 'es' ? 'Continuar con Privy' : 'Continue with Privy'}</span>
                      <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{lang === 'es' ? 'Preparando entorno…' : 'Preparing environment…'}</span>
                    </>
                  )}
                </button>
                {ready && authenticated && <button disabled={changingAccount} onClick={() => void changeAccount()} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
                  {changingAccount ? (lang === 'es' ? 'Cerrando sesión…' : 'Signing out…') : (lang === 'es' ? 'Cambiar de cuenta' : 'Change account')}
                </button>}
              </div>

              {/* Security & Gas Sponsorship Pill */}
              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 text-clinical">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div className="text-xs text-slate-500">
                    <p className="font-semibold text-slate-700">
                      {lang === 'es' ? 'Firma soberana y comisiones cubiertas' : 'Sovereign signing & covered fees'}
                    </p>
                    <p className="mt-0.5 leading-relaxed">
                      {lang === 'es'
                        ? 'Tus firmas son soberanas con tu wallet. TrustLeaf cubre el costo de las operaciones en Stellar Testnet.'
                        : 'Your signatures remain sovereign with your wallet. TrustLeaf sponsors Stellar Testnet operation costs.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick switch footer */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                <span>{lang === 'es' ? '¿Otro rol?' : 'Different role?'}</span>
                <div className="flex gap-3">
                  <Link href="/login?role=patient" className="hover:text-emerald-700 hover:underline">
                    {lang === 'es' ? 'Paciente' : 'Patient'}
                  </Link>
                  <Link href="/login?role=doctor" className="hover:text-sky-700 hover:underline">
                    {lang === 'es' ? 'Médico' : 'Doctor'}
                  </Link>
                  <Link href="/login?role=admin" className="hover:text-indigo-700 hover:underline">
                    {lang === 'es' ? 'Admin' : 'Admin'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <svg className="h-5 w-5 animate-spin text-clinical" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Preparando acceso…</span>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

