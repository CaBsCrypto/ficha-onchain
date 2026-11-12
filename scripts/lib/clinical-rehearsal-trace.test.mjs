import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Trace the actual policy without letting an accidental glob crawl dependencies
// or inspect private runtime files. This catches the production-build regression.
test('policy and retention tracing never search for or bundle private runtime records', async () => {
  const require = createRequire(import.meta.url);
  const globId = require.resolve('next/dist/compiled/glob');
  const original = require(globId);
  const patterns = [];
  const stub = (pattern, options, callback) => {
    patterns.push(String(pattern));
    if (typeof options === 'function') options(null, []);
    else callback?.(null, []);
    return { on() { return this; } };
  };
  stub.sync = () => [];
  stub.glob = stub;
  require.cache[globId].exports = stub;
  try {
    const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const result = await nodeFileTrace([resolve(root, 'scripts/lib/clinical-rehearsal-policy.mjs'), resolve(root, 'scripts/lib/clinical-receipt-retention.mjs')], {
      base: root, processCwd: root, ignore: ['**/node_modules/**'],
    });
    assert.deepEqual(patterns, [], 'runtime paths must not trigger static recursive searches');
    assert.ok([...result.fileList].every(file => !file.endsWith('.private.json')));
    assert.ok([...result.fileList].some(file => file.endsWith('clinical-rehearsal-policy.mjs')));
    assert.ok([...result.fileList].some(file => file.endsWith('clinical-receipt-retention.mjs')));
  } finally {
    require.cache[globId].exports = original;
  }
});
