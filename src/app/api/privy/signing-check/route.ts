import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Contract, Networks, TransactionBuilder, Keypair, rpc, Transaction } from '@stellar/stellar-sdk';
import { type OwnerBinding, type PreparedOwnerTransaction } from '@/lib/stellar/privy-owner-signing';
import { getDb } from '@/lib/db';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { resolveStellarWallet } from '@/lib/stellar/privy-wallet-binding';

export const runtime = 'nodejs';
const registry = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
type Evidence = { binding?: OwnerBinding; intent?: PreparedOwnerTransaction; xdr?: string; hash?: string; status?: string };

/** Local prerequisite probe only. No clinical state is mutated: the only
 * operation is interface_version on the private registry. Never deploy enabled.
 */
export async function POST(request: Request) {
  if (process.env.TRUSTLEAF_PRIVY_SIGNING_CHECK !== 'true' || process.env.VERCEL ||
      !['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)) {
    return NextResponse.json({ error: 'disabled' }, { status: 404 });
  }
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const appId = process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret || !process.env.RELAYER_SECRET) return NextResponse.json({ error: 'configuration_missing' }, { status: 503 });
  const privy = new PrivyClient(appId, appSecret);
  let userId: string;
  try { userId = (await privy.verifyAuthToken(token)).userId; }
  catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }
  let input: { action?: string; signature?: string; operationId?: string };
  try { input = await request.json(); } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  if (!['prepare', 'confirm', 'status'].includes(input.action ?? '')) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  const folder = path.join(process.cwd(), '.trustleaf-local', 'privy-signing-check');
  await mkdir(folder, { recursive: true });
  // One global lock also serializes relay use by this probe. Other workers must
  // remain stopped during the prerequisite test.
  const lockPath = path.join(folder, 'probe.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch { return NextResponse.json({ error: 'probe_busy_or_interrupted' }, { status: 409 }); }
  const filename = path.join(folder, `${createHash('sha256').update(userId).digest('hex')}.json`);
  let stage = 'load';
  try {
    let evidence: Evidence = {};
    try { evidence = JSON.parse(await readFile(filename, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const save = async () => { await writeFile(`${filename}.tmp`, JSON.stringify(evidence, null, 2)); await rename(`${filename}.tmp`, filename); };
    stage = 'wallet';
    const wallet = await resolveStellarWallet(getDb(), { getUser: (id: string) => privy.getUser(id), walletApi: privy.walletApi }, appId, userId);
    if (evidence.binding && (evidence.binding.walletId !== wallet.walletId || evidence.binding.address !== wallet.address)) throw new Error('wallet_binding_changed');
    evidence.binding = { userId, walletId: wallet.walletId, address: wallet.address };
    await save();
    const server = new rpc.Server('https://soroban-testnet.stellar.org');
    if (!evidence.xdr) {
      if (input.action === 'status') return NextResponse.json({ status: 'AWAITING_SIGNATURE' });
      stage = 'provision';
      try { await server.getAccount(evidence.binding.address); }
      catch {
        const funded = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(evidence.binding.address)}`, { signal: AbortSignal.timeout(20_000) });
        if (!funded.ok) throw new Error('test_account_provisioning_failed');
      }
      stage = 'prepare';
      // No envelope has been persisted or submitted on this path. Expired
      // unsigned preparations can therefore be replaced without double sending.
      if (input.action === 'prepare' && evidence.intent && evidence.intent.expiresAt <= Date.now()) delete evidence.intent;
      if (!evidence.intent) {
        const tx = await server.prepareTransaction(new TransactionBuilder(await server.getAccount(evidence.binding.address), { fee: '10000', networkPassphrase: Networks.TESTNET })
          .addOperation(new Contract(registry).call('interface_version')).setTimeout(180).build());
        evidence.intent = { ...evidence.binding, network: 'testnet', unsignedXdr: tx.toXDR(), hash: tx.hash().toString('hex'), expiresAt: Number(tx.timeBounds!.maxTime) * 1000 };
        await save();
      }
      stage = 'owner_sign';
      if (input.action === 'prepare') return NextResponse.json({ operationId: evidence.intent.hash, hash: `0x${evidence.intent.hash}`, address: evidence.binding.address });
      if (input.operationId !== evidence.intent.hash || evidence.intent.expiresAt <= Date.now()) throw new Error('intent_expired_or_changed');
      const user = await privy.getUser(userId);
      const ownerWallets = user.linkedAccounts as Array<{ type: string; id?: string; address?: string; chainType?: string }>;
      if (!ownerWallets.some(w => w.type === 'wallet' && w.id === evidence.binding!.walletId && w.address === evidence.binding!.address && w.chainType === 'stellar')) throw new Error('wallet_binding_changed');
      const hex = input.signature?.replace(/^0x/, '');
      if (!hex || !/^[a-fA-F0-9]{128}$/.test(hex)) throw new Error('invalid_owner_signature');
      const inner = TransactionBuilder.fromXDR(evidence.intent.unsignedXdr, Networks.TESTNET) as Transaction;
      if (!Keypair.fromPublicKey(evidence.binding.address).verify(inner.hash(), Buffer.from(hex, 'hex'))) throw new Error('wrong_wallet_signature');
      inner.addSignature(evidence.binding.address, Buffer.from(hex, 'hex').toString('base64'));
      const relayer = Keypair.fromSecret(process.env.RELAYER_SECRET);
      const outer = TransactionBuilder.buildFeeBumpTransaction(relayer, '2000000', inner, Networks.TESTNET);
      outer.sign(relayer);
      evidence.xdr = outer.toXDR(); evidence.hash = outer.hash().toString('hex'); evidence.status = 'prepared';
      await save();
    }
    stage = 'relay';
    const previous = await server.getTransaction(evidence.hash!);
    if (previous.status === 'NOT_FOUND') {
      const submission = await server.sendTransaction(TransactionBuilder.fromXDR(evidence.xdr, Networks.TESTNET));
      if (submission.status === 'ERROR') {
        evidence.status = 'REJECTED'; await save();
        return NextResponse.json({ status: evidence.status, hash: evidence.hash, error: 'relay_rejected_saved_attempt' }, { status: 422 });
      }
    }
    const receipt = await server.getTransaction(evidence.hash!);
    evidence.status = receipt.status; await save();
    return NextResponse.json({ address: evidence.binding.address, hash: evidence.hash, status: evidence.status, explorer: `https://stellar.expert/explorer/testnet/tx/${evidence.hash}` });
  } catch (error) {
    // Do not return provider payloads, JWTs or authorization keys.
    const known = error instanceof Error && /^(owner_|wallet_|intent_|invalid_|wrong_|privy_signing_failed_)/.test(error.message) ? error.message : 'probe_failed';
    return NextResponse.json({ error: known, stage }, { status: 422 });
  } finally { await lock.close(); await unlink(lockPath); }
}
