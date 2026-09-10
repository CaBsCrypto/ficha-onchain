'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { usePrivyEmail } from '@/hooks/usePrivyEmail';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { WalletBoundary } from '@/components/private-portal/WalletBoundary';

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
    { href: '/doctor?tab=recetas', label: 'Recetas', icon: <IconRx className="h-5 w-5" />, tab: 'recetas' },
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
function DoctorShell({ children, authorization }: { children: React.ReactNode; authorization: PrivateDoctorStatus }) {
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
          <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Autorización confirmada · Stellar Testnet</p>
            <p className="mt-1">Vigente hasta {new Date((authorization.authorization.validUntil ?? 0) * 1000).toLocaleString('es-CL')}.</p>
            {authorization.pendingRequest && ['pending', 'submitted'].includes(authorization.pendingRequest.state) && <p className="mt-1">Hay una solicitud administrativa pendiente de confirmación.</p>}
          </div>
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

// ── Minimal shell for the pre-portal screens (registro / pendiente) ────────────
function GateShell({ children }: { children: React.ReactNode }) {
  const { logout } = usePrivy();
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500 text-white shadow-sm"><span className="text-xs font-bold">T</span></span>
            <span className="text-slate-900">Trust<span className="text-sky-500">Leaf</span></span>
          </Link>
          <button onClick={() => void logout()} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600">Cerrar sesión</button>
        </div>
      </header>
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-12">{children}</div>
    </div>
  );
}

type OnboardingState = 'invited' | 'draft' | 'submitted' | 'changes_requested' | 'rejected' | 'authorization_pending' | 'authorized' | 'expired' | 'revoked';
interface OnboardingView {
  id: string; source: 'application' | 'invitation'; state: OnboardingState; reviewNote: string | null;
  profile: null | { name: string; specialty: string; licenseNum: string; rut: string };
}

function DoctorOnboarding({ email, onDone }: { email: string; onDone: () => void }) {
  const [onboarding, setOnboarding] = useState<OnboardingView | null>(null);
  const [form, setForm] = useState({ name: '', specialty: '', licenseNum: '', rut: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const accepting = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await authedFetch('/api/doctor/onboarding', { cache: 'no-store' });
      const body = await response.json() as { onboarding?: OnboardingView | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'doctor_onboarding_unavailable');
      if (body.onboarding?.state === 'invited' && !accepting.current) {
        accepting.current = true;
        const accepted = await authedFetch('/api/doctor/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept_invitation' }) });
        const acceptedBody = await accepted.json() as { onboarding?: OnboardingView; error?: string };
        if (!accepted.ok || !acceptedBody.onboarding) throw new Error(acceptedBody.error ?? 'invitation_not_acceptable');
        body.onboarding = acceptedBody.onboarding;
        accepting.current = false;
      }
      setOnboarding(body.onboarding ?? null);
      if (body.onboarding?.profile) setForm({
        name: body.onboarding.profile.name ?? '', specialty: body.onboarding.profile.specialty ?? '',
        licenseNum: body.onboarding.profile.licenseNum ?? '', rut: body.onboarding.profile.rut ?? '',
      });
      if (body.onboarding?.state === 'authorized') onDone();
    } catch (cause) { accepting.current = false; setError(cause instanceof Error ? cause.message : 'doctor_onboarding_unavailable'); }
    finally { setLoading(false); }
  }, [onDone]);
  useEffect(() => { void load(); }, [load]);
  async function submit(action: 'save' | 'submit') {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const response = await authedFetch('/api/doctor/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...form }) });
      const body = await response.json() as { onboarding?: OnboardingView; error?: string };
      if (!response.ok || !body.onboarding) throw new Error(body.error ?? 'doctor_onboarding_unavailable');
      setOnboarding(body.onboarding);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'doctor_onboarding_unavailable'); }
    finally { setSaving(false); }
  }
  const state = onboarding?.state;
  const editable = !state || state === 'draft' || state === 'changes_requested';
  const profileComplete = Object.values(form).every(value => value.trim().length > 0);
  return (
    <GateShell>
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-800">Alta médica en TrustLeaf</h1>
        <p className="mt-2 break-all text-sm font-medium text-slate-700">{email}</p>
        {loading && <p role="status" className="mt-4 text-sm text-slate-600">Preparando tu identidad y wallet Stellar…</p>}
        {!loading && onboarding?.source === 'invitation' && <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">Invitación reconocida. Tu wallet Stellar quedó vinculada a esta cuenta.</p>}
        {!loading && editable && <div className="mt-5 space-y-4">
          <p className="text-sm text-slate-600">Completa el perfil con datos sintéticos. Enviar la solicitud no concede autorización.</p>
          {state === 'changes_requested' && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">El administrador solicitó cambios{onboarding?.reviewNote ? `: ${onboarding.reviewNote}` : '.'}</p>}
          {([['name','Nombre de prueba'],['specialty','Especialidad de prueba'],['licenseNum','Registro de prueba'],['rut','RUT sintético']] as const).map(([key,label]) => <label key={key} className="block text-xs font-medium text-slate-600">
            <span className="mb-1.5 block">{label}</span><input required value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30" />
          </label>)}
          <div className="flex flex-wrap gap-3"><button disabled={saving || !profileComplete} onClick={() => void submit('save')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">Guardar perfil</button><button disabled={saving || !profileComplete} onClick={() => void submit('submit')} className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Enviar para revisión'}</button></div>
        </div>}
        {!loading && state === 'submitted' && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><strong>Solicitud enviada.</strong> El administrador debe revisar el expediente sintético antes de autorizar.</p>}
        {!loading && state === 'authorization_pending' && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><strong>Autorización pendiente en Stellar.</strong> El acceso se habilitará cuando el worker confirme el recibo.</p>}
        {!loading && state === 'rejected' && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800"><strong>Solicitud rechazada.</strong> El administrador debe reabrirla antes de que puedas corregirla.{onboarding?.reviewNote ? ` Motivo: ${onboarding.reviewNote}` : ''}</p>}
        {!loading && state === 'expired' && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">La invitación venció. Solicita al administrador una nueva invitación.</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">No se pudo completar el alta: {error}</p>}
        {!editable && <button onClick={() => void load()} className="mt-5 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600">Comprobar estado</button>}
        <p className="mt-4 text-xs text-slate-500">Una wallet Stellar por persona · Privy · Stellar Testnet</p>
      </div>
    </GateShell>
  );
}

// ── Status screens (pending / blocked) ─────────────────────────────────────────
function StatusScreen({ variant, onRefresh }: { variant: 'pending' | 'expired' | 'revoked' | 'paused' | 'error'; onRefresh: () => void }) {
  const descriptions = {
    pending: ['Autorización pendiente', 'La autorización del administrador debe confirmarse en Stellar antes de habilitar tu acceso. Si el procesador está apagado, la solicitud permanece pendiente.'],
    expired: ['Autorización vencida', 'Solicita al administrador la renovación. Tu acceso se habilitará cuando se confirme en Stellar.'],
    revoked: ['Autorización revocada', 'El registro confirma que tu permiso fue revocado. Contacta al administrador para revisar tu autorización.'],
    paused: ['Registro pausado', 'El registro de médicos está pausado. Las operaciones permanecen deshabilitadas.'],
    error: ['No pudimos verificar tu autorización', 'Las operaciones permanecen bloqueadas hasta recuperar la conexión y comprobar tu autorización. Puedes volver a consultar el estado.'],
  } as const;
  const [title, description] = descriptions[variant];
  return (
    <GateShell>
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className={cn('mx-auto flex h-12 w-12 items-center justify-center rounded-full', variant === 'pending' ? 'bg-amber-100' : 'bg-rose-100')}>
          <span aria-hidden="true" className="text-2xl">{variant === 'pending' ? '⏳' : '🚫'}</span>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-800">{title}</h1>
        <p role="status" className="mt-2 text-sm text-slate-500">{description}</p>
          <button onClick={onRefresh} className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-sky-300 hover:text-sky-600">
            Comprobar estado
          </button>
        <p className="mt-4 text-xs text-slate-400">DoctorRegistryPrivate · Stellar Testnet</p>
      </div>
    </GateShell>
  );
}

// ── Access gate: registro → pendiente → portal ─────────────────────────────────
type DocStatus = 'loading' | 'onboarding' | 'pending' | 'active' | 'expired' | 'revoked' | 'paused' | 'error';
interface PrivateDoctorStatus {
  authorized: boolean;
  source: 'private_registry';
  wallet: string;
  doctor: { id: number; name: string; email: string } | null;
  authorization: { status: 'unregistered' | 'authorized' | 'expired' | 'revoked' | 'paused'; version: number; validUntil: number | null };
  pendingRequest?: { state: string } | null;
  onboarding?: { state: OnboardingState; source: 'application' | 'invitation' } | null;
}

function DoctorAccessGate({ children }: { children: React.ReactNode }) {
  const email = usePrivyEmail();
  const [status, setStatus] = useState<DocStatus>('loading');
  const [record, setRecord] = useState<PrivateDoctorStatus | null>(null);
  const [refresh, setRefresh] = useState(0);
  const check = useCallback(() => { setStatus('loading'); setRefresh((value) => value + 1); }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await authedFetch('/api/doctor-status', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('authorization_unavailable');
        const body = await response.json() as PrivateDoctorStatus;
        if (body.source !== 'private_registry' || !body.authorization) throw new Error('authorization_unverified');
        if (!alive) return;
        setRecord(body);
        if (body.onboarding && !['authorized','revoked'].includes(body.onboarding.state)) setStatus('onboarding');
        else if (!body.doctor || (body.authorization.status === 'unregistered' && !body.pendingRequest)) setStatus('onboarding');
        else if (body.authorized && body.wallet && body.authorization.status === 'authorized' && (body.authorization.validUntil ?? 0) * 1000 > Date.now()) setStatus('active');
        else if (['expired', 'revoked', 'paused'].includes(body.authorization.status)) setStatus(body.authorization.status as 'expired' | 'revoked' | 'paused');
        else setStatus('pending');
      } catch {
        if (alive) { setRecord(null); setStatus('error'); }
      } finally {
        if (alive) timer = setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [email, refresh]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }
  if (status === 'onboarding') return <DoctorOnboarding email={email ?? ''} onDone={check} />;
  if (status !== 'active' || !record) return <StatusScreen variant={status === 'active' ? 'error' : status} onRefresh={check} />;
  return <DoctorShell authorization={record}>{children}</DoctorShell>;
}

// ── Layout (default export) ───────────────────────────────────────────────────
export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) router.replace('/login?role=doctor');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  return <WalletBoundary key={user?.id}><DoctorAccessGate>{children}</DoctorAccessGate></WalletBoundary>;
}
