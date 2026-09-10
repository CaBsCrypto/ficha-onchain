'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePrivy, useUser } from '@privy-io/react-auth';
import { portalApi } from './client';
import { bootstrapStellarWallet, type PortalWallet } from './wallet-bootstrap';

const WalletContext = createContext<PortalWallet | null>(null);
export function usePortalWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('Verified Stellar wallet required');
  return wallet;
}
export function WalletBoundary({ children }: { children: React.ReactNode }) {
  const { user, logout } = usePrivy();
  const { refreshUser } = useUser();
  const userRef = useRef(user);
  const refreshUserRef = useRef(refreshUser);
  useEffect(() => { refreshUserRef.current = refreshUser; userRef.current = user; }, [refreshUser, user]);
  const [wallet, setWallet] = useState<PortalWallet | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setWallet(null); setError('');
    void (async () => {
      try {
        const identity = userRef.current;
        if (!identity) throw new Error('Vuelve a ingresar con Privy.');
        const result = await bootstrapStellarWallet(identity.id, identity, {
          resolve: () => portalApi<PortalWallet>('/api/privy/stellar-wallet', { method: 'POST' }),
          refresh: () => refreshUserRef.current(),
        });
        if (alive) setWallet(result);
      } catch (failure) { if (alive) setError(failure instanceof Error ? failure.message : 'No se pudo verificar tu cuenta Stellar.'); }
    })();
    return () => { alive = false; };
  }, [user?.id, revision]);
  if (!wallet) return <div className="mx-auto my-16 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-xl font-semibold text-slate-800">Tu cuenta Stellar</h1>
    <p role={error ? 'alert' : 'status'} className="mt-3 text-sm text-slate-600">{error || 'Preparando tu cuenta con Privy…'}</p>
    {error && <button onClick={() => setRevision(value => value + 1)} className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Volver a consultar</button>}
    <button onClick={() => void logout()} className="ml-4 mt-4 text-sm text-slate-600 underline">Cerrar sesión</button>
  </div>;
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}
