import { createServer as createHttpServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const authDirectory = join(root, 'e2e', 'clinical-auth');
const MAX_BODY_BYTES = 20_000;
const MAX_TOKEN_BYTES = 16_384;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff': 'font/woff', '.woff2': 'font/woff2' };
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://auth.privy.io https://*.privy.io https://challenges.cloudflare.com; frame-src https://auth.privy.io https://*.privy.io https://challenges.cloudflare.com; img-src 'self' data: blob: https://*.privy.io; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
class RequestFailure extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
const failure = code => new Error(code);
function configuration(input) {
  const { appId, port = 3018, mode = 'inspect', runId, target, expectedPatient,
    timeoutMs = 300_000, signal } = input;
  let targetUrl;
  try { targetUrl = new URL(target); } catch { throw failure('clinical_local_auth_configuration_invalid'); }
  if (typeof appId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(appId) ||
      !Number.isInteger(port) || port < 0 || port > 65535 ||
      !['inspect', 'run', 'execute'].includes(mode) ||
      typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(runId) ||
      !['http:', 'https:'].includes(targetUrl.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(targetUrl.hostname) ||
      targetUrl.username || targetUrl.password || targetUrl.search || targetUrl.hash ||
      targetUrl.pathname !== '/' ||
      (expectedPatient !== undefined && (typeof expectedPatient !== 'string' || !/^G[A-Z2-7]{55}$/.test(expectedPatient))) ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 1_800_000 ||
      (signal !== undefined && !(signal instanceof AbortSignal))) {
    throw failure('clinical_local_auth_configuration_invalid');
  }
  return { appId, port, mode, runId, target: targetUrl.origin, expectedPatient, timeoutMs, signal };
}
function oneHeader(request, name) {
  let count = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    if (request.rawHeaders[i].toLowerCase() === name) count++;
  }
  const value = request.headers[name];
  return count === 1 && typeof value === 'string' ? value : null;
}
function send(response, status, body, contentType = 'application/json; charset=utf-8', head = false) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': contentType,
    'Content-Length': bytes.byteLength, 'Connection': 'close' });
  response.end(head ? undefined : bytes);
}
function readJson(request) {
  if (oneHeader(request, 'content-type') !== 'application/json') {
    throw new RequestFailure(415, 'clinical_local_auth_json_required');
  }
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new RequestFailure(413, 'clinical_local_auth_body_too_large');
  }
  return new Promise((resolve, reject) => {
    let total = 0, finished = false;
    const chunks = [];
    const clean = () => {
      request.off('data', data); request.off('end', end); request.off('aborted', abort);
      request.off('error', abort);
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
    };
    const rejectBody = error => {
      if (finished) return;
      finished = true; clean(); request.resume(); reject(error);
    };
    const abort = () => rejectBody(new RequestFailure(400, 'clinical_local_auth_request_invalid'));
    const data = chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        rejectBody(new RequestFailure(413, 'clinical_local_auth_body_too_large')); return;
      }
      chunks.push(Buffer.from(chunk));
    };
    const end = () => {
      if (finished) return;
      finished = true;
      const bytes = Buffer.concat(chunks);
      try {
        const value = JSON.parse(bytes.toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        resolve(value);
      } catch { reject(new RequestFailure(400, 'clinical_local_auth_request_invalid')); }
      finally { bytes.fill(0); clean(); }
    };
    request.on('data', data); request.once('end', end);
    request.once('aborted', abort); request.once('error', abort);
  });
}
async function compileAuthAssets(appId) {
  try {
    const { build } = await import('vite');
    const result = await build({
      root: authDirectory, configFile: false, envDir: false, envPrefix: [], publicDir: false, logLevel: 'silent',
      define: { 'process.env.NEXT_PUBLIC_PRIVY_APP_ID': JSON.stringify(appId) },
      resolve: { alias: { '@': join(root, 'src') } },
      esbuild: { jsx: 'automatic', tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } } },
      css: { postcss: { plugins: [] } },
      build: { write: false, emptyOutDir: false, sourcemap: false, reportCompressedSize: false },
    });
    const outputs = Array.isArray(result) ? result.flatMap(item => item.output) : result.output;
    const assets = new Map();
    for (const item of outputs ?? []) {
      if (item.fileName !== 'index.html' && !/^assets\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(item.fileName)) {
        throw new Error();
      }
      assets.set('/' + item.fileName, Buffer.from(item.type === 'asset' ? item.source : item.code));
    }
    if (!assets.has('/index.html')) throw new Error();
    return assets;
  } catch { throw failure('clinical_local_auth_build_unavailable'); }
}

/** Internal HTTP adapter is exported so security tests need no Privy session or build.
 * No filesystem is served: only Vite's emitted, in-memory page and assets. */
export async function createClinicalLocalAuthServer(input, { assets = new Map(), now = Date.now } = {}) {
  const options = configuration(input);
  if (options.signal?.aborted) throw failure('clinical_local_auth_aborted');
  const pageAssets = new Map(assets);
  if ([...pageAssets.keys()].some(path => path !== '/index.html' && !/^\/assets\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(path))) {
    throw failure('clinical_local_auth_configuration_invalid');
  }
  const nonce = randomBytes(32);
  let phase = 'waiting', url, expectedHost, expiresAt, timer, closing;
  let resolveAuthorization, rejectAuthorization;
  let authorization = new Promise((resolve, reject) => { resolveAuthorization = resolve; rejectAuthorization = reject; });
  // The caller may claim the promise after cancellation; do not create an unhandled rejection.
  authorization.catch(() => {});
  const rejectWaiting = code => {
    nonce.fill(0);
    if (phase === 'waiting') {
      phase = 'expired';
      rejectAuthorization?.(failure(code));
      resolveAuthorization = null; rejectAuthorization = null;
    }
  };
  const server = createHttpServer({ maxHeaderSize: 8192 }, async (request, response) => {
    try {
      if (!LOOPBACK.has(request.socket.remoteAddress) || oneHeader(request, 'host') !== expectedHost) {
        send(response, 403, { error: 'clinical_local_auth_forbidden' }); return;
      }
      const path = request.url;
      const control = path === '/__context' || path === '/__auth';
      if (control && (request.method !== 'POST' || oneHeader(request, 'origin') !== url ||
          (request.headers['sec-fetch-site'] !== undefined && request.headers['sec-fetch-site'] !== 'same-origin'))) {
        send(response, 403, { error: 'clinical_local_auth_forbidden' }); return;
      }
      if (!control && request.headers.origin !== undefined && oneHeader(request, 'origin') !== url) {
        send(response, 403, { error: 'clinical_local_auth_forbidden' }); return;
      }
      if (phase === 'waiting' && now() >= expiresAt) rejectWaiting('clinical_local_auth_expired');
      if (phase !== 'waiting' && control) {
        send(response, 410, { error: 'clinical_local_auth_unavailable' }); return;
      }
      if (control) {
        const body = await readJson(request);
        // Recheck after streaming: concurrent requests, expiry, close and abort must not win a race.
        if (phase === 'waiting' && now() >= expiresAt) rejectWaiting('clinical_local_auth_expired');
        if (phase !== 'waiting') { send(response, 410, { error: 'clinical_local_auth_unavailable' }); return; }
        if (path === '/__context') {
          if (Object.keys(body).length) throw new RequestFailure(400, 'clinical_local_auth_request_invalid');
          send(response, 200, { nonce: nonce.toString('hex'), mode: options.mode, runId: options.runId,
            target: options.target, expectedPatient: options.expectedPatient ?? null, expiresAt });
          return;
        }
        if (Object.keys(body).sort().join(',') !== 'accessToken,confirmed,confirmedSynthetic,nonce' ||
            typeof body.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(body.nonce) ||
            body.confirmed !== true || body.confirmedSynthetic !== (options.mode !== 'inspect') ||
            typeof body.accessToken !== 'string' || body.accessToken.length > MAX_TOKEN_BYTES ||
            !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.accessToken)) {
          throw new RequestFailure(400, 'clinical_local_auth_request_invalid');
        }
        if (!timingSafeEqual(nonce, Buffer.from(body.nonce, 'hex'))) {
          throw new RequestFailure(403, 'clinical_local_auth_forbidden');
        }
        phase = 'authorized'; nonce.fill(0); clearTimeout(timer);
        send(response, 200, { accepted: true });
        resolveAuthorization({ accessToken: body.accessToken, confirmedSynthetic: body.confirmedSynthetic });
        resolveAuthorization = null; rejectAuthorization = null;
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        send(response, 405, { error: 'clinical_local_auth_method_invalid' }); return;
      }
      const asset = pageAssets.get(path === '/' ? '/index.html' : path);
      if (!asset) { send(response, 404, { error: 'clinical_local_auth_not_found' }); return; }
      send(response, 200, asset, MIME[extname(path === '/' ? '/index.html' : path)] ?? 'application/octet-stream', request.method === 'HEAD');
    } catch (error) {
      if (!response.headersSent && !response.destroyed) {
        send(response, error instanceof RequestFailure ? error.status : 503,
          { error: error instanceof RequestFailure ? error.message : 'clinical_local_auth_unavailable' });
      }
    }
  });
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  const stop = code => {
    if (closing) return closing;
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    rejectWaiting(code);
    phase = 'closed'; pageAssets.clear();
    closing = new Promise(resolve => {
      server.close(() => resolve());
      server.closeIdleConnections();
      server.closeAllConnections();
    });
    return closing;
  };
  const onAbort = () => { void stop('clinical_local_auth_aborted'); };
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
  } catch {
    rejectWaiting('clinical_local_auth_server_unavailable');
    throw failure('clinical_local_auth_server_unavailable');
  }
  expectedHost = '127.0.0.1:' + server.address().port;
  url = 'http://' + expectedHost;
  expiresAt = now() + options.timeoutMs;
  timer = setTimeout(() => { void stop('clinical_local_auth_expired'); }, options.timeoutMs);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  return {
    url,
    waitForAuthorization() {
      if (!authorization) return Promise.reject(failure('clinical_local_auth_already_claimed'));
      const pending = authorization; authorization = null;
      return pending;
    },
    close() { return stop('clinical_local_auth_closed'); },
  };
}

/** Starts a local Privy companion. Its one-shot result is memory-only; this module
 * never logs credentials, loads workspace env files or calls application APIs. */
export async function startClinicalLocalAuth(input) {
  const options = configuration(input);
  if (options.signal?.aborted) throw failure('clinical_local_auth_aborted');
  const assets = await compileAuthAssets(options.appId);
  if (options.signal?.aborted) throw failure('clinical_local_auth_aborted');
  return createClinicalLocalAuthServer(options, { assets });
}
