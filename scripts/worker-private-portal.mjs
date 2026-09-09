import { pathToFileURL } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';
import { runOnce as runAdmin, createChain as adminChain, createStore as adminStore } from './worker-doctor-authorizations.mjs';
import { runOnce as runBooking, createChain as bookingChain, createStore as bookingStore } from './worker-prescription-bookings.mjs';
import { acquireSignerLock, PRIVATE_PRESCRIPTION_ID, PRIVY_APP_ID, secureStoreSigner, workerConfiguration } from './lib/private-worker-runtime.mjs';

/** Alternate the first queue and allow each one reconciliation on every cycle.
 * An unresolved envelope owns the source sequence, across both queues.
 */
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
  const releaseFile = await acquireSignerLock(env.STELLAR_CONFIG_DIR, config.authority);
  if (!releaseFile) { console.log(JSON.stringify({ status: 'busy' })); return; }
  let pool, client;
  try {
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    neonConfig.webSocketConstructor = (await import('ws')).default;
    const { PrivyClient } = await import('@privy-io/server-auth');
    pool = new Pool({ connectionString: env.DATABASE_URL }); client = await pool.connect();
    const locked = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', ['trustleaf-booking:' + config.authority]);
    if (!locked.rows[0].locked) { console.log(JSON.stringify({ status: 'busy' })); return; }
    const shared = { authority: config.authority, relayer: Keypair.fromSecret(env.RELAYER_SECRET),
      provider: new PrivyClient(PRIVY_APP_ID, env.PRIVY_APP_SECRET),
      signXdr: secureStoreSigner({ alias: env.DOCTOR_REGISTRY_ADMIN_ALIAS, configDir: env.STELLAR_CONFIG_DIR }) };
    const queues = [
      { name: 'admin', run: runAdmin, store: adminStore(client), chain: adminChain({ ...shared, dataKey: env.TRUSTLEAF_DATA_KEY }) },
      { name: 'bookings', run: runBooking, store: bookingStore(client, PRIVATE_PRESCRIPTION_ID), chain: bookingChain(shared) },
    ].filter(q => queue === 'all' || q.name === queue);
    const cycle = createFairCycle({ queues, writesEnabled: () => env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'true',
      hasPendingAuthorityAttempt: async () => {
        const result = await client.query(`SELECT EXISTS(
          SELECT 1 FROM doctor_authorization_requests WHERE network='testnet' AND state='submitted' AND transaction_hash IS NOT NULL
          UNION ALL SELECT 1 FROM prescription_booking_requests WHERE network='testnet' AND state IN ('submitted','cancel_requested') AND transaction_hash IS NOT NULL
        ) AS busy`);
        return result.rows[0].busy;
      } });
    let stopped = false;
    const halt = () => { stopped = true; };
    process.on('SIGINT', halt); process.on('SIGTERM', halt);
    try {
      do {
        const results = await cycle();
        for (const result of results) if (!watch || result.status !== 'idle') console.log(JSON.stringify(result));
        if (watch && !stopped) await new Promise(resolve => setTimeout(resolve, 3000));
      } while (watch && !stopped);
    } finally { process.off('SIGINT', halt); process.off('SIGTERM', halt); }
  } finally {
    if (client) { await client.query('SELECT pg_advisory_unlock_all()').catch(() => {}); client.release(); }
    if (pool) await pool.end();
    await releaseFile();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error('Private portal worker stopped; configuration or reconciliation required.'); process.exitCode = 1;
});
