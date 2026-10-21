import { StrKey } from '@stellar/stellar-sdk';

/** Dedicated direct PostgreSQL connection required: session advisory locks do
 * not survive a transaction-pooling endpoint. Uses the existing private-user
 * namespace so prescriptions cannot allocate the same source simultaneously. */
export async function acquireClinicalSourceLocks(client, sources) {
  const wallets = [...new Set(sources)].sort();
  if (!wallets.length || wallets.some(wallet => !StrKey.isValidEd25519PublicKey(wallet))) throw Error('clinical_source_lock_unavailable');
  let valid = true; const held = [];
  const lost = () => { valid = false; };
  client.on('error', lost); client.on('end', lost);
  const pid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid);
  async function release() {
    valid = false;
    for (const key of held.reverse()) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]).catch(() => {});
    client.removeListener('error', lost); client.removeListener('end', lost);
  }
  try {
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('clinical_source_lock_unavailable');
    for (const wallet of wallets) {
      const key = 'private-user:' + wallet;
      if ((await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [key])).rows[0]?.locked !== true) throw Error('clinical_source_busy');
      held.push(key);
    }
    return {
      async assertHeld() {
        if (!valid) throw Error('clinical_source_lock_lost');
        for (const key of held) {
          const row = (await client.query(`SELECT pg_backend_pid() AS pid,
            EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted AND objsubid=1
              AND objid::bigint=(hashtext($1)::bigint & 4294967295)
              AND classid::bigint=CASE WHEN hashtext($1)<0 THEN 4294967295 ELSE 0 END) AS held`, [key])).rows[0];
          if (!valid || Number(row?.pid) !== pid || row?.held !== true) { valid = false; throw Error('clinical_source_lock_lost'); }
        }
      },
      release,
    };
  } catch (error) { await release(); throw error; }
}
