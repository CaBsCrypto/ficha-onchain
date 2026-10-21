import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { StrKey } from '@stellar/stellar-sdk';
import { acquireClinicalSourceLocks } from './clinical-source-lock.mjs';

const wallet = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
function connections() {
  const owners = new Map();
  const client = pid => {
    const instance = new EventEmitter(); instance.pid = pid;
    instance.query = async (sql, [key] = []) => {
      if (sql.includes('pg_try_advisory_lock')) {
        const available = !owners.has(key) || owners.get(key) === instance.pid;
        if (available) owners.set(key, instance.pid);
        return { rows: [{ locked: available }] };
      }
      if (sql.includes('pg_advisory_unlock')) { if (owners.get(key) === instance.pid) owners.delete(key); return { rows: [] }; }
      return { rows: [{ pid: instance.pid, held: owners.get(key) === instance.pid }] };
    }; return instance;
  };
  return { owners, first: client(100), second: client(200) };
}
test('two sources compete in the existing private-user namespace and only one owns the wallet', async () => {
  const f = connections(), first = await acquireClinicalSourceLocks(f.first, [wallet]);
  await first.assertHeld(); assert.equal(f.owners.has('private-user:' + wallet), true);
  await assert.rejects(() => acquireClinicalSourceLocks(f.second, [wallet]), { message: 'clinical_source_busy' });
  await first.release();
  const second = await acquireClinicalSourceLocks(f.second, [wallet]); await second.assertHeld(); await second.release();
  assert.equal(f.owners.size, 0);
});
test('connection loss, backend change or removed lock prevents further work', async () => {
  for (const mutate of [f => f.first.emit('error', Error('provider secret')), f => { f.first.pid = 300; }, f => f.owners.clear()]) {
    const f = connections(), lock = await acquireClinicalSourceLocks(f.first, [wallet]);
    mutate(f); await assert.rejects(() => lock.assertHeld(), { message: 'clinical_source_lock_lost' }); await lock.release();
  }
});
