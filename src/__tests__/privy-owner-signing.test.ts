import { describe, it, expect, vi } from 'vitest';
import { Account, Contract, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { signPreparedOwnerTransaction } from '@/lib/stellar/privy-owner-signing';
vi.mock('@privy-io/server-auth/wallet-api', () => ({ generateAuthorizationSignature: () => 'owner-request-signature' }));

function fixture() {
  const key = Keypair.random();
  const now = Date.now();
  const binding = { userId: 'did:privy:test', walletId: 'wallet-test', address: key.publicKey() };
  const tx = new TransactionBuilder(new Account(binding.address, '0'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract('CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2').call('interface_version')).setTimeout(120).build();
  const intent = { ...binding, network: 'testnet' as const, unsignedXdr: tx.toXDR(), hash: tx.hash().toString('hex'), expiresAt: Number(tx.timeBounds!.maxTime) * 1000 };
  const wallet = { id: binding.walletId, address: binding.address, chainType: 'stellar', ownerId: 'user-key-quorum' };
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ method: 'raw_sign', data: { encoding: 'hex', signature: key.sign(tx.hash()).toString('hex') } }));
  const privy = {
    verifyAuthToken: vi.fn().mockResolvedValue({ userId: binding.userId }),
    getUser: vi.fn().mockResolvedValue({ linkedAccounts: [{ ...wallet, type: 'wallet' }] }),
    walletApi: { getWallet: vi.fn().mockResolvedValue(wallet), generateUserSigner: vi.fn().mockResolvedValue({ authorizationKey: 'temporary', expiresAt: new Date(now + 60000), wallets: [wallet] }) },
  };
  const dependencies = { privy: privy as unknown as Parameters<typeof signPreparedOwnerTransaction>[3]['privy'], appId: 'app', appSecret: 'secret', fetch: fetchMock, now: () => now };
  return { key, binding, intent, dependencies, privy, fetchMock };
}

describe('Privy owner signing boundary', () => {
  it('verifies and attaches the owner signature, preserving the prepared hash', async () => {
    const f = fixture();
    const result = await signPreparedOwnerTransaction('token', f.binding, f.intent, f.dependencies);
    const tx = TransactionBuilder.fromXDR(result.signedXdr, Networks.TESTNET);
    expect(tx.hash().toString('hex')).toBe(f.intent.hash);
    expect(f.key.verify(tx.hash(), tx.signatures[0].signature())).toBe(true);
    expect(f.fetchMock.mock.calls[0][1].headers['privy-authorization-signature']).toBe('owner-request-signature');
  });
  it('rejects an invalid session before requesting a signer', async () => {
    const f = fixture(); f.privy.verifyAuthToken.mockRejectedValue(new Error('invalid_token'));
    await expect(signPreparedOwnerTransaction('token', f.binding, f.intent, f.dependencies)).rejects.toThrow('invalid_token');
    expect(f.privy.walletApi.generateUserSigner).not.toHaveBeenCalled();
  });
  it.each(['userId', 'walletId', 'address'] as const)('rejects changed intent %s', async field => {
    const f = fixture(); f.intent[field] = 'other';
    await expect(signPreparedOwnerTransaction('token', f.binding, f.intent, f.dependencies)).rejects.toThrow('owner_mismatch');
    expect(f.fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a wallet removed from the owner account', async () => {
    const f = fixture(); f.privy.getUser.mockResolvedValue({ linkedAccounts: [] });
    await expect(signPreparedOwnerTransaction('token', f.binding, f.intent, f.dependencies)).rejects.toThrow('wallet_binding_changed');
  });
  it('rejects another wallet signature', async () => {
    const f = fixture(); f.fetchMock.mockResolvedValue(Response.json({ method: 'raw_sign', data: { encoding: 'hex', signature: Keypair.random().sign(Buffer.from(f.intent.hash, 'hex')).toString('hex') } }));
    await expect(signPreparedOwnerTransaction('token', f.binding, f.intent, f.dependencies)).rejects.toThrow('wrong_wallet_signature');
  });
  it('does not turn a provider failure into success', async () => {
    const f = fixture(); f.fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    await expect(signPreparedOwnerTransaction('token', f.binding, f.intent, f.dependencies)).rejects.toThrow('privy_signing_failed_503');
  });
  it('rejects a substituted prepared hash before signing', async () => {
    const f = fixture(); f.intent.hash = '00'.repeat(32);
    await expect(signPreparedOwnerTransaction('token', f.binding, f.intent, f.dependencies)).rejects.toThrow('invalid_prepared_transaction');
    expect(f.fetchMock).not.toHaveBeenCalled();
  });
});
