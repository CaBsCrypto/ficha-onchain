/** Two real direct Neon connections; lock-only checks, no persistent data writes. */
import assert from 'node:assert/strict';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { Keypair } from '@stellar/stellar-sdk';
import { acquireClinicalSourceLocks } from './lib/clinical-source-lock.mjs';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.get('sslmode') !== 'require' ||
      !/^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(url.hostname)) throw Error('clinical_lock_smoke_unavailable');
  url.hostname = url.hostname.replace('-pooler.', '.');
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: url.href, connectionTimeoutMillis: 15_000 });
  let a, b, first, second;
  try {
    [a, b] = await Promise.all([pool.connect(), pool.connect()]);
    const wallet = Keypair.random().publicKey();
    first = await acquireClinicalSourceLocks(a, [wallet]); await first.assertHeld();
    await assert.rejects(() => acquireClinicalSourceLocks(b, [wallet]), { message: 'clinical_source_busy' });
    await first.release(); first = null;
    second = await acquireClinicalSourceLocks(b, [wallet]); await second.assertHeld();
    await b.query('SELECT pg_advisory_unlock(hashtext($1))', ['private-user:' + wallet]);
    await assert.rejects(() => second.assertHeld(), { message: 'clinical_source_lock_lost' });
    console.log(JSON.stringify({ environment: 'isolated-dev', twoLiveConnections: true, oneSourceOwner: true,
      releasedLockReacquired: true, removedLockRejected: true, persistentDataWrites: false }));
  } finally {
    if (first) await first.release(); if (second) await second.release();
    if (a) a.release(); if (b) b.release(); await pool.end();
  }
}
main().catch(() => { console.error('clinical_lock_smoke_unavailable'); process.exitCode = 1; });
