import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { PrivateFlowError } from '@/lib/private-config';
import { WalletBindingError } from '@/lib/stellar/privy-wallet-binding';

const deps = vi.hoisted(() => ({ getDb: vi.fn(), verifiedWallet: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDb: deps.getDb }));
vi.mock('@/lib/doctor-authorizations', () => ({ verifiedWallet: deps.verifiedWallet }));
import { assertClinicalOwner, resolveClinicalActor } from '@/lib/clinical/identity';

const address = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const otherAddress = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
const user: AuthedUser = { userId: 'did:privy:patient1', email: 'patient@example.test' };
const actor = { userId: user.userId, walletId: 'wallet-patient1', address };
const history = { owner_user_id: actor.userId, wallet_id: actor.walletId, patient_wallet: address };
const sql = Object.assign(vi.fn(), { query: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  deps.getDb.mockReturnValue(sql);
  deps.verifiedWallet.mockResolvedValue({ walletId: actor.walletId, address, chain: 'stellar', created: false });
});

describe('clinical identity binding', () => {
  it('derives the stable DID and wallet from the existing verified binding', async () => {
    expect(await resolveClinicalActor(user)).toEqual(actor);
    expect(deps.verifiedWallet).toHaveBeenCalledExactlyOnceWith(sql, user.userId, user.email);
    expect(sql).not.toHaveBeenCalled();
  });

  it('keeps ownership when the same Privy identity changes its verified email', async () => {
    const changed = { ...user, email: 'new-email@example.test' };
    const resolved = await resolveClinicalActor(changed);
    expect(() => assertClinicalOwner(history, resolved)).not.toThrow();
    expect(deps.verifiedWallet).toHaveBeenCalledWith(sql, user.userId, changed.email);
  });

  it('rejects a different DID even if the caller supplies the same email and wallet', async () => {
    const other = await resolveClinicalActor({ ...user, userId: 'did:privy:patient2' });
    expect(() => assertClinicalOwner(history, other)).toThrow('clinical_access_denied');
    try { assertClinicalOwner(history, other); } catch (error) {
      expect(error).toBeInstanceOf(PrivateFlowError);
      expect((error as PrivateFlowError).status).toBe(403);
      expect(String(error)).not.toContain(user.email);
      expect(String(error)).not.toContain(history.owner_user_id);
    }
  });

  it.each([
    { ...actor, walletId: 'replacement-wallet' },
    { ...actor, address: otherAddress },
    { ...actor, walletId: 'replacement-wallet', address: otherAddress },
  ])('rejects a changed wallet binding for an existing history', changed => {
    expect(() => assertClinicalOwner(history, changed)).toThrow('clinical_wallet_changed');
  });

  it.each([
    { ...history, wallet_id: '' },
    { ...history, patient_wallet: '' },
    { ...history, owner_user_id: '' },
  ])('rejects incomplete saved ownership rather than falling back to email', incomplete => {
    expect(() => assertClinicalOwner(incomplete, actor)).toThrow();
  });

  it.each([
    { ...user, email: null },
    { ...user, email: '' },
    { ...user, email: ' ' },
    { ...user, userId: '' },
    { ...user, userId: 'patient@example.test' },
  ])('rejects incomplete identity before invoking database/provider helpers', async invalid => {
    await expect(resolveClinicalActor(invalid)).rejects.toMatchObject({ message: 'clinical_identity_required', status: 403 });
    expect(deps.getDb).not.toHaveBeenCalled();
    expect(deps.verifiedWallet).not.toHaveBeenCalled();
  });

  it('preserves a verified provider binding rejection instead of using a claimed wallet', async () => {
    deps.verifiedWallet.mockRejectedValue(new WalletBindingError('wallet_binding_changed'));
    await expect(resolveClinicalActor(user)).rejects.toThrow('wallet_binding_changed');
  });
});
