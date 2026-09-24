import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { Keypair, Networks, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { PRIVATE_REGISTRY_ID } from './private-registry.mjs';

export const PRIVY_APP_ID = 'cmrix722m03d30clewd1fuffq';
export const PRIVATE_PRESCRIPTION_ID = 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE';

export function workerConfiguration(env) {
  if (!['local', 'preview', 'test'].includes(env.TRUSTLEAF_ENV) || !env.DATABASE_URL || !env.TRUSTLEAF_DB_HOST) throw Error('worker_environment_required');
  const url = new URL(env.DATABASE_URL), host = url.hostname;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || host !== env.TRUSTLEAF_DB_HOST ||
      !/^[a-z0-9.-]+\.neon\.tech$/.test(host)) throw Error('database_host_mismatch');
  if (host.includes('-pooler.')) throw Error('worker_requires_direct_database');
  const signerMode = env.TRUSTLEAF_SIGNER_MODE ?? 'local';
  if (!['local', 'secret-file'].includes(signerMode)) throw Error('worker_signer_mode_invalid');
  if (signerMode === 'secret-file' && (env.STELLAR_NETWORK !== 'testnet' ||
      env.TRUSTLEAF_AUTHORITY_DATABASE_HOST !== host ||
      !env.TRUSTLEAF_AUTHORITY_DATABASE_NAME || decodeURIComponent(url.pathname.slice(1)) !== env.TRUSTLEAF_AUTHORITY_DATABASE_NAME ||
      !env.TRUSTLEAF_AUTHORITY_SECRET_FILE)) throw Error('hosted_signer_configuration_required');
  const localDev = /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(host);
  if (env.TRUSTLEAF_ENV === 'local' ? !localDev : localDev || /^ep-rapid-shadow-ahq94785(?:-pooler)?\./.test(host)) throw Error('isolated_test_database_required');
  if (env.PRIVY_APP_ID !== PRIVY_APP_ID || env.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID !== PRIVATE_REGISTRY_ID ||
      env.PRESCRIPTION_PRIVATE_CONTRACT_ID !== PRIVATE_PRESCRIPTION_ID ||
      !StrKey.isValidEd25519PublicKey(env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY ?? '') ||
      env.BOOKING_AUTHORITY_PUBLIC_KEY !== env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY || !env.STELLAR_CONFIG_DIR ||
      (signerMode === 'local' && !env.DOCTOR_REGISTRY_ADMIN_ALIAS) || !env.PRIVY_APP_SECRET || !env.RELAYER_SECRET || !env.TRUSTLEAF_DATA_KEY) throw Error('worker_configuration_required');
  return { environment: env.TRUSTLEAF_ENV, host, authority: env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY, signerMode,
    writesEnabled: env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'true' };
}

/** Mounted only at runtime. Does not write a CLI key file or log provider errors. */
export async function secretFileSigner({ path, authority, network }) {
  if (network !== 'testnet' || !path) throw Error('hosted_signer_configuration_required');
  let key;
  try { key = Keypair.fromSecret((await readFile(path, 'utf8')).trim()); }
  catch { throw Error('authority_secret_unavailable'); }
  if (key.publicKey() !== authority) throw Error('authority_secret_mismatch');
  return async xdr => {
    let tx;
    try { tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET); }
    catch { throw Error('authority_envelope_invalid'); }
    if (tx.innerTransaction || tx.source !== authority || tx.operations.length !== 1 ||
        tx.operations[0].type !== 'invokeHostFunction' || tx.signatures.length !== 0) throw Error('authority_envelope_invalid');
    // Chain adapters validate exact contract/method/arguments before calling this signer.
    tx.sign(key);
    return tx.toXDR();
  };
}

export function secureStoreSigner({ alias, configDir }) {
  if (!alias || !configDir) throw Error('secure_signer_configuration_required');
  return async xdr => {
    const signed = spawnSync('stellar', ['tx', 'sign', '--sign-with-key', alias, '--network', 'testnet', '--config-dir', configDir],
      { input: xdr, encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    if (signed.status !== 0) throw Error('secure_signing_failed');
    return signed.stdout.trim();
  };
}

export async function acquireSignerLock(configDir, authority) {
  if (!StrKey.isValidEd25519PublicKey(authority)) throw Error('authority_invalid');
  const dir = join(configDir, '.trustleaf-worker-locks');
  await mkdir(dir, { recursive: true });
  const path = join(dir, authority + '.lock');
  async function create() {
    let handle;
    try { handle = await open(path, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') return null; throw e; }
    const token = randomUUID();
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), token, createdAt: new Date().toISOString() })); }
    catch (error) { await handle.close(); await unlink(path); throw error; }
    return async () => {
      await handle.close();
      const saved = JSON.parse(await readFile(path, 'utf8'));
      if (saved.token !== token) throw Error('signer_lock_changed');
      await unlink(path);
    };
  }
  const acquired = await create();
  if (acquired) return acquired;
  // A crash during recovery itself leaves this guard for manual review.
  const recoveryPath = path + '.recovery';
  let recovery;
  try { recovery = await open(recoveryPath, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') return null; throw e; }
  try {
    let previous;
    try { previous = JSON.parse(await readFile(path, 'utf8')); }
    catch (e) { return e.code === 'ENOENT' ? await create() : null; }
    if (previous.host !== hostname() || !Number.isSafeInteger(previous.pid) || previous.pid <= 0 || typeof previous.token !== 'string') return null;
    try { process.kill(previous.pid, 0); return null; } catch (e) { if (e.code !== 'ESRCH') return null; }
    const still = JSON.parse(await readFile(path, 'utf8'));
    if (still.token !== previous.token || still.pid !== previous.pid || still.host !== previous.host) return null;
    await unlink(path);
    return await create();
  } finally { await recovery.close(); await unlink(recoveryPath); }
}

export async function assertCurrentPrivyIdentity(provider, { userId, email, walletId, address }) {
  if (!userId || !email || !walletId || !StrKey.isValidEd25519PublicKey(address ?? '')) throw Error('identity_changed');
  const user = await provider.getUser(userId);
  const emails = [user.email?.address, user.google?.email, ...user.linkedAccounts.filter(a => ['email', 'google_oauth'].includes(a.type)).map(a => a.address ?? a.email)]
    .filter(x => typeof x === 'string').map(x => x.toLowerCase());
  if (user.id !== userId || !emails.includes(email.toLowerCase()) ||
      !user.linkedAccounts.some(w => w.type === 'wallet' && w.chainType === 'stellar' && w.id === walletId && w.address === address)) throw Error('identity_changed');
  const wallet = await provider.walletApi.getWallet({ id: walletId });
  // ownerId is a Privy key-quorum ID; it is not the user's DID.
  if (wallet.id !== walletId || wallet.chainType !== 'stellar' || wallet.address !== address || wallet.archivedAt || wallet.archived_at) throw Error('identity_changed');
}
