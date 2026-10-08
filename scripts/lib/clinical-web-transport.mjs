import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, lstat, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export function clinicalLoopbackTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('rehearsal_target_invalid'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.port) throw Error('rehearsal_target_invalid');
  return url.origin;
}

/** Credentials exist only in this closure. Requests cannot redirect them to
 * another host. Provider payloads and raw exceptions never become diagnostics. */
export function createClinicalWebApi({ target, accessToken, fetchImpl = fetch, signal }) {
  const origin = clinicalLoopbackTarget(target);
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 16000) throw Error('rehearsal_auth_invalid');
  const uuid = id => { if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw Error('rehearsal_operation_invalid'); return id; };
  async function request(path, body, binary = false) {
    let response;
    try {
      response = await fetchImpl(origin + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', cache: 'no-store',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
        headers: { Authorization: `Bearer ${accessToken}`, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw Error('rehearsal_response_uncertain'); }
    if (!response.ok) {
      // Never reflect response bodies: they may contain clinical/provider data.
      throw Error(response.status === 401 ? 'rehearsal_session_expired' : response.status === 403 ? 'rehearsal_access_denied' : `rehearsal_http_${response.status}`);
    }
    if (!/\bno-store\b/i.test(response.headers.get('cache-control') ?? '')) throw Error('rehearsal_cache_policy_invalid');
    const limit = binary ? 3000000 : 1000000;
    const chunks = []; let size = 0;
    for await (const chunk of response.body ?? []) {
      size += chunk.byteLength; if (size > limit) { await response.body?.cancel().catch(() => {}); throw Error('rehearsal_response_too_large'); }
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);
    const mediaType = (response.headers.get('content-type') ?? '').split(';')[0];
    if (binary && mediaType !== 'application/json') {
      if (!['application/pdf','image/png','image/jpeg'].includes(mediaType) || response.headers.get('x-content-type-options') !== 'nosniff') throw Error('rehearsal_document_invalid');
      return { content, mediaType };
    }
    if (mediaType !== 'application/json') throw Error('rehearsal_response_invalid');
    try { return JSON.parse(content.toString('utf8')); } catch { throw Error('rehearsal_response_invalid'); }
  }
  return {
    wallet: () => request('/api/privy/stellar-wallet'),
    snapshot: () => request('/api/private-clinical-history'),
    prepare: payload => request('/api/private-clinical-operations', payload),
    sign: id => request(`/api/private-clinical-operations/${uuid(id)}/sign`, { confirmed: true }),
    inspect: id => request(`/api/private-clinical-operations/${uuid(id)}`),
    document: (entryId, version) => {
      if (!/^[a-f0-9]{64}$/.test(entryId) || !Number.isSafeInteger(version) || version < 1) throw Error('rehearsal_document_invalid');
      return request(`/api/private-clinical-history/document?entryId=${entryId}&version=${version}`, undefined, true);
    },
    dispose: () => { accessToken = ''; },
  };
}

/** One local process per run. The API itself owns the cross-flow DB wallet
 * lock; taking that lock here would deadlock API preparation. Never steal a
 * stale journal lock automatically: inspect the owning process first. */
export async function openClinicalWebJournal({ directory, runId }) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(runId)) throw Error('rehearsal_run_invalid');
  const root = resolve(directory); await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink()) throw Error('rehearsal_journal_invalid');
  const folder = join(root, runId); await mkdir(folder, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  if ((await lstat(folder)).isSymbolicLink()) throw Error('rehearsal_journal_invalid');
  const lockPath = join(folder, 'process.lock'), file = join(folder, 'journal.json');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(JSON.stringify({ pid: process.pid })); }
  catch { throw Error('rehearsal_run_locked'); }
  let closed = false;
  return {
    async load() {
      try {
        const info = await lstat(file); if (info.isSymbolicLink() || !info.isFile() || info.size > 2000000) throw Error();
        return JSON.parse(await readFile(file, 'utf8'));
      } catch (error) { if (error.code === 'ENOENT') return null; throw Error('rehearsal_journal_invalid'); }
    },
    async save(state) {
      if (closed) throw Error('rehearsal_journal_closed');
      const serialized = JSON.stringify(state, null, 2);
      if (serialized.length > 2000000 || /accessToken|authorization|Bearer |eyJ[a-zA-Z0-9_-]{20,}/.test(serialized)) throw Error('rehearsal_journal_invalid');
      const temp = join(folder, `${randomUUID()}.tmp`);
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(serialized); await handle.sync(); } finally { await handle.close(); }
      await rename(temp, file);
    },
    async close() { if (!closed) { closed = true; await lock.close(); await unlink(lockPath); } },
  };
}
