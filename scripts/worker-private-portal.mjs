import { pathToFileURL } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';
import { runOnce as runAdmin, createChain as adminChain, createStore as adminStore } from './worker-doctor-authorizations.mjs';
import { runOnce as runBooking, createChain as bookingChain, createStore as bookingStore } from './worker-prescription-bookings.mjs';
import { acquireSignerLock, PRIVATE_PRESCRIPTION_ID, PRIVY_APP_ID, secureStoreSigner, secretFileSigner, workerConfiguration } from './lib/private-worker-runtime.mjs';
import { guardedChain, pause, sessionGuard, waitForAuthorityLock } from './lib/private-worker-session.mjs';

/** Alternate queues while an unresolved envelope owns the authority sequence. */
export function createFairCycle({ queues, hasPendingAuthorityAttempt, writesEnabled }) {
  let offset = 0;
  return async () => {
    const ordered = queues.slice(offset).concat(queues.slice(0, offset));
    offset = (offset + 1) % queues.length;
    const results = [];
    for (const queue of ordered) {
      const enabled = writesEnabled();
      const prepareEnabled = enabled && !(await hasPendingAuthorityAttempt());
      const result = await queue.run({ store: queue.store, chain: queue.chain, writesEnabled: enabled, prepareEnabled });
      results.push({ queue: queue.name, ...result });
    }
    return results;
  };
}

export async function main({ queue = 'all', env = process.env } = {}) {
  const once = process.argv.includes('--once'), watch = process.argv.includes('--watch');
  if (once === watch || !['all', 'admin', 'bookings'].includes(queue)) throw Error('choose_once_or_watch');
  const config = workerConfiguration(env);
  const controller = new AbortController();
  const halt = () => controller.abort();
  process.on('SIGINT', halt); process.on('SIGTERM', halt);
  const log = value => console.log(JSON.stringify({ at: new Date().toISOString(), ...value }));
  let releaseFile, pool, client, guard;
  // Prevent an unhandled connection error even while waiting for the DB lock.
  let connectionFailed = false;
  const connectionLost = () => { connectionFailed = true; controller.abort(); };
  try {
    const signer = config.signerMode === 'secret-file'
      ? await secretFileSigner({ path: env.TRUSTLEAF_AUTHORITY_SECRET_FILE, authority: config.authority, network: env.STELLAR_NETWORK })
      : secureStoreSigner({ alias: env.DOCTOR_REGISTRY_ADMIN_ALIAS, configDir: env.STELLAR_CONFIG_DIR });
    while (!controller.signal.aborted) {
      releaseFile = await acquireSignerLock(env.STELLAR_CONFIG_DIR, config.authority);
      if (releaseFile) break;
      log({ status: 'waiting_for_local_lock' });
      if (!watch) return;
      await pause(controller.signal);
    }
    if (!releaseFile || controller.signal.aborted) return;
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    neonConfig.webSocketConstructor = (await import('ws')).default;
    const { PrivyClient } = await import('@privy-io/server-auth');
    pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 15000 });
    pool.on('error', connectionLost);
    client = await pool.connect();
    client.on('error', connectionLost); client.on('end', connectionLost);
    if (!await waitForAuthorityLock(client, config.authority, { watch, signal: controller.signal, log })) {
      if (connectionFailed) throw Error('worker_session_unavailable');
      return;
    }
    guard = sessionGuard(client, config.authority, controller.signal);
    const shared = { authority: config.authority, relayer: Keypair.fromSecret(env.RELAYER_SECRET),
      provider: new PrivyClient(PRIVY_APP_ID, env.PRIVY_APP_SECRET),
      signXdr: async xdr => { await guard.assert(); return signer(xdr); } };
    const queues = [
      { name: 'admin', run: runAdmin, store: adminStore(client), chain: guardedChain(adminChain({ ...shared, dataKey: env.TRUSTLEAF_DATA_KEY }), guard) },
      { name: 'bookings', run: runBooking, store: bookingStore(client, PRIVATE_PRESCRIPTION_ID), chain: guardedChain(bookingChain(shared), guard) },
    ].filter(q => queue === 'all' || q.name === queue);
    const cycle = createFairCycle({ queues, writesEnabled: () => !controller.signal.aborted && env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'true',
      hasPendingAuthorityAttempt: async () => {
        await guard.assert();
        const result = await client.query(`SELECT EXISTS(
          SELECT 1 FROM doctor_authorization_requests WHERE network='testnet' AND state='submitted' AND transaction_hash IS NOT NULL
          UNION ALL SELECT 1 FROM prescription_booking_requests WHERE network='testnet' AND state IN ('submitted','cancel_requested') AND transaction_hash IS NOT NULL
        ) AS busy`);
        return result.rows[0].busy;
      } });
    log({ status: 'ready', writesEnabled: config.writesEnabled });
    let heartbeat = 0;
    while (!controller.signal.aborted) {
      await guard.assert();
      const results = await cycle();
      for (const result of results) if (!watch || result.status !== 'idle') log(result);
      if (Date.now() - heartbeat >= 60000) { await guard.assert(); log({ status: 'cycle_ok' }); heartbeat = Date.now(); }
      if (once) break;
      await pause(controller.signal);
    }
    if (connectionFailed) throw Error('worker_session_unavailable');
  } catch (error) {
    if (!controller.signal.aborted || connectionFailed) throw error;
  } finally {
    // Releasing the connection also releases its advisory lock, including on errors.
    if (client) {
      await client.query('SELECT pg_advisory_unlock_all()').catch(() => {});
      guard?.dispose();
      client.off('error', connectionLost); client.off('end', connectionLost);
      client.release(true);
    }
    try { if (pool) await pool.end(); }
    finally {
      try { if (releaseFile) await releaseFile(); }
      finally {
        process.off('SIGINT', halt); process.off('SIGTERM', halt);
        log({ status: 'stopped' });
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error('Private portal worker stopped; configuration or reconciliation required.'); process.exitCode = 1;
});
