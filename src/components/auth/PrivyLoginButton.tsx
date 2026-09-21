'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogin, useModalStatus, usePrivy } from '@privy-io/react-auth';
import { useLanguage } from '@/hooks/useLanguage';
import { useTrackUser } from '@/hooks/useTrackUser';

export function PrivyLoginButton() {
  const { ready, authenticated, logout } = usePrivy();
  const { isOpen } = useModalStatus();
  const router = useRouter();
  const { lang } = useLanguage();
  useTrackUser();
  const trigger = useRef<HTMLButtonElement>(null);
  const requested = useRef(false);
  const wasOpen = useRef(false);
  const restoreFocus = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const labels = {
    pt: { signIn:'Entrar', portal:'Ir ao meu portal', signOut:'Sair', error:'Não foi possível concluir. Tente novamente.' },
    en: { signIn:'Sign in', portal:'Go to my portal', signOut:'Sign out', error:'Could not complete the request. Please try again.' },
    es: { signIn:'Iniciar sesión', portal:'Ir a mi portal', signOut:'Cerrar sesión', error:'No se pudo completar la solicitud. Vuelve a intentarlo.' },
  }[lang];
  const { login } = useLogin({
    onComplete: () => {
      if (!requested.current) return;
      requested.current = false;
      router.replace('/patient');
    },
    onError: (code) => {
      requested.current = false;
      setBusy(false);
      setError(code !== 'exited_auth_flow');
    },
  });
  function enter() {
    if (!ready || requested.current) return;
    if (authenticated) { router.replace('/patient'); return; }
    requested.current = true; setBusy(true); setError(false);
    try { login(); }
    catch { requested.current = false; setBusy(false); setError(true); }
  }
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('login') !== 'patient') return;
    // Consume before opening so cancellation, reload and StrictMode cannot reopen it.
    url.searchParams.delete('login');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    enter();
  });
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      requested.current = false; setBusy(false);
      restoreFocus.current = true;
    }
    wasOpen.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    if (!busy && !isOpen && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [busy, isOpen]);
  async function signOut() {
    if (busy) return;
    setBusy(true); setError(false);
    try { await logout(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <button ref={trigger} type="button" disabled={!ready || busy} onClick={enter}
      className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:opacity-50">
      {authenticated ? labels.portal : labels.signIn}
    </button>
    {authenticated && <button type="button" disabled={busy} onClick={() => void signOut()} className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">{labels.signOut}</button>}
    {error && <p role="alert" className="max-w-56 text-xs text-rose-700">{labels.error}</p>}
  </div>;
}
