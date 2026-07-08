'use client';
import { usePrivyAuth } from '@/lib/privy';

export function PrivyLoginButton() {
  const { ready, authenticated, user, login, logout } = usePrivyAuth();

  if (!ready) {
    return <div className="h-9 w-24 bg-gray-100 animate-pulse rounded-lg" />;
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">
          {user?.email?.address || 'Conectado'}
        </span>
        <button
          onClick={logout}
          className="text-sm px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Salir
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="text-sm px-4 py-2 rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors font-medium"
    >
      Iniciar sesión
    </button>
  );
}
