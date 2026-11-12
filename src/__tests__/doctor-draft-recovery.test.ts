// @vitest-environment jsdom
import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ api: vi.fn(), fetch: vi.fn(), rx: vi.fn(), identity: 'did:privy:doctor', walletId: 'wallet-doctor' }));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: () => ({ ready: true, authenticated: !!m.identity, user: m.identity ? { id: m.identity } : null }) }));
vi.mock('@/components/private-portal/WalletBoundary', () => ({ usePortalWallet: () => ({ walletId: m.walletId, address: 'G' + 'D'.repeat(55) }) }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: m.fetch }));
vi.mock('@/components/private-portal/clinical-client', () => ({ clinicalApi: m.api,
  ClinicalClientError: class extends Error { constructor(public status: number, public code: string) { super(code); } },
  readClinicalPrescriptions: m.rx, readClinicalFile: vi.fn() }));
import { DoctorDraftRecovery } from '@/components/private-portal/DoctorDraftRecovery';
const id = '10000000-0000-4000-8000-000000000001', draftId = '20000000-0000-4000-8000-000000000002';
const historyId = 'a'.repeat(64), metadata = { id: draftId, revision: 1, historyId, patient: 'G' + 'P'.repeat(55), author: 'G' + 'D'.repeat(55),
  state: 'draft', publicationRequestId: null, createdAt: '2026-10-25T10:00:00Z', updatedAt: '2026-10-25T10:00:00Z' };
const op = (state = 'awaiting_signature', transactionHash: string | null = null) => ({ id, action: 'append_version', state,
  expiresAt: Math.floor(Date.now() / 1000) + 180, transactionHash, errorCode: null });
let root: Root | null = null, host: HTMLDivElement;
async function mount() { host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root!.render(createElement(DoctorDraftRecovery))); }
const find = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text);
async function click(text: string) { const button = find(text); expect(button).toBeDefined(); await act(async () => button!.click()); }
async function linked() {
  m.api.mockResolvedValue({ drafts: [{ ...metadata, publicationRequestId: id }], hasMore: false, nextBefore: null });
  await mount(); await click('Mis borradores privados'); await click('Consultar publicación vinculada');
}
beforeEach(() => {
  vi.clearAllMocks(); m.identity = 'did:privy:doctor'; m.walletId = 'wallet-doctor';
  m.rx.mockResolvedValue([]); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; host?.remove(); vi.useRealTimers(); });

it('allows author recovery without checking a doctor profile or loading history/RX', async () => {
  m.api.mockImplementation(async (path: string) => path.endsWith('/' + draftId)
    ? { draft: { ...metadata, payload: { note: { title: 'Private draft', text: 'Recovered own content', eventDate: null, prescriptionId: id } } } }
    : { drafts: [metadata], hasMore: false, nextBefore: null });
  await mount(); expect(m.api).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
  await click('Mis borradores privados'); await click('Abrir borrador');
  expect(host.querySelector('textarea')?.value).toBe('Recovered own content');
  expect(m.rx).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
  expect(m.api.mock.calls.every(([path]) => String(path).startsWith('/api/private-clinical-drafts'))).toBe(true);
  expect(find('Preparar firma')?.disabled ?? true).toBe(true);
});
it('queries the linked operation without a selected patient context and displays its receipt', async () => {
  m.fetch.mockResolvedValue(Response.json({ operation: op('confirmed', 'c'.repeat(64)) }));
  await linked();
  expect(m.fetch).toHaveBeenCalledWith('/api/private-clinical-operations/' + id, expect.objectContaining({ method: 'GET', cache: 'no-store' }));
  expect(host.textContent).toContain('Confirmado en Stellar Testnet'); expect(host.textContent).toContain('c'.repeat(64));
  expect(find('Cancelar solicitud pendiente')).toBeUndefined(); expect(m.rx).not.toHaveBeenCalled();
});
it('cancels only after two explicit clicks and never signs, broadcasts or prepares another operation', async () => {
  m.fetch.mockImplementation(async (_path: string, init: RequestInit) => Response.json({ operation: init.method === 'POST' ? op('cancelled') : op() }));
  await linked(); expect(m.fetch).toHaveBeenCalledTimes(1);
  await click('Cancelar solicitud pendiente'); expect(m.fetch).toHaveBeenCalledTimes(1);
  await click('Confirmar cancelación sin firma');
  expect(m.fetch.mock.calls[1][0]).toBe('/api/private-clinical-operations/' + id + '/cancel');
  expect(JSON.parse(String(m.fetch.mock.calls[1][1].body))).toEqual({ confirmed: true });
  expect(host.textContent).toContain('Solicitud cancelada sin firma ni envío');
  expect(m.fetch.mock.calls.every(([path]) => String(path).includes('/' + id) && !/sign|retry/.test(String(path)))).toBe(true);
  expect(m.api.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});
it.each(['submitted','confirmed','failed','cancelled'])('does not offer cancellation for a %s operation', async state => {
  m.fetch.mockResolvedValue(Response.json({ operation: op(state, state === 'submitted' || state === 'confirmed' || state === 'failed' ? 'c'.repeat(64) : null) }));
  await linked(); expect(find('Cancelar solicitud pendiente')).toBeUndefined();
});
it('never claims cancellation when the server reports the request already submitted', async () => {
  m.fetch.mockImplementation(async (_path: string, init: RequestInit) => Response.json({ operation: init.method === 'POST' ? op('submitted', 'c'.repeat(64)) : op() }));
  await linked(); await click('Cancelar solicitud pendiente'); await click('Confirmar cancelación sin firma');
  expect(host.textContent).toContain('El intento cambió');
  expect(host.textContent).not.toContain('Solicitud cancelada sin firma ni envío'); expect(find('Cancelar solicitud pendiente')).toBeUndefined();
});
it('rejects mismatched operation responses and does not expose provider errors', async () => {
  m.fetch.mockResolvedValue(Response.json({ operation: { ...op(), id: draftId, payload: 'PRIVATE_PROVIDER' } }));
  await linked(); expect(host.textContent).toContain('No recibimos un estado verificable'); expect(host.textContent).not.toContain('PRIVATE_PROVIDER');
  m.fetch.mockResolvedValue(Response.json({ error: 'postgres://SECRET' }, { status: 503 }));
  await click('Consultar el mismo intento'); expect(host.textContent).not.toContain('SECRET');
});
it('aborts results when the account/wallet changes and clears the previous attempt', async () => {
  let resolve!: (r: Response) => void;
  m.fetch.mockImplementation(() => new Promise<Response>(done => { resolve = done; })); await linked();
  const signal = m.fetch.mock.calls[0][1].signal as AbortSignal;
  m.identity = 'did:privy:other'; m.walletId = 'wallet-other';
  await act(async () => root!.render(createElement(DoctorDraftRecovery))); expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json({ operation: op('confirmed', 'c'.repeat(64)) })));
  expect(host.textContent).not.toContain('Confirmado en Stellar Testnet'); expect(host.textContent).not.toContain('c'.repeat(64));
});
it('ends a partial timeout without assuming cancellation and permits consulting the same id', async () => {
  vi.useFakeTimers(); m.fetch.mockImplementation(() => new Promise<Response>(() => {}));
  await linked(); const signal = m.fetch.mock.calls[0][1].signal as AbortSignal;
  await act(async () => vi.advanceTimersByTime(15_001)); expect(signal.aborted).toBe(true);
  expect(host.textContent).toContain('No recibimos un estado verificable'); expect(find('Consultar el mismo intento')!.disabled).toBe(false);
  m.fetch.mockResolvedValue(Response.json({ operation: op('cancelled') }));
  await click('Consultar el mismo intento'); expect(host.textContent).toContain('Cancelado');
  expect(m.fetch.mock.calls.every(([path]) => String(path) === '/api/private-clinical-operations/' + id)).toBe(true);
});
it('does not fetch anything while logged out', async () => {
  m.identity = ''; await mount(); expect(m.api).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled(); expect(m.rx).not.toHaveBeenCalled();
});

it.each([op('confirmed', null), op('awaiting_signature', 'c'.repeat(64))])('rejects a contradictory operation state/hash pair', async value => {
  m.fetch.mockResolvedValue(Response.json({ operation: value })); await linked();
  expect(host.textContent).toContain('No recibimos un estado verificable'); expect(find('Cancelar solicitud pendiente')).toBeUndefined();
});
