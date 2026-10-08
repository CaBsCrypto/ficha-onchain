// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalOperation, ClinicalSnapshot, ClinicalVersion } from '@/types/clinical';
import { ClinicalClientError, ClinicalOperationController, clinicalApi, readClinicalDownload, readClinicalFile, useClinicalSnapshot, validateClinicalFile, verifiedClinicalOperation } from '@/components/private-portal/clinical-client';
import { ClinicalEntryForm } from '@/components/private-portal/ClinicalEntryForm';
import { ClinicalHistory } from '@/components/private-portal/ClinicalHistory';
import { ClinicalPermissions } from '@/components/private-portal/ClinicalPermissions';

const deps = vi.hoisted(() => ({ fetch: vi.fn(), userId: 'did:privy:patient1' }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: deps.fetch }));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: deps.userId } }) }));
vi.mock('@/components/private-portal/WalletBoundary', () => ({ usePortalWallet: () => ({ walletId: 'wallet1', address: 'G' + 'A'.repeat(55) }) }));
vi.mock('@/components/private-portal/Operation', () => ({ ReceiptLink: ({ hash }: { hash: string }) => createElement('a', { href: `https://stellar.expert/explorer/testnet/tx/${hash}` }, 'Ver recibo') }));
const ID = '09fedaff-8110-4415-8b5c-3409bf0a5731';
const OTHER = '18d482c5-aeae-448b-a37c-a17bfc8042d2';
const op = (overrides: Partial<ClinicalOperation> = {}): ClinicalOperation => ({ id: ID, action: 'append_version', state: 'awaiting_signature', expiresAt: 1_900_000_000, transactionHash: null, errorCode: null, ...overrides });
const note = { title: 'Antecedente sintético', text: 'Información de prueba', eventDate: null };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const version = (overrides: Partial<ClinicalVersion> = {}): ClinicalVersion => ({ entryId: '1'.repeat(64), version: 1, author: 'G' + 'A'.repeat(55), source: 'patient', createdAt: 1_800_000_000, title: note.title, mediaType: 'application/json', fileName: 'antecedente.json', note, transactionHash: 'a'.repeat(64), canCorrect: true, ...overrides });
const snapshot = (entries: ClinicalVersion[] = []): ClinicalSnapshot => ({ history: { id: '9'.repeat(64), patient: 'G' + 'A'.repeat(55), createdAt: 1_800_000_000 }, entries, operations: [], grants: [], verifiedAt: '2026-10-08T05:00:00Z' });
let roots: Array<{ root: Root; host: HTMLDivElement }> = [];
async function mount(node: React.ReactNode) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push({ root, host }); await act(async () => root.render(node)); return { root, host }; }
beforeEach(() => { vi.clearAllMocks(); deps.userId = 'did:privy:patient1'; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { for (const { root, host } of roots) { await act(async () => root.unmount()); host.remove(); } roots = []; vi.unstubAllGlobals(); });

describe('clinical attempt recovery', () => {
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
    const client = new ClinicalOperationController(request, () => {}, () => ID);
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
    client.reopen(op()); await expect(client.sign()).rejects.toThrow('revisa'); expect(request).not.toHaveBeenCalled();
    await client.cancel(); expect(request.mock.calls[0][0]).toBe(`/api/private-clinical-operations/${ID}/cancel`);
    expect(client.snapshot().operation?.state).toBe('cancelled');
  });
  it('never accepts an unrelated receipt, a changed hash or a regression back to unsigned', async () => {
    const submitted = op({ state: 'submitted', transactionHash: 'a'.repeat(64) });
    const request = vi.fn().mockResolvedValueOnce({ operation: op({ id: OTHER, state: 'confirmed', transactionHash: 'b'.repeat(64) }) }).mockResolvedValueOnce({ operation: op() }).mockResolvedValueOnce({ operation: op({ state: 'confirmed', transactionHash: 'b'.repeat(64) }) });
    const client = new ClinicalOperationController(request, () => {}); client.reopen(submitted);
    for (let i = 0; i < 3; i++) { await expect(client.check()).rejects.toThrow(); expect(client.snapshot().operation).toEqual(submitted); }
  });
  it('clears local private operation state when access expires', async () => {
    const request = vi.fn().mockRejectedValue(new ClinicalClientError(401, 'unauthorized'));
    const client = new ClinicalOperationController(request, () => {}); client.reopen(op());
    await expect(client.check()).rejects.toThrow(); expect(client.snapshot().operation).toBeNull(); expect(client.snapshot().accessLost).toBe(true);
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
    expect(deps.fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store', signal: abort.signal });
    abort.abort(); await expect(readClinicalDownload('1'.repeat(64), 2, abort.signal)).rejects.toThrow('cancelada');
  });
});

describe('identity, refresh and history presentation', () => {
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
    expect(document.activeElement).toBe(heading); expect(scroll).toHaveBeenCalledOnce();
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
    expect(document.activeElement?.textContent).toBe('Crear mi historial · Pendiente de tu firma');
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
    expect(document.activeElement?.textContent).toBe('Guardar aporte · Pendiente de tu firma');
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
