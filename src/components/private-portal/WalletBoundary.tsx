'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePrivy, useUser } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { privyEmail } from '@/lib/auth/privy-email';
import { accessApi, accessFailure, type AccessError } from './access-client';
import { bootstrapStellarWallet, type PortalWallet } from './wallet-bootstrap';

const WalletContext = createContext<PortalWallet | null>(null);
export function usePortalWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('Verified Stellar wallet required');
  return wallet;
}
type Role = 'doctor' | 'patient';
function VerifiedWalletBoundary({ children, role }: { children: React.ReactNode; role: Role }) {
  const { user, logout } = usePrivy();
  const { refreshUser } = useUser();
  const router = useRouter();
  const userRef = useRef(user);
  const refreshUserRef = useRef(refreshUser);
  const session = useRef({});
  useEffect(() => { refreshUserRef.current = refreshUser; userRef.current = user; }, [refreshUser, user]);
  const [wallet, setWallet] = useState<PortalWallet | null>(null);
  const [error, setError] = useState<AccessError | null>(null);
  const [revision, setRevision] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let alive = true;
    setWallet(null); setError(null);
    if (!leaving) void (async () => {
      try {
        const identity = userRef.current;
        if (!identity) return;
        const result = await bootstrapStellarWallet(identity.id, identity, {
          resolve: () => accessApi<PortalWallet>('/api/privy/stellar-wallet', { method: 'POST' }),
          refresh: () => refreshUserRef.current(),
          session: session.current,
        });
        if (alive) setWallet(result);
      } catch (failure) { if (alive) setError(accessFailure(failure)); }
    })();
    return () => { alive = false; };
  }, [revision, leaving]);
  async function changeAccount() {
    setLeaving(true); setWallet(null);
    try { await logout(); router.replace(`/login/${role}`); }
    catch (failure) { setLeaving(false); setError(accessFailure(failure)); }
  }
  if (!wallet || leaving) return <div className="mx-auto my-16 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-xl font-semibold text-slate-800">Tu cuenta Stellar</h1>
    <p className="mt-2 break-all text-sm text-slate-600">Cuenta actual: {privyEmail(user) ?? 'Cuenta de Privy'}</p>
    <p role={error ? 'alert' : 'status'} className="mt-3 text-sm text-slate-600">{leaving ? 'Cerrando sesión…' : error?.message || 'Preparando tu cuenta con Privy…'}</p>
    {error?.reference && <p className="mt-2 text-xs text-slate-500">Referencia: {error.reference}</p>}
    {error && error.status !== 401 && error.status !== 403 && <button onClick={() => setRevision(value => value + 1)} className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Volver a consultar</button>}
    <button disabled={leaving} onClick={() => void changeAccount()} className="ml-4 mt-4 text-sm text-slate-600 underline disabled:opacity-50">{error?.status === 401 ? 'Volver a ingresar con Privy' : 'Cambiar de cuenta'}</button>
  </div>;
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}
export function WalletBoundary({ children, role = 'patient' }: { children: React.ReactNode; role?: Role }) {
  const { ready, authenticated, user } = usePrivy();
  if (!ready || !authenticated || !user) return <p role="status" className="p-8 text-center text-sm text-slate-500">Verificando sesión…</p>;
  return <VerifiedWalletBoundary key={user.id} role={role}>{children}</VerifiedWalletBoundary>;
}
