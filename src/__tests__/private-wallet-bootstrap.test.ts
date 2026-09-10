import { describe, expect, it, vi } from 'vitest';
import { bootstrapStellarWallet, type PortalWallet } from '@/components/private-portal/wallet-bootstrap';

const wallet: PortalWallet = { address: `G${'A'.repeat(55)}`, walletId: 'existing-wallet', chain: 'stellar' };
const identity = { linkedAccounts: [{ type: 'wallet', chainType: 'stellar', address: wallet.address }] };
describe('Portal Stellar session initialization', () => {
  it('does not refresh Privy when the verified wallet is already linked', async () => {
    const refresh = vi.fn();
    await expect(bootstrapStellarWallet('known', identity, { resolve: async () => wallet, refresh })).resolves.toEqual(wallet);
    expect(refresh).not.toHaveBeenCalled();
  });
  it('shares simultaneous mounts and refreshes a newly created wallet once', async () => {
    let finish!: (value: PortalWallet) => void;
    const resolve = vi.fn(() => new Promise<PortalWallet>(done => { finish = done; }));
    const refresh = vi.fn(async () => identity);
    const first = bootstrapStellarWallet('concurrent', { linkedAccounts: [] }, { resolve, refresh });
    const second = bootstrapStellarWallet('concurrent', { linkedAccounts: [] }, { resolve, refresh });
    expect(first).toBe(second);
    finish(wallet);
    await Promise.all([first, second]);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('requires the refreshed Privy identity to contain the expected Stellar address', async () => {
    await expect(bootstrapStellarWallet('missing', { linkedAccounts: [] }, { resolve: async () => wallet, refresh: async () => ({ linkedAccounts: [] }) })).rejects.toThrow('antes de firmar');
  });
  it('keeps a throttled refresh recoverable and does not automatically retry it', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('Too many requests'));
    await expect(bootstrapStellarWallet('throttled', { linkedAccounts: [] }, { resolve: async () => wallet, refresh })).rejects.toThrow('Espera un momento');
    expect(refresh).toHaveBeenCalledTimes(1);
    await expect(bootstrapStellarWallet('throttled', identity, { resolve: async () => wallet, refresh })).resolves.toEqual(wallet);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('never accepts an address from another chain', async () => {
    const refresh = vi.fn();
    await expect(bootstrapStellarWallet('wrong-chain', identity, { resolve: async () => ({ ...wallet, address: '0x1234' }), refresh })).rejects.toThrow('Stellar única');
    expect(refresh).not.toHaveBeenCalled();
  });
});
