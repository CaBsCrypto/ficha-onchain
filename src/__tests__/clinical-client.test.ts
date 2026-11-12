// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewedOperation } from './fixtures/clinical-operation-review';
import { CLINICAL_PREPARE_CAPABILITY_HEADER, CLINICAL_PREPARE_CAPABILITY_VERSION } from '@/lib/clinical/client-contract';
import type { ClinicalOperation, ClinicalSnapshot, ClinicalVersion } from '@/types/clinical';
import { CLINICAL_READ_TIMEOUT_MS, CLINICAL_SNAPSHOT_READ_TIMEOUT_MS, ClinicalClientError, ClinicalOperationController, clinicalSignDiagnostic, clinicalPrivySigningError, clinicalApi, readClinicalDownload, readClinicalFile, readClinicalPrescriptions, useClinicalOperation, useClinicalSnapshot, validateClinicalFile, verifiedClinicalOperation } from '@/components/private-portal/clinical-client';
import { ClinicalEntryForm } from '@/components/private-portal/ClinicalEntryForm';
import { ClinicalHistory } from '@/components/private-portal/ClinicalHistory';
import { ClinicalPermissions } from '@/components/private-portal/ClinicalPermissions';

const deps = vi.hoisted(() => ({ fetch: vi.fn(), sign: vi.fn(async () => ({ signature: '0x' + '7'.repeat(128) })), userId: 'did:privy:patient1' }));
vi.mock('@privy-io/react-auth/extended-chains', () => ({ useSignRawHash: () => ({ signRawHash: deps.sign }) }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: deps.fetch }));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: deps.userId } }) }));
vi.mock('@/components/private-portal/WalletBoundary', () => ({ usePortalWallet: () => ({ walletId: 'wallet1', address: 'G' + 'A'.repeat(55) }) }));
const ID = '09fedaff-8110-4415-8b5c-3409bf0a5731';
const OTHER = '18d482c5-aeae-448b-a37c-a17bfc8042d2';
const op = (overrides: Partial<ClinicalOperation> = {}): ClinicalOperation => reviewedOperation({ id: ID, action: 'append_version', state: 'awaiting_signature', expiresAt: 1_900_000_000, transactionHash: null, errorCode: null, signing: overrides.state && overrides.state !== 'awaiting_signature' ? undefined : { address: 'G' + 'A'.repeat(55), hash: '1'.repeat(64), network: 'testnet', expiresAt: overrides.expiresAt ?? 1_900_000_000 }, ...overrides });
const note = { title: 'Antecedente sintético', text: 'Información de prueba', eventDate: null };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const version = (overrides: Partial<ClinicalVersion> = {}): ClinicalVersion => ({ entryId: '1'.repeat(64), version: 1, author: 'G' + 'A'.repeat(55), source: 'patient', createdAt: 1_800_000_000, title: note.title, mediaType: 'application/json', fileName: 'antecedente.json', note, transactionHash: 'a'.repeat(64), canCorrect: true, ...overrides });
const snapshot = (entries: ClinicalVersion[] = []): ClinicalSnapshot => ({ writes: {create_history:true,append_version:true,set_permissions:true}, history: { id: '9'.repeat(64), patient: 'G' + 'A'.repeat(55), createdAt: 1_800_000_000 }, entries, operations: [], grants: [], verifiedAt: '2026-10-08T05:00:00Z' });
let roots: Array<{ root: Root; host: HTMLDivElement }> = [];
async function mount(node: React.ReactNode) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push({ root, host }); await act(async () => root.render(node)); return { root, host }; }
beforeEach(() => { vi.clearAllMocks(); deps.userId = 'did:privy:patient1'; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { for (const { root, host } of roots) { await act(async () => root.unmount()); host.remove(); } roots = []; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('clinical attempt recovery', () => {
  it('does not impose a snapshot deadline on an uncertain preparation or create a replacement intent', async () => {
    vi.useFakeTimers(); const late = deferred<any>(); let signal!: AbortSignal;
    deps.fetch.mockImplementationOnce((_path, init) => { signal = init.signal; return late.promise; });
    const client = new ClinicalOperationController(clinicalApi, () => {}, () => ID);
    const preparation = client.prepare({ action: 'append_version', note });
    await vi.advanceTimersByTimeAsync(CLINICAL_SNAPSHOT_READ_TIMEOUT_MS + 1);
    expect(signal.aborted).toBe(false); expect(client.snapshot().busy).toBe(true); expect(deps.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0); expect(deps.sign).not.toHaveBeenCalled();
    late.resolve(response({ operation: op() })); await preparation;
    expect(client.snapshot()).toMatchObject({ busy: false, operation: { id: ID, state: 'awaiting_signature' } });
  });
  it.each([{ elapsed: 90_001, deliver: true }, { elapsed: 300_001, deliver: false }])('keeps Privy pending independently of read deadlines at $elapsed ms, enforcing the original quote before delivery', async ({ elapsed, deliver }) => {
    vi.useFakeTimers(); const preparedAt = Math.floor(Date.now() / 1000), late = deferred<{ signature: string }>();
    const prepared = op({ sponsorship: { maxFeeStroops: '4001000', quotePreparedAt: preparedAt, quoteExpiresAt: preparedAt + 300, quoteValidUntil: preparedAt + 300 } });
    const sign = vi.fn(() => late.promise);
    deps.fetch.mockResolvedValueOnce(response({ operation: prepared })).mockResolvedValueOnce(response({ operation: op({ state: 'submitted', transactionHash: 'a'.repeat(64) }) }));
    const client = new ClinicalOperationController(clinicalApi, () => {}, () => ID, { address: 'G' + 'A'.repeat(55), sign });
    await client.prepare({ action: 'append_version', note }); const signing = client.sign();
    await vi.advanceTimersByTimeAsync(elapsed);
    expect(client.snapshot().busy).toBe(true); expect(sign).toHaveBeenCalledOnce(); expect(deps.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    if (deliver) {
      late.resolve({ signature: '0x' + '7'.repeat(128) }); await signing;
      expect(client.snapshot().operation?.state).toBe('submitted'); expect(deps.fetch).toHaveBeenCalledTimes(2);
      expect(deps.fetch.mock.calls[1][0]).toBe('/api/private-clinical-operations/' + ID + '/sign');
    } else {
      const rejected = expect(signing).rejects.toMatchObject({ code: 'clinical_quote_expired' });
      late.resolve({ signature: '0x' + '7'.repeat(128) }); await rejected;
      expect(client.snapshot()).toMatchObject({ busy: false, operation: { id: ID, state: 'awaiting_signature' } });
      expect(deps.fetch).toHaveBeenCalledOnce();
    }
  });

  it('discards a late Privy signature after disposal and activation without posting it', async () => {
    const late=deferred<{signature:string}>(), sign=vi.fn(()=>late.promise), request=vi.fn().mockResolvedValue({operation:op()});
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign});
    await client.prepare({action:'append_version',note}); const pending=client.sign();
    client.dispose();client.activate();late.resolve({signature:'0x'+'7'.repeat(128)});
    await expect(pending).rejects.toThrow('sesión cambió');expect(request).toHaveBeenCalledTimes(1);expect(client.snapshot().operation).toBeNull();
  });
  it('double signing clicks use one hook and one delivery to the exact operation', async () => {
    const late=deferred<{signature:string}>(), sign=vi.fn(()=>late.promise), request=vi.fn().mockResolvedValueOnce({operation:op()}).mockResolvedValueOnce({operation:op({state:'submitted',transactionHash:'a'.repeat(64)})});
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign});
    await client.prepare({action:'append_version',note});const pending=client.sign();await expect(client.sign()).rejects.toThrow('anterior');
    late.resolve({signature:'0x'+'7'.repeat(128)});await pending;expect(sign).toHaveBeenCalledOnce();
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({confirmed:true,signature:'0x'+'7'.repeat(128)});
  });
  it('a cancelled hook sends nothing and preserves the same unsigned attempt', async () => {
    const request=vi.fn().mockResolvedValue({operation:op()}), sign=vi.fn().mockRejectedValue(Error('provider cancellation'));
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign});
    await client.prepare({action:'append_version',note});await expect(client.sign()).rejects.toThrow();
    expect(request).toHaveBeenCalledOnce();expect(client.snapshot()).toMatchObject({uncertain:false,operation:{id:ID,state:'awaiting_signature'}});
  });
  it('does not deliver a signature when the intent expires while Privy is signing', async () => {
    const original=Date.now(), expiry=Math.floor(original/1000)+10;
    const request=vi.fn().mockResolvedValue({operation:op({expiresAt:expiry})}), sign=vi.fn(async()=>{vi.spyOn(Date,'now').mockReturnValue(expiry*1000+1);return{signature:'0x'+'7'.repeat(128)};});
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign});
    try {await client.prepare({action:'append_version',note});await expect(client.sign()).rejects.toThrow();expect(request).toHaveBeenCalledOnce();}
    finally {vi.restoreAllMocks();}
  });
  it('rejects a changed signing wallet or hash for the same saved intent', async () => {
    const original=op(), request=vi.fn().mockResolvedValueOnce({operation:original});
    const client=new ClinicalOperationController(request,()=>{},()=>ID);await client.prepare({action:'append_version',note});
    for(const change of [{hash:'2'.repeat(64)},{address:'G'+'B'.repeat(55)}]) {
      request.mockResolvedValueOnce({operation:{...original,signing:{...original.signing,...change}}});await expect(client.check()).rejects.toThrow();
      expect(client.snapshot().operation).toEqual(original);
    }
  });
  it('prevents double preparation and preserves an immutable request ID and payload after a lost response', async () => {
    const lost = deferred<{ operation: ClinicalOperation }>(); const request = vi.fn().mockReturnValueOnce(lost.promise); const newId = vi.fn(() => ID);
    const client = new ClinicalOperationController(request, () => {}, newId);
    const input = { action: 'append_version' as const, note: { ...note } };
    const first = client.prepare(input); input.note.text = 'Changed after preparation';
    await expect(client.prepare(input)).rejects.toThrow('intento anterior');
    lost.reject(new ClinicalClientError(0, 'network_unavailable')); await expect(first).rejects.toThrow();
    request.mockRejectedValueOnce(new ClinicalClientError(404, 'clinical_operation_not_found'));
    await expect(client.check()).rejects.toThrow();
    await expect(client.prepare({ action: 'create_history' })).rejects.toThrow('intento anterior');
    request.mockResolvedValueOnce({ operation: op() }); await client.prepareSaved();
    const original = JSON.parse(request.mock.calls[0][1].body); const retried = JSON.parse(request.mock.calls[2][1].body);
    expect(original).toEqual(retried); expect(retried.note.text).toBe(note.text); expect(newId).toHaveBeenCalledTimes(1);
  });
  it('recovers a lost signing response without another signature or a new operation', async () => {
    const submitted = op({ state: 'submitted', transactionHash: 'a'.repeat(64) });
    const request = vi.fn().mockResolvedValueOnce({ operation: op() }).mockRejectedValueOnce(new ClinicalClientError(0, 'network_unavailable')).mockResolvedValueOnce({ operation: submitted }).mockResolvedValueOnce({ operation: submitted });
    const client = new ClinicalOperationController(request, () => {}, () => ID, { address: 'G' + 'A'.repeat(55), sign: deps.sign });
    await client.prepare({ action: 'append_version', note }); await expect(client.sign()).rejects.toThrow();
    await expect(client.sign()).rejects.toThrow('consulta'); await client.check();
    expect(request.mock.calls[2][0]).toBe(`/api/private-clinical-operations/${ID}`);
    expect(request.mock.calls[2][1].method).toBeUndefined();
    await client.retry(); expect(request.mock.calls[3][0]).toBe(`/api/private-clinical-operations/${ID}/retry`);
    expect(JSON.parse(request.mock.calls[3][1].body)).toEqual({ confirmed: true });
    expect(request.mock.calls.filter(call => call[0].endsWith('/sign'))).toHaveLength(1);
  });
  it('will not sign recovered unknown content; cancellation preserves the saved attempt', async () => {
    const request = vi.fn().mockResolvedValueOnce({ operation: op({ state: 'cancelled', errorCode: 'signature_cancelled' }) });
    const client = new ClinicalOperationController(request, () => {});
    client.reopen(op({review:undefined,sponsorship:undefined})); await expect(client.sign()).rejects.toThrow('revisa'); expect(request).not.toHaveBeenCalled();
    await client.cancel(); expect(request.mock.calls[0][0]).toBe(`/api/private-clinical-operations/${ID}/cancel`);
    expect(client.snapshot().operation?.state).toBe('cancelled');
  });
  it('never accepts an unrelated receipt, a changed hash or a regression back to unsigned', async () => {
    const submitted = op({ state: 'submitted', transactionHash: 'a'.repeat(64) });
    const request = vi.fn().mockResolvedValueOnce({ operation: op({ id: OTHER, state: 'confirmed', transactionHash: 'b'.repeat(64) }) }).mockResolvedValueOnce({ operation: op() }).mockResolvedValueOnce({ operation: op({ state: 'confirmed', transactionHash: 'b'.repeat(64) }) });
    const client = new ClinicalOperationController(request, () => {}); client.reopen(submitted);
    for (let i = 0; i < 3; i++) { await expect(client.check()).rejects.toThrow(); expect(client.snapshot().operation).toEqual(submitted); }
  });
  it.each([[401,'unauthorized'],[403,'clinical_identity_changed']] as const)('clears local private operation state for an actual access failure (%s)', async (status,code) => {
    const request = vi.fn().mockRejectedValue(new ClinicalClientError(status, code));
    const client = new ClinicalOperationController(request, () => {}); client.reopen(op());
    await expect(client.check()).rejects.toThrow(); expect(client.snapshot().operation).toBeNull(); expect(client.snapshot().accessLost).toBe(true);
  });
  it.each(['clinical_create_once_window_too_short','clinical_create_once_expired','clinical_create_once_fee_exceeded'])('reports %s without treating it as a lost session or asking Privy to sign', async code => {
    const request=vi.fn().mockRejectedValue(new ClinicalClientError(409,code));
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign:deps.sign});
    await expect(client.prepare({action:'create_history'})).rejects.toThrow();
    expect(client.snapshot()).toMatchObject({accessLost:false,uncertain:false,operation:null,canSign:false});
    expect(client.snapshot().error).not.toContain('Tu cuenta no tiene permiso');
    expect(deps.sign).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledOnce();
  });
  it('keeps the exact saved operation when its temporary creation window expires during confirmation', async () => {
    const saved=op({action:'create_history'}), request=vi.fn().mockResolvedValueOnce({operation:saved}).mockRejectedValueOnce(new ClinicalClientError(409,'clinical_create_once_expired'));
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign:deps.sign});
    await client.prepare({action:'create_history'}); await expect(client.sign()).rejects.toThrow('habilitación temporal');
    expect(client.snapshot()).toMatchObject({accessLost:false,uncertain:false,canSign:false,operation:{id:ID,state:'awaiting_signature'}});
    await expect(client.prepare({action:'create_history'})).rejects.toThrow('intento anterior');
    await expect(client.sign()).rejects.toThrow('revisa');
    expect(deps.sign).toHaveBeenCalledOnce(); expect(request).toHaveBeenCalledTimes(2);
  });
  it('discards late results and aborts requests on disposal, including a subsequent activation', async () => {
    const late = deferred<{ operation: ClinicalOperation }>(); const request = vi.fn().mockReturnValue(late.promise); const publish = vi.fn();
    const client = new ClinicalOperationController(request, publish, () => ID); const first = client.prepare({ action: 'append_version', note });
    const signal = request.mock.calls[0][1].signal; client.dispose(); client.activate();
    late.resolve({ operation: op({ state: 'confirmed', transactionHash: 'a'.repeat(64) }) }); await expect(first).rejects.toThrow('sesión cambió');
    expect(signal.aborted).toBe(true); expect(client.snapshot().operation).toBeNull(); expect(publish.mock.calls.at(-1)[0].operation).toBeNull();
  });
  it('rejects malformed confirmed responses before any confirmation is shown', () => {
    for (const candidate of [null, op({ state: 'confirmed' }), op({ id: 'bad' }), op({ expiresAt: NaN }), { ...op(), state: 'optimistic' }]) expect(() => verifiedClinicalOperation(candidate)).toThrow();
  });
});

describe('private client transport and file limits', () => {
  it('adds the current review capability only to preparation and preserves caller headers without mutation', async () => {
    deps.fetch.mockResolvedValue(response({ operation: op() }));
    const headers = new Headers({ 'Content-Type': 'application/json', 'X-Draft-Test': 'fixture', [CLINICAL_PREPARE_CAPABILITY_HEADER]: '1' });
    const abort = new AbortController();
    await clinicalApi('/api/private-clinical-operations', { method: 'post', headers, body: '{}', signal: abort.signal });
    const sent = deps.fetch.mock.calls[0][1];
    expect(new Headers(sent.headers).get(CLINICAL_PREPARE_CAPABILITY_HEADER)).toBe(CLINICAL_PREPARE_CAPABILITY_VERSION);
    expect(new Headers(sent.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(sent.headers).get('X-Draft-Test')).toBe('fixture');
    expect(headers.get(CLINICAL_PREPARE_CAPABILITY_HEADER)).toBe('1');
    expect(sent).toMatchObject({ method: 'post', body: '{}', signal: abort.signal, cache: 'no-store' });
  });
  it.each([
    ['/api/private-clinical-operations', 'GET'],
    ['/api/private-clinical-history', 'POST'],
    [`/api/private-clinical-operations/${ID}/sign`, 'POST'],
    [`/api/private-clinical-operations/${ID}/retry`, 'POST'],
    [`/api/private-clinical-operations/${ID}/cancel`, 'POST'],
  ])('leaves existing operation and read requests independent of the preparation capability: %s %s', async (path, method) => {
    deps.fetch.mockResolvedValue(response({ operation: op() }));
    await clinicalApi(path, { method });
    expect(new Headers(deps.fetch.mock.calls[0][1].headers).has(CLINICAL_PREPARE_CAPABILITY_HEADER)).toBe(false);
  });
  it('explains a stale preparation client without opening Privy or treating it as a lost session', async () => {
    const request = vi.fn().mockRejectedValue(new ClinicalClientError(409, 'clinical_client_update_required'));
    const client = new ClinicalOperationController(request, () => {}, () => ID, { address: 'G' + 'A'.repeat(55), sign: deps.sign });
    await expect(client.prepare({ action: 'append_version', note })).rejects.toThrow('recarga la página');
    expect(client.snapshot()).toMatchObject({ operation: null, canSign: false, uncertain: false, accessLost: false });
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it('uses the bearer adapter without credentials in URLs and forces no-store', async () => {
    deps.fetch.mockResolvedValue(response({ operation: op() })); await clinicalApi('/api/private-clinical-history', { cache: 'force-cache' });
    expect(deps.fetch).toHaveBeenCalledWith('/api/private-clinical-history', expect.objectContaining({ cache: 'no-store' }));
    deps.fetch.mockResolvedValue(response({ error: 'secret@example.test' }, 503)); await expect(clinicalApi('/api/private-clinical-history')).rejects.not.toThrow('secret@example.test');
  });
  it('accepts exactly 3,000,000 bytes, rejects oversize, unsupported types and invalid filenames', () => {
    const file = { name: 'examen.pdf', size: 3_000_000, type: 'application/pdf' };
    expect(() => validateClinicalFile(file)).not.toThrow();
    for (const invalid of [{ ...file, size: 3_000_001 }, { ...file, size: 0 }, { ...file, type: 'text/html' }, { ...file, name: '../examen.pdf' }, { ...file, name: 'á'.repeat(128) }]) expect(() => validateClinicalFile(invalid)).toThrow();
  });
  it('checks original bytes against the declared PDF/image format and discards cancelled reads', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\nSynthetic\n%%EOF\n');
    const file = { name: 'examen.pdf', type: 'application/pdf', size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
    expect((await readClinicalFile(file)).base64).toBe(btoa(String.fromCharCode(...bytes)));
    await expect(readClinicalFile({ ...file, type: 'image/png' } as File)).rejects.toThrow('no coincide');
    const abort = new AbortController(); abort.abort(); await expect(readClinicalFile(file, abort.signal)).rejects.toThrow('cancelada');
  });
  it('fetches files through an authenticated no-store read and rejects late downloads', async () => {
    const abort = new AbortController(); const blob = new Blob(['%PDF-1.7\n%%EOF\n'], { type: 'application/pdf' });
    deps.fetch.mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'application/pdf' }), blob: async () => blob });
    expect(await readClinicalDownload('1'.repeat(64), 2, abort.signal)).toBe(blob);
    expect(deps.fetch.mock.calls[0][0]).toBe(`/api/private-clinical-history/document?entryId=${'1'.repeat(64)}&version=2`);
    expect(deps.fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
    expect(deps.fetch.mock.calls[0][1].signal.aborted).toBe(false);
    abort.abort(); await expect(readClinicalDownload('1'.repeat(64), 2, abort.signal)).rejects.toThrow('cancelada');
  });
});

describe('identity, refresh and history presentation', () => {
  it.each(['patient', 'doctor'])('keeps a %s snapshot pending past the former three-minute boundary and accepts the verified result at 181 seconds', async role => {
    vi.useFakeTimers(); const late = deferred<any>(); let signal!: AbortSignal;
    deps.fetch.mockImplementationOnce((_path, init) => { signal = init.signal; return late.promise; });
    const historyId = role === 'doctor' ? '9'.repeat(64) : undefined;
    function View() { const result = useClinicalSnapshot(role, historyId); return createElement('div', null, result.loading ? 'Consultando' : result.error || result.data?.entries[0]?.title); }
    const { host } = await mount(createElement(View));
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(host.textContent).toBe('Consultando'); expect(signal.aborted).toBe(false); expect(deps.fetch).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      late.resolve(response({ ...snapshot([version()]), ...(role === 'doctor' ? { context: { role: 'doctor', canRead: true, canAppend: false, grantRevision: 6 } } : {}) }));
    });
    expect(host.textContent).toBe(note.title); expect(deps.fetch).toHaveBeenCalledOnce(); expect(signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0); expect(deps.sign).not.toHaveBeenCalled();
  });
  it('cancels the extended snapshot on unmount and ignores its late response without leaving a timer', async () => {
    vi.useFakeTimers(); const late = deferred<any>(); let signal!: AbortSignal;
    deps.fetch.mockImplementationOnce((_path, init) => { signal = init.signal; return late.promise; });
    function View() { const result = useClinicalSnapshot('patient-unmount'); return createElement('div', null, result.data?.entries[0]?.title || 'Consultando'); }
    const { root, host } = await mount(createElement(View));
    await act(async () => { await vi.advanceTimersByTimeAsync(100_000); });
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    await act(async () => late.resolve(response(snapshot([version()]))));
    expect(host.textContent).toBe(''); expect(vi.getTimerCount()).toBe(0); expect(deps.fetch).toHaveBeenCalledOnce();
  });
  it('preserves the ninety-second prescription read limit independently of the longer snapshot', async () => {
    vi.useFakeTimers(); const late = deferred<any>(); let signal!: AbortSignal;
    deps.fetch.mockImplementationOnce((_path, init) => { signal = init.signal; return late.promise; });
    const read = readClinicalPrescriptions('9'.repeat(64)); const checked = expect(read).rejects.toMatchObject({ code: 'clinical_read_timeout' });
    await vi.advanceTimersByTimeAsync(CLINICAL_READ_TIMEOUT_MS - 1); expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await checked; expect(signal.aborted).toBe(true);
    late.resolve(response({ prescriptions: [] })); await Promise.resolve(); expect(vi.getTimerCount()).toBe(0); expect(deps.fetch).toHaveBeenCalledOnce();
  });

  it.each(['request', 'json'])('ends a stalled %s with a recoverable read error and ignores late content', async phase => {
    vi.useFakeTimers();
    const late = deferred<any>(); let readSignal!: AbortSignal;
    deps.fetch.mockImplementationOnce((_path, init) => {
      readSignal = init.signal;
      return phase === 'request' ? late.promise : Promise.resolve({ ok: true, json: () => late.promise });
    });
    function View() {
      const result = useClinicalSnapshot('patient-timeout');
      return createElement('div', null, result.data?.entries[0]?.title ?? result.error ?? '',
        createElement('button', { disabled: result.loading, onClick: result.refresh }, result.loading ? 'Consultando' : 'Actualizar'));
    }
    const { host } = await mount(createElement(View));
    await act(async () => { await vi.advanceTimersByTimeAsync(CLINICAL_SNAPSHOT_READ_TIMEOUT_MS - 1); });
    expect(host.textContent).toContain('Consultando'); expect(readSignal.aborted).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(host.textContent).toContain('tardando demasiado'); expect(readSignal.aborted).toBe(true);
    expect(host.querySelector('button')?.disabled).toBe(false);
    await act(async () => late.resolve(phase === 'request' ? response(snapshot([version()])) : snapshot([version()])));
    expect(host.textContent).not.toContain(note.title);
    deps.fetch.mockResolvedValueOnce(response(snapshot([version()])));
    await act(async () => host.querySelector('button')!.click());
    expect(host.textContent).toContain(note.title);
    expect(deps.fetch.mock.calls.every(call => (call[1]?.method ?? 'GET') === 'GET')).toBe(true);
    expect(deps.sign).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a stalled download body without delivering late file content', async () => {
    vi.useFakeTimers(); const late = deferred<Blob>(); let signal!: AbortSignal;
    deps.fetch.mockImplementationOnce((_path, init) => { signal = init.signal; return Promise.resolve({ ok: true, headers: new Headers({ 'content-type': 'application/pdf' }), blob: () => late.promise }); });
    const download = readClinicalDownload('1'.repeat(64), 1, new AbortController().signal);
    const checked = expect(download).rejects.toThrow('tardando demasiado');
    await vi.advanceTimersByTimeAsync(CLINICAL_READ_TIMEOUT_MS); await checked;
    expect(signal.aborted).toBe(true); late.resolve(new Blob(['PRIVATE_LATE_CONTENT']));
    await Promise.resolve(); expect(vi.getTimerCount()).toBe(0); expect(deps.sign).not.toHaveBeenCalled();
  });
  it('clears previous data on refresh failure and ignores another identity’s late response', async () => {
    const requests: Array<{ signal: AbortSignal; resolve: (data: unknown) => void }> = [];
    deps.fetch.mockImplementation((_path, init) => new Promise(resolve => requests.push({ signal: init.signal, resolve })));
    let refresh!: () => void;
    function View({ identity }: { identity: string }) { const result = useClinicalSnapshot(identity); refresh = result.refresh; return createElement('div', null, result.data?.entries[0]?.title ?? (result.error ? 'error' : 'loading')); }
    const { root, host } = await mount(createElement(View, { identity: 'patient-a' }));
    await act(async () => requests[0].resolve(response(snapshot([version()])))); expect(host.textContent).toContain(note.title);
    await act(async () => refresh()); expect(host.textContent).not.toContain(note.title);
    await act(async () => requests[1].resolve(response({ error: 'clinical_history_unavailable' }, 503))); expect(host.textContent).toBe('error');
    await act(async () => root.render(createElement(View, { identity: 'patient-b' })));
    await act(async () => root.render(createElement(View, { identity: 'patient-c' }))); expect(requests[2].signal.aborted).toBe(true);
    await act(async () => requests[2].resolve(response(snapshot([version({ title: 'Previous private content' })])))); expect(host.textContent).not.toContain('Previous private');
    await act(async () => requests[3].resolve(response(snapshot([version({ title: 'Current patient' })])))); expect(host.textContent).toBe('Current patient');
  });
  it('shows prior versions and distinguishes patient notes from doctor records without correcting them', async () => {
    deps.fetch.mockResolvedValue(response(snapshot([version({ version: 2, title: 'Latest contribution' }), version({ title: 'Earlier contribution', canCorrect: false }), version({ entryId: '2'.repeat(64), title: 'Doctor note', source: 'doctor', canCorrect: false })])));
    const { host } = await mount(createElement(ClinicalHistory));
    expect(host.textContent).toContain('Latest contribution'); expect(host.textContent).toContain('Earlier contribution');
    expect(host.textContent).toContain('Registrado por médico'); expect(host.querySelectorAll('button').length).toBeGreaterThan(0);
    const corrections = [...host.querySelectorAll('button')].filter(button => button.textContent === 'Corregir mi aporte'); expect(corrections).toHaveLength(1);
    expect(host.querySelector('details')?.textContent).toContain('versión anterior');
  });
  it('reviews a correction before preparing, retains its prior version and prevents a double submission', async () => {
    const saved = deferred<ClinicalOperation>(); const prepare = vi.fn().mockReturnValue(saved.promise);
    const { host } = await mount(createElement(ClinicalEntryForm, { correction: version({ version: 2 }), onPrepare: prepare, onCancel: vi.fn() }));
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(prepare).not.toHaveBeenCalled(); expect(document.activeElement?.textContent).toBe('Revisa antes de preparar la firma');
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Preparar firma')!;
    await act(async () => { button.click(); button.click(); }); expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0][0]).toMatchObject({ action: 'append_version', entryId: '1'.repeat(64), expectedVersion: 2, note });
    await act(async () => saved.resolve(op()));
  });
});

describe('review, focus and object URL lifecycle', () => {
  it('allows a corrected preparation after a definitive validation rejection', async () => {
    const request = vi.fn().mockRejectedValueOnce(new ClinicalClientError(400, 'clinical_request_invalid')).mockResolvedValueOnce({ operation: op({ id: OTHER }) });
    const nextId = vi.fn().mockReturnValueOnce(ID).mockReturnValueOnce(OTHER);
    const client = new ClinicalOperationController(request, () => {}, nextId);
    await expect(client.prepare({ action: 'append_version', note })).rejects.toThrow();
    expect(client.snapshot().uncertain).toBe(false);
    await client.prepare({ action: 'append_version', note }); expect(client.snapshot().operation?.id).toBe(OTHER);
  });
  it('does not prepare or sign again once an existing attempt is submitted', async () => {
    const request = vi.fn(); const client = new ClinicalOperationController(request, () => {});
    client.reopen(op({ state: 'submitted', transactionHash: 'a'.repeat(64) }));
    await expect(client.prepare({ action: 'create_history' })).rejects.toThrow();
    await expect(client.sign()).rejects.toThrow(); await expect(client.prepareSaved()).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('moves focus into the inline form and returns it to the opening button', async () => {
    deps.fetch.mockResolvedValue(response(snapshot()));
    const { host } = await mount(createElement(ClinicalHistory));
    const opener = [...host.querySelectorAll('button')].find(button => button.textContent === 'Agregar antecedente o archivo')!;
    await act(async () => opener.click()); expect(document.activeElement?.textContent).toBe('Agregar al historial');
    const close = [...host.querySelectorAll('button')].find(button => button.textContent === 'Cerrar')!;
    await act(async () => close.click()); expect(document.activeElement).toBe(opener);
  });
  it('revokes preview URLs on replacement and unmount without displaying arbitrary PDFs inline', async () => {
    const createUrl = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second'); const revoke = vi.fn();
    class BrowserURL extends URL { static createObjectURL = createUrl; static revokeObjectURL = revoke; }
    vi.stubGlobal('URL', BrowserURL);
    const { root, host } = await mount(createElement(ClinicalEntryForm, { onPrepare: vi.fn(), onCancel: vi.fn() }));
    const radio = host.querySelector<HTMLInputElement>('input[value="file"]')!; await act(async () => radio.click());
    const bytes = new TextEncoder().encode('%PDF-1.7\nSynthetic\n%%EOF\n');
    const makeFile = (name: string) => { const file = new File([bytes], name, { type: 'application/pdf' }); Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer }); return file; };
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [makeFile('first.pdf')] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(host.querySelector('a')?.getAttribute('href')).toBe('blob:first'); expect(host.querySelector('iframe')).toBeNull(); expect(host.querySelector('object')).toBeNull();
    Object.defineProperty(input, 'files', { configurable: true, value: [makeFile('second.pdf')] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(revoke).toHaveBeenCalledWith('blob:first'); expect(host.textContent).not.toContain('first.pdf');
    await act(async () => root.unmount()); roots = roots.filter(item => item.root !== root); host.remove(); expect(revoke).toHaveBeenCalledWith('blob:second');
  });
  it('aborts a closed document read and never creates a URL for its late contents', async () => {
    const createUrl = vi.fn(); class BrowserURL extends URL { static createObjectURL = createUrl; static revokeObjectURL = vi.fn(); }
    vi.stubGlobal('URL', BrowserURL);
    const late = deferred<unknown>(); let signal!: AbortSignal;
    deps.fetch.mockResolvedValueOnce(response(snapshot([version({ note: null, fileName: 'examen.pdf', mediaType: 'application/pdf' })]))).mockImplementationOnce((_path, init) => { signal = init.signal; return late.promise; });
    const { root, host } = await mount(createElement(ClinicalHistory));
    const open = [...host.querySelectorAll('button')].find(button => button.textContent === 'Preparar descarga privada')!;
    await act(async () => open.click()); await act(async () => root.unmount()); roots = roots.filter(item => item.root !== root); host.remove();
    await act(async () => late.resolve({ ok: true, headers: new Headers({ 'content-type': 'application/pdf' }), blob: async () => new Blob(['private late content'], { type: 'application/pdf' }) }));
    expect(signal.aborted).toBe(true); expect(createUrl).not.toHaveBeenCalled();
  });
});

describe('prepared history attempt focus', () => {
  const scroll = vi.fn();
  let originalScroll: PropertyDescriptor | undefined;
  const withPermissions = () => createElement(ClinicalHistory, { renderPermissions: props => createElement(ClinicalPermissions, props) });
  const shared = (): ClinicalSnapshot => ({ ...snapshot([version()]), grants: [{ doctorId: 1, doctorName: 'Médico sintético', address: 'G' + 'B'.repeat(55), authorized: true, canRead: true, canAppend: false, revision: 1 }] });
  const getButton = (host: HTMLElement, text: string) => [...host.querySelectorAll('button')].find(button => button.textContent === text)!;
  function mockPreparation(saved: ReturnType<typeof deferred<unknown>>) {
    let requestId = '';
    deps.fetch.mockImplementation((path, init) => {
      if (path === '/api/private-clinical-history') return Promise.resolve(response(shared()));
      requestId = JSON.parse(init.body).requestId;
      return saved.promise;
    });
    return () => requestId;
  }
  async function reviewPermission(host: HTMLElement) {
    const checkbox = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1];
    await act(async () => checkbox.click());
    const review = getButton(host, 'Revisar cambio de permisos'); review.focus();
    await act(async () => review.click());
    return review;
  }
  beforeEach(() => {
    originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  });
  afterEach(() => {
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });
  it('brings a successfully prepared permission change into view without signing, and returns from its confirmation review', async () => {
    const saved = deferred<unknown>(); const requestId = mockPreparation(saved);
    const { host } = await mount(withPermissions());
    await reviewPermission(host);
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => saved.resolve(response({ operation: op({ id: requestId(), action: 'set_permissions' }) })));
    const heading = host.querySelector('[aria-label="Intento clínico actual"] h2');
    expect(heading?.textContent).toBe('Actualizar permisos · Pendiente de tu firma');
    expect(document.activeElement?.textContent).toBe('Actualizar permisos'); expect(getButton(host, 'Confirmar con mi cuenta Privy')).toBeDefined(); expect(scroll).toHaveBeenCalledOnce();
    expect(scroll.mock.calls[0]).toEqual([{ block: 'center' }]);
    expect(deps.fetch.mock.calls.filter(call => call[0].endsWith('/sign'))).toHaveLength(0);
    const review = getButton(host, 'Revisar confirmación');
    await act(async () => review.click()); expect(document.activeElement?.textContent).toBe('Actualizar permisos');
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.activeElement).toBe(review);
    await act(async () => review.click()); await act(async () => getButton(host, 'Volver').click());
    expect(document.activeElement).toBe(review); expect(scroll).toHaveBeenCalledOnce();
    expect(deps.fetch.mock.calls.filter(call => call[0].endsWith('/sign'))).toHaveLength(0);
  });
  it('uses the same handoff for creating a history and for preparing a correction', async () => {
    let requestId = ''; let requestAction: ClinicalOperation['action'] = 'create_history';
    deps.fetch.mockImplementation((path, init) => {
      if (path === '/api/private-clinical-history') return Promise.resolve(response({ ...snapshot(), history: null }));
      const body = JSON.parse(init.body); requestId = body.requestId; requestAction = body.action;
      return Promise.resolve(response({ operation: op({ id: requestId, action: requestAction }) }));
    });
    const first = await mount(createElement(ClinicalHistory));
    await act(async () => getButton(first.host, 'Preparar mi historial').click());
    expect(document.activeElement?.textContent).toBe('Crear mi historial'); expect(getButton(first.host, 'Confirmar con mi cuenta Privy')).toBeDefined();
    expect(scroll).toHaveBeenCalledOnce();
    await act(async () => first.root.unmount()); roots = roots.filter(item => item.root !== first.root); first.host.remove();
    deps.fetch.mockImplementation((path, init) => {
      if (path === '/api/private-clinical-history') return Promise.resolve(response(snapshot([version({ version: 2 })])));
      const body = JSON.parse(init.body); requestId = body.requestId;
      expect(body).toMatchObject({ action: 'append_version', entryId: '1'.repeat(64), expectedVersion: 2 });
      return Promise.resolve(response({ operation: op({ id: requestId }) }));
    });
    const second = await mount(createElement(ClinicalHistory));
    await act(async () => getButton(second.host, 'Corregir mi aporte').click());
    await act(async () => second.host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await act(async () => getButton(second.host, 'Preparar firma').click());
    expect(document.activeElement?.textContent).toBe('Guardar aporte'); expect(getButton(second.host, 'Confirmar con mi cuenta Privy')).toBeDefined();
    expect(scroll).toHaveBeenCalledTimes(2); expect(second.host.querySelector('form')).toBeNull();
  });
  it.each([400, 401, 403, 503])('does not hand focus to a failed preparation (%s)', async status => {
    const saved = deferred<unknown>(); mockPreparation(saved);
    const { host } = await mount(withPermissions());
    const review = await reviewPermission(host);
    await act(async () => saved.resolve(response({ error: 'clinical_request_invalid' }, status)));
    expect(scroll).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Intento clínico actual"] h2')).not.toBe(document.activeElement);
    if (status === 400) expect(document.activeElement).toBe(review);
    if ([401, 403].includes(status)) { expect(host.textContent).not.toContain(note.title); expect(host.querySelector('input[type="checkbox"]')).toBeNull(); }
  });
  it('discards an old session’s prepared response without moving focus or bringing back old content', async () => {
    const saved = deferred<unknown>(); const requestId = mockPreparation(saved);
    const { root, host } = await mount(withPermissions()); await reviewPermission(host);
    deps.userId = 'did:privy:another-patient';
    deps.fetch.mockImplementation(path => Promise.resolve(response(path === '/api/private-clinical-history' ? snapshot() : { error: 'clinical_request_invalid' })));
    await act(async () => root.render(withPermissions()));
    const outside = document.createElement('button'); outside.textContent = 'Foco de la nueva sesión'; document.body.append(outside); outside.focus();
    await act(async () => saved.resolve(response({ operation: op({ id: requestId(), action: 'set_permissions' }) })));
    expect(document.activeElement).toBe(outside); expect(scroll).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Intento clínico actual"]')).toBeNull(); expect(host.textContent).not.toContain(note.title);
    outside.remove();
  });
});
describe('read-only clinical release',()=>{
 const writes={create_history:false,append_version:false,set_permissions:false};
 const button=(host:HTMLElement,text:string)=>[...host.querySelectorAll('button')].find(x=>x.textContent===text);
 it.each([false,true])('keeps versions and receipts readable when writes are disabled or missing (%s)',async missing=>{
  const data:Partial<ClinicalSnapshot>={...snapshot([version({version:2}),version()]),writes,grants:[{doctorId:7,doctorName:'Médico sintético',address:'G'+'B'.repeat(55),authorized:true,canRead:true,canAppend:false,revision:1}]};
  if(missing)delete data.writes;
  deps.fetch.mockResolvedValue(response(data));
  const {host}=await mount(createElement(ClinicalHistory,{renderPermissions:props=>createElement(ClinicalPermissions,props)}));
  expect(host.textContent).toContain(note.text);expect(host.textContent).toContain('Ver 1 versión anterior');expect(host.textContent).toContain('Permisos consultados');
  expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  expect([...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(input=>input.disabled)).toBe(true);
  expect(host.querySelector('a[href*="stellar.expert"]')).not.toBeNull();
  for(const text of ['Agregar antecedente o archivo','Corregir mi aporte']){const control=button(host,text);if(control){expect(control.disabled).toBe(false);await act(async()=>control.click());expect(host.textContent).toContain('Borrador temporal');await act(async()=>button(host,'Cerrar')!.click());}}
  await act(async()=>button(host,'Actualizar')!.click());
  expect(deps.fetch.mock.calls.every(call=>call[0]==='/api/private-clinical-history'&&(call[1]?.method??'GET')==='GET')).toBe(true);expect(deps.sign).not.toHaveBeenCalled();
 });
 it('cannot sign a recovered creation while writes are paused',async()=>{
  const pending=op({action:'create_history'});
  deps.fetch.mockImplementation((path,init)=>{expect(init?.method??'GET').toBe('GET');return Promise.resolve(response(path==='/api/private-clinical-history'?{...snapshot(),writes,history:null,operations:[pending]}:{operation:pending}));});
  const {host}=await mount(createElement(ClinicalHistory));
  await act(async()=>button(host,'Consultar intento pendiente')!.click());
  for(const text of ['Revisar confirmación','Confirmar con mi cuenta Privy','Cancelar firma pendiente','Reintentar envío del mismo intento'])expect(button(host,text)).toBeUndefined();
  await act(async()=>button(host,'Consultar confirmación')!.click());expect(deps.sign).not.toHaveBeenCalled();
 });
});
describe('local drafts while clinical confirmations are paused',()=>{
 const writes={create_history:false,append_version:false,set_permissions:false};
 const getButton=(host:HTMLElement,text:string)=>[...host.querySelectorAll('button')].find(item=>item.textContent===text)!;
 const view=()=>createElement(ClinicalHistory,{renderPermissions:props=>createElement(ClinicalPermissions,props)});
 async function textValue(input:HTMLInputElement|HTMLTextAreaElement,value:string){
  const prototype=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 }
 const onlyReads=()=>{expect(deps.fetch.mock.calls.every(call=>(call[1]?.method??'GET')==='GET')).toBe(true);expect(deps.sign).not.toHaveBeenCalled();};
 it.each(['paused','missing','create-only'])('opens, edits, reviews and discards a note locally with %s capabilities',async mode=>{
  const data:Partial<ClinicalSnapshot>={...snapshot([version()]),writes};
  if(mode==='missing')delete data.writes;
  if(mode==='create-only')data.writes={...writes,create_history:true};
  deps.fetch.mockResolvedValue(response(data)); const {host}=await mount(view());
  const opener=getButton(host,'Agregar antecedente o archivo');await act(async()=>opener.click());
  await textValue(host.querySelector('input[required]')!,'BORRADOR SIN GUARDAR');
  await textValue(host.querySelector('textarea')!,'Contenido que sólo existe en esta pantalla.');
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(document.activeElement?.textContent).toBe('Revisa tu borrador');expect(host.textContent).toContain('BORRADOR SIN GUARDAR');
  expect(getButton(host,'Preparar firma').disabled).toBe(true);await act(async()=>getButton(host,'Preparar firma').click());onlyReads();
  await act(async()=>getButton(host,'Volver a editar').click());expect(host.querySelector<HTMLInputElement>('input[required]')!.value).toBe('BORRADOR SIN GUARDAR');
  await act(async()=>getButton(host,'Cerrar').click());expect(document.activeElement).toBe(opener);
  await act(async()=>opener.click());expect(host.querySelector<HTMLInputElement>('input[required]')!.value).toBe('');
  expect(host.textContent).not.toContain('BORRADOR SIN GUARDAR');onlyReads();
 });
 it('previews only an original patient author’s latest correction without changing earlier versions or preparing a request',async()=>{
  deps.fetch.mockResolvedValue(response({...snapshot([version({version:2}),version({canCorrect:false}),version({entryId:'2'.repeat(64),source:'doctor',canCorrect:false})]),writes}));
  const {host}=await mount(view());const corrections=[...host.querySelectorAll('button')].filter(item=>item.textContent==='Corregir mi aporte');expect(corrections).toHaveLength(1);
  await act(async()=>corrections[0].click());expect(host.textContent).toContain('Las versiones guardadas no cambiarán');
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(getButton(host,'Preparar firma').disabled).toBe(true);await act(async()=>getButton(host,'Preparar firma').click());
  expect(host.textContent).toContain('Ver 1 versión anterior');expect(host.textContent).toContain('Registrado por médico');onlyReads();
 });
 it.each(['ready','pending'])('clears a %s file draft and ignores a late file read after a real identity change',async state=>{
  const createUrl=vi.fn().mockReturnValue('blob:local-draft'),revoke=vi.fn();class BrowserURL extends URL{static createObjectURL=createUrl;static revokeObjectURL=revoke;}vi.stubGlobal('URL',BrowserURL);
  deps.fetch.mockResolvedValue(response({...snapshot(),writes}));const {root,host}=await mount(view());
  await act(async()=>getButton(host,'Agregar antecedente o archivo').click());await act(async()=>host.querySelector<HTMLInputElement>('input[value="file"]')!.click());
  const bytes=new TextEncoder().encode('%PDF-1.7\nLOCAL DRAFT\n%%EOF\n'),late=deferred<ArrayBuffer>();const file=new File([bytes],'private-draft.pdf',{type:'application/pdf'});
  Object.defineProperty(file,'arrayBuffer',{value:()=>state==='ready'?Promise.resolve(bytes.buffer):late.promise});
  const input=host.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(input,'files',{value:[file],configurable:true});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  if(state==='ready')expect(host.textContent).toContain('private-draft.pdf');
  deps.userId='did:privy:second-patient';deps.fetch.mockResolvedValue(response({...snapshot(),writes}));
  await act(async()=>root.render(view()));await act(async()=>late.resolve(bytes.buffer));
  expect(host.querySelector('form')).toBeNull();expect(host.textContent).not.toContain('private-draft.pdf');
  if(state==='ready')expect(revoke).toHaveBeenCalledWith('blob:local-draft');else expect(createUrl).not.toHaveBeenCalled();onlyReads();
 });
 it('validates and reviews a local PDF with preparation disabled, and rejects an oversize selection',async()=>{
  const createUrl=vi.fn().mockReturnValue('blob:pdf-draft');class BrowserURL extends URL{static createObjectURL=createUrl;static revokeObjectURL=vi.fn();}vi.stubGlobal('URL',BrowserURL);
  const prepare=vi.fn();const {host}=await mount(createElement(ClinicalEntryForm,{readOnly:true,onPrepare:prepare,onCancel:vi.fn()}));
  await act(async()=>host.querySelector<HTMLInputElement>('input[value="file"]')!.click());
  const bytes=new TextEncoder().encode('%PDF-1.7\nLOCAL DRAFT\n%%EOF\n');const file=new File([bytes],'synthetic-draft.pdf',{type:'application/pdf'});Object.defineProperty(file,'arrayBuffer',{value:async()=>bytes.buffer});
  const input=host.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(input,'files',{value:[file],configurable:true});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  expect(createUrl).toHaveBeenCalledOnce();expect(host.querySelector('iframe')).toBeNull();
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(host.textContent).toContain('synthetic-draft.pdf');expect(getButton(host,'Preparar firma').disabled).toBe(true);await act(async()=>getButton(host,'Preparar firma').click());
  expect(prepare).not.toHaveBeenCalled();await act(async()=>getButton(host,'Volver a editar').click());
  const oversized=new File([new Uint8Array(3_000_001)],'too-large.pdf',{type:'application/pdf'});Object.defineProperty(input,'files',{value:[oversized],configurable:true});
  const current=host.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(current,'files',{value:[oversized],configurable:true});await act(async()=>current.dispatchEvent(new Event('change',{bubbles:true})));
  expect(host.textContent).toContain('máximo 3 MB');expect(prepare).not.toHaveBeenCalled();expect(deps.fetch).not.toHaveBeenCalled();expect(deps.sign).not.toHaveBeenCalled();
 });
 it.each([true,false])('shows only observed permissions and rejects form submission after confirmations pause (doctor authorized=%s)',async authorized=>{
  const prepare=vi.fn(),grant={doctorId:7,doctorName:'Médico sintético',address:'G'+'B'.repeat(55),authorized,canRead:true,canAppend:false,revision:1};
  const {root,host}=await mount(createElement(ClinicalPermissions,{grants:[grant],disabled:false,onPrepare:prepare}));
  await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async()=>root.render(createElement(ClinicalPermissions,{grants:[grant],disabled:false,readOnly:true,onPrepare:prepare})));
  const inputs=[...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];expect(inputs.map(input=>input.checked)).toEqual([true,false]);expect(inputs.every(input=>input.disabled)).toBe(true);
  expect(getButton(host,'Revisar cambio de permisos').disabled).toBe(true);await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(host.textContent).toContain('Confirmar cambios está deshabilitado');expect(prepare).not.toHaveBeenCalled();expect(deps.sign).not.toHaveBeenCalled();
 });
 it('keeps draft openers disabled during an unresolved existing operation',async()=>{
  deps.fetch.mockResolvedValue(response({...snapshot([version()]),writes,operations:[op()]}));const {host}=await mount(view());
  for(const text of ['Agregar antecedente o archivo','Corregir mi aporte']){expect(getButton(host,text).disabled).toBe(true);await act(async()=>getButton(host,text).click());}
  expect(host.querySelector('form')).toBeNull();onlyReads();
 });
});
it('shows incomplete permission verification separately from verified owner entries',async()=>{
 const data={...snapshot([version()]),writes:{create_history:false,append_version:false,set_permissions:false},grantsUnavailable:true};
 deps.fetch.mockResolvedValue(response(data));const {host}=await mount(createElement(ClinicalHistory,{renderPermissions:props=>createElement(ClinicalPermissions,props)}));
 expect(host.textContent).toContain(note.text);expect(host.textContent).toContain('Sólo mostramos los estados verificados');
 expect(host.querySelector('input[type="checkbox"]')).toBeNull();expect(host.querySelector('a[href*="stellar.expert"]')).not.toBeNull();
 expect(deps.sign).not.toHaveBeenCalled();expect(deps.fetch).toHaveBeenCalledOnce();
});

describe('history creation card', () => {
  const hash = 'b'.repeat(64);
  const writes = { create_history: false, append_version: false, set_permissions: false };
  it('shows the creation date and exact receipt before contributions, including an empty history in read-only mode', async () => {
    const data = snapshot(); data.writes = writes; data.history!.creationTransactionHash = hash;
    deps.fetch.mockResolvedValue(response(data));
    const { host } = await mount(createElement(ClinicalHistory));
    const card = host.querySelector('section[aria-labelledby="clinical-history-created-title"]')!;
    expect(card.textContent).toContain('Historial clínico creado'); expect(card.textContent).toContain('Creado:');
    const link = card.querySelector('a')!;
    expect(link.href).toBe(`https://stellar.expert/explorer/testnet/tx/${hash}`);
    expect(link.textContent).toBe('Ver transacción de creación en Stellar Testnet');
    expect(host.textContent).toContain('Aún no hay antecedentes ni archivos');
    expect(deps.fetch.mock.calls.every(call => call[0] === '/api/private-clinical-history' && (call[1]?.method ?? 'GET') === 'GET')).toBe(true);
    expect(deps.sign).not.toHaveBeenCalled();
  });
  it.each([undefined, null, 'unverified'])('keeps a missing or invalid receipt unlinked (%s)', async creationTransactionHash => {
    const data = snapshot([version()]); data.history!.creationTransactionHash = creationTransactionHash;
    deps.fetch.mockResolvedValue(response(data));
    const { host } = await mount(createElement(ClinicalHistory));
    const card = host.querySelector('section[aria-labelledby="clinical-history-created-title"]')!;
    expect(card.textContent).toContain('No pudimos comprobar el recibo de creación'); expect(card.querySelector('a')).toBeNull();
    expect(host.textContent).toContain(note.text); expect(deps.sign).not.toHaveBeenCalled();
  });
  it('does not show a created history while loading or when the account has no history', async () => {
    const pending = deferred<Response>(); deps.fetch.mockReturnValue(pending.promise);
    const { host } = await mount(createElement(ClinicalHistory));
    expect(host.querySelector('#clinical-history-created-title')).toBeNull();
    await act(async () => pending.resolve(response({ ...snapshot(), history: null })));
    expect(host.textContent).toContain('Comienza tu historial'); expect(host.querySelector('#clinical-history-created-title')).toBeNull();
    expect(deps.sign).not.toHaveBeenCalled();
  });
});


describe('private signature failure messages and bounded diagnostics', () => {
  it('distinguishes a failed Privy prompt without posting a signature or exposing its provider error', async () => {
    const request = vi.fn().mockResolvedValue({ operation: op() });
    const sign = vi.fn().mockRejectedValue(Error('private-provider-token-and-email@example.test'));
    const diagnostic = vi.fn();
    const client = new ClinicalOperationController(request, () => {}, () => ID, { address: 'G' + 'A'.repeat(55), sign }, undefined, diagnostic);
    await client.prepare({ action: 'append_version', note });
    await expect(client.sign()).rejects.toMatchObject({ code: 'clinical_signing_failed', status: 400 });
    expect(client.snapshot().error).toContain('Privy no pudo completar la firma');
    expect(client.snapshot().error).not.toContain('private-provider');
    expect(client.snapshot()).toMatchObject({ uncertain: false, operation: { id: ID, state: 'awaiting_signature' } });
    expect(request).toHaveBeenCalledTimes(1); expect(sign).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith({ phase: 'privy', status: 400, code: 'clinical_signing_failed' });
    expect(client.snapshot().signDiagnostic).toEqual({ phase: 'privy', status: 400, code: 'clinical_signing_failed' });
  });

  it('records only a safe delivery status/code and keeps an uncertain response on the same saved attempt', async () => {
    const request = vi.fn().mockResolvedValueOnce({ operation: op() }).mockRejectedValueOnce(new ClinicalClientError(503, 'clinical_service_unavailable'));
    const sign = vi.fn().mockResolvedValue({ signature: '0x' + '7'.repeat(128) }), diagnostic = vi.fn();
    const client = new ClinicalOperationController(request, () => {}, () => ID, { address: 'G' + 'A'.repeat(55), sign }, undefined, diagnostic);
    await client.prepare({ action: 'append_version', note }); await expect(client.sign()).rejects.toThrow('comprobación del intento');
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith({ phase: 'delivery', status: 503, code: 'clinical_service_unavailable' });
    expect(client.snapshot()).toMatchObject({ uncertain: true, operation: { id: ID, state: 'awaiting_signature' } });
    expect(client.snapshot().error).not.toContain('503'); expect(client.snapshot().error).not.toContain('clinical_service_unavailable');
    expect(request).toHaveBeenCalledTimes(2); expect(sign).toHaveBeenCalledTimes(1);
  });

  it('never copies unrecognized codes, raw errors, signatures or provider fields into diagnostics', () => {
    for (const error of [new ClinicalClientError(503, 'a'.repeat(64)), Error('secret@example.test'), { code: 'signature_cancelled', status: 400, payload: 'private-content' }]) {
      const diagnostic = clinicalSignDiagnostic('delivery', error);
      expect(diagnostic.code).toBe('clinical_service_unavailable');
      expect(Object.keys(diagnostic).sort()).toEqual(['code', 'phase', 'status']); expect(Object.isFrozen(diagnostic)).toBe(true);
      expect(JSON.stringify(diagnostic)).not.toContain('secret'); expect(JSON.stringify(diagnostic)).not.toContain('private-content');
    }
    expect(clinicalSignDiagnostic('review', new ClinicalClientError(NaN, 'signature_request_expired'))).toEqual({ phase: 'review', status: 0, code: 'signature_request_expired' });
  });
});


describe('signature deadline presentation', () => {
  it.each([['signature_request_expired', 'Solicitud de firma vencida'], ['signature_cancelled', 'Firma cancelada']] as const)('labels %s without confusing manual cancellation and expiry', async (errorCode, label) => {
    const awaiting = op({review:undefined,sponsorship:undefined}), terminal = op({ state: 'cancelled', errorCode }); let reconciled = false;
    deps.fetch.mockImplementation(path => {
      if (path === '/api/private-clinical-history') return Promise.resolve(response({ ...snapshot(), operations: [reconciled ? terminal : awaiting] }));
      if (path === `/api/private-clinical-operations/${ID}`) { reconciled = true; return Promise.resolve(response({ operation: terminal })); }
      throw Error('unexpected_signature_presentation_request');
    });
    const { host } = await mount(createElement(ClinicalHistory));
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Consultar intento pendiente')!.click());
    expect(host.textContent).toContain('Esta solicitud de firma vence:'); expect(host.textContent).toContain('Hora de Chile');
    expect(host.textContent).toContain('La firma requiere contenido y cotización verificados y vigentes');
    expect([...host.querySelectorAll('button')].some(button => button.textContent === 'Confirmar con mi cuenta Privy')).toBe(false);
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Consultar confirmación')!.click());
    expect(host.querySelector('[aria-label="Intento clínico actual"] h2')?.textContent).toBe(`Guardar aporte · ${label}`);
    expect(host.textContent).not.toContain('Esta solicitud de firma vence:');
    expect(deps.sign).not.toHaveBeenCalled(); expect(deps.fetch.mock.calls.every(call => (call[1]?.method ?? 'GET') === 'GET')).toBe(true);
  });
  it.each(['clinical_rehearsal_expired', 'signature_request_expired'])('hides the confirmation panel after %s while preserving the attempt', async code => {
    const scope = { runId: OTHER, until: Math.floor(Date.now() / 1000) + 3600, steps: [{ requestId: ID, action: 'create_history' }] };
    const saved = op({ action: 'create_history' });
    deps.fetch.mockImplementation((path, init) => {
      if (path === '/api/private-clinical-history') return Promise.resolve(response({ ...snapshot(), history: null, rehearsal: scope }));
      if (path === '/api/private-clinical-operations') return Promise.resolve(response({ operation: saved }));
      if (path.endsWith('/sign')) return Promise.resolve(response({ error: code }, 409));
      throw Error('unexpected_confirmation_presentation_request');
    });
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    try {
      const { host } = await mount(createElement(ClinicalHistory));
      await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Preparar mi historial')!.click());
      await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Revisar confirmación')!.click());
      await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Confirmar con mi cuenta Privy')!.click());
      expect(host.textContent).toContain('La firma requiere contenido y cotización verificados y vigentes');
      expect([...host.querySelectorAll('button')].some(button => button.textContent === 'Confirmar con mi cuenta Privy')).toBe(false);
      expect([...host.querySelectorAll('button')].some(button => button.textContent === 'Revisar confirmación')).toBe(false);
      expect(deps.sign).toHaveBeenCalledOnce(); expect(deps.fetch.mock.calls.filter(call => call[0].endsWith('/sign'))).toHaveLength(1);
    } finally { if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original); else delete (HTMLElement.prototype as any).scrollIntoView; }
  });
});


describe('safe Privy failure classification', () => {
  it.each([
    [new Error('Wallet not found'), 'clinical_signing_wallet_unavailable'],
    [{ privyErrorCode: 'embedded_wallet_not_found' }, 'clinical_signing_wallet_unavailable'],
    [{ privyErrorCode: 'missing_or_invalid_token' }, 'clinical_signing_session_unavailable'],
    [{ privyErrorCode: 'unknown_auth_error' }, 'clinical_signing_session_unavailable'],
    [new Error('iframe not initialized'), 'clinical_signing_proxy_unavailable'],
    [new Error('Wallet proxy not initialized.'), 'clinical_signing_proxy_unavailable'],
    [new Error('Failed to initialize embedded wallet proxy.'), 'clinical_signing_proxy_unavailable'],
    [new Error('Failed to connect to wallet proxy'), 'clinical_signing_proxy_unavailable'],
    [{ privyErrorCode: 'embedded_wallet_password_unconfirmed' }, 'clinical_signing_recovery_required'],
    [{ type: 'twilio_verification_failed' }, 'clinical_signing_verification_required'],
    [{ privyErrorCode: 'unknown_mfa_error' }, 'clinical_signing_verification_required'],
    [{ privyErrorCode: 'session_storage_unavailable' }, 'clinical_signing_browser_unavailable'],
    [{ privyErrorCode: 'buffer_not_defined' }, 'clinical_signing_browser_unavailable'],
    [{ privyErrorCode: 'too_many_requests' }, 'clinical_signing_rate_limited'],
    [{ privyErrorCode: 'invalid_data' }, 'clinical_signing_request_rejected'],
    [{ privyErrorCode: 'invalid_message' }, 'clinical_signing_request_rejected'],
    [{ type: 'invalid_request_arguments' }, 'clinical_signing_request_rejected'],
    [{ privyErrorCode: 'embedded_wallet_password_already_exists' }, 'clinical_signing_request_rejected'],
    [{ privyErrorCode: 'embedded_wallet_recovery_already_exists' }, 'clinical_signing_request_rejected'],
    [{ privyErrorCode: 'unsupported_wallet_type' }, 'clinical_signing_not_supported'],
    [{ privyErrorCode: 'unsupported_chain_id' }, 'clinical_signing_not_supported'],
    [{ privyErrorCode: 'not_supported' }, 'clinical_signing_not_supported'],
    [new Error('Failed to sign'), 'clinical_signing_response_invalid'],
    [{ privyErrorCode: 'unable_to_sign' }, 'clinical_signing_provider_failed'],
    [{ privyErrorCode: 'unknown_connect_wallet_error' }, 'clinical_signing_provider_failed'],
    [{ privyErrorCode: 'generic_connect_wallet_error' }, 'clinical_signing_provider_failed'],
    [{ privyErrorCode: 'unknown_embedded_wallet_error' }, 'clinical_signing_provider_failed'],
    [{ type: 'error' }, 'clinical_signing_provider_failed'],
    [{ type: 'client_error', message: 'MFA canceled' }, 'signature_cancelled'],
    [new Error('User must be authenticated before signing'), 'clinical_signing_session_unavailable'],
    [new Error('User must be authenticated'), 'clinical_signing_session_unavailable'],
    [new Error('Must have valid access token.'), 'clinical_signing_session_unavailable'],
    [new Error('Wallet proxy not initialized'), 'clinical_signing_proxy_unavailable'],
    [{ code: 'must_be_authenticated' }, 'clinical_signing_session_unavailable'],
    [{ privyErrorCode: 'invalid_credentials' }, 'clinical_signing_session_unavailable'],
    [{ type: 'wallet_not_on_device' }, 'clinical_signing_recovery_required'],
    [{ type: 'invalid_recovery_pin' }, 'clinical_signing_recovery_required'],
    [{ type: 'mfa_timeout' }, 'clinical_signing_verification_required'],
    [{ code: 'missing_or_invalid_mfa' }, 'clinical_signing_verification_required'],
    [{ type: 'mfa_verification_max_attempts_reached' }, 'clinical_signing_verification_required'],
    [new TypeError('Failed to fetch'), 'clinical_signing_transport_unavailable'],
    [new TypeError('NetworkError when attempting to fetch resource.'), 'clinical_signing_transport_unavailable'],
    [{ code: 'client_request_timeout' }, 'clinical_signing_transport_unavailable'],
    [{ code: 'ERR_NETWORK' }, 'clinical_signing_transport_unavailable'],
    [{ code: 'ECONNABORTED' }, 'clinical_signing_transport_unavailable'],
    [{ cause: new Error('Wallet not found') }, 'clinical_signing_wallet_unavailable'],
    [{ code: 4001 }, 'signature_cancelled'],
    [{ code: '4001' }, 'signature_cancelled'],
    [{ code: 'user_rejected_request' }, 'signature_cancelled'],
    [{ code: 'user_rejected' }, 'signature_cancelled'],
    [{ code: 'mfa_canceled' }, 'signature_cancelled'],
  ])('classifies only an exact recognized marker as %s / %s', (failure, code) => {
    const safe = clinicalPrivySigningError(failure);
    expect(safe).toBeInstanceOf(ClinicalClientError); expect(safe).toMatchObject({status:400,code});
    expect(safe).not.toHaveProperty('cause');
  });

  it('does not treat unknown errors or a matching substring containing private details as cancellation', () => {
    const failures: unknown[] = [
      Error('private-provider-token secret@example.test'),
      Error('Wallet not found: private-wallet-id'),
      Error('User rejected request for secret@example.test'),
      Error('iframe not initialized: secret@example.test'),
      Error('Failed to sign private-wallet-id'),
      { privyErrorCode: 'invalid_data secret@example.test' },
      { type: 'client_error', message: 'MFA canceled secret@example.test' },
      { code: 'private-provider-token', type: 'unknown', message: 'secret@example.test', payload: {signature:'7'.repeat(128)} },
      'User must be authenticated', null, undefined,
      { get code() { throw Error('private-getter'); }, get message() { throw Error('private-getter'); }, get cause() { throw Error('private-getter'); } },
    ];
    for(const failure of failures){
      const safe=clinicalPrivySigningError(failure);expect(safe.code).toBe('clinical_signing_failed');
      const diagnostic=clinicalSignDiagnostic('privy',safe);
      expect(diagnostic).toEqual({phase:'privy',status:400,code:'clinical_signing_failed'});
      expect(safe.message).not.toMatch(/private-|secret@|777777/);expect(JSON.stringify(diagnostic)).not.toMatch(/private-|secret@|777777/);
    }
  });

  it('exposes a bounded production diagnostic and no raw provider fields while keeping the same unsigned attempt', async () => {
    const request=vi.fn().mockResolvedValue({operation:op()}),sign=vi.fn().mockRejectedValue({type:'wallet_not_on_device',message:'private token secret@example.test',payload:{signature:'7'.repeat(128)}});
    const report=vi.fn(),debug=vi.spyOn(console,'debug').mockImplementation(()=>{});
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign},undefined,report);
    vi.stubEnv('NODE_ENV','production');
    try{
      await client.prepare({action:'append_version',note});await expect(client.sign()).rejects.toMatchObject({code:'clinical_signing_recovery_required'});
      const state=client.snapshot();expect(state.operation).toEqual(op());expect(state).toMatchObject({uncertain:false,signDiagnostic:{phase:'privy',status:400,code:'clinical_signing_recovery_required'}});
      expect(Object.keys(state.signDiagnostic!).sort()).toEqual(['code','phase','status']);expect(Object.isFrozen(state.signDiagnostic)).toBe(true);
      expect(state.error).toContain('recuperar el acceso de firma');expect(JSON.stringify(state)).not.toMatch(/private token|secret@|777777/);
      expect(report).toHaveBeenCalledExactlyOnceWith(state.signDiagnostic);expect(debug).not.toHaveBeenCalled();
      expect(sign).toHaveBeenCalledOnce();expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0][0]).toBe('/api/private-clinical-operations');
    }finally{vi.unstubAllEnvs();debug.mockRestore();}
  });

  it('never carries a late diagnostic across a disposed and reactivated identity', async () => {
    const late=deferred<{signature:string}>(),request=vi.fn().mockResolvedValue({operation:op()}),sign=vi.fn(()=>late.promise);
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign});
    await client.prepare({action:'append_version',note});const pending=client.sign();client.dispose();client.activate();late.reject(Error('Wallet not found'));
    await expect(pending).rejects.toMatchObject({code:'clinical_signing_wallet_unavailable'});
    expect(client.snapshot().operation).toBeNull();expect(client.snapshot().error).toBe('');expect(client.snapshot().signDiagnostic).toBeUndefined();expect(request).toHaveBeenCalledOnce();
  });
});


describe('clinical rehearsal limit messages and saved-intent safety', () => {
  it.each([['clinical_rehearsal_budget_exceeded', 409], ['clinical_rehearsal_budget_unavailable', 503]] as const)(
    'blocks signing after %s while preserving the exact saved attempt', async (code, status) => {
      const saved = op(), request = vi.fn().mockResolvedValueOnce({ operation: saved })
        .mockRejectedValueOnce(new ClinicalClientError(status, code));
      const client = new ClinicalOperationController(request, () => {}, () => ID, { address: 'G' + 'A'.repeat(55), sign: deps.sign });
      await client.prepare({ action: 'append_version', note });
      await expect(client.sign()).rejects.toBeInstanceOf(ClinicalClientError);
      expect(client.snapshot()).toMatchObject({ operation: { id: ID, state: 'awaiting_signature' }, canSign: false, accessLost: false });
      expect(client.snapshot().uncertain).toBe(status === 503);
      await expect(client.sign()).rejects.toThrow();
      await expect(client.prepare({ action: 'append_version', note })).rejects.toThrow('intento anterior');
      expect(deps.sign).toHaveBeenCalledOnce(); expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[1][0]).toBe(`/api/private-clinical-operations/${ID}/sign`);
    });
  it.each([
    ['clinical_rehearsal_fee_exceeded', 409, 'La comisión supera el límite'],
    ['clinical_rehearsal_budget_exceeded', 409, 'El presupuesto restante'],
    ['clinical_rehearsal_budget_unavailable', 503, 'No pudimos comprobar los recibos'],
  ] as const)('shows %s in the permission form without retrying or signing', async (code, status, expected) => {
    const data = { ...snapshot(), grants: [{ doctorId: 1, doctorName: 'Médico sintético', address: 'G' + 'B'.repeat(55),
      authorized: true, canRead: false, canAppend: true, revision: 5 }] };
    deps.fetch.mockImplementation(path => Promise.resolve(response(path === '/api/private-clinical-history' ? data :
      { error: code, detail: 'RPC PRIVATE_DATA secret@example.test' }, path === '/api/private-clinical-history' ? 200 : status)));
    const { host } = await mount(createElement(ClinicalHistory, { renderPermissions: props => createElement(ClinicalPermissions, props) }));
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    const review = [...host.querySelectorAll('button')].find(button => button.textContent === 'Revisar cambio de permisos')!;
    await act(async () => review.click());
    const alert = host.querySelector('form [role="alert"]');
    expect(alert?.textContent).toContain(expected);
    expect(alert?.textContent).not.toContain('No se pudo preparar el cambio');
    expect(host.textContent).not.toContain('PRIVATE_DATA'); expect(host.textContent).not.toContain('secret@example.test');
    expect(host.textContent).not.toContain('Revisa el cambio y firma para confirmarlo.');
    expect(host.textContent).not.toContain('Confirmado en Stellar');
    const currentHeading = host.querySelector('[aria-label="Intento clínico actual"] h2');
    if (status === 503) {
      expect(currentHeading?.textContent).toBe('Preparación sin resultado comprobado');
      expect([...host.querySelectorAll('button')].some(button => button.textContent === 'Consultar confirmación')).toBe(true);
    } else expect(currentHeading).toBeNull();
    expect(deps.fetch.mock.calls.filter(call => call[0] === '/api/private-clinical-operations')).toHaveLength(1);
    expect(deps.fetch.mock.calls.filter(call => /\/(sign|retry)$/.test(call[0]))).toHaveLength(0);
    expect(deps.fetch).toHaveBeenCalledTimes(2); expect(deps.sign).not.toHaveBeenCalled();
  });
});

describe('canonical prepared review and quote lifetime', () => {
  it.each(['review','sponsorship'] as const)('blocks Privy before signing when %s metadata is absent, while preserving read and cancel', async field => {
    const prepared=op({[field]:undefined}), sign=vi.fn(), request=vi.fn().mockResolvedValueOnce({operation:prepared})
      .mockResolvedValueOnce({operation:prepared}).mockResolvedValueOnce({operation:op({state:'cancelled'})});
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign});
    await client.prepare({action:'append_version',note});expect(client.snapshot().canSign).toBe(false);
    await expect(client.sign()).rejects.toMatchObject({code:'clinical_operation_unavailable'});
    expect(sign).not.toHaveBeenCalled();await client.check();await client.cancel();
    expect(request.mock.calls.map(call=>call[0])).toEqual(['/api/private-clinical-operations','/api/private-clinical-operations/'+ID,'/api/private-clinical-operations/'+ID+'/cancel']);
  });
  it('uses the supplied immutable quote origin, rejects an expired quote and never invents another ninety seconds',async()=>{
    const at=Math.floor(Date.now()/1000), prepared=op({sponsorship:{maxFeeStroops:'4150886',quotePreparedAt:at-91,quoteExpiresAt:at-1}});
    const sign=vi.fn(),request=vi.fn().mockResolvedValue({operation:prepared});
    const client=new ClinicalOperationController(request,()=>{},()=>ID,{address:'G'+'A'.repeat(55),sign});
    await client.prepare({action:'append_version',note});await expect(client.sign()).rejects.toMatchObject({code:'clinical_quote_expired'});
    await client.check();expect(client.snapshot().operation?.sponsorship).toEqual(prepared.sponsorship);
    expect(sign).not.toHaveBeenCalled();expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects quote timestamp extension, unknown fields, changed author, mismatched action and malformed file review',()=>{
    const prepared=op(), review=prepared.review!, quote=prepared.sponsorship!;
    for(const patch of [
      {sponsorship:{...quote,quoteExpiresAt:quote.quoteExpiresAt+1}},
      {sponsorship:{...quote,quotePreparedAt:quote.quotePreparedAt+.5}},
      {sponsorship:{...quote,token:'forbidden'}},
      {review:{...review,author:'G'+'B'.repeat(55)}},
      {review:{...review,recipient:'unexpected'}},
      {action:'set_permissions'},
      {review:{...review,content:{kind:'file',fileName:'../wrong.pdf',mediaType:'application/pdf',byteLength:964,sha256:'f'.repeat(64)}}},
      {review:{...review,content:{kind:'file',fileName:'synthetic.pdf',mediaType:'application/pdf',byteLength:0,sha256:'f'.repeat(64)}}},
      {review:{...review,content:{kind:'file',fileName:'synthetic.pdf',mediaType:'application/pdf',byteLength:964,sha256:'not-a-hash'}}},
    ]) expect(()=>verifiedClinicalOperation({...prepared,...patch})).toThrow('No pudimos verificar la operación');
  });
  it('copies and freezes exact note/RX review instead of retaining mutable response objects',()=>{
    const rx=OTHER, prepared=op(), input={...prepared,review:{...prepared.review!,content:{kind:'note' as const,note:{...note,prescriptionId:rx}}}};
    const verified=verifiedClinicalOperation(input);
    input.review.content.note.text='mutated';input.sponsorship!.quoteExpiresAt++;
    expect(verified.review?.content.kind==='note'&&verified.review.content.note.text).toBe(note.text);
    expect(verified.review?.content.kind==='note'&&verified.review.content.note.prescriptionId).toBe(rx);
    expect(Object.isFrozen(verified.review?.content)).toBe(true);
    expect(verified.sponsorship?.quoteExpiresAt).not.toBe(input.sponsorship!.quoteExpiresAt);
  });
  it('renders the exact file, patient, author and offered maximum before the human confirmation click',async()=>{
    const prepared=op({review:{network:'testnet',contractId:'C'+'A'.repeat(55),historyId:'9'.repeat(64),patient:'G'+'A'.repeat(55),author:'G'+'A'.repeat(55),operationId:'2'.repeat(64),entryId:'1'.repeat(64),version:1,
      content:{kind:'file',fileName:'aporte-medico-sintetico-v1.pdf',mediaType:'application/pdf',byteLength:964,sha256:'f'.repeat(64)}},
      sponsorship:{maxFeeStroops:'4150886',quotePreparedAt:Math.floor(Date.now()/1000),quoteExpiresAt:Math.floor(Date.now()/1000)+90}});
    deps.fetch.mockResolvedValue(response({...snapshot(),operations:[prepared]}));
    const {host}=await mount(createElement(ClinicalHistory));
    await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Consultar intento pendiente')!.click());
    const panel=host.querySelector('[aria-label="Revisión del cambio preparado"]')!;
    expect(panel.textContent).toContain('aporte-medico-sintetico-v1.pdf');expect(panel.textContent).toContain('964');
    expect(panel.textContent).toContain('f'.repeat(64));expect(panel.textContent).toContain('0.4150886 XLM de Testnet');
    expect(panel.textContent).toContain('Paciente · cuenta Stellar');expect(panel.textContent).toContain('Autor · cuenta que firma');
    expect(panel.textContent).toContain('Cotización preparada:');expect(panel.textContent).toContain('Válida hasta:');
    await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Revisar confirmación')!.click());
    expect([...host.querySelectorAll('button')].some(button=>button.textContent==='Confirmar con mi cuenta Privy')).toBe(true);
    expect(deps.sign).not.toHaveBeenCalled();
  });
  it('removes signing eligibility at canonical quote expiry without another request or losing the review',async()=>{
    vi.useFakeTimers();vi.setSystemTime(1800000000000);const prepared=op();
    deps.fetch.mockResolvedValue(response({operation:prepared}));
    const scope={runId:OTHER,until:Math.floor(Date.now()/1000)+1000,steps:[{requestId:ID,action:'append_version' as const,kind:'note' as const}]};
    let latest!:ReturnType<typeof useClinicalOperation>;function View(){latest=useClinicalOperation('review-expiry','G'+'A'.repeat(55),scope);return null;}
    await mount(createElement(View));await act(async()=>latest.controller.prepare({action:'append_version',note}));
    expect(latest.canSign).toBe(true);
    await act(async()=>vi.advanceTimersByTimeAsync(90_000));expect(latest.canSign).toBe(false);
    expect(latest.operation?.review).toEqual(prepared.review);expect(deps.fetch).toHaveBeenCalledOnce();expect(deps.sign).not.toHaveBeenCalled();
  });
});


describe('selected clinical RX recheck transport',()=>{
  it('uses the existing authenticated read endpoint with a normalized single-RX filter',async()=>{
    const history='ab'.repeat(32),rx={id:OTHER};deps.fetch.mockResolvedValue(response({prescriptions:[rx]}));
    const signal=new AbortController().signal;
    expect(await readClinicalPrescriptions(history,signal,OTHER.toUpperCase())).toEqual([rx]);
    expect(deps.fetch.mock.calls[0][0]).toBe(`/api/private-clinical-history/prescriptions?historyId=${history}&prescriptionId=${OTHER}`);
    expect(deps.fetch.mock.calls[0][1].cache).toBe('no-store');
  });
  it('keeps the existing unfiltered caller path',async()=>{
    deps.fetch.mockResolvedValue(response({prescriptions:[]}));await readClinicalPrescriptions();
    expect(deps.fetch.mock.calls[0][0]).toBe('/api/private-clinical-history/prescriptions');
  });
  it('rejects invalid selection before any request',async()=>{
    await expect(readClinicalPrescriptions(undefined,undefined,'bad')).rejects.toMatchObject({status:400});
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each([{prescriptions:[{id:ID}]},{prescriptions:[{id:OTHER},{id:OTHER}]}])('rejects a mismatched or ambiguous selected RX response',async ({prescriptions})=>{
    deps.fetch.mockResolvedValue(response({prescriptions}));
    await expect(readClinicalPrescriptions(undefined,undefined,OTHER)).rejects.toMatchObject({status:503});
  });
});
