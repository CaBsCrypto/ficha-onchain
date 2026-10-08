import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createClinicalLocalAuthServer } from './clinical-local-auth.mjs';

const base = { appId: 'public-app-test', mode: 'inspect', runId: 'auth-test',
  target: 'http://localhost:3000', port: 0, timeoutMs: 60_000 };
const fakeToken = 'test-header.test-payload.test-signature';
const assets = () => new Map([
  ['/index.html', Buffer.from('<!doctype html><title>Local test</title>')],
  ['/assets/page.js', Buffer.from('export {};')],
]);
async function fixture(t, options = {}, adapters = {}) {
  const auth = await createClinicalLocalAuthServer({ ...base, ...options }, { assets: assets(), ...adapters });
  t.after(() => auth.close());
  return auth;
}
function exchange(url, path, { method = 'POST', headers = {}, body = {}, rawBody, chunked = false } = {}) {
  const destination = new URL(url);
  const bytes = rawBody === undefined ? Buffer.from(JSON.stringify(body)) : Buffer.from(rawBody);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: destination.hostname, port: destination.port, path, method,
      headers: { Origin: url, 'Content-Type': 'application/json',
        ...(!chunked && method === 'POST' ? { 'Content-Length': bytes.length } : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', data => chunks.push(data));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data; try { data = JSON.parse(text); } catch { data = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, data });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (method === 'POST') {
      if (chunked) { req.write(bytes.subarray(0, 500)); req.write(bytes.subarray(500)); req.end(); }
      else req.end(bytes);
    } else req.end();
  });
}
const context = async auth => {
  const response = await exchange(auth.url, '/__context');
  assert.equal(response.status, 200);
  return response.data;
};
const authorization = (ctx, synthetic = false) => ({
  nonce: ctx.nonce, accessToken: fakeToken, confirmed: true, confirmedSynthetic: synthetic,
});

test('context is local, bounded in time, and does not expose credentials', async t => {
  const auth = await fixture(t, { expectedPatient: 'G' + 'A'.repeat(55) });
  const response = await exchange(auth.url, '/__context');
  assert.equal(response.status, 200);
  assert.match(response.data.nonce, /^[a-f0-9]{64}$/);
  assert.equal(response.data.expectedPatient, 'G' + 'A'.repeat(55));
  assert.equal(response.data.mode, 'inspect');
  assert.equal(response.data.target, base.target);
  assert.equal('accessToken' in response.data, false);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('forged host, missing/foreign/duplicate origin, and cross-site requests are rejected', async t => {
  const auth = await fixture(t);
  for (const headers of [
    { Host: 'attacker.invalid' }, { Origin: '' }, { Origin: 'https://attacker.invalid' },
    { Origin: [auth.url, 'https://attacker.invalid'] }, { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
  ]) {
    const response = await exchange(auth.url, '/__context', { headers });
    assert.equal(response.status, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  const ctx = await context(auth);
  const response = await exchange(auth.url, '/__auth', {
    headers: { Origin: 'https://attacker.invalid' }, body: authorization(ctx),
  });
  assert.equal(response.status, 403);
  assert.equal((await exchange(auth.url, '/__context', { method: 'OPTIONS' })).status, 403);
});

test('JSON content type, valid JSON, and exact context fields are required', async t => {
  const auth = await fixture(t);
  assert.equal((await exchange(auth.url, '/__context', { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  for (const rawBody of ['{', 'null', '[]', '"string"']) {
    assert.equal((await exchange(auth.url, '/__context', { rawBody })).status, 400);
  }
  assert.equal((await exchange(auth.url, '/__context', { body: { unexpected: true } })).status, 400);
  assert.equal((await context(auth)).mode, 'inspect');
});

test('declared and streamed oversized bodies are rejected before a token can be accepted', async t => {
  const auth = await fixture(t);
  const ctx = await context(auth);
  const rawBody = JSON.stringify({ ...authorization(ctx), accessToken: 'a'.repeat(22_000) });
  for (const chunked of [false, true]) {
    assert.equal((await exchange(auth.url, '/__auth', { rawBody, chunked })).status, 413);
  }
  assert.equal((await exchange(auth.url, '/__auth', { body: authorization(ctx) })).status, 200);
  assert.deepEqual(await auth.waitForAuthorization(), { accessToken: fakeToken, confirmedSynthetic: false });
});

test('authorization requires exact fields, a valid nonce, a JWT-shaped token, and explicit confirmation', async t => {
  const auth = await fixture(t);
  const ctx = await context(auth);
  const good = authorization(ctx);
  const invalid = [
    { ...good, additional: 'rejected' }, { ...good, nonce: '0'.repeat(64) },
    { ...good, nonce: 'short' }, { ...good, confirmed: false }, { ...good, confirmed: 'true' },
    { ...good, confirmedSynthetic: true }, { ...good, confirmedSynthetic: 'false' },
    { ...good, accessToken: 'not-a-jwt' }, { ...good, accessToken: 1 },
    { ...good, accessToken: 'a'.repeat(16_385) + '.b.c' },
  ];
  for (const body of invalid) {
    assert.ok([400, 403].includes((await exchange(auth.url, '/__auth', { body })).status));
  }
  const missing = { ...good }; delete missing.confirmed;
  assert.equal((await exchange(auth.url, '/__auth', { body: missing })).status, 400);
  assert.equal((await exchange(auth.url, '/__auth', { body: good })).status, 200);
  assert.deepEqual(await auth.waitForAuthorization(), { accessToken: fakeToken, confirmedSynthetic: false });
});

test('run and execute modes require the synthetic transaction confirmation', async t => {
  for (const mode of ['run', 'execute']) {
    const auth = await fixture(t, { mode });
    const ctx = await context(auth);
    assert.equal(ctx.mode, mode);
    assert.equal((await exchange(auth.url, '/__auth', { body: authorization(ctx, false) })).status, 400);
    assert.equal((await exchange(auth.url, '/__auth', { body: authorization(ctx, true) })).status, 200);
    assert.deepEqual(await auth.waitForAuthorization(), { accessToken: fakeToken, confirmedSynthetic: true });
  }
});

test('concurrent captures and later replay cannot deliver more than one authorization', async t => {
  const auth = await fixture(t);
  const pending = auth.waitForAuthorization();
  const ctx = await context(auth);
  const responses = await Promise.all([
    exchange(auth.url, '/__auth', { body: authorization(ctx) }),
    exchange(auth.url, '/__auth', { body: authorization(ctx) }),
  ]);
  assert.deepEqual(responses.map(item => item.status).sort(), [200, 410]);
  assert.deepEqual(await pending, { accessToken: fakeToken, confirmedSynthetic: false });
  assert.equal((await exchange(auth.url, '/__auth', { body: authorization(ctx) })).status, 410);
  assert.equal((await exchange(auth.url, '/__context')).status, 410);
  await assert.rejects(auth.waitForAuthorization(), /clinical_local_auth_already_claimed/);
});

test('expiry during an open session rejects both capture and pending authorization', async t => {
  let now = 100;
  const auth = await fixture(t, { timeoutMs: 60_000 }, { now: () => now });
  const pending = auth.waitForAuthorization();
  const rejected = assert.rejects(pending, /clinical_local_auth_expired/);
  const ctx = await context(auth);
  now = ctx.expiresAt;
  assert.equal((await exchange(auth.url, '/__auth', { body: authorization(ctx) })).status, 410);
  await rejected;
});

test('close is idempotent, rejects pending authorization, and releases the listener', async t => {
  const auth = await fixture(t);
  const pending = auth.waitForAuthorization();
  const rejected = assert.rejects(pending, /clinical_local_auth_closed/);
  await Promise.all([auth.close(), auth.close()]);
  await rejected;
  await assert.rejects(exchange(auth.url, '/__context'), { code: 'ECONNREFUSED' });
});

test('abort rejects pending authorization and stops the local listener', async t => {
  const controller = new AbortController();
  const auth = await fixture(t, { signal: controller.signal });
  const pending = auth.waitForAuthorization();
  const rejected = assert.rejects(pending, /clinical_local_auth_aborted/);
  controller.abort();
  await rejected; await auth.close();
  await assert.rejects(exchange(auth.url, '/__context'), { code: 'ECONNREFUSED' });
  await assert.rejects(createClinicalLocalAuthServer({ ...base, signal: controller.signal }), /clinical_local_auth_aborted/);
});

test('abort still closes the companion after its authorization has been consumed', async t => {
  const controller = new AbortController();
  const auth = await fixture(t, { signal: controller.signal });
  const ctx = await context(auth);
  assert.equal((await exchange(auth.url, '/__auth', { body: authorization(ctx) })).status, 200);
  await auth.waitForAuthorization();
  controller.abort();
  await assert.rejects(exchange(auth.url, '/__context'), { code: 'ECONNREFUSED' });
});

test('only compiled page assets are served; repository files and query URLs stay inaccessible', async t => {
  const auth = await fixture(t);
  assert.equal((await exchange(auth.url, '/', { method: 'GET' })).status, 200);
  assert.equal((await exchange(auth.url, '/assets/page.js', { method: 'GET' })).status, 200);
  for (const path of ['/.env.local', '/.trustleaf-local/secrets.dpapi', '/.git/config',
    '/@fs/C:/repository/.env.local', '/src/providers/PrivyProvider.tsx',
    '/node_modules/@privy-io/react-auth/package.json', '/?nonce=secret', '/%2e%2e/.env.local',
    '/__auth?accessToken=secret', '/assets/../index.html']) {
    const response = await exchange(auth.url, path, { method: 'GET' });
    assert.equal(response.status, 404);
    assert.equal(response.text.includes('secret'), false);
  }
});

test('configuration cannot target a remote origin or hide credentials in a URL', async () => {
  for (const overrides of [
    { target: 'https://production.invalid' }, { target: 'http://secret@localhost:3000' },
    { target: 'http://localhost:3000/?token=secret' }, { target: 'http://localhost:3000/#secret' },
    { target: 'file:///tmp' }, { target: 'http://localhost:3000/api' },
    { mode: 'unexpected' }, { appId: 'bad app id' }, { port: -1 }, { timeoutMs: 0 },
    { expectedPatient: 'private-value' },
  ]) {
    await assert.rejects(createClinicalLocalAuthServer({ ...base, ...overrides }), /clinical_local_auth_configuration_invalid/);
  }
  await assert.rejects(createClinicalLocalAuthServer(base, { assets: new Map([['/@fs/file', Buffer.from('blocked')]]) }),
    /clinical_local_auth_configuration_invalid/);
});

test('the authorization deadline automatically stops the local listener', async t => {
  const auth = await fixture(t, { timeoutMs: 20 });
  await assert.rejects(auth.waitForAuthorization(), /clinical_local_auth_expired/);
  await assert.rejects(exchange(auth.url, '/__context'), { code: 'ECONNREFUSED' });
});
