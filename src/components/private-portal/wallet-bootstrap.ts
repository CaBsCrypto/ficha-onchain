export interface PortalWallet { address: string; walletId: string; chain: 'stellar' }
type LinkedAccount = { type: string; chainType?: string; address?: string };
type WalletIdentity = { id?: string; linkedAccounts: readonly LinkedAccount[] };
const inflight = new Map<string | object, Promise<PortalWallet>>();

/** Share concurrent mounts, including development StrictMode, without caching identity across sessions. */
export function bootstrapStellarWallet(userId: string, identity: WalletIdentity, dependencies: {
  resolve: () => Promise<PortalWallet>; refresh: () => Promise<WalletIdentity>; session?: object;
}) {
  const key = dependencies.session ?? userId;
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = (async () => {
    if (identity.id && identity.id !== userId) throw new Error('La sesión cambió. Vuelve a ingresar con Privy.');
    const wallet = await dependencies.resolve();
    if (wallet.chain !== 'stellar' || !wallet.walletId || !/^G[A-Z2-7]{55}$/.test(wallet.address)) throw new Error('No se pudo verificar una cuenta Stellar única.');
    const hasWallet = (value: WalletIdentity) => value.linkedAccounts.some(account => account.type === 'wallet' && account.chainType === 'stellar' && account.address === wallet.address);
    if (!hasWallet(identity)) {
      let refreshed: WalletIdentity;
      try { refreshed = await dependencies.refresh(); }
      catch { throw new Error('Privy no pudo actualizar tu cuenta. Espera un momento y vuelve a consultar.'); }
      if (refreshed.id && refreshed.id !== userId) throw new Error('La sesión cambió. Vuelve a ingresar con Privy.');
      if (!hasWallet(refreshed)) throw new Error('Tu wallet Stellar está asociada, pero Privy aún no actualiza la sesión. Vuelve a consultar antes de firmar.');
    }
    return wallet;
  })();
  inflight.set(key, pending);
  void pending.finally(() => { if (inflight.get(key) === pending) inflight.delete(key); }).catch(() => {});
  return pending;
}
