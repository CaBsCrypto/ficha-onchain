'use client';
import { usePrivyAuth } from '@/lib/privy';
import { useLanguage } from '@/hooks/useLanguage';
import { useTrackUser } from '@/hooks/useTrackUser';

export function PrivyLoginButton() {
  const { ready, authenticated, user, login, logout } = usePrivyAuth();
  useTrackUser(); // track on any page where this button renders
  const { lang } = useLanguage();

  const labels = {
    en: { signIn: 'Sign in', connected: 'Connected', signOut: 'Sign out' },
    es: { signIn: 'Iniciar sesión', connected: 'Conectado', signOut: 'Salir' },
  }[lang] ?? { signIn: 'Sign in', connected: 'Connected', signOut: 'Sign out' };

  if (!ready) {
    return <div className="h-9 w-24 bg-gray-100 animate-pulse rounded-lg" />;
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">
          {user?.email?.address || labels.connected}
        </span>
        <button
          onClick={logout}
          className="text-sm px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          {labels.signOut}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="text-sm px-4 py-2 rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors font-medium"
    >
      {labels.signIn}
    </button>
  );
}
