import { setTimeout as delay } from 'node:timers/promises';

export const authorityLockName = authority => 'trustleaf-booking:' + authority;

/** A dedicated session owns the lock; never silently reconnect this client. */
export function sessionGuard(client, authority, signal) {
  let lost = false;
  const fail = () => { lost = true; };
  client.on('error', fail);
  client.on('end', fail);
  return {
    async assert() {
      if (lost || signal.aborted) throw Error('worker_session_unavailable');
      try {
        const result = await client.query(`SELECT EXISTS(SELECT 1 FROM pg_locks
          WHERE locktype='advisory' AND granted AND pid=pg_backend_pid()
          AND objid=hashtext($1)::oid AND objsubid=1) AS owned`, [authorityLockName(authority)]);
        if (!result.rows[0]?.owned || lost || signal.aborted) throw Error();
      } catch { lost = true; throw Error('worker_session_unavailable'); }
    },
    dispose() { client.off('error', fail); client.off('end', fail); },
  };
}

export function guardedChain(chain, guard) {
  return { ...chain,
    prepare: async (...args) => { await guard.assert(); const result = await chain.prepare(...args); await guard.assert(); return result; },
    submit: async (...args) => { await guard.assert(); return chain.submit(...args); },
  };
}

export async function pause(signal, milliseconds = 3000) {
  try { await delay(milliseconds, undefined, { signal }); }
  catch (error) { if (error.name !== 'AbortError') throw error; }
}

/** Waiting is not readiness. Acquire once per session, retry without spinning. */
export async function waitForAuthorityLock(client, authority, { watch, signal, log, wait = pause }) {
  while (!signal.aborted) {
    const result = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [authorityLockName(authority)]);
    if (result.rows[0]?.locked) return true;
    log({ status: 'waiting_for_lock' });
    if (!watch) return false;
    await wait(signal);
  }
  return false;
}
